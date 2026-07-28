"""
Unit tests for app/middleware/auth.py — JWT authentication middleware.
Tests extract_bearer_token and _decode_token helpers.
Flask-dependent require_auth decorator is tested in integration tests.
"""

import os
import sys
import pytest
from unittest.mock import patch

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


class TestExtractBearerToken:
    """Test suite for extract_bearer_token helper."""

    def test_returns_token_for_valid_bearer_header(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.sig")
        assert result == "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.sig"

    def test_returns_token_case_insensitive(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("bearer mytoken123")
        assert result == "mytoken123"

    def test_returns_none_for_empty_header(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("")
        assert result is None

    def test_returns_none_for_none_header(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token(None)
        assert result is None

    def test_returns_none_for_missing_bearer_prefix(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Basic dXNlcjpwYXNz")
        assert result is None

    def test_returns_none_for_token_only(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("mytoken123")
        assert result is None

    def test_returns_none_for_bearer_only_no_token(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer")
        assert result is None

    def test_returns_none_for_empty_bearer_token(self):
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer ")
        assert result is None


class TestDecodeToken:
    """Test suite for _decode_token helper."""

    @patch.dict(os.environ, {"JWT_SECRET": "test-secret-key", "FLASK_ENV": "development"})
    def test_decodes_valid_token(self):
        import jwt as pyjwt
        from app.middleware.auth import _decode_token, JWT_SECRET, JWT_ALGORITHM

        token = pyjwt.encode({"sub": "user-123", "email": "test@example.com"}, JWT_SECRET, algorithm=JWT_ALGORITHM)
        result = _decode_token(token)

        assert result is not None
        assert result["sub"] == "user-123"
        assert result["email"] == "test@example.com"

    @patch.dict(os.environ, {"JWT_SECRET": "test-secret-key", "FLASK_ENV": "development"})
    def test_returns_none_for_expired_token(self):
        import jwt as pyjwt
        from datetime import datetime, timedelta
        from app.middleware.auth import _decode_token, JWT_SECRET, JWT_ALGORITHM

        expired_payload = {
            "sub": "user-123",
            "exp": datetime.utcnow() - timedelta(hours=1),
        }
        token = pyjwt.encode(expired_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        result = _decode_token(token)

        assert result is None

    @patch.dict(os.environ, {"JWT_SECRET": "test-secret-key", "FLASK_ENV": "development"})
    def test_returns_none_for_wrong_secret(self):
        import jwt as pyjwt
        from app.middleware.auth import _decode_token, JWT_ALGORITHM

        token = pyjwt.encode({"sub": "user-123"}, "wrong-secret", algorithm=JWT_ALGORITHM)
        result = _decode_token(token)

        assert result is None

    @patch.dict(os.environ, {"JWT_SECRET": "test-secret-key", "FLASK_ENV": "development"})
    def test_returns_none_for_malformed_token(self):
        from app.middleware.auth import _decode_token
        result = _decode_token("not.a.valid.jwt.token")
        assert result is None

    @patch.dict(os.environ, {"JWT_SECRET": "test-secret-key", "FLASK_ENV": "development"})
    def test_returns_none_for_empty_string(self):
        from app.middleware.auth import _decode_token
        result = _decode_token("")
        assert result is None

    @patch.dict(os.environ, {"JWT_SECRET": "test-secret-key", "FLASK_ENV": "development"})
    def test_returns_none_for_none_token(self):
        from app.middleware.auth import _decode_token
        result = _decode_token(None)
        assert result is None
