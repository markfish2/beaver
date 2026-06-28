from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .routers import auth, users, documents, nodes, attachments, shares, diary, memos, search, public_memos, link_preview, excalidraw, todos, api_tokens, trash, share, habits, ai, ai_chat, ai_conversations, skills
from .database import engine, Base
from .limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import os
import logging

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Dynalist Clone API")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - only allow specific origins
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost,https://localhost,http://localhost:8080,http://localhost:5173,http://localhost:*")
origins = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if not exists
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "uploads")
THUMB_DIR = os.path.join(UPLOAD_DIR, "thumbs")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)
if not os.path.exists(THUMB_DIR):
    os.makedirs(THUMB_DIR)

logger = logging.getLogger(__name__)

@app.on_event("startup")
def generate_missing_thumbnails():
    """Generate thumbnails for existing images that don't have one yet."""
    IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'}
    try:
        from PIL import Image
        from io import BytesIO
        count = 0
        for filename in os.listdir(UPLOAD_DIR):
            filepath = os.path.join(UPLOAD_DIR, filename)
            if not os.path.isfile(filepath):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext not in IMAGE_EXTS or ext == '.svg':
                continue
            base = os.path.splitext(filename)[0]
            thumb_path = os.path.join(THUMB_DIR, f"{base}.jpg")
            if os.path.exists(thumb_path):
                continue
            try:
                with open(filepath, 'rb') as f:
                    content = f.read()
                img = Image.open(BytesIO(content))
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                img.thumbnail((1024, 1024), Image.LANCZOS)
                img.save(thumb_path, 'JPEG', quality=85, optimize=True)
                count += 1
            except Exception as e:
                logger.warning(f"启动时生成缩略图失败: {filename}, {e}")
        if count > 0:
            logger.info(f"启动时为 {count} 张已有图片生成了缩略图")
    except ImportError:
        logger.warning("Pillow 未安装，跳过缩略图生成")

