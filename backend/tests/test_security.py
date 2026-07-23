import socket
import unittest
from unittest.mock import patch

from app.auth import get_password_hash, verify_password
from app.url_safety import is_safe_http_url


class UrlSafetyTests(unittest.TestCase):
    def test_rejects_non_http_and_missing_hosts(self):
        self.assertFalse(is_safe_http_url("file:///etc/passwd"))
        self.assertFalse(is_safe_http_url("http:///missing-host"))

    @patch("app.url_safety.socket.getaddrinfo")
    def test_rejects_private_dns_results(self, getaddrinfo):
        getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80)),
        ]
        self.assertFalse(is_safe_http_url("http://example.test"))

    @patch("app.url_safety.socket.getaddrinfo")
    def test_accepts_public_dns_results(self, getaddrinfo):
        getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
        ]
        self.assertTrue(is_safe_http_url("https://example.test"))

    @patch("app.url_safety.socket.getaddrinfo", side_effect=socket.gaierror)
    def test_rejects_dns_failures(self, _getaddrinfo):
        self.assertFalse(is_safe_http_url("https://missing.test"))


class PasswordTests(unittest.TestCase):
    def test_long_multibyte_password_is_handled_consistently(self):
        password = "密" * 100
        password_hash = get_password_hash(password)
        self.assertTrue(verify_password(password, password_hash))
        self.assertFalse(verify_password("错" + password, password_hash))


if __name__ == "__main__":
    unittest.main()
