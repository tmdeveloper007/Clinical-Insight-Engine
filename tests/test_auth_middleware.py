"""
Unit tests for JWT auth middleware in app/middleware/auth.py.
"""
import os
import sys
import pytest

REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Set environment before importing the module
os.environ["FLASK_ENV"] = "development"
os.environ["NODE_ENV"] = "development"
os.environ["JWT_SECRET"] = "test-secret-key"
os.environ["JWT_ALGORITHM"] = "HS256"

from app.middleware.auth import (
    _decode_token,
    extract_bearer_token,
    JWT_SECRET,
    JWT_ALGORITHM,
)


class TestExtractBearerToken:
    def test_valid_bearer_token(self):
        result = extract_bearer_token("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
        assert result == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"

    def test_bearer_lowercase(self):
        result = extract_bearer_token("bearer token123")
        assert result == "token123"

    def test_bearer_mixed_case(self):
        result = extract_bearer_token("BeArEr token456")
        assert result == "token456"

    def test_empty_header_returns_none(self):
        result = extract_bearer_token("")
        assert result is None

    def test_none_header_returns_none(self):
        result = extract_bearer_token(None)
        assert result is None

    def test_header_without_bearer_prefix_returns_none(self):
        result = extract_bearer_token("Basic abc123")
        assert result is None

    def test_bearer_alone_returns_none(self):
        result = extract_bearer_token("Bearer")
        assert result is None

    def test_single_token_without_bearer_returns_none(self):
        result = extract_bearer_token("just_a_token_string")
        assert result is None

    def test_token_with_bearer_and_extra_parts_returns_none(self):
        result = extract_bearer_token("Bearer token extra")
        assert result is None

    def test_bearer_with_empty_token_returns_none(self):
        result = extract_bearer_token("Bearer ")
        assert result is None


class TestDecodeToken:
    def test_decode_valid_token(self):
        import jwt

        payload = {"sub": "user123", "role": "doctor"}
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        result = _decode_token(token)
        assert result is not None
        assert result["sub"] == "user123"
        assert result["role"] == "doctor"

    def test_decode_tampered_token_returns_none(self):
        result = _decode_token("tampered.token.here")
        assert result is None

    def test_decode_token_signed_with_wrong_secret_returns_none(self):
        import jwt

        payload = {"sub": "user123"}
        token = jwt.encode(payload, "wrong-secret", algorithm=JWT_ALGORITHM)
        result = _decode_token(token)
        assert result is None

    def test_decode_malformed_token_returns_none(self):
        result = _decode_token("not-even-three-parts")
        assert result is None

    def test_decode_empty_token_returns_none(self):
        result = _decode_token("")
        assert result is None


class TestJwtSecretConfiguration:
    def test_jwt_secret_uses_env_value(self):
        assert JWT_SECRET == "test-secret-key"

    def test_jwt_algorithm_is_hs256(self):
        assert JWT_ALGORITHM == "HS256"


class TestProductionJwtValidation:
    def test_raises_error_in_production_with_placeholder_secret(self):
        os.environ["FLASK_ENV"] = "production"
        os.environ["NODE_ENV"] = "production"
        os.environ["JWT_SECRET"] = "change-me-in-production"

        # Clear module cache
        mods_to_remove = [k for k in sys.modules if "app.middleware.auth" in k]
        for mod in mods_to_remove:
            del sys.modules[mod]

        with pytest.raises(RuntimeError, match="JWT_SECRET environment variable is required in production"):
            import importlib
            import app.middleware.auth

            importlib.reload(app.middleware.auth)
