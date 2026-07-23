from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import uuid
import mimetypes
import logging
from datetime import datetime
from io import BytesIO

from ..database import get_db
from ..models import Attachment
from ..schemas import UploadResponse
from ..dependencies import get_current_user_flexible as get_current_user
from ..schemas import User
from ..url_safety import is_safe_http_url, is_safe_peer_response

router = APIRouter(
    tags=["attachments"]
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
THUMB_DIR = os.path.join(UPLOAD_DIR, "thumbs")

# 文件大小限制 (50MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

# 缩略图最大边长
THUMB_MAX_SIZE = 1024


def validate_raster_image(content: bytes) -> bool:
    try:
        from PIL import Image
        with Image.open(BytesIO(content)) as image:
            image.verify()
        return True
    except Exception:
        return False

def ensure_upload_dir():
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    if not os.path.exists(THUMB_DIR):
        os.makedirs(THUMB_DIR)

def generate_thumbnail(content: bytes, filename: str) -> str | None:
    """Generate a thumbnail for an image file. Returns thumbnail URL path or None."""
    try:
        from PIL import Image
        img = Image.open(BytesIO(content))
        # Convert RGBA/P to RGB for JPEG output
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        # Resize keeping aspect ratio, max edge = THUMB_MAX_SIZE
        img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE), Image.LANCZOS)
        # Save as JPEG
        base = os.path.splitext(filename)[0]
        thumb_filename = f"{base}.jpg"
        thumb_path = os.path.join(THUMB_DIR, thumb_filename)
        img.save(thumb_path, 'JPEG', quality=85, optimize=True)
        return f"/uploads/thumbs/{thumb_filename}"
    except Exception as e:
        logger.warning(f"生成缩略图失败: {filename}, 错误: {e}")
        return None

