"""
分享接口：接收 URL，抓取正文内容（文字+图片），自动创建 memo
"""
import os
import re
import uuid
import ipaddress
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from readability import Document as ReadabilityDocument
import html2text

from .. import crud, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")

router = APIRouter()

# SSRF 防护：禁止访问内网地址
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 允许的图片类型
_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
_IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}


class ShareRequest(BaseModel):
    url: str | None = None
    title: str | None = None
    text: str | None = None
    extracted_content: str | None = None  # 前端预提取的正文（markdown）


class ShareResponse(BaseModel):
    memo_id: str
    content: str
    images_count: int = 0


def _is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        ip = ipaddress.ip_address(hostname)
        for net in _PRIVATE_NETWORKS:
            if ip in net:
                return False
    except ValueError:
        pass
    return True


def _download_image(client: httpx.Client, img_url: str, upload_dir: str) -> str | None:
    """下载图片并保存到 uploads 目录，返回相对路径"""
    try:
        resp = client.get(img_url, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type not in _IMAGE_TYPES:
            return None
        ext = _IMAGE_EXTENSIONS.get(content_type, ".jpg")
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = f"{upload_dir}/{filename}"
        with open(filepath, "wb") as f:
            f.write(resp.content)
        return f"/uploads/{filename}"
    except Exception:
        return None


def _extract_og_meta(html: str, property_name: str) -> str | None:
    """提取 Open Graph meta 标签"""
    patterns = [
        rf'<meta\s+[^>]*property\s*=\s*["\']{re.escape(property_name)}["\'][^>]*content\s*=\s*["\']([^"\']*)["\']',
        rf'<meta\s+[^>]*content\s*=\s*["\']([^"\']*)["\'][^>]*property\s*=\s*["\']{re.escape(property_name)}["\']',
        rf'<meta\s+[^>]*name\s*=\s*["\']{re.escape(property_name)}["\'][^>]*content\s*=\s*["\']([^"\']*)["\']',
        rf'<meta\s+[^>]*content\s*=\s*["\']([^"\']*)["\'][^>]*name\s*=\s*["\']{re.escape(property_name)}["\']',
    ]
    for pattern in patterns:
        m = re.search(pattern, html, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def _extract_content_from_html(html: str, base_url: str, upload_dir: str) -> tuple[str, int]:
    """
    从 HTML 中提取正文，转换为 Markdown，下载图片。
    返回 (markdown_content, downloaded_images_count)
    """
    # 用 readability 提取正文
    try:
        doc = ReadabilityDocument(html)
        title = doc.title()
        content_html = doc.summary()
    except Exception:
        title = ""
        content_html = html

    # 收集正文中的图片 URL
    img_urls = re.findall(r'<img[^>]+src\s*=\s*["\']([^"\']+)["\']', content_html, re.IGNORECASE)

    # 下载图片并替换路径
    downloaded = 0
    with httpx.Client(headers=_HEADERS, verify=False) as client:
        for img_url in img_urls:
            abs_url = urljoin(base_url, img_url)
            local_path = _download_image(client, abs_url, upload_dir)
            if local_path:
                content_html = content_html.replace(img_url, local_path)
                downloaded += 1

    # HTML 转 Markdown
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = False
    h.body_width = 0  # 不自动换行
    h.protect_links = True
    h.wrap_links = False
    h.single_line_break = False

    markdown = h.handle(content_html).strip()

    # 加上标题
    if title:
        markdown = f"**{title}**\n\n{markdown}"

    return markdown, downloaded


@router.post("/", response_model=ShareResponse)
def share_content(
    req: ShareRequest,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """接收分享内容，如果是 URL 则抓取正文，创建 memo"""
    content_parts: list[str] = []
    images_count = 0

    # 前端已预提取内容（适用于服务器无法访问的站点如 X/Twitter）
    if req.extracted_content and req.extracted_content.strip():
        content_parts.append(req.extracted_content.strip())
    # 处理 URL：抓取正文（仅当前端未预提取时）
    elif req.url and req.url.startswith("http"):
        if not _is_safe_url(req.url):
            raise HTTPException(status_code=400, detail="不允许访问该 URL")

        try:
            with httpx.Client(headers=_HEADERS, verify=False, follow_redirects=True, timeout=20) as client:
                resp = client.get(req.url)
                resp.raise_for_status()
                html = resp.text

            # 提取正文 + 下载图片
            article_md, images_count = _extract_content_from_html(html, req.url, UPLOAD_DIR)

            if article_md.strip():
                content_parts.append(article_md)
            else:
                # 提取失败，降级保存 URL + OG 信息
                og_title = _extract_og_meta(html, "og:title") or req.title or ""
                og_desc = _extract_og_meta(html, "og:description") or req.text or ""
                og_image = _extract_og_meta(html, "og:image")

                parts = []
                if og_title:
                    parts.append(f"**{og_title}**")
                if og_desc:
                    parts.append(og_desc)
                parts.append(f"[原文链接]({req.url})")
                if og_image:
                    parts.append(f"![{og_title}]({og_image})")
                content_parts.append("\n\n".join(parts))

        except Exception as e:
            # 抓取失败，降级保存 URL
            title_part = f"**{req.title}**\n\n" if req.title else ""
            text_part = f"{req.text}\n\n" if req.text else ""
            content_parts.append(f"{title_part}{text_part}[原文链接]({req.url})")

    elif req.text:
        # 纯文本分享
        title_part = f"**{req.title}**\n\n" if req.title and req.title != req.text else ""
        content_parts.append(f"{title_part}{req.text}")
    elif req.title:
        content_parts.append(req.title)

    final_content = "\n\n".join(content_parts).strip()
    if not final_content:
        raise HTTPException(status_code=400, detail="无有效内容")

    # 创建 memo
    memo = crud.create_memo(db, schemas.MemoCreate(content=final_content))

    return ShareResponse(
        memo_id=str(memo.id),
        content=final_content,
        images_count=images_count,
    )
