import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import crud, schemas

router = APIRouter()


@router.get("/")
def list_projects(db: Session = Depends(get_db)):
    projects = crud.get_projects(db)
    return projects


@router.get("/archived")
def list_archived_projects(db: Session = Depends(get_db)):
    projects = crud.get_archived_projects(db)
    return projects


@router.post("/")
def create_project(data: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.create_project(db, data.name)


@router.put("/reorder")
def reorder_projects(data: schemas.ProjectReorder, db: Session = Depends(get_db)):
    crud.reorder_projects(db, data.ids)
    return {"ok": True}


@router.put("/{project_id}")
def update_project(project_id: str, data: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    result = crud.update_project(db, uuid.UUID(project_id), data)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    if not crud.delete_project(db, uuid.UUID(project_id)):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@router.put("/{project_id}/archive")
def archive_project(project_id: str, db: Session = Depends(get_db)):
    result = crud.archive_project(db, uuid.UUID(project_id), True)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.put("/{project_id}/unarchive")
def unarchive_project(project_id: str, db: Session = Depends(get_db)):
    result = crud.archive_project(db, uuid.UUID(project_id), False)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.get("/{project_id}/tasks")
def list_tasks(project_id: str, db: Session = Depends(get_db)):
    return crud.get_tasks(db, uuid.UUID(project_id))