@app.on_event("startup")
def migrate_database():
    """Add missing columns to existing tables."""
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "..", "data", "app.db")
    if not os.path.exists(db_path):
        return
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        # Check if is_public column exists in memos table
        cursor.execute("PRAGMA table_info(memos)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'is_public' not in columns:
            cursor.execute("ALTER TABLE memos ADD COLUMN is_public BOOLEAN DEFAULT 0")
            conn.commit()
            logger.info("已添加 memos.is_public 列")
        # Create todos table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS todos (
                id TEXT PRIMARY KEY,
                content TEXT DEFAULT '',
                is_completed BOOLEAN DEFAULT 0,
                sort_order REAL DEFAULT 0.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        logger.info("已确 todos 表存在")
        # Create api_tokens table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT DEFAULT 'API Token',
                token_hash TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP
            )
        """)
        conn.commit()
        logger.info("已确认 api_tokens 表存在")
        # Create habits table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS habits (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '📌',
                sort_order REAL DEFAULT 0.0,
                is_archived BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Create habit_records table if not exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS habit_records (
                id TEXT PRIMARY KEY,
                habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
                record_date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_habit_records_habit_id ON habit_records(habit_id)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_records_unique ON habit_records(habit_id, record_date)")
        conn.commit()
        logger.info("已确认 habits / habit_records 表存在")
        # Add updated_at column to documents table if not exists
        cursor.execute("PRAGMA table_info(documents)")
        doc_columns = [row[1] for row in cursor.fetchall()]
        if 'updated_at' not in doc_columns:
            cursor.execute("ALTER TABLE documents ADD COLUMN updated_at TIMESTAMP")
            cursor.execute("UPDATE documents SET updated_at = datetime('now')")
            conn.commit()
            logger.info("已添加 documents.updated_at 列")
        # Add user profile fields if not exists
        cursor.execute("PRAGMA table_info(users)")
        user_columns = [row[1] for row in cursor.fetchall()]
        for col_name, col_def in [
            ('nickname', "VARCHAR(50)"),
            ('email', "VARCHAR(100)"),
            ('phone', "VARCHAR(20)"),
            ('bio', "VARCHAR(200)"),
            ('avatar_path', "VARCHAR(500)"),
        ]:
            if col_name not in user_columns:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
                conn.commit()
                logger.info(f"已添加 users.{col_name} 列")
        # Add ai_excluded to documents and memos
        for table in ['documents', 'memos']:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [row[1] for row in cursor.fetchall()]
            if 'ai_excluded' not in columns:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN ai_excluded BOOLEAN DEFAULT 0")
                conn.commit()
                logger.info(f"已添加 {table}.ai_excluded 列")
        # Create AI conversation tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_conversations (
                id TEXT PRIMARY KEY,
                title VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_ai_messages_conversation ON ai_messages(conversation_id)")

        # 性能优化索引
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_documents_sort_order ON documents(sort_order)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_nodes_document_sort ON nodes(document_id, sort_order)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_memos_created_at_desc ON memos(created_at DESC)")

        conn.commit()
        logger.info("已确认 ai_conversations / ai_messages 表存在")
        conn.close()
    except Exception as e:
        logger.warning(f"数据库迁移失败: {e}")

@app.on_event("startup")
def migrate_excalidraw_to_files():
    """将画布数据从 SQLite 迁移到文件系统。"""
    import sqlite3
    import json as json_mod
    from . import excalidraw_storage as ex_storage
    db_path = os.path.join(os.path.dirname(__file__), "..", "data", "app.db")
    if not os.path.exists(db_path):
        return
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT document_id, scene_data FROM excalidraw_data WHERE scene_data IS NOT NULL AND scene_data != ''")
        rows = cursor.fetchall()
        conn.close()
        if not rows:
            return
        count = 0
        for doc_id, scene_data_str in rows:
            try:
                scene_obj = json_mod.loads(scene_data_str)
                files = scene_obj.pop("files", None)
                ex_storage.write_scene(doc_id, scene_obj)
                if files:
                    ex_storage.write_files(doc_id, files)
                count += 1
            except Exception as e:
                logger.warning(f"迁移画布数据失败: {doc_id}, {e}")
        if count > 0:
            # 清空 SQLite 中的 scene_data
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("UPDATE excalidraw_data SET scene_data = NULL WHERE scene_data IS NOT NULL")
            conn.commit()
            conn.close()
            logger.info(f"已迁移 {count} 个画布数据到文件系统")
    except Exception as e:
        logger.warning(f"画布数据迁移失败: {e}")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(nodes.router, prefix="/api/nodes", tags=["nodes"])
app.include_router(attachments.router, prefix="/api/attachments", tags=["attachments"])
app.include_router(shares.router, prefix="/api/shares", tags=["shares"])
app.include_router(shares.public_router, prefix="/api/public", tags=["public"])
app.include_router(public_memos.public_router, prefix="/api/public", tags=["public-memos"])
app.include_router(diary.router, prefix="/api/diary", tags=["diary"])
app.include_router(memos.router, prefix="/api/memos", tags=["memos"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(link_preview.router, prefix="/api/link-preview", tags=["link-preview"])
app.include_router(excalidraw.router, prefix="/api/excalidraw", tags=["excalidraw"])
app.include_router(todos.router, prefix="/api/todos", tags=["todos"])
app.include_router(api_tokens.router, prefix="/api/tokens", tags=["tokens"])
app.include_router(trash.router, prefix="/api/trash", tags=["trash"])
app.include_router(share.router, prefix="/api/share", tags=["share"])
app.include_router(habits.router, prefix="/api/habits", tags=["habits"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(ai_chat.router, prefix="/api/ai", tags=["ai-chat"])
app.include_router(ai_conversations.router, prefix="/api/ai/conversations", tags=["ai-conversations"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])

# Mount static files for uploads (must be after API routes)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"message": "Welcome to Dynalist Clone API"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
