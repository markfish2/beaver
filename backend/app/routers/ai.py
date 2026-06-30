"""
AI 功能路由：对话整理、模型配置管理
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user
import httpx
import json
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_ai_config(db: Session, config_id: uuid.UUID | None) -> schemas.AIConfig:
    """获取 AI 配置，优先使用指定 ID，否则使用默认配置"""
    if config_id:
        config = crud.get_ai_config(db, config_id)
        if config:
            return config
    config = crud.get_default_ai_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="未配置 AI 模型，请先在设置中添加")
    return config


# ── AI 配置 CRUD ──

@router.get("/configs", response_model=list[schemas.AIConfig])
def list_configs(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.get_ai_configs(db)


@router.post("/configs", response_model=schemas.AIConfig)
def create_config(
    config: schemas.AIConfigCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_ai_config(db, config)


@router.put("/configs/{config_id}", response_model=schemas.AIConfig)
def update_config(
    config_id: uuid.UUID,
    update: schemas.AIConfigUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    result = crud.update_ai_config(db, config_id, update)
    if not result:
        raise HTTPException(status_code=404, detail="配置不存在")
    return result


@router.delete("/configs/{config_id}")
def delete_config(
    config_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if not crud.delete_ai_config(db, config_id):
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"ok": True}


@router.post("/configs/{config_id}/test")
async def test_config(
    config_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """测试 AI 配置连接"""
    config = crud.get_ai_config(db, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            purpose = config.purpose or 'chat'
            if purpose == 'embedding':
                # embedding 模型用 /embeddings 接口
                resp = await client.post(
                    f"{config.api_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {config.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": config.model,
                        "input": "test"
                    }
                )
            else:
                # chat 模型用 /chat/completions 接口
                resp = await client.post(
                    f"{config.api_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {config.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": config.model,
                        "messages": [{"role": "user", "content": "hi"}],
                        "max_tokens": 5
                    }
                )
            if resp.status_code == 200:
                return {"ok": True, "message": "连接成功"}
            else:
                return {"ok": False, "message": f"API 返回 {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"ok": False, "message": f"连接失败: {str(e)}"}


@router.get("/configs/{config_id}/embedding-support")
async def check_embedding_support(
    config_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """检测 AI 配置是否支持 embedding API"""
    config = crud.get_ai_config(db, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    from ..vector_search import check_embedding_support
    supported = await check_embedding_support(config)
    return {"supported": supported}


@router.get("/embedding-status")
async def get_embedding_status(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取当前默认 AI 配置的 embedding 支持状态"""
    config = crud.get_default_ai_config(db)
    if not config:
        return {"has_config": False, "supported": False}

    from ..vector_search import check_embedding_support
    supported = await check_embedding_support(config)
    return {
        "has_config": True,
        "supported": supported,
        "config_name": config.name,
        "provider": config.provider,
    }


# ── AI 对话（流式）──

