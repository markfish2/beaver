import socket
import unittest
from io import BytesIO
from unittest.mock import patch

from PIL import Image

from app.routers.attachments import validate_raster_image
from app.url_safety import is_safe_http_url, is_safe_peer_response


def dns_result(*addresses: str):
    return [(socket.AF_INET6 if ':' in address else socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443)) for address in addresses]


class UrlSafetyTest(unittest.TestCase):
    def test_rejects_non_http_and_missing_host(self):
        self.assertFalse(is_safe_http_url("file:///etc/passwd"))
        self.assertFalse(is_safe_http_url("https:///missing-host"))

    @patch("app.url_safety.socket.getaddrinfo", return_value=dns_result("127.0.0.1"))
    def test_rejects_private_address(self, _lookup):
        self.assertFalse(is_safe_http_url("http://example.test"))

    @patch("app.url_safety.socket.getaddrinfo", return_value=dns_result("93.184.216.34"))
    def test_accepts_public_address(self, _lookup):
        self.assertTrue(is_safe_http_url("https://example.test/path"))

    @patch("app.url_safety.socket.getaddrinfo", return_value=dns_result("93.184.216.34", "10.0.0.2"))
    def test_rejects_mixed_public_and_private_dns(self, _lookup):
        self.assertFalse(is_safe_http_url("https://example.test"))

    def test_validates_connected_peer_and_fails_closed_without_it(self):
        class Stream:
            def __init__(self, address):
                self.address = address

            def get_extra_info(self, name):
                return self.address if name == "server_addr" else None

        class Response:
            def __init__(self, address=None):
                self.extensions = {} if address is None else {"network_stream": Stream((address, 443))}

        self.assertTrue(is_safe_peer_response(Response("93.184.216.34")))
        self.assertFalse(is_safe_peer_response(Response("127.0.0.1")))
        self.assertFalse(is_safe_peer_response(Response()))

    def test_raster_validation_rejects_svg_and_spoofed_html(self):
        image_bytes = BytesIO()
        Image.new("RGB", (2, 2), "white").save(image_bytes, format="PNG")
        self.assertTrue(validate_raster_image(image_bytes.getvalue()))
        self.assertFalse(validate_raster_image(b'<svg><script>alert(1)</script></svg>'))
        self.assertFalse(validate_raster_image(b'<html>not a jpeg</html>'))


if __name__ == "__main__":
    unittest.main()
