from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from .. import crud, schemas

router = APIRouter()

@router.post("/", response_model=schemas.ApiTokenCreated)
def create_token(
    data: schemas.ApiTokenCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    db_token, raw_token = crud.create_api_token(db, current_user.id, data.name)
    return schemas.ApiTokenCreated(
        id=db_token.id,
        name=db_token.name,
        created_at=db_token.created_at,
        last_used_at=db_token.last_used_at,
        token=raw_token,
    )

@router.get("/", response_model=list[schemas.ApiTokenInfo])
def list_tokens(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    tokens = crud.get_api_tokens(db, current_user.id)
    return tokens

@router.delete("/{token_id}")
def delete_token(
    token_id: str,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    import uuid
    ok = crud.delete_api_token(db, uuid.UUID(token_id), current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"ok": True}
