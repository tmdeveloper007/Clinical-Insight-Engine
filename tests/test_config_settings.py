"""
Unit tests for app/config/settings.py configuration module.
"""
import os
import sys
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)


class TestEnablePhiRedaction:
    def test_default_is_true_when_env_var_not_set(self, monkeypatch):
        """When ENABLE_PHI_REDACTION is not set, it defaults to True."""
        # Remove the env var if present
        monkeypatch.delenv("ENABLE_PHI_REDACTION", raising=False)

        # Reload the module to pick up the cleared env
        # We need to reimport after clearing the env var
        if "app.config.settings" in sys.modules:
            mod = sys.modules.pop("app.config.settings")
        else:
            mod = None

        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is True

    def test_explicit_true_lowercase(self, monkeypatch):
        """ENABLE_PHI_REDACTION=true (lowercase) resolves to True."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "true")

        if "app.config.settings" in sys.modules:
            sys.modules.pop("app.config.settings")
        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is True

    def test_explicit_true_uppercase(self, monkeypatch):
        """ENABLE_PHI_REDACTION=TRUE (uppercase) resolves to True."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "TRUE")

        if "app.config.settings" in sys.modules:
            sys.modules.pop("app.config.settings")
        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is True

    def test_explicit_false_lowercase(self, monkeypatch):
        """ENABLE_PHI_REDACTION=false resolves to False."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "false")

        if "app.config.settings" in sys.modules:
            sys.modules.pop("app.config.settings")
        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is False

    def test_explicit_false_uppercase(self, monkeypatch):
        """ENABLE_PHI_REDACTION=FALSE resolves to False."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "FALSE")

        if "app.config.settings" in sys.modules:
            sys.modules.pop("app.config.settings")
        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is False

    def test_non_boolean_value_resolves_to_false(self, monkeypatch):
        """Arbitrary non-boolean strings resolve to False (only 'true' is True)."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "yes")

        if "app.config.settings" in sys.modules:
            sys.modules.pop("app.config.settings")
        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is False

    def test_empty_string_resolves_to_false(self, monkeypatch):
        """Empty ENABLE_PHI_REDACTION resolves to False."""
        monkeypatch.setenv("ENABLE_PHI_REDACTION", "")

        if "app.config.settings" in sys.modules:
            sys.modules.pop("app.config.settings")
        import importlib
        import app.config.settings as settings_mod
        importlib.reload(settings_mod)

        assert settings_mod.ENABLE_PHI_REDACTION is False
