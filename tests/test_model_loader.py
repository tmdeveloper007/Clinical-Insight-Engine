"""
Unit tests for app/ml/model_loader module — specifically clear_cache.

The module-level import of patch_joblib requires joblib which is not available
in this environment. We mock patch_joblib before importing.
"""
import pytest
import sys
import os
from unittest.mock import patch, MagicMock

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Mock patch_joblib before importing the module
with patch.dict("sys.modules", {"joblib": MagicMock()}):
    from app.ml.model_loader import clear_cache, _model_cache


class TestModelCache:
    def test_clear_cache_removes_all_entries(self):
        """clear_cache empties the module-level _model_cache."""
        _model_cache["dummy_path"] = "dummy_model"
        assert "dummy_path" in _model_cache

        clear_cache()

        assert "dummy_path" not in _model_cache

    def test_clear_cache_is_idempotent(self):
        """Calling clear_cache twice does not raise."""
        clear_cache()
        clear_cache()  # should not raise
