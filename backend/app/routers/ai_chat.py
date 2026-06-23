"""
AI 问答路由：基于笔记内容的检索问答（使用向量搜索）
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from .. import crud, schemas, models
from ..database import get_db
from ..dependencies import get_current_user
from ..vector_search import search_similar, get_embedding_config
import json
import uuid
import logging
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()


def _estimate_tokens(text: str) -> int:
    """估算文本的 token 数量（中英混合场景）"""
    if not text:
        return 0
    import re
    # 中文字符数 * 1.5（中文通常 1-2 token/字）
    chinese_chars = len(re.findall(r'[一-鿿]', text))
    # 英文单词数 * 1.3
    english_words = len(re.findall(r'[a-zA-Z]+', text))
    # 其他字符（标点、数字、空格等）按 0.5 token/字符估算
    other_chars = len(text) - chinese_chars - sum(len(w) for w in re.findall(r'[a-zA-Z]+', text))
    return int(chinese_chars * 1.5 + english_words * 1.3 + other_chars * 0.5) + 4  # +4 for message overhead


async def _summarize_messages(messages: list, config) -> str:
    """用 AI 生成对话摘要"""
    import httpx
    # 构建摘要请求
    conversation_text = ""
    for msg in messages:
        role = "用户" if msg.get("role") == "user" else "AI"
        content = msg.get("content", "")[:500]  # 截断过长内容
        conversation_text += f"{role}：{content}\n"

    prompt = f"""请用中文简洁地总结以下对话的关键信息（不超过200字）。保留重要问题、结论和关键数据。

{conversation_text}

