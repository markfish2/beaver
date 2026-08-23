from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .routers import auth, users, documents, nodes, attachments, shares, diary, memos, search, public_memos, link_preview, excalidraw, todos, api_tokens, trash, share, habits, ai, ai_chat, ai_conversations, skills, projects, tasks
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
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost,https://localhost,http://localhost:8080,http://localhost:*")
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


class SafeUploadStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if path.lower().endswith(".svg"):
            response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
            response.headers["Content-Disposition"] = "attachment"
        return response

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
def run_database_migrations():
    from .migrations import migrate_database
    db_path = os.path.join(os.path.dirname(__file__), "..", "data", "app.db")
    migrate_database(db_path)


@app.on_event("startup")
def migrate_excalidraw_to_files():
    """将旧画布数据安全迁移到文件系统，不覆盖已存在的场景。"""
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
        migrated_ids = []
        for doc_id, scene_data_str in rows:
            try:
                if ex_storage.read_scene(doc_id) is not None:
                    # 文件系统版本已存在，应视为权威数据，仅清理旧 SQLite 副本。
                    migrated_ids.append(doc_id)
                    continue
                scene_obj = json_mod.loads(scene_data_str)
                files = scene_obj.pop("files", None)
                ex_storage.write_scene(doc_id, scene_obj)
                if isinstance(files, dict):
                    meta = {}
                    for file_id, file_info in files.items():
                        if not isinstance(file_info, dict):
                            continue
                        data_url = file_info.get("dataURL") or file_info.get("dataUrl")
                        if data_url:
                            meta[file_id] = ex_storage.write_image_file(doc_id, file_id, data_url)
                    if meta:
                        ex_storage.write_files_meta(doc_id, meta)
                migrated_ids.append(doc_id)
            except Exception as e:
                logger.warning(f"迁移画布数据失败: {doc_id}, {e}")
        if migrated_ids:
            # 只清空已经成功迁移或确认存在文件系统版本的记录。
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            placeholders = ",".join("?" for _ in migrated_ids)
            cursor.execute(
                f"UPDATE excalidraw_data SET scene_data = NULL WHERE document_id IN ({placeholders})",
                migrated_ids,
            )
            conn.commit()
            conn.close()
            logger.info(f"已处理 {len(migrated_ids)} 个旧画布数据")
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
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])

# Mount static files for uploads (must be after API routes)
app.mount("/uploads", SafeUploadStaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"message": "Welcome to Dynalist Clone API"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
