from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user

router = APIRouter()

@router.post("/", response_model=schemas.Memo)
def create_memo(
    memo: schemas.MemoCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_memo(db, memo)

@router.get("/", response_model=schemas.MemoListResponse)
def list_memos(
    page: int = 1,
    page_size: int = 20,
    archived: bool = False,
    public: bool = False,
    tag: str = None,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    memos, total = crud.get_memos(db, page=page, page_size=page_size, archived=archived, public=public, tag=tag, search=search)
    return schemas.MemoListResponse(memos=memos, total=total, page=page, page_size=page_size)

@router.get("/heatmap/{year}/{month}", response_model=schemas.MemoHeatmapResponse)
def get_memo_heatmap(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")
    day_counts = crud.get_memo_heatmap(db, year, month)
    return schemas.MemoHeatmapResponse(year=year, month=month, days=day_counts)

@router.get("/tags", response_model=schemas.MemoTagsResponse)
def get_memo_tags(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    tags = crud.get_memo_tags(db)
    return schemas.MemoTagsResponse(tags=tags)

@router.get("/{memo_id}", response_model=schemas.Memo)
def get_memo(
    memo_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    memo = crud.get_memo(db, memo_id)
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    return memo

@router.put("/{memo_id}", response_model=schemas.Memo)
def update_memo(
    memo_id: UUID,
    memo: schemas.MemoUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    updated = crud.update_memo(db, memo_id, memo)
    if not updated:
        raise HTTPException(status_code=404, detail="Memo not found")
    return updated

@router.delete("/{memo_id}")
def delete_memo(
    memo_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if not crud.delete_memo(db, memo_id):
        raise HTTPException(status_code=404, detail="Memo not found")
    return {"ok": True}
