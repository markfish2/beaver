"""
向量搜索模块：embedding 生成 + sqlite-vec 语义搜索
"""

import json
import uuid
import logging
import struct
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from . import models, crud

logger = logging.getLogger(__name__)

# Embedding 维度（根据模型不同而不同）
EMBEDDING_DIMENSIONS = 1536  # OpenAI text-embedding-3-small


def get_embedding_config(db: Session):
    """获取用于 embedding 的 AI 配置（优先找 purpose=embedding 的配置）"""
    import uuid as uuid_mod
    # 先找专用 embedding 配置
    config = db.query(models.AIConfig).filter(models.AIConfig.purpose == 'embedding').first()
    if config:
        return config
    # 回退到默认配置
    return crud.get_default_ai_config(db)


def _get_embedding_model(config) -> str:
    """根据 provider 确定 embedding 模型名"""
    provider = config.provider.lower()
    model = config.model
    if 'openai' in provider:
        return "text-embedding-3-small"
    if 'deepseek' in provider:
        return "deepseek-embedding"
    if 'qwen' in provider or 'dashscope' in provider:
        return "text-embedding-v3"
    return model


def chunk_text(text: str, max_chars: int = 800, min_chars: int = 50) -> list[str]:
    """按段落分块文本"""
    if not text or not text.strip():
        return []

    # 按双换行分段
    paragraphs = text.split('\n\n')
    chunks = []
    current_chunk = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # 如果当前块加上新段落超过限制，先保存当前块
        if current_chunk and len(current_chunk) + len(para) + 2 > max_chars:
            if len(current_chunk) >= min_chars:
                chunks.append(current_chunk.strip())
            current_chunk = para
        else:
            if current_chunk:
                current_chunk += "\n\n" + para
            else:
                current_chunk = para

    # 保存最后一块
    if current_chunk and len(current_chunk) >= min_chars:
        chunks.append(current_chunk.strip())

    return chunks


async def check_embedding_support(config) -> bool:
    """检测 AI 配置是否支持 embedding API（用于默认配置检测）"""
    return await check_embedding_config(config)


async def check_embedding_config(config) -> bool:
    """检测 embedding 配置是否可用"""
    import httpx

    api_url = config.api_url.rstrip('/')
    if '/v1' in api_url:
        embedding_url = f"{api_url}/embeddings"
    else:
        embedding_url = f"{api_url}/v1/embeddings"

    model = config.model

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                embedding_url,
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json"
                },
                json={"model": model, "input": "test"}
            )
            return resp.status_code == 200
    except Exception:
        return False


async def generate_embedding(text: str, config) -> Optional[list[float]]:
    """调用 embedding API 生成向量"""
    import httpx

    # 根据 provider 确定 embedding endpoint
    api_url = config.api_url.rstrip('/')
    if '/v1' in api_url:
        embedding_url = f"{api_url}/embeddings"
    else:
        embedding_url = f"{api_url}/v1/embeddings"

    model = _get_embedding_model(config)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                embedding_url,
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "input": text
                }
            )
            if resp.status_code != 200:
                logger.warning(f"Embedding API 返回 {resp.status_code}: {resp.text[:200]}")
                return None

            data = resp.json()
            if "data" in data and len(data["data"]) > 0:
                return data["data"][0]["embedding"]
            return None
    except Exception as e:
        logger.warning(f"Embedding 生成失败: {e}")
        return None


def embedding_to_blob(embedding: list[float]) -> bytes:
    """将 embedding 列表转为二进制（float32 数组）"""
    return struct.pack(f'{len(embedding)}f', *embedding)


def blob_to_embedding(blob: bytes) -> list[float]:
    """将二进制转为 embedding 列表"""
    count = len(blob) // 4
    return list(struct.unpack(f'{count}f', blob))


async def index_note(db: Session, source_type: str, source_id: str, content: str, config):
    """为笔记生成 embedding 并存入数据库"""
    # 删除该笔记的旧 embedding
    db.execute(
        text("DELETE FROM note_embeddings WHERE source_type = :st AND source_id = :sid"),
        {"st": source_type, "sid": str(source_id)}
    )
    db.commit()

    # 分块
    chunks = chunk_text(content)
    if not chunks:
        return

    # 为每个块生成 embedding
    for chunk in chunks:
        embedding = await generate_embedding(chunk, config)
        if embedding is None:
            continue

        embedding_blob = embedding_to_blob(embedding)
        chunk_id = str(uuid.uuid4())

        db.execute(
            text("""INSERT INTO note_embeddings (id, source_type, source_id, chunk_text, embedding)
                    VALUES (:id, :st, :sid, :text, :emb)"""),
            {"id": chunk_id, "st": source_type, "sid": str(source_id), "text": chunk, "emb": embedding_blob}
        )

    db.commit()
    logger.info(f"已为 {source_type}/{source_id} 生成 {len(chunks)} 个 embedding 块")


