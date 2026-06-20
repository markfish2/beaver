from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import crud, models, schemas, auth
from ..database import get_db
from ..dependencies import get_current_user, invalidate_user_cache

router = APIRouter()

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: schemas.User = Depends(get_current_user)):
    return current_user

@router.put("/settings", response_model=schemas.User)
def update_settings(settings: schemas.UserSettingsUpdate, current_user: schemas.User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = crud.update_user_settings(db, current_user.id, settings)
    invalidate_user_cache(current_user.username)
    return result

@router.put("/profile", response_model=schemas.User)
def update_profile(profile: schemas.UserProfileUpdate, current_user: schemas.User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = crud.update_user_profile(db, current_user.id, profile)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    invalidate_user_cache(current_user.username)
    return result

@router.put("/password", response_model=schemas.User)
def update_password(password_update: schemas.PasswordUpdate, current_user: schemas.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 从数据库获取真实用户模型（Pydantic schema 没有 password_hash）
    db_user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    # Verify old password
    if not auth.verify_password(password_update.old_password, db_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect old password")

    result = crud.update_user_password(db, current_user.id, password_update.new_password)
    invalidate_user_cache(current_user.username)
    return result
