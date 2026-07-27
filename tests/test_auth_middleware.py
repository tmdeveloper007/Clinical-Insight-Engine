"""
Unit tests for app.middleware.auth.

Tests extract_bearer_token helper and _decode_token function.
"""
import os
import sys
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Set a known test secret before importing the module
os.environ["JWT_SECRET"] = "test-secret-key-for-unit-tests"
os.environ["FLASK_ENV"] = "development"

from app.middleware.auth import extract_bearer_token, _decode_token


class TestExtractBearerToken:
    """Tests for extract_bearer_token helper."""

    def test_valid_bearer_token(self):
        """Standard 'Bearer <token>' format returns the token."""
        token = extract_bearer_token("Bearer abc123xyz")
        assert token == "abc123xyz"

    def test_bearer_token_case_insensitive(self):
        """'bearer' prefix must be matched case-insensitively."""
        assert extract_bearer_token("bearer mytoken") == "mytoken"
        assert extract_bearer_token("BEARER mytoken") == "mytoken"
        assert extract_bearer_token("BeArEr mytoken") == "mytoken"

    def test_missing_bearer_prefix(self):
        """Header without 'Bearer' prefix returns None."""
        assert extract_bearer_token("abc123xyz") is None

    def test_empty_string(self):
        """Empty string returns None."""
        assert extract_bearer_token("") is None

    def test_none_input(self):
        """None input returns None."""
        assert extract_bearer_token(None) is None

    def test_only_bearer_without_token(self):
        """'Bearer' without a token returns None."""
        assert extract_bearer_token("Bearer") is None

    def test_only_two_parts_accepted(self):
        """Header must have exactly 'Bearer <token>' (two parts) to match."""
        # If extra parts are present, the split produces 3+ parts -> returns None
        assert extract_bearer_token("Bearer token123 extra") is None

    def test_basic_auth_not_matched(self):
        """Basic auth is not treated as Bearer."""
        assert extract_bearer_token("Basic dXNlcjpwYXNz") is None


class TestDecodeToken:
    """Tests for _decode_token function."""

    def test_valid_jwt_token(self):
        """A valid JWT signed with JWT_SECRET decodes correctly."""
        import jwt
        secret = "test-secret-key-for-unit-tests"
        payload = {"sub": "user123", "email": "user@example.com", "role": "provider"}
        token = jwt.encode(payload, secret, algorithm="HS256")

        result = _decode_token(token)
        assert result is not None
        assert result["sub"] == "user123"
        assert result["email"] == "user@example.com"
        assert result["role"] == "provider"

    def test_invalid_token(self):
        """A token not signed with JWT_SECRET returns None."""
        import jwt
        wrong_secret = "wrong-secret"
        payload = {"sub": "user123"}
        token = jwt.encode(payload, wrong_secret, algorithm="HS256")

        result = _decode_token(token)
        assert result is None

    def test_malformed_token(self):
        """A malformed token string returns None."""
        assert _decode_token("not-a-jwt-at-all") is None
        assert _decode_token("") is None
        assert _decode_token("a.b") is None  # missing signature
