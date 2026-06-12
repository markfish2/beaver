from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user

router = APIRouter()

@router.post("/", response_model=schemas.Todo)
def create_todo(
    todo: schemas.TodoCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_todo(db, todo)

@router.get("/", response_model=List[schemas.Todo])
def list_todos(
    completed: bool = False,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.get_todos(db, completed=completed)

@router.put("/{todo_id}", response_model=schemas.Todo)
def update_todo(
    todo_id: UUID,
    data: schemas.TodoUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    todo = crud.update_todo(db, todo_id, data)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo

@router.delete("/{todo_id}")
def delete_todo(
    todo_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if not crud.delete_todo(db, todo_id):
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"ok": True}
