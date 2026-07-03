"""
Unit tests for app/config/settings.py — PHI redaction feature flag configuration.
"""

import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.config import settings


class TestSettings:
    def test_phi_redaction_enabled_by_default(self):
        """ENABLE_PHI_REDACTION defaults to True when env var is not set."""
        # Save and clear the env var
        saved = os.environ.pop("ENABLE_PHI_REDACTION", None)
        try:
            # Re-import to pick up the cleared env
            import importlib
            import app.config.settings as s
            importlib.reload(s)
            assert s.ENABLE_PHI_REDACTION is True
        finally:
            if saved is not None:
                os.environ["ENABLE_PHI_REDACTION"] = saved

    def test_phi_redaction_true_env(self):
        """ENABLE_PHI_REDACTION is True when env var is 'true'."""
        saved = os.environ.get("ENABLE_PHI_REDACTION")
        os.environ["ENABLE_PHI_REDACTION"] = "true"
        try:
            import importlib
            import app.config.settings as s
            importlib.reload(s)
            assert s.ENABLE_PHI_REDACTION is True
        finally:
            if saved is not None:
                os.environ["ENABLE_PHI_REDACTION"] = saved
            else:
                os.environ.pop("ENABLE_PHI_REDACTION", None)

    def test_phi_redaction_false_env(self):
        """ENABLE_PHI_REDACTION is False when env var is 'false'."""
        saved = os.environ.get("ENABLE_PHI_REDACTION")
        os.environ["ENABLE_PHI_REDACTION"] = "false"
        try:
            import importlib
            import app.config.settings as s
            importlib.reload(s)
            assert s.ENABLE_PHI_REDACTION is False
        finally:
            if saved is not None:
                os.environ["ENABLE_PHI_REDACTION"] = saved
            else:
                os.environ.pop("ENABLE_PHI_REDACTION", None)

    def test_phi_redaction_case_insensitive(self):
        """ENABLE_PHI_REDACTION parsing is case-insensitive."""
        saved = os.environ.get("ENABLE_PHI_REDACTION")
        os.environ["ENABLE_PHI_REDACTION"] = "TRUE"
        try:
            import importlib
            import app.config.settings as s
            importlib.reload(s)
            assert s.ENABLE_PHI_REDACTION is True
        finally:
            if saved is not None:
                os.environ["ENABLE_PHI_REDACTION"] = saved
            else:
                os.environ.pop("ENABLE_PHI_REDACTION", None)
