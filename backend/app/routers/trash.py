from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from .. import crud, schemas, dependencies

router = APIRouter()

@router.get("/")
def get_trash(db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_user)):
    """获取回收站所有内容"""
    items = crud.get_trash_items(db)
    return {
        "documents": [schemas.Document.model_validate(d) for d in items["documents"]],
        "memos": [schemas.Memo.model_validate(m) for m in items["memos"]],
    }

@router.post("/restore/{item_type}/{item_id}")
def restore_item(item_type: str, item_id: UUID, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_user)):
    """恢复回收站项目"""
    if item_type == "document":
        if not crud.restore_document(db, item_id):
            raise HTTPException(status_code=404, detail="Document not found in trash")
    elif item_type == "memo":
        if not crud.restore_memo(db, item_id):
            raise HTTPException(status_code=404, detail="Memo not found in trash")
    else:
        raise HTTPException(status_code=400, detail="Invalid item type")
    return {"ok": True}

@router.delete("/{item_type}/{item_id}")
def permanent_delete(item_type: str, item_id: UUID, db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_user)):
    """彻底删除"""
    if item_type == "document":
        if not crud.permanent_delete_document(db, item_id):
            raise HTTPException(status_code=404, detail="Document not found")
    elif item_type == "memo":
        if not crud.permanent_delete_memo(db, item_id):
            raise HTTPException(status_code=404, detail="Memo not found")
    else:
        raise HTTPException(status_code=400, detail="Invalid item type")
    return {"ok": True}

@router.post("/empty")
def empty_trash(db: Session = Depends(dependencies.get_db), current_user=Depends(dependencies.get_current_user)):
    """清空回收站"""
    crud.empty_trash(db)
    return {"ok": True}
