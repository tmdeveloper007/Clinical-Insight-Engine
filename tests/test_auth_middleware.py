"""
Unit tests for app.middleware.auth module.
"""
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


class TestExtractBearerToken:
    """Tests for extract_bearer_token function."""

    def test_valid_bearer_token(self):
        """Returns token from valid 'Bearer <token>' header."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig")
        assert result == "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sig"

    def test_bearer_case_insensitive(self):
        """Header matching is case-insensitive for 'Bearer'."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("bearer mytoken123")
        assert result == "mytoken123"

    def test_bearer_uppercase(self):
        """'BEARER' (uppercase) is also accepted."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("BEARER mytoken")
        assert result == "mytoken"

    def test_none_header(self):
        """Returns None for None input."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token(None)
        assert result is None

    def test_empty_string(self):
        """Returns None for empty string."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("")
        assert result is None

    def test_missing_token_part(self):
        """Returns None when header has 'Bearer' but no token."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer")
        assert result is None

    def test_too_many_parts_returns_none(self):
        """Returns None when header has more than two parts."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer token123 extra")
        assert result is None

    def test_wrong_scheme(self):
        """Returns None for Basic auth scheme."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Basic dXNlcjpwYXNz")
        assert result is None

    def test_no_scheme(self):
        """Returns None for plain token without Bearer prefix."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("just_a_token")
        assert result is None

    def test_single_word_bearer(self):
        """Returns None when header is just the word 'Bearer'."""
        from app.middleware.auth import extract_bearer_token
        result = extract_bearer_token("Bearer")
        assert result is None


class TestDecodeToken:
    """Tests for _decode_token function. Skipped when PyJWT is not installed."""

    def test_decode_valid_token(self):
        """Returns payload dict for a valid JWT token."""
        import pytest
        pytest.importorskip("jwt", reason="PyJWT not installed")
        import jwt
        from app.middleware.auth import _decode_token, JWT_SECRET, JWT_ALGORITHM
        payload = {"sub": "user123", "role": "admin"}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        result = _decode_token(token)
        assert result is not None
        assert result["sub"] == "user123"
        assert result["role"] == "admin"

    def test_decode_invalid_token(self):
        """Returns None for malformed token."""
        from app.middleware.auth import _decode_token
        result = _decode_token("not.a.valid.token")
        assert result is None

    def test_decode_tampered_signature(self):
        """Returns None when token signature is tampered."""
        import pytest
        pytest.importorskip("jwt", reason="PyJWT not installed")
        import jwt
        from app.middleware.auth import _decode_token, JWT_SECRET, JWT_ALGORITHM
        payload = {"sub": "user123"}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        # Tamper with the signature
        tampered = token[:-5] + "XXXXX"
        result = _decode_token(tampered)
        assert result is None

    def test_decode_expired_token(self):
        """Returns None for expired token."""
        import pytest
        pytest.importorskip("jwt", reason="PyJWT not installed")
        import jwt
        from app.middleware.auth import _decode_token, JWT_SECRET, JWT_ALGORITHM
        import time
        payload = {"sub": "user123", "exp": int(time.time()) - 3600}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        result = _decode_token(token)
        assert result is None
