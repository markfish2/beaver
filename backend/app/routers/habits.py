from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user

router = APIRouter()

@router.get("/", response_model=List[schemas.HabitWithRecords])
def list_habits(
    week_offset: int = 0,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.get_habits(db, week_offset=week_offset)

@router.post("/", response_model=schemas.HabitWithRecords)
def create_habit(
    habit: schemas.HabitCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    created = crud.create_habit(db, habit)
    # 返回时带上本周打卡记录（空列表）
    return {
        "id": created.id,
        "name": created.name,
        "icon": created.icon,
        "sort_order": created.sort_order,
        "is_archived": created.is_archived,
        "created_at": created.created_at,
        "week_records": []
    }

@router.put("/{habit_id}", response_model=schemas.HabitWithRecords)
def update_habit(
    habit_id: UUID,
    data: schemas.HabitUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    habit = crud.update_habit(db, habit_id, data)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    # 获取本周打卡记录
    from datetime import date, timedelta
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    from .. import models
    records = db.query(models.HabitRecord).filter(
        models.HabitRecord.habit_id == habit.id,
        models.HabitRecord.record_date >= monday.isoformat(),
        models.HabitRecord.record_date <= sunday.isoformat()
    ).all()
    return {
        "id": habit.id,
        "name": habit.name,
        "icon": habit.icon,
        "sort_order": habit.sort_order,
        "is_archived": habit.is_archived,
        "created_at": habit.created_at,
        "week_records": [r.record_date for r in records]
    }

@router.delete("/{habit_id}")
def delete_habit(
    habit_id: UUID,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if not crud.delete_habit(db, habit_id):
        raise HTTPException(status_code=404, detail="Habit not found")
    return {"ok": True}

@router.post("/{habit_id}/toggle")
def toggle_habit(
    habit_id: UUID,
    data: schemas.HabitToggleRequest,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    checked = crud.toggle_habit_record(db, habit_id, data.date)
    return {"checked": checked, "date": data.date}
