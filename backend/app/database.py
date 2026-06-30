from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# Create data directory if not exists (for local development)
# In Docker, this will likely be a mounted volume
os.makedirs("./data", exist_ok=True)

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,  # 增加超时时间到 30 秒
    },
    pool_pre_ping=True,
    pool_recycle=3600,
)

# 启用 WAL 模式和优化 SQLite 配置
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")  # 启用 WAL 模式，提高并发性能
    cursor.execute("PRAGMA synchronous=FULL")  # 每次 commit 等待数据写入磁盘，防止数据丢失
    cursor.execute("PRAGMA cache_size=-20000")  # 增加缓存到 20MB
    cursor.execute("PRAGMA busy_timeout=30000")  # 忙碌等待超时 30 秒
    # 加载 sqlite-vec 向量搜索扩展
    try:
        import sqlite_vec
        sqlite_vec.load(dbapi_connection)
    except Exception:
        pass  # 扩展不可用时静默跳过
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
