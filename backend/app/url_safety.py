"""Network URL validation helpers used by server-side fetch endpoints."""

import ipaddress
import socket
from urllib.parse import urlparse


def is_safe_http_url(url: str) -> bool:
    """Allow public HTTP(S) targets only, including DNS-resolved addresses."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False

    try:
        addresses = {
            info[4][0]
            for info in socket.getaddrinfo(parsed.hostname, parsed.port, type=socket.SOCK_STREAM)
        }
    except (OSError, ValueError):
        return False

    if not addresses:
        return False

    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            return False
    return True
