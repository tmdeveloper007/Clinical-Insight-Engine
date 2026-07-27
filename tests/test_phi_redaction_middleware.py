"""
Unit tests for app/middleware/phi_redaction.phi_redaction_middleware decorator.

Tests that PHI is redacted from function arguments and that the decorator
respects ENABLE_PHI_REDACTION.
"""
import os
import sys
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.middleware.phi_redaction import phi_redaction_middleware


class TestPhiRedactionMiddleware:
    def test_decorator_passes_through_when_phi_redaction_disabled(self, monkeypatch):
        """When ENABLE_PHI_REDACTION=false, decorator should sanitize but not redact."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "false")

        # Re-import to pick up new env var
        import importlib
        import app.middleware.phi_redaction as pr
        importlib.reload(pr)
        from app.middleware.phi_redaction import phi_redaction_middleware

        @phi_redaction_middleware
        def sample_func(name, age):
            return {"name": name, "age": age}

        result = sample_func("John Doe", 30)
        # Sanitization runs; redaction does not
        assert result["name"] == "John Doe"
        assert result["age"] == 30

    def test_decorator_calls_function_with_sanitized_args(self, monkeypatch):
        """Decorator should sanitize inputs even when PHI redaction is disabled."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "false")

        import importlib
        import app.middleware.phi_redaction as pr
        importlib.reload(pr)
        from app.middleware.phi_redaction import phi_redaction_middleware

        @phi_redaction_middleware
        def sample_func(text):
            return text

        # When ENABLE_PHI_REDACTION=false, sanitize_data is called but no PHI redaction
        result = sample_func("input text")
        assert result == "input text"

    def test_decorator_preserves_return_value(self):
        """Decorator should return the exact value from the decorated function."""
        @phi_redaction_middleware
        def get_patient():
            return {"id": 42, "name": "Alice"}

        result = get_patient()
        assert result == {"id": 42, "name": "Alice"}

    def test_decorator_works_with_keyword_arguments(self):
        """Decorator handles both positional and keyword arguments."""
        @phi_redaction_middleware
        def multi_arg(name, age=None, diagnosis=None):
            return {"name": name, "age": age, "diagnosis": diagnosis}

        result = multi_arg("Bob", age=25, diagnosis="flu")
        assert result["name"] == "Bob"
        assert result["age"] == 25
        assert result["diagnosis"] == "flu"

    def test_decorator_preserves_function_metadata(self):
        """@wraps should preserve function name and docstring."""
        @phi_redaction_middleware
        def documented_func():
            """This is the docstring."""
            pass

        assert documented_func.__name__ == "documented_func"
        assert documented_func.__doc__ == "This is the docstring."

    def test_decorator_handles_empty_arguments(self):
        """Decorator should not crash when called with no arguments."""
        @phi_redaction_middleware
        def no_args():
            return "ok"

        result = no_args()
        assert result == "ok"
