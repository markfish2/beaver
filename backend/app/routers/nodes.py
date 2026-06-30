from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from .. import crud, models, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user

router = APIRouter()

# Batch operation size limit to prevent OOM and database lock contention
BATCH_SIZE_LIMIT = 500

@router.post("/", response_model=schemas.Node)
def create_node(node: schemas.NodeCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.create_node(db, node)

@router.put("/batch/move", response_model=list[schemas.Node])
def batch_move_nodes(updates: list[schemas.NodeBatchUpdateItem], db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(updates) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    return crud.batch_move_nodes(db, updates)

@router.post("/batch/delete")
def batch_delete_nodes_post(node_ids: list[UUID], db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(node_ids) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    crud.batch_delete_nodes(db, node_ids)
    return {"ok": True}

@router.post("/batch/create", response_model=list[schemas.Node])
def batch_create_nodes(nodes_data: list[schemas.NodeBatchCreateItem], db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(nodes_data) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    return crud.batch_create_nodes(db, nodes_data)

@router.delete("/batch/delete")
def batch_delete_nodes(node_ids: list[UUID], db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(node_ids) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    crud.batch_delete_nodes(db, node_ids)
    return {"ok": True}

@router.put("/{node_id}", response_model=schemas.Node)
def update_node(node_id: UUID, node: schemas.NodeUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    updated_node, status = crud.update_node(db, node_id, node)
    if status == "not_found":
        raise HTTPException(status_code=404, detail="Node not found")
    if status == "conflict":
        raise HTTPException(status_code=409, detail={"message": "版本冲突", "current_version": updated_node.version, "current_content": updated_node.content})
    return updated_node

@router.put("/{node_id}/move", response_model=schemas.Node)
def move_node(node_id: UUID, move: schemas.NodeMove, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    updated_node = crud.move_node(db, node_id, move)
    if not updated_node:
        raise HTTPException(status_code=404, detail="Node not found")
    return updated_node

@router.delete("/{node_id}")
def delete_node(node_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if not crud.delete_node(db, node_id):
        raise HTTPException(status_code=404, detail="Node not found")
    return {"ok": True}

@router.post("/batch/update", response_model=list[schemas.Node])
def batch_update_nodes(updates: list[schemas.NodeBatchUpdateItem], db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(updates) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    updated_nodes = crud.batch_update_nodes(db, updates)
    return updated_nodes

@router.post("/batch/properties", response_model=list[schemas.Node])
def batch_update_node_properties(updates: list[schemas.NodeBatchPropertyUpdateItem], db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(updates) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    updated_nodes = crud.batch_update_node_properties(db, updates)
    return updated_nodes

@router.post("/batch/save")
def batch_save_operations(request: schemas.BatchSaveRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if len(request.operations) > BATCH_SIZE_LIMIT:
        raise HTTPException(status_code=400, detail=f"批量操作最多支持 {BATCH_SIZE_LIMIT} 条记录")
    return crud.batch_save_operations(db, request.operations)