@router.post("/chat")
async def ai_chat(
    request: schemas.AIChatRequest,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """AI 对话（流式响应）"""
    config = _get_ai_config(db, request.ai_config_id)

    system_prompt = f"""你是一个笔记整理助手。用户的笔记内容如下：
---
{request.context}
---
请帮用户整理、讨论这段内容。可以：
1. 润色文字，修正错别字
2. 提取要点，整理结构
3. 根据用户要求修改内容
4. 回答用户关于内容的问题
5. 根据用户指令撰写新内容
用中文回复。直接输出内容，不要加额外说明。"""

    messages = [{"role": "system", "content": system_prompt}] + request.messages

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{config.api_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {config.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": config.model,
                        "messages": messages,
                        "stream": True
                    }
                ) as resp:
                    if resp.status_code != 200:
                        error_text = ""
                        async for chunk in resp.aiter_bytes():
                            error_text += chunk.decode()
                        yield f"[错误] API 返回 {resp.status_code}: {error_text[:200]}"
                        return

                    async for line in resp.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                data = json.loads(line[6:])
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content")
                                if content:
                                    yield content
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
        except httpx.TimeoutException:
            yield "\n[错误] 请求超时"
        except Exception as e:
            yield f"\n[错误] {str(e)}"

    return StreamingResponse(generate(), media_type="text/plain")


# 全局索引状态
_reindex_status = {
    "running": False,
    "memos_indexed": 0,
    "docs_indexed": 0,
    "memos_skipped": 0,
    "docs_skipped": 0,
    "errors": 0,
    "total_memos": 0,
    "total_docs": 0,
    "current": "",
    "done": False,
    "message": "",
}


@router.get("/reindex-status")
async def get_reindex_status(
    current_user: schemas.User = Depends(get_current_user)
):
    """获取索引进度"""
    return _reindex_status


@router.post("/reindex")
async def reindex_embeddings(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """批量重建所有笔记的向量索引（后台执行）"""
    from ..vector_search import get_embedding_config, check_embedding_config

    if _reindex_status["running"]:
        raise HTTPException(status_code=409, detail="索引任务正在执行中")

    config = get_embedding_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="未配置向量模型，请先在 AI 设置中添加")

    if not await check_embedding_config(config):
        raise HTTPException(status_code=400, detail="向量模型连接失败，请检查配置")

    config_id = config.id

    # 统计总数
    from .. import models
    total_memos = db.query(models.Memo).filter(
        models.Memo.deleted_at.is_(None),
        models.Memo.ai_excluded == False,
        models.Memo.content != '',
    ).count()
    total_docs = db.query(models.Document).filter(
        models.Document.deleted_at.is_(None),
        models.Document.ai_excluded == False,
        models.Document.type.in_(["document", "note"]),
    ).count()

    _reindex_status.update({
        "running": True,
        "memos_indexed": 0, "docs_indexed": 0,
        "memos_skipped": 0, "docs_skipped": 0,
        "errors": 0,
        "total_memos": total_memos, "total_docs": total_docs,
        "current": "准备中...", "done": False, "message": "",
    })

    import asyncio
    asyncio.create_task(_do_reindex(config_id))

    return {"success": True, "message": "索引任务已启动", "total_memos": total_memos, "total_docs": total_docs}


async def _do_reindex(config_id):
    """后台执行批量索引"""
    from ..vector_search import index_note
    from .. import models
    from ..database import SessionLocal
    import logging
    logger = logging.getLogger(__name__)

    db = SessionLocal()
    try:
        config = db.query(models.AIConfig).filter(models.AIConfig.id == config_id).first()
        if not config:
            _reindex_status.update({"running": False, "done": True, "message": "向量模型配置不存在"})
            return

        # 统计不参与 AI 的笔记
        excluded_memos = db.query(models.Memo).filter(
            models.Memo.deleted_at.is_(None),
            models.Memo.ai_excluded == True,
        ).count()
        excluded_docs = db.query(models.Document).filter(
            models.Document.deleted_at.is_(None),
            models.Document.ai_excluded == True,
            models.Document.type.in_(["document", "note"]),
        ).count()
        excluded_total = excluded_memos + excluded_docs

        # 索引 memos
        memos = db.query(models.Memo).filter(
            models.Memo.deleted_at.is_(None),
            models.Memo.ai_excluded == False,
            models.Memo.content != '',
        ).all()

        for i, memo in enumerate(memos):
            _reindex_status["current"] = f"索引随想 {i+1}/{len(memos)}"
            if not memo.content or len(memo.content.strip()) < 20:
                _reindex_status["memos_skipped"] += 1
                continue
            try:
                await index_note(db, "memo", memo.id, memo.content, config)
                _reindex_status["memos_indexed"] += 1
            except Exception:
                _reindex_status["errors"] += 1

        # 索引文档
        docs = db.query(models.Document).filter(
            models.Document.deleted_at.is_(None),
            models.Document.ai_excluded == False,
            models.Document.type.in_(["document", "note"]),
        ).all()

        for i, doc in enumerate(docs):
            _reindex_status["current"] = f"索引文档 {i+1}/{len(docs)}"
            nodes = db.query(models.Node).filter(models.Node.document_id == doc.id).all()
            content_parts = []
            for node in nodes:
                text = (node.content or "") + "\n" + (node.note or "")
                if text.strip():
                    content_parts.append(text.strip())
            full_content = "\n\n".join(content_parts)
            if len(full_content.strip()) < 20:
                _reindex_status["docs_skipped"] += 1
                continue
            try:
                await index_note(db, "document", doc.id, full_content, config)
                _reindex_status["docs_indexed"] += 1
            except Exception:
                _reindex_status["errors"] += 1

        skipped = _reindex_status['memos_skipped'] + _reindex_status['docs_skipped']
        msg = f"索引完成：{_reindex_status['memos_indexed']} 条随想，{_reindex_status['docs_indexed']} 篇文档已索引"
        if excluded_total > 0:
            msg += f"，{excluded_total} 条不参与AI"
        if skipped > 0:
            msg += f"，{skipped} 条内容过短跳过"
        if _reindex_status['errors'] > 0:
            msg += f"，{_reindex_status['errors']} 个错误"
        _reindex_status.update({
            "running": False,
            "done": True,
            "current": "",
            "message": msg,
        })
        logger.info(f"[Reindex] {_reindex_status['message']}")
    except Exception as e:
        _reindex_status.update({"running": False, "done": True, "current": "", "message": f"索引失败: {e}"})
        logger.error(f"[Reindex] 失败: {e}")
    finally:
        db.close()
