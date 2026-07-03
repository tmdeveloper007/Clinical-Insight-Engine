"""
Unit tests for the JWT Authentication Middleware (app/middleware/auth.py)
"""
import os
import sys
import unittest

# Ensure repository root is on the path BEFORE any imports
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Set test environment before importing auth module
os.environ["FLASK_ENV"] = "development"
os.environ["JWT_SECRET"] = "test-secret-key-for-unit-testing"

from app.middleware.auth import extract_bearer_token, _decode_token


class TestExtractBearerToken(unittest.TestCase):
    """Test suite for extract_bearer_token."""

    def test_valid_bearer_token(self):
        """Verify valid Bearer token is extracted correctly."""
        token = extract_bearer_token("Bearer eyJhbGciOiJIUzI1NiJ9.test.signature")
        self.assertEqual(token, "eyJhbGciOiJIUzI1NiJ9.test.signature")

    def test_bearer_case_insensitive(self):
        """Verify Bearer keyword is case-insensitive."""
        token = extract_bearer_token("bearer mytoken123")
        self.assertEqual(token, "mytoken123")
        token_upper = extract_bearer_token("BEARER mytoken123")
        self.assertEqual(token_upper, "mytoken123")

    def test_none_input(self):
        """Verify None returns None."""
        self.assertIsNone(extract_bearer_token(None))

    def test_empty_string(self):
        """Verify empty string returns None."""
        self.assertIsNone(extract_bearer_token(""))

    def test_missing_token_only_bearer(self):
        """Verify 'Bearer' alone returns None."""
        self.assertIsNone(extract_bearer_token("Bearer"))

    def test_only_bearer_with_spaces(self):
        """Verify 'Bearer  ' (no token) returns None."""
        self.assertIsNone(extract_bearer_token("Bearer  "))

    def test_wrong_scheme(self):
        """Verify non-Bearer scheme returns None."""
        self.assertIsNone(extract_bearer_token("Basic dXNlcjpwYXNz"))

    def test_extra_parts(self):
        """Verify token with extra parts returns None."""
        self.assertIsNone(extract_bearer_token("Bearer token extra"))

    def test_bearer_with_leading_space(self):
        """Verify Bearer with extra leading whitespace is handled."""
        token = extract_bearer_token("Bearer  token123")
        self.assertEqual(token, "token123")

    def test_jwt_token_format(self):
        """Verify full JWT three-part format is extracted."""
        full_token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        extracted = extract_bearer_token(full_token)
        self.assertEqual(extracted, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c")


class TestDecodeToken(unittest.TestCase):
    """Test suite for _decode_token."""

    def test_valid_token_decodes_successfully(self):
        """Verify a valid HS256 JWT token is decoded to the correct payload."""
        import jwt
        secret = "test-secret-key-for-unit-testing"
        payload = {"sub": "patient_123", "role": "clinician"}
        token = jwt.encode(payload, secret, algorithm="HS256")
        result = _decode_token(token)
        self.assertIsNotNone(result)
        self.assertEqual(result["sub"], "patient_123")
        self.assertEqual(result["role"], "clinician")

    def test_expired_token_returns_none(self):
        """Verify an expired token returns None (not an exception)."""
        import jwt
        import time
        secret = "test-secret-key-for-unit-testing"
        payload = {"sub": "user1", "exp": int(time.time()) - 3600}
        token = jwt.encode(payload, secret, algorithm="HS256")
        result = _decode_token(token)
        self.assertIsNone(result)

    def test_malformed_token_returns_none(self):
        """Verify a malformed token string returns None."""
        result = _decode_token("not.a.valid.jwt.token")
        self.assertIsNone(result)

    def test_token_with_wrong_secret_returns_none(self):
        """Verify a token signed with a different secret returns None."""
        import jwt
        wrong_secret = "completely-different-secret-that-is-long-enough"
        payload = {"sub": "user1"}
        token = jwt.encode(payload, wrong_secret, algorithm="HS256")
        result = _decode_token(token)
        self.assertIsNone(result)

    def test_empty_string_token_returns_none(self):
        """Verify empty string token returns None."""
        result = _decode_token("")
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
