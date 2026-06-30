from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from uuid import UUID

from .. import crud, schemas
from .. import excalidraw_storage as ex_storage
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/{document_id}", response_model=schemas.ExcalidrawData)
async def get_excalidraw_data(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取画布数据（从文件系统读取，合并图片数据）"""
    # 验证文档存在
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(status_code=400, detail="Document is not excalidraw type")

    # 获取画布数据（CRUD 从文件系统读取 scene_data + files，老数据自动迁移）
    excalidraw = crud.get_excalidraw_data(db, document_id)
    if not excalidraw:
        # 如果不存在，自动创建
        excalidraw = crud.create_excalidraw_data(
            db,
            schemas.ExcalidrawDataCreate(document_id=document_id)
        )

    return excalidraw

@router.post("/", response_model=schemas.ExcalidrawData)
async def create_excalidraw_data(
    data: schemas.ExcalidrawDataCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """创建画布数据"""
    # 验证文档存在
    document = crud.get_document(db, data.document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(status_code=400, detail="Document is not excalidraw type")

    # 检查是否已存在
    existing = crud.get_excalidraw_data(db, data.document_id)
    if existing:
        raise HTTPException(status_code=400, detail="Excalidraw data already exists")

    return crud.create_excalidraw_data(db, data)

@router.put("/{document_id}", response_model=schemas.ExcalidrawData)
async def update_excalidraw_data(
    document_id: UUID,
    data: schemas.ExcalidrawDataUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """更新画布数据（自动保存，带版本控制）"""
    # 验证文档存在
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 验证文档类型
    if document.type != 'excalidraw':
        raise HTTPException(status_code=400, detail="Document is not excalidraw type")

    # 更新数据（带版本检查）
    excalidraw, conflict_version = crud.update_excalidraw_data(db, document_id, data)
    if conflict_version is not None:
        raise HTTPException(
            status_code=409,
            detail={"message": "Version conflict", "current_version": conflict_version}
        )
    if not excalidraw:
        raise HTTPException(status_code=404, detail="Excalidraw data not found")

    return excalidraw

@router.get("/{document_id}/files")
async def get_excalidraw_files_meta(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取画布图片文件元数据（fileId → mimeType 映射）"""
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return ex_storage.read_files_meta(str(document_id))


@router.get("/{document_id}/files/{file_id}")
async def get_excalidraw_file(
    document_id: UUID,
    file_id: str,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """获取单个图片文件（返回二进制）"""
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    result = ex_storage.read_image_file(str(document_id), file_id)
    if not result:
        raise HTTPException(status_code=404, detail="File not found")
    raw, mime = result
    return Response(
        content=raw,
        media_type=mime,
        headers={"Cache-Control": "public, max-age=604800, immutable"}
    )


@router.delete("/{document_id}")
async def delete_excalidraw_data(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """删除画布数据"""
    # 验证文档存在
    document = crud.get_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # 删除画布数据
    success = crud.delete_excalidraw_data(db, document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Excalidraw data not found")

    return {"ok": True}
