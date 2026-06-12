from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()
public_router = APIRouter()

@router.post("/{document_id}", response_model=schemas.ShareResponse)
def create_share(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    doc = crud.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return crud.create_share(db, document_id)

@router.get("/{document_id}", response_model=schemas.ShareResponse | None)
def get_share(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.get_share_by_doc(db, document_id)

@router.delete("/{token}")
def delete_share(token: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    share = crud.delete_share(db, token)
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"ok": True}

@public_router.get("/share/{token}", response_model=schemas.SharedDocumentResponse)
def get_shared_document(token: str, db: Session = Depends(get_db)):
    share = crud.get_share_by_token(db, token)
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found or expired")
    doc = crud.get_document(db, share.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    nodes = crud.get_nodes(db, share.document_id)
    return schemas.SharedDocumentResponse(title=doc.title, nodes=nodes)
