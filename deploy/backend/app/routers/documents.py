from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from .. import crud, models, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user

router = APIRouter()

@router.get("/", response_model=List[schemas.Document])
def read_documents(search: str = None, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.get_documents(db, search=search)

@router.get("/recent", response_model=List[schemas.Document])
def read_recent_documents(limit: int = 20, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.get_recent_documents(db, limit=limit)

@router.get("/{document_id}", response_model=schemas.Document)
def read_document(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    doc = crud.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@router.post("/", response_model=schemas.Document)
def create_document(document: schemas.DocumentCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.create_document(db, document)

@router.post("/{document_id}/copy", response_model=schemas.Document)
def copy_document(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    new_doc = crud.copy_document(db, document_id)
    if not new_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return new_doc

@router.get("/{document_id}/nodes", response_model=List[schemas.Node])
def read_document_nodes(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    # Verify document exists
    doc = crud.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return crud.get_nodes(db, document_id)

@router.put("/{document_id}", response_model=schemas.Document)
def update_document(document_id: UUID, document: schemas.DocumentUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    updated_doc, status = crud.update_document(db, document_id, document)
    if status == "not_found":
        raise HTTPException(status_code=404, detail="Document not found")
    if status == "conflict":
        raise HTTPException(status_code=409, detail={"message": "版本冲突", "current_version": updated_doc.version, "current_title": updated_doc.title})
    return updated_doc

@router.delete("/{document_id}")
def delete_document(document_id: UUID, delete_children: bool = False, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if not crud.delete_document(db, document_id, delete_children=delete_children):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}
