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


def is_safe_peer_response(response) -> bool:
    """Verify the address actually connected by httpx to close the DNS-rebinding gap."""
    stream = response.extensions.get("network_stream")
    if stream is None:
        return False
    peer = stream.get_extra_info("server_addr") or stream.get_extra_info("peername")
    if not peer:
        return False
    address = peer[0] if isinstance(peer, tuple) else peer
    try:
        return ipaddress.ip_address(address).is_global
    except ValueError:
        return False
