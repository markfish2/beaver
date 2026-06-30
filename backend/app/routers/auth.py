from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from .. import crud, models, schemas, auth, database
from ..limiter import limiter

router = APIRouter()

@router.post("/token", response_model=schemas.Token)
@limiter.limit("20/minute")  # 🚀 放宽限流：每分钟 20 次
def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/setup", response_model=schemas.User)
def setup_admin(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    # Check if any user exists
    if crud.get_users_count(db) > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Setup already completed. Registration is closed."
        )
    return crud.create_user(db, user=user)

@router.get("/setup/status")
def check_setup_status(db: Session = Depends(database.get_db)):
    count = crud.get_users_count(db)
    return {"setup_required": count == 0}