要求：只输出摘要内容，不要加标题或前缀。"""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{config.api_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": config.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 300,
                    "temperature": 0.3
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
    except Exception:
        pass
    return ""


async def _truncate_messages(messages: list, system_prompt: str, config=None, max_context_tokens: int = 800000) -> list:
    """截断消息以适配模型上下文窗口，支持摘要压缩

    策略：
    1. 始终保留 system prompt
    2. 始终保留最后 8 条对话（最近的上下文）
    3. 旧消息超出限制时，调用 AI 生成摘要替代
    4. 如果单条消息就超限，截断其内容
    """
    if not messages:
        return messages

    # 预留 20% 给 AI 回复
    available_tokens = int(max_context_tokens * 0.8)

    # 计算 system prompt 的 token
    system_tokens = _estimate_tokens(system_prompt)
    available_tokens -= system_tokens

    # 始终保留最后 N 条消息（最近的上下文）
    keep_recent = min(8, len(messages))
    recent_messages = messages[-keep_recent:]
    older_messages = messages[:-keep_recent] if len(messages) > keep_recent else []

    # 计算总 token
    recent_tokens = sum(_estimate_tokens(m.get("content", "")) for m in recent_messages)
    older_tokens = sum(_estimate_tokens(m.get("content", "")) for m in older_messages)
    total_tokens = recent_tokens + older_tokens

    # 未超限，直接返回
    if total_tokens <= available_tokens:
        return messages

    # 超限了，需要处理旧消息
    # 计算给旧消息的空间（减去摘要预留的 ~500 token）
    summary_budget = 500
    older_available = available_tokens - recent_tokens - summary_budget

    if older_available <= 0:
        # 连最近消息都超限，只截断最近消息
        result = []
        tokens_used = 0
        for msg in reversed(recent_messages):
            msg_tokens = _estimate_tokens(msg.get("content", ""))
            if tokens_used + msg_tokens > available_tokens:
                content = msg.get("content", "")
                max_chars = int((available_tokens - tokens_used) / 1.5)
                if max_chars > 100:
                    result.insert(0, {**msg, "content": content[:max_chars] + "\n[已截断]"})
                break
            result.insert(0, msg)
            tokens_used += msg_tokens
        return result

    # 收集需要被摘要压缩的旧消息
    kept_older = []
    tokens_used = 0
    summarize_from = len(older_messages)
    for i, msg in enumerate(older_messages):
        msg_tokens = _estimate_tokens(msg.get("content", ""))
        if tokens_used + msg_tokens > older_available:
            summarize_from = i
            break
        kept_older.append(msg)
        tokens_used += msg_tokens

    # 需要摘要的消息
    to_summarize = older_messages[:summarize_from]

    # 生成摘要
    summary_text = ""
    if to_summarize and config:
        summary_text = await _summarize_messages(to_summarize, config)

    # 构建最终消息列表
    result = []
    if summary_text:
        result.append({
            "role": "system",
            "content": f"[以下为更早的对话摘要]\n{summary_text}"
        })
    elif to_summarize:
        result.append({
            "role": "system",
            "content": f"[已省略 {len(to_summarize)} 条早期对话消息]"
        })

    result.extend(kept_older)
    result.extend(recent_messages)
    return result


def _search_notes(db: Session, query: str, keywords: list[str] = None, limit: int = 10) -> list[dict]:
    """搜索笔记内容，按关键词匹配数量评分排序"""
    import re
    results = []

    # 如果没传 keywords，用原始查询提取
    if keywords is None:
        keywords = []
        keywords.extend([w for w in re.findall(r'[a-zA-Z]+', query) if len(w) >= 3])
        chinese = re.findall(r'[一-鿿]+', query)
        for seg in chinese:
            if len(seg) >= 2:
                for i in range(len(seg) - 1):
                    keywords.append(seg[i:i+2])
        if not keywords:
            keywords = [query.strip()]
        stopwords = {'笔记', '里面', '哪些', '什么', '怎么', '如何', '可以', '这个', '那个', '有没有', '是什么'}
        keywords = [kw for kw in keywords if len(kw) >= 2 and kw not in stopwords]

    memo_conditions = [
        models.Memo.deleted_at.is_(None),
        models.Memo.ai_excluded == False,
        models.Memo.is_archived == False,
    ]

    # 1) 完整短语搜索（最高优先级）
    memos = db.query(models.Memo).filter(
        *memo_conditions, models.Memo.content.like(f"%{query}%")
    ).limit(limit).all()
    nodes = db.query(models.Node).filter(
        or_(models.Node.content.like(f"%{query}%"), models.Node.note.like(f"%{query}%"))
    ).limit(limit).all()

    # 2) 关键词 OR 搜索（短语无结果时），按匹配数量评分
    if not memos and not nodes and keywords:
        # 搜索所有可能匹配的 memo
        kw_conds = [models.Memo.content.like(f"%{kw}%") for kw in keywords]
        all_memos = db.query(models.Memo).filter(
            *memo_conditions, or_(*kw_conds)
        ).limit(limit * 3).all()

        # 评分：计算每个 memo 匹配了多少个关键词
        scored_memos = []
        for memo in all_memos:
            content = memo.content or ""
            score = sum(1 for kw in keywords if kw in content)
            if score > 0:
                scored_memos.append((score, memo))
        scored_memos.sort(key=lambda x: -x[0])
        # 关键词 >= 3 个时，要求至少匹配 2 个
        min_score = 2 if len(keywords) >= 3 else 1
        if scored_memos:
            filtered = [(s, m) for s, m in scored_memos if s >= min_score]
            if filtered:
                memos = [m for _, m in filtered[:limit]]
            elif min_score == 1:
                memos = [m for _, m in scored_memos[:3]]

        # 搜索节点
        node_kw_conds = [
            or_(models.Node.content.like(f"%{kw}%"), models.Node.note.like(f"%{kw}%"))
            for kw in keywords
        ]
        all_nodes = db.query(models.Node).filter(
            or_(*node_kw_conds)
        ).limit(limit * 3).all()

        scored_nodes = []
        for node in all_nodes:
            text = (node.content or "") + (node.note or "")
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                scored_nodes.append((score, node))
        scored_nodes.sort(key=lambda x: -x[0])
        if scored_nodes:
            filtered = [(s, n) for s, n in scored_nodes if s >= min_score]
            if filtered:
                nodes = [n for _, n in filtered[:limit]]
            elif min_score == 1:
                nodes = [n for _, n in scored_nodes[:3]]

    for memo in memos:
        snippet = _extract_snippet(memo.content, query)
        results.append({
            "id": str(memo.id),
            "title": _extract_title(memo.content),
            "type": "memo",
            "snippet": snippet,
        })

    # 按 document 分组
    doc_snippets = {}
    for node in nodes:
        doc = db.query(models.Document).filter(
            models.Document.id == node.document_id,
            models.Document.deleted_at.is_(None),
            models.Document.ai_excluded == False,
        ).first()
        if not doc:
            continue
        doc_id = str(doc.id)
        if doc_id not in doc_snippets:
            doc_snippets[doc_id] = {
                "id": doc_id,
                "title": doc.title,
                "type": doc.type,
                "snippet": "",
            }
        text = node.content or node.note or ""
        snippet = _extract_snippet(text, query)
        if snippet and len(snippet) > len(doc_snippets[doc_id]["snippet"]):
            doc_snippets[doc_id]["snippet"] = snippet

    results.extend(list(doc_snippets.values())[:limit])

    # 去重：按 id 去除完全重复，按 title 去除相似结果
    seen_ids = set()
    seen_titles = set()
    deduped = []
    for r in results:
        if r["id"] in seen_ids:
            continue
        title_key = re.sub(r'[\s\W]', '', r["title"]) if r["title"] else ""
        if title_key and title_key in seen_titles:
            continue
        seen_ids.add(r["id"])
        if title_key:
            seen_titles.add(title_key)
        deduped.append(r)
    return deduped[:limit]


def _search_todos(db: Session, query: str, limit: int = 10) -> list[dict]:
    """搜索未完成的待办事项"""
    import re
    results = []

    # 从未完成的 todos 表搜索
    todos = db.query(models.Todo).filter(
        models.Todo.is_completed == False
    ).all()
    for todo in todos:
        results.append({
            "id": str(todo.id),
            "title": "待办事项",
            "type": "todo",
            "snippet": todo.content,
        })

    # 从 memos 中搜索未完成的复选框
    memos = db.query(models.Memo).filter(
        models.Memo.deleted_at.is_(None),
        models.Memo.ai_excluded == False,
        models.Memo.is_archived == False,
    ).all()
    for memo in memos:
        unchecked = re.findall(r'^(\s*[-*+])\s*\[\s*\]\s*(.+)', memo.content, re.MULTILINE)
        if unchecked:
            items = [f"{m[0]} [ ] {m[1]}" for m in unchecked]
            snippet = "\n".join(items[:10])
            results.append({
                "id": str(memo.id),
                "title": _extract_title(memo.content),
                "type": "memo",
                "snippet": f"未完成待办：\n{snippet}",
            })

    # 从 nodes 中搜索未完成的复选框
    nodes = db.query(models.Node).filter(
        models.Node.is_todo == True,
        models.Node.is_completed == False,
    ).limit(50).all()
    doc_nodes = {}
    for node in nodes:
        doc_id = str(node.document_id)
        if doc_id not in doc_nodes:
            doc = db.query(models.Document).filter(
                models.Document.id == node.document_id,
                models.Document.deleted_at.is_(None),
                models.Document.ai_excluded == False,
            ).first()
            if doc:
                doc_nodes[doc_id] = {"doc": doc, "items": []}
        if doc_id in doc_nodes:
            doc_nodes[doc_id]["items"].append(node.content or "")

    for doc_id, data in doc_nodes.items():
        doc = data["doc"]
        items = data["items"]
        if items:
            snippet = "\n".join(f"- [ ] {item}" for item in items[:10])
            results.append({
                "id": doc_id,
                "title": doc.title,
                "type": doc.type,
                "snippet": f"未完成待办：\n{snippet}",
            })

    return results[:limit]


def _extract_snippet(text: str, query: str, context_chars: int = 100) -> str:
    """提取匹配片段"""
    if not text:
        return ""
    idx = text.lower().find(query.lower())
    if idx == -1:
        return text[:200]
    start = max(0, idx - context_chars)
    end = min(len(text), idx + len(query) + context_chars)
    snippet = text[start:end]
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet


def _extract_title(content: str) -> str:
    """从 memo 内容提取标题"""
    if not content:
        return "无标题"
    first_line = content.split('\n')[0].strip()
    # 去掉 markdown 标记（标题、加粗、列表等）
    import re
    title = re.sub(r'^[#*\-\s]+', '', first_line)  # 去掉开头的 #, *, -, 空格
    title = re.sub(r'[*_]{1,3}', '', title)         # 去掉 *, **, ***, _, __, ___
    title = title.strip()
    return title[:50] if title else "无标题"


async def _expand_query(query: str, config) -> list[str]:
    """用 AI 扩展搜索关键词（Query Expansion）"""
    try:
        prompt = f"""用户问题：{query}

