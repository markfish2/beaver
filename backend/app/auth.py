from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import secrets

# JWT secret key - MUST be set via environment variable in production
# Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    import warnings
    warnings.warn(
        "SECRET_KEY not set! Using random key (tokens will invalidate on restart). "
        "Set SECRET_KEY environment variable for production.",
        stacklevel=2
    )
    SECRET_KEY = secrets.token_hex(32)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "43200"))  # 30 days default

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

def _bcrypt_safe_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) <= 72:
        return password
    return raw[:72].decode("utf-8", errors="ignore")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(_bcrypt_safe_password(plain_password), hashed_password)

def get_password_hash(password):
    return pwd_context.hash(_bcrypt_safe_password(password))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
