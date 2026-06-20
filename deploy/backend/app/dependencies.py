import time
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from .database import get_db
from . import auth, crud, schemas

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

# Simple TTL cache for user data (stores dict to avoid detached instance issues)
_user_cache: dict[str, tuple[float, dict]] = {}
_USER_CACHE_TTL = 300  # 5 minutes

def invalidate_user_cache(username: str | None = None):
    """Invalidate cached user data. Call after user settings/password change."""
    if username:
        _user_cache.pop(username, None)
    else:
        _user_cache.clear()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Check cache first
    now = time.time()
    cached = _user_cache.get(username)
    if cached and (now - cached[0]) < _USER_CACHE_TTL:
        return schemas.User(**cached[1])

    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception

    # Cache user data as dict to avoid detached instance issues
    user_data = {
        "id": user.id,
        "username": user.username,
        "theme": user.theme,
        "font_family": user.font_family,
        "font_size": user.font_size,
        "memo_columns": user.memo_columns,
        "nickname": user.nickname,
        "email": user.email,
        "phone": user.phone,
        "bio": user.bio,
        "avatar_path": user.avatar_path,
    }
    _user_cache[username] = (now, user_data)
    return schemas.User(**user_data)

def get_current_user_flexible(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """支持 JWT 和 API Token 两种认证方式"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 先尝试 JWT
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username:
            now = time.time()
            cached = _user_cache.get(username)
            if cached and (now - cached[0]) < _USER_CACHE_TTL:
                return schemas.User(**cached[1])
            user = crud.get_user_by_username(db, username=username)
            if user:
                user_data = {
                    "id": user.id,
                    "username": user.username,
                    "theme": user.theme,
                    "font_family": user.font_family,
                    "font_size": user.font_size,
                    "memo_columns": user.memo_columns,
                    "nickname": user.nickname,
                    "email": user.email,
                    "phone": user.phone,
                    "bio": user.bio,
                    "avatar_path": user.avatar_path,
                }
                _user_cache[username] = (now, user_data)
                return schemas.User(**user_data)
    except JWTError:
        pass

    # JWT 失败，尝试 API Token
    user = crud.verify_api_token(db, token)
    if user is None:
        raise credentials_exception

    return schemas.User(
        id=user.id,
        username=user.username,
        theme=user.theme,
        font_family=user.font_family,
        font_size=user.font_size,
        memo_columns=user.memo_columns,
        nickname=user.nickname,
        email=user.email,
        phone=user.phone,
        bio=user.bio,
        avatar_path=user.avatar_path,
    )
