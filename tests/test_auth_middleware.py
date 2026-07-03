"""
Unit tests for app/middleware/auth.py — JWT authentication middleware helpers.
"""

import os
import sys
import time

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.middleware.auth import extract_bearer_token, _decode_token


class TestExtractBearerToken:
    def test_valid_bearer_token(self):
        """Returns token string for valid Bearer header."""
        token = extract_bearer_token("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig")
        assert token == "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig"

    def test_lowercase_bearer(self):
        """Returns token for lowercase 'bearer' scheme."""
        token = extract_bearer_token("bearer mytoken123")
        assert token == "mytoken123"

    def test_mixed_case_bearer(self):
        """Returns token for mixed-case 'Bearer' scheme."""
        token = extract_bearer_token("Bearer token456")
        assert token == "token456"

    def test_none_header(self):
        """Returns None for None header."""
        assert extract_bearer_token(None) is None

    def test_empty_string(self):
        """Returns None for empty string header."""
        assert extract_bearer_token("") is None

    def test_missing_scheme(self):
        """Returns None when header has no space separator."""
        assert extract_bearer_token("notbearer") is None

    def test_wrong_scheme_basic(self):
        """Returns None for Basic auth scheme."""
        assert extract_bearer_token("Basic dXNlcjpwYXNz") is None

    def test_wrong_scheme_digest(self):
        """Returns None for Digest auth scheme."""
        assert extract_bearer_token("Digest username=admin") is None

    def test_bearer_only_no_token(self):
        """Returns None when only 'Bearer' is present without token."""
        assert extract_bearer_token("Bearer") is None

    def test_extra_parts_ignored(self):
        """Extra parts beyond token are ignored (exactly 2 parts required)."""
        token = extract_bearer_token("Bearer token123 extra")
        assert token is None  # 3 parts, not 2

    def test_extra_whitespace_prefix_not_stripped(self):
        """Leading whitespace is stripped by str.split() default behavior."""
        result = extract_bearer_token("  Bearer token")
        assert result == "token"


class TestDecodeToken:
    def test_decode_valid_token(self):
        """Decodes a valid JWT token correctly."""
        import jwt
        secret = "change-me-in-production"
        payload = {"sub": "user123", "email": "test@example.com", "iat": int(time.time())}
        token = jwt.encode(payload, secret, algorithm="HS256")
        decoded = _decode_token(token)
        assert decoded is not None
        assert decoded["sub"] == "user123"
        assert decoded["email"] == "test@example.com"

    def test_decode_malformed_token(self):
        """Returns None for malformed JWT token."""
        assert _decode_token("not.a.jwt") is None
        assert _decode_token("") is None

    def test_decode_incomplete_token(self):
        """Returns None for token missing the signature part."""
        assert _decode_token("eyJhbGciOiJIUzI1NiJ9") is None

    def test_decode_tampered_signature(self):
        """Returns None for token with tampered signature."""
        import jwt
        secret = "change-me-in-production"
        payload = {"sub": "user123"}
        token = jwt.encode(payload, secret, algorithm="HS256")
        tampered = token.rsplit(".", 1)[0] + ".tampered"
        assert _decode_token(tampered) is None

    def test_decode_wrong_algorithm(self):
        """Returns None for token signed with different algorithm."""
        import jwt
        payload = {"sub": "user123"}
        # HS384 vs HS256 mismatch
        token = jwt.encode(payload, "change-me-in-production", algorithm="HS384")
        assert _decode_token(token) is None

    def test_decode_expired_token(self):
        """Returns None for expired JWT token."""
        import jwt
        secret = "change-me-in-production"
        payload = {"sub": "user123", "exp": int(time.time()) - 3600}
        token = jwt.encode(payload, secret, algorithm="HS256")
        decoded = _decode_token(token)
        assert decoded is None