请生成 8-12 个搜索关键词，用于在笔记中搜索相关内容。
规则：
1. 把问题拆解成多个独立的词（2-4个字的词）
2. 添加同义词、近义词、相关概念词
3. 如果问"人生建议"，要生成：人生、建议、智慧、心态、哲理、忠告、格言、感悟、道理 等
4. 每行一个词，不要用短语，不要编号，不要解释"""

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{config.api_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": config.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.3
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                queries = [q.strip() for q in content.strip().split('\n') if q.strip()]
                # 原始查询也要包含
                if query not in queries:
                    queries.insert(0, query)
                return queries[:6]
    except Exception as e:
        logger.warning(f"Query expansion 失败: {e}")

    return [query]


@router.post("/ask")
async def ask_ai(
    request: schemas.AIChatRequest,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """AI 问答"""
    # 获取 AI 配置
    config = crud.get_default_ai_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="未配置 AI 模型，请先在设置中添加")

    # 提前提取配置值为普通字符串，避免流式生成器中访问 SQLAlchemy 对象
    api_url = config.api_url
    api_key = config.api_key
    model_name = config.model

    # 提取最后一条用户消息作为查询
    user_messages = [m for m in request.messages if m.get("role") == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="缺少用户消息")

    # 获取或创建对话
    conv_id = request.conversation_id
    if conv_id:
        conv = crud.get_conversation(db, conv_id)
        if not conv:
            conv = crud.create_conversation(db)
    else:
        conv = crud.create_conversation(db)

    # 保存用户消息（提前捕获为普通值，避免后续访问 SQLAlchemy 对象）
    conv_id_str = str(conv.id)
    conv_uuid = conv.id
    user_query = user_messages[-1].get("content", "")
    crud.add_message(db, conv_uuid, "user", user_query)

    query = user_messages[-1].get("content", "")
    if not query.strip():
        raise HTTPException(status_code=400, detail="消息内容为空")

    # 根据模式构建 prompt
    sources = []
    if request.mode == "web":
        # 网络模式：直接问答，不搜索本地笔记
        system_prompt = "你是一个智能助手。请直接回答用户的问题，用中文回答。回答要简洁准确。"
    else:
        # 数据模式：搜索本地笔记
        from ..vector_search import check_embedding_config, get_embedding_config, search_similar
        embedding_config = get_embedding_config(db)
        embedding_supported = embedding_config and await check_embedding_config(embedding_config)

        if embedding_supported:
            sources = await search_similar(db, query, embedding_config)
        else:
            # 用 AI 扩展搜索关键词
            search_queries = await _expand_query(query, config)
            # 收集关键词：扩展查询的词组和 bigram（不含原始查询，避免无意义碎片）
            import re
            all_keywords = set()
            # 扩展查询：提取词组
            for sq in search_queries:
                if sq == query:
                    continue  # 跳过原始查询
                for w in re.findall(r'[一-鿿]{2,}', sq):
                    all_keywords.add(w)
                for w in re.findall(r'[a-zA-Z]{3,}', sq):
                    all_keywords.add(w)
            # 把长词组拆成 bigram
            extra = set()
            for kw in list(all_keywords):
                if len(kw) > 2:
                    for i in range(len(kw) - 1):
                        extra.add(kw[i:i+2])
            all_keywords.update(extra)
            # 过滤停用词
            stopwords = {'笔记', '里面', '哪些', '什么', '怎么', '如何', '可以', '这个', '那个', '有没有', '是什么', '我的'}
            keywords = [kw for kw in all_keywords if len(kw) >= 2 and kw not in stopwords]
            # 搜索
            sources = _search_notes(db, query, keywords=keywords if keywords else None)

        context_parts = []
        for i, source in enumerate(sources, 1):
            context_parts.append(f"[{i}] {source['type'].upper()}: {source['title']} (id:{source['id']})\n{source['snippet']}")
        context = "\n\n".join(context_parts) if context_parts else "未找到相关笔记。"

        system_prompt = f"""你是一个笔记助手。根据用户的笔记内容回答问题。

