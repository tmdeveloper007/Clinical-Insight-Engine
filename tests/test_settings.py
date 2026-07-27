"""
Unit tests for app.config.settings module.
"""
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


class TestEnablePhiRedaction:
    def test_default_true(self, monkeypatch):
        """ENABLE_PHI_REDACTION defaults to True when env var is absent."""
        # Ensure the env var is not set
        monkeypatch.delenv("ENABLE_PHI_REDACTION", raising=False)
        # Reload the module to pick up the fresh environment
        if "app.config.settings" in sys.modules:
            mod = sys.modules["app.config.settings"]
            # Re-read the env var directly
            from app.config import settings
            # Clear any cached state
            monkeypatch.setenv("ENABLE_PHI_REDACTION", "")
            monkeypatch.delenv("ENABLE_PHI_REDACTION", raising=False)
        # Import after clearing env
        for key in list(sys.modules.keys()):
            if key.startswith("app.config"):
                del sys.modules[key]
        from app.config.settings import ENABLE_PHI_REDACTION
        assert ENABLE_PHI_REDACTION is True

    def test_explicit_true(self, monkeypatch):
        """ENABLE_PHI_REDACTION is True when env var is 'true'."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "true")
        for key in list(sys.modules.keys()):
            if key.startswith("app.config"):
                del sys.modules[key]
        from app.config.settings import ENABLE_PHI_REDACTION
        assert ENABLE_PHI_REDACTION is True

    def test_explicit_false(self, monkeypatch):
        """ENABLE_PHI_REDACTION is False when env var is 'false'."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "false")
        for key in list(sys.modules.keys()):
            if key.startswith("app.config"):
                del sys.modules[key]
        from app.config.settings import ENABLE_PHI_REDACTION
        assert ENABLE_PHI_REDACTION is False

    def test_case_insensitive_true(self, monkeypatch):
        """ENABLE_PHI_REDACTION treats 'TRUE' as True (case-insensitive)."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "TRUE")
        for key in list(sys.modules.keys()):
            if key.startswith("app.config"):
                del sys.modules[key]
        from app.config.settings import ENABLE_PHI_REDACTION
        assert ENABLE_PHI_REDACTION is True

    def test_arbitrary_string_is_false(self, monkeypatch):
        """ENABLE_PHI_REDACTION is False for any value other than 'true'."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "yes-please-enable")
        for key in list(sys.modules.keys()):
            if key.startswith("app.config"):
                del sys.modules[key]
        from app.config.settings import ENABLE_PHI_REDACTION
        assert ENABLE_PHI_REDACTION is False
