from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from .. import crud, schemas
from datetime import date

router = APIRouter()


@router.put("/reorder")
def reorder_tasks(data: schemas.TaskReorder, db: Session = Depends(get_db)):
    crud.reorder_tasks(db, data.items)
    return {"ok": True}


@router.post("/{project_id}")
def create_task(project_id: str, data: schemas.TaskCreate, db: Session = Depends(get_db)):
    import uuid
    return crud.create_task(db, uuid.UUID(project_id), data)


@router.put("/{task_id}")
def update_task(task_id: str, data: schemas.TaskUpdate, db: Session = Depends(get_db)):
    import uuid as _uuid
    result = crud.update_task(db, _uuid.UUID(task_id), data)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return result


@router.delete("/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db)):
    import uuid as _uuid
    if not crud.delete_task(db, _uuid.UUID(task_id)):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


@router.put("/{task_id}/toggle")
def toggle_task(task_id: str, db: Session = Depends(get_db)):
    import uuid as _uuid
    task, diary_trigger = crud.toggle_task_done(db, _uuid.UUID(task_id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # 日记联动：完成时自动添加到当天日记
    if diary_trigger:
        try:
            _add_to_diary(db, task)
        except Exception:
            pass  # 日记联动失败不影响主流程

    return task


def _add_to_diary(db: Session, task):
    """将完成的任务添加到当天日记"""
    from .. import models

    today = date.today()
    year, month, day = today.year, today.month, today.day

    # 获取项目名称
    project = db.query(models.Project).filter(models.Project.id == task.project_id).first()
    if not project:
        return

    # 获取或创建月度日记文档
    doc, _ = crud.get_or_create_monthly_diary_doc(db, year, month)
    if not doc:
        return

    # 获取或创建当天日期节点
    day_node, _, _ = crud.get_or_create_day_node(db, doc.id, year, month, day)
    if not day_node:
        return

    # 检查是否已添加过（避免重复）
    existing = db.query(models.Node).filter(
        models.Node.document_id == doc.id,
        models.Node.parent_node_id == day_node.id,
        models.Node.content.contains(task.title)
    ).first()
    if existing:
        return

    # 在日期节点下创建子节点
    content = f"{task.title} #{project.name}"
    # 计算 sort_order：取当天最大 sort_order + 1
    max_order = db.query(models.Node.sort_order).filter(
        models.Node.parent_node_id == day_node.id
    ).order_by(models.Node.sort_order.desc()).first()
    next_order = (max_order[0] + 1) if max_order else 1.0

    node = models.Node(
        document_id=doc.id,
        content=content,
        parent_node_id=day_node.id,
        sort_order=next_order,
        is_todo=True,
        is_completed=True,
    )
    db.add(node)
    db.commit()