用户的笔记内容：
---
{context}
---

要求：
1. 只基于提供的笔记内容回答问题
2. 仔细检查每条笔记来源，只引用与问题直接相关的笔记
3. 如果笔记内容与问题无关，不要引用它
4. 如果笔记中没有相关内容，如实告知"未找到相关笔记"
5. 用中文回答
6. 当你引用某条笔记时，用 Markdown 链接标注来源，格式为 [笔记标题](/d/笔记id)。例如：根据[小熊积分](/d/abc123)，当前积分是112分。
7. 不要在回答末尾单独列出来源列表，直接在正文中引用即可。"""

    # 上下文管理：截断超长对话
    truncated = await _truncate_messages(request.messages, system_prompt, config=config)
    messages = [{"role": "system", "content": system_prompt}] + truncated

    # 收集完整回复用于保存
    full_response = ""

    async def generate():
        nonlocal full_response
        try:
            # 先发送 conversation_id
            yield json.dumps({"type": "conversation_id", "id": conv_id_str}, ensure_ascii=False) + "\n"

            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{api_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": True
                    }
                ) as resp:
                    if resp.status_code != 200:
                        error_text = ""
                        async for chunk in resp.aiter_bytes():
                            error_text += chunk.decode()
                        error_msg = f"[错误] API 返回 {resp.status_code}: {error_text[:200]}"
                        full_response = error_msg
                        yield json.dumps({"type": "error", "content": error_msg}, ensure_ascii=False) + "\n"
                        return

                    async for line in resp.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                data = json.loads(line[6:])
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content")
                                if content:
                                    full_response += content
                                    yield json.dumps({"type": "content", "content": content}, ensure_ascii=False) + "\n"
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
        except httpx.TimeoutException:
            error_msg = "\n[错误] 请求超时"
            full_response = error_msg
            yield json.dumps({"type": "error", "content": error_msg}, ensure_ascii=False)
        except Exception as e:
            error_msg = f"\n[错误] {str(e)}"
            full_response = error_msg
            yield json.dumps({"type": "error", "content": error_msg}, ensure_ascii=False)
        else:
            # 流正常结束，解析 AI 回复中的来源标记
            if sources:
                import re as _re
                match = _re.search(r'\[来源:\s*([^\]]+)\]', full_response)
                if match:
                    ref_str = match.group(1).strip()
                    if ref_str.lower() == 'none':
                        filtered_sources = []
                    else:
                        try:
                            ref_indices = [int(x.strip()) - 1 for x in ref_str.split(',')]
                            filtered_sources = [sources[i] for i in ref_indices if 0 <= i < len(sources)]
                        except (ValueError, IndexError):
                            filtered_sources = sources[:3]
                    # 从回复中移除来源标记
                    full_response = _re.sub(r'\n?\[来源:\s*[^\]]+\]\s*$', '', full_response).strip()
                else:
                    # AI 没有按格式标记来源，取前 3 条最相关的
                    filtered_sources = sources[:3]
                yield json.dumps({"type": "sources", "sources": filtered_sources}, ensure_ascii=False) + "\n"
        finally:
            # 保存 AI 回复到数据库（使用新 session，因为 FastAPI 已关闭注入的 db）
            if full_response:
                sources_json = json.dumps(sources, ensure_ascii=False) if sources else None
                from ..database import SessionLocal
                save_db = SessionLocal()
                try:
                    crud.add_message(save_db, conv_uuid, "assistant", full_response, sources_json)
                except Exception:
                    save_db.rollback()
                    raise
                finally:
                    save_db.close()

    return StreamingResponse(generate(), media_type="text/plain")
