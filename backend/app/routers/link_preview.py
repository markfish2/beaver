import re
import time
import ipaddress
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Query

from ..schemas import LinkPreview

router = APIRouter()

# In-memory cache: url -> (timestamp, preview)
_preview_cache: dict[str, tuple[float, LinkPreview]] = {}
CACHE_TTL = 3600  # 1 hour

# SSRF: private/reserved IP ranges
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
        # hostname is a domain name, not an IP — OK
        pass
    return True


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
    if not _is_safe_url(url):
        return _empty_preview(url)

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0),
            headers={"User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

            # Only parse HTML
            content_type = resp.headers.get("content-type", "")
            if "html" not in content_type:
                return _empty_preview(url)

            # Read up to 512KB
            html = resp.text[:512 * 1024]
            preview = _parse_preview(url, html)

    except Exception:
        preview = _empty_preview(url)

    # Cache result
    _preview_cache[url] = (time.time(), preview)
    return preview