async def search_similar(db: Session, query: str, config, limit: int = 10) -> list[dict]:
    """语义搜索相似笔记"""
    # 生成查询向量
    query_embedding = await generate_embedding(query, config)
    if query_embedding is None:
        # 回退到关键词搜索
        return _fallback_keyword_search(db, query, limit)

    query_blob = embedding_to_blob(query_embedding)

    # 使用 sqlite-vec 搜索
    try:
        results = db.execute(
            text("""
                SELECT source_type, source_id, chunk_text,
                       vec_distance_cosine(embedding, :query) as distance
                FROM note_embeddings
                WHERE embedding IS NOT NULL
                ORDER BY distance
                LIMIT :limit
            """),
            {"query": query_blob, "limit": limit * 3}  # 多取一些，后续过滤
        ).fetchall()

        # 过滤相似度过低的结果，按 source 去重
        MAX_DISTANCE = 0.45  # 距离越小越相似
        seen_sources = set()
        sources = []
        for row in results:
            source_type, source_id, chunk_text, distance = row
            if distance > MAX_DISTANCE:
                continue
            # 跳过无意义内容（图片链接、文件名、太短的片段）
            if len(chunk_text.strip()) < 30:
                continue
            if chunk_text.strip().startswith('![') or chunk_text.strip().startswith('[deploy'):
                continue
            source_key = f"{source_type}:{source_id}"
            if source_key in seen_sources:
                continue
            seen_sources.add(source_key)
            title = _get_source_title(db, source_type, source_id)
            sources.append({
                "id": source_id,
                "title": title,
                "type": source_type,
                "snippet": chunk_text[:200],
                "distance": distance,
            })
            if len(sources) >= limit:
                break

        # 如果向量搜索结果太少，回退到关键词搜索补充
        if len(sources) < 3:
            kw_results = await _fallback_keyword_search_async(db, query, config, limit - len(sources))
            seen_ids = {s["id"] for s in sources}
            for r in kw_results:
                if r["id"] not in seen_ids:
                    sources.append(r)
                    if len(sources) >= limit:
                        break

        return sources
    except Exception as e:
        logger.warning(f"向量搜索失败，回退到关键词搜索: {e}")
        return await _fallback_keyword_search_async(db, query, config, limit)


def _fallback_keyword_search(db: Session, query: str, limit: int) -> list[dict]:
    """关键词搜索回退方案（基础版本，不依赖 AI）"""
    from .routers.ai_chat import _search_notes
    return _search_notes(db, query, limit=limit)


async def _fallback_keyword_search_async(db: Session, query: str, config, limit: int) -> list[dict]:
    """关键词搜索回退方案（使用 AI 扩展关键词）"""
    from .routers.ai_chat import _search_notes, _expand_query
    from . import crud
    import re

    # 扩展关键词需要 chat 模型，不是 embedding 模型
    chat_config = crud.get_default_ai_config(db)
    if not chat_config:
        return _search_notes(db, query, limit=limit)

    search_queries = await _expand_query(query, chat_config)

    all_keywords = set()
    for sq in search_queries:
        if sq == query:
            continue
        for w in re.findall(r'[一-鿿]{2,}', sq):
            all_keywords.add(w)
        for w in re.findall(r'[a-zA-Z]{3,}', sq):
            all_keywords.add(w)
    extra = set()
    for kw in list(all_keywords):
        if len(kw) > 2:
            for i in range(len(kw) - 1):
                extra.add(kw[i:i+2])
    all_keywords.update(extra)
    stopwords = {'笔记', '里面', '哪些', '什么', '怎么', '如何', '可以', '这个', '那个', '有没有', '是什么', '我的'}
    keywords = [kw for kw in all_keywords if len(kw) >= 2 and kw not in stopwords]

    return _search_notes(db, query, keywords=keywords if keywords else None, limit=limit)


def _get_source_title(db: Session, source_type: str, source_id: str) -> str:
    """获取笔记标题"""
    import uuid as uuid_mod
    try:
        source_uuid = uuid_mod.UUID(source_id) if isinstance(source_id, str) else source_id
    except ValueError:
        return "未知"

    if source_type == "memo":
        memo = db.query(models.Memo).filter(models.Memo.id == source_uuid).first()
        if memo and memo.content:
            first_line = memo.content.split('\n')[0].strip()
            return first_line.lstrip('#').lstrip('*').strip()[:50] or "无标题"
    elif source_type in ("document", "node"):
        doc = db.query(models.Document).filter(models.Document.id == source_uuid).first()
        if doc:
            return doc.title
    return "未知"
