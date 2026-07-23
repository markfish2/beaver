import socket
import unittest
from unittest.mock import patch

from app.url_safety import is_safe_http_url


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


if __name__ == "__main__":
    unittest.main()
