from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/", response_model=schemas.SearchResponse)
def search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    results = crud.unified_search(db, q, limit=limit)
    return schemas.SearchResponse(
        query=q,
        results=[schemas.SearchResultItem(**r) for r in results],
        total=len(results)
    )
