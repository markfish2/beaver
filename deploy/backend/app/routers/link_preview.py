import re
import time
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, Depends, Query

from ..schemas import LinkPreview
from ..dependencies import get_current_user
from ..url_safety import is_safe_http_url, is_safe_peer_response

router = APIRouter(dependencies=[Depends(get_current_user)])

# In-memory cache: url -> (timestamp, preview)
_preview_cache: dict[str, tuple[float, LinkPreview]] = {}
CACHE_TTL = 3600  # 1 hour

def _extract_meta(html: str, property_name: str) -> str | None:
    # og:meta: <meta property="og:title" content="...">
    pattern = rf'<meta\s+[^>]*property\s*=\s*["\']{re.escape(property_name)}["\'][^>]*content\s*=\s*["\']([^"\']*)["\']'
    m = re.search(pattern, html, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # reversed order: content before property
    pattern2 = rf'<meta\s+[^>]*content\s*=\s*["\']([^"\']*)["\'][^>]*property\s*=\s*["\']{re.escape(property_name)}["\']'
    m2 = re.search(pattern2, html, re.IGNORECASE)
    if m2:
        return m2.group(1).strip()
    return None


def _extract_meta_name(html: str, name: str) -> str | None:
    pattern = rf'<meta\s+[^>]*name\s*=\s*["\']{re.escape(name)}["\'][^>]*content\s*=\s*["\']([^"\']*)["\']'
    m = re.search(pattern, html, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    pattern2 = rf'<meta\s+[^>]*content\s*=\s*["\']([^"\']*)["\'][^>]*name\s*=\s*["\']{re.escape(name)}["\']'
    m2 = re.search(pattern2, html, re.IGNORECASE)
    if m2:
        return m2.group(1).strip()
    return None


def _extract_title(html: str) -> str | None:
    m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def _extract_favicon(html: str, base_url: str) -> str | None:
    # <link rel="icon" href="..."> or <link rel="shortcut icon" href="...">
    patterns = [
        r'<link\s+[^>]*rel\s*=\s*["\'](?:shortcut )?icon["\'][^>]*href\s*=\s*["\']([^"\']+)["\']',
        r'<link\s+[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*rel\s*=\s*["\'](?:shortcut )?icon["\']',
    ]
    for p in patterns:
        m = re.search(p, html, re.IGNORECASE)
        if m:
            href = m.group(1).strip()
            return urljoin(base_url, href)
    return None


def _parse_preview(url: str, html: str) -> LinkPreview:
    title = _extract_meta(html, "og:title") or _extract_title(html)
    description = _extract_meta(html, "og:description") or _extract_meta_name(html, "description")
    image = _extract_meta(html, "og:image")
    site_name = _extract_meta(html, "og:site_name")
    favicon = _extract_favicon(html, url)

    # Resolve relative URLs
    if image:
        image = urljoin(url, image)

    return LinkPreview(
        url=url,
        title=title,
        description=description,
        image=image,
        favicon=favicon,
        site_name=site_name,
    )


def _empty_preview(url: str) -> LinkPreview:
    return LinkPreview(url=url)


@router.get("/", response_model=LinkPreview)
async def get_link_preview(url: str = Query(..., description="URL to preview")):
    # Check cache
    if url in _preview_cache:
        ts, preview = _preview_cache[url]
        if time.time() - ts < CACHE_TTL:
            return preview
        else:
            del _preview_cache[url]

    # SSRF check
    if not is_safe_http_url(url):
        return _empty_preview(url)

    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
            headers={"User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)"},
        ) as client:
            current_url = url
            for _ in range(6):
                if not is_safe_http_url(current_url):
                    return _empty_preview(url)
                async with client.stream("GET", current_url) as resp:
                    if not is_safe_peer_response(resp):
                        return _empty_preview(url)
                    if resp.is_redirect:
                        location = resp.headers.get("location")
                        if not location:
                            return _empty_preview(url)
                        current_url = urljoin(current_url, location)
                        continue
                    resp.raise_for_status()

                    # Only parse HTML and never buffer more than 512 KiB.
                    content_type = resp.headers.get("content-type", "")
                    if "html" not in content_type:
                        return _empty_preview(url)
                    body = bytearray()
                    async for chunk in resp.aiter_bytes():
                        body.extend(chunk)
                        if len(body) >= 512 * 1024:
                            del body[512 * 1024:]
                            break
                    encoding = resp.encoding or "utf-8"
                    html = body.decode(encoding, errors="replace")
                    preview = _parse_preview(current_url, html)
                    preview.url = url
                    break
            else:
                return _empty_preview(url)

    except Exception:
        preview = _empty_preview(url)

    # Cache result
    _preview_cache[url] = (time.time(), preview)
    return preview
