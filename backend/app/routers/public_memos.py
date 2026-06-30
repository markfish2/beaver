from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from .. import models
from ..database import get_db

public_router = APIRouter()


@public_router.get("/memos")
def list_public_memos(db: Session = Depends(get_db)):
    memos = db.query(models.Memo).filter(
        models.Memo.is_public == True,
        models.Memo.is_archived == False
    ).order_by(models.Memo.created_at.desc()).all()
    return [
        {
            "id": str(m.id),
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        }
        for m in memos
    ]


@public_router.get("/memos/{memo_id}")
def get_public_memo(memo_id: UUID, db: Session = Depends(get_db)):
    memo = db.query(models.Memo).filter(
        models.Memo.id == memo_id,
        models.Memo.is_public == True,
        models.Memo.is_archived == False
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Public memo not found")
    return {
        "id": str(memo.id),
        "content": memo.content,
        "created_at": memo.created_at.isoformat() if memo.created_at else None,
        "updated_at": memo.updated_at.isoformat() if memo.updated_at else None,
    }