@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ensure_upload_dir()
    
    try:
        # 读取文件内容
        content = await file.read()
        file_size = len(content)
        
        # 检查文件大小
        if file_size > MAX_FILE_SIZE:
            logger.warning(f"文件大小超过限制: {file.filename}, 大小: {file_size} bytes, 用户: {current_user.username}")
            raise HTTPException(
                status_code=413, 
                detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)"
            )
        
        # 检查文件类型（仅拒绝可执行/脚本类型，其余放行，大小限制兜底）
        content_type = file.content_type or "application/octet-stream"
        BLOCKED_TYPES = ['application/x-executable', 'application/x-msdos-program', 'application/x-sh', 'application/x-bat', 'image/svg+xml']
        file_ext = os.path.splitext(file.filename or "")[1].lower()
        looks_like_svg = content.lstrip().lower().startswith((b'<svg', b'<?xml')) and b'<svg' in content[:4096].lower()
        if content_type in BLOCKED_TYPES or file_ext == '.svg' or looks_like_svg:
            logger.warning(f"不允许的文件类型: {file.filename}, 类型: {content_type}, 用户: {current_user.username}")
            raise HTTPException(
                status_code=400,
                detail=f"不允许上传可执行文件"
            )
        if content_type.startswith('image/') and not validate_raster_image(content):
            raise HTTPException(status_code=400, detail="图片内容无效或格式不受支持")
        
        # 生成唯一文件名
        file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # 保存文件
        with open(file_path, "wb") as f:
            f.write(content)
        
        # 确定文件类型 & 生成缩略图
        thumbnail_path = None
        if content_type.startswith("image/"):
            file_type = "image"
            thumbnail_path = generate_thumbnail(content, unique_filename)
        else:
            file_type = "attachment"
        
        # 创建数据库记录
        attachment = Attachment(
            file_path=file_path,
            file_name=file.filename or "unknown",
            file_type=content_type,
            file_size=file_size
        )
        db.add(attachment)
        db.commit()
        db.refresh(attachment)
        
        logger.info(f"文件上传成功: {file.filename}, 大小: {file_size} bytes, 用户: {current_user.username}")
        
        return UploadResponse(
            file_path=f"/uploads/{unique_filename}",
            file_name=file.filename or "unknown",
            file_type=content_type,
            file_size=file_size,
            thumbnail_path=thumbnail_path
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件上传失败: {str(e)}, 文件名: {file.filename}, 用户: {current_user.username}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

@router.post("/upload-audio", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """上传音频文件，自动转为 MP4/AAC 格式"""
    import subprocess
    ensure_upload_dir()

    try:
        content = await file.read()
        file_size = len(content)

        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)")

        # 先保存原始文件到临时路径
        raw_filename = f"{uuid.uuid4()}.webm"
        raw_path = os.path.join(UPLOAD_DIR, raw_filename)
        with open(raw_path, "wb") as f:
            f.write(content)

        # 转换为 MP4/AAC
        mp4_filename = f"{uuid.uuid4()}.mp4"
        mp4_path = os.path.join(UPLOAD_DIR, mp4_filename)
        try:
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", raw_path, "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4_path],
                capture_output=True, timeout=30
            )
            if result.returncode != 0:
                logger.warning(f"ffmpeg 转换失败，使用原始文件: {result.stderr.decode()}")
                # 转换失败，使用原始文件
                mp4_filename = raw_filename
                mp4_path = raw_path
            else:
                # 转换成功，删除原始文件
                os.remove(raw_path)
        except Exception as e:
            logger.warning(f"ffmpeg 转换异常，使用原始文件: {e}")
            mp4_filename = raw_filename
            mp4_path = raw_path

        # 获取转换后文件大小
        final_size = os.path.getsize(mp4_path)

        # 创建数据库记录
        attachment = Attachment(
            file_path=mp4_path,
            file_name=file.filename or "audio.mp4",
            file_type="audio/mp4",
            file_size=final_size
        )
        db.add(attachment)
        db.commit()
        db.refresh(attachment)

        return UploadResponse(
            file_path=f"/uploads/{mp4_filename}",
            file_name=file.filename or "audio.mp4",
            file_type="audio/mp4",
            file_size=final_size,
            thumbnail_path=None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"音频上传失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

class UploadFromUrlRequest(BaseModel):
    url: str

@router.post("/upload-from-url", response_model=UploadResponse)
async def upload_from_url(
    req: UploadFromUrlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """从 URL 下载图片并上传到本地服务器（绕过浏览器 CORS 限制）"""
    import httpx
    ensure_upload_dir()

    if not is_safe_http_url(req.url):
        raise HTTPException(status_code=400, detail="不允许访问该 URL")

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            current_url = req.url
            for _ in range(6):
                if not is_safe_http_url(current_url):
                    raise HTTPException(status_code=400, detail="重定向目标不安全")
                async with client.stream('GET', current_url, headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; MiniFlowy/1.0)',
                    'Referer': current_url,
                }) as resp:
                    if not is_safe_peer_response(resp):
                        raise HTTPException(status_code=400, detail="连接目标不安全")
                    if resp.is_redirect:
                        location = resp.headers.get('location')
                        if not location:
                            raise HTTPException(status_code=400, detail="无效重定向")
                        from urllib.parse import urljoin
                        current_url = urljoin(current_url, location)
                        continue
                    if resp.status_code != 200:
                        raise HTTPException(status_code=400, detail=f"下载失败: HTTP {resp.status_code}")
                    try:
                        declared_size = int(resp.headers.get('content-length', '0') or 0)
                    except ValueError:
                        declared_size = 0
                    if declared_size > MAX_FILE_SIZE:
                        raise HTTPException(status_code=413, detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)")
                    chunks = []
                    received = 0
                    async for chunk in resp.aiter_bytes():
                        received += len(chunk)
                        if received > MAX_FILE_SIZE:
                            raise HTTPException(status_code=413, detail=f"文件大小超过限制 ({MAX_FILE_SIZE // 1024 // 1024}MB)")
                        chunks.append(chunk)
                    content = b''.join(chunks)
                    content_type = resp.headers.get('content-type', 'image/jpeg').split(';')[0].strip().lower()
                    break
            else:
                raise HTTPException(status_code=400, detail="重定向次数过多")

        file_size = len(content)
        if not content_type.startswith('image/') or content_type == 'image/svg+xml':
            raise HTTPException(status_code=400, detail="URL 返回的不是图片")
        if not validate_raster_image(content):
            raise HTTPException(status_code=400, detail="URL 返回的图片内容无效")

        ext = mimetypes.guess_extension(content_type) or '.jpg'
        if ext == '.jpe':
            ext = '.jpg'
        unique_filename = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as f:
            f.write(content)

        thumbnail_path = generate_thumbnail(content, unique_filename)

        # 从 URL 提取原始文件名
        from urllib.parse import urlparse, unquote
        parsed = urlparse(req.url)
        original_name = unquote(parsed.path.split('/')[-1].split('?')[0]) or f"image{ext}"

        attachment = Attachment(
            file_path=file_path,
            file_name=original_name,
            file_type=content_type,
            file_size=file_size
        )
        db.add(attachment)
        db.commit()
        db.refresh(attachment)

        return UploadResponse(
            file_path=f"/uploads/{unique_filename}",
            file_name=original_name,
            file_type=content_type,
            file_size=file_size,
            thumbnail_path=thumbnail_path
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"URL 图片上传失败: {req.url}, 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

@router.get("/download/{filename}")
async def download_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if not filename or filename != os.path.basename(filename):
        raise HTTPException(status_code=400, detail="无效的文件名")
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    attachment = db.query(Attachment).filter(
        Attachment.file_path.endswith(filename)
    ).first()
    
    original_filename = attachment.file_name if attachment else filename
    
    return FileResponse(
        path=file_path,
        filename=original_filename,
        media_type="application/octet-stream"
    )

@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")
    
    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)
    
    db.delete(attachment)
    db.commit()
    
    return {"message": "附件已删除"}
