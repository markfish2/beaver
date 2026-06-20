"""
AI 对话历史路由
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user
import json

router = APIRouter()


@router.get("/", response_model=list[dict])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取所有对话列表"""
    convs = crud.get_conversations(db)
    return [
        {
            "id": str(c.id),
            "title": c.title,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in convs
    ]


@router.post("/", response_model=dict)
def create_conversation(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """创建新对话"""
    conv = crud.create_conversation(db)
    return {
        "id": str(conv.id),
        "title": conv.title,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
    }


@router.get("/{conversation_id}", response_model=dict)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取对话详情（含消息）"""
    conv = crud.get_conversation(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")

    messages = crud.get_messages(db, conversation_id)
    return {
        "id": str(conv.id),
        "title": conv.title,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "sources": json.loads(m.sources) if m.sources else None,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
    }


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """删除对话"""
    if not crud.delete_conversation(db, conversation_id):
        raise HTTPException(status_code=404, detail="对话不存在")
    return {"ok": True}
