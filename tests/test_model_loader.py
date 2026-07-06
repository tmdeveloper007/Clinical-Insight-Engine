"""
Tests for model_loader.py in app/ml/model_loader.py
"""
import pytest
import os
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, ".")


class TestLoadModel:
    """Unit tests for load_model function."""

    def setup_method(self):
        """Clear the model cache before each test."""
        from app.ml import model_loader
        model_loader._model_cache.clear()

    def teardown_method(self):
        """Clear cache after each test."""
        from app.ml import model_loader
        model_loader._model_cache.clear()

    def test_load_model_raises_file_not_found_for_missing_path(self):
        """load_model raises FileNotFoundError when model file does not exist."""
        from app.ml.model_loader import load_model

        with pytest.raises(FileNotFoundError) as exc_info:
            load_model("/nonexistent/path/model.pkl")
        assert "Model file not found" in str(exc_info.value)

    def test_load_model_raises_permission_error_on_bad_signature(self):
        """load_model raises PermissionError when model signature verification fails."""
        from app.ml.model_loader import load_model

        with patch("app.ml.model_loader.Path.exists", return_value=True):
            with patch("app.ml.model_loader.Path.resolve", return_value="/tmp/model3.pkl"):
                with patch("app.ml.security.verify_signature", return_value=False):
                    with open("/tmp/model3.pkl", "wb") as f:
                        f.write(b"dummy")
                    with pytest.raises(PermissionError) as exc_info:
                        load_model("/tmp/model3.pkl")
                    assert "signature verification failed" in str(exc_info.value)

    def test_load_model_calls_verify_signature_before_loading(self):
        """load_model calls verify_signature before deserializing the model."""
        from app.ml.model_loader import load_model

        with patch("app.ml.security.verify_signature", return_value=True) as mock_verify:
            with patch("app.ml.model_loader.Path.exists", return_value=True):
                with patch("app.ml.model_loader.Path.resolve", return_value="/tmp/model.pkl"):
                    with patch("joblib.load", return_value="model"):
                        with open("/tmp/model.pkl", "wb") as f:
                            f.write(b"dummy")
                        load_model("/tmp/model.pkl")
                        mock_verify.assert_called_once_with("/tmp/model.pkl")


class TestGetModel:
    """Tests for get_model function."""

    def setup_method(self):
        from app.ml import model_loader
        model_loader._model_cache.clear()

    def teardown_method(self):
        from app.ml import model_loader
        model_loader._model_cache.clear()

    def test_get_model_loads_from_default_path(self):
        """get_model loads model from the DEFAULT_MODEL_PATH environment variable."""
        from app.ml.model_loader import get_model, DEFAULT_MODEL_PATH
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            with patch("app.ml.model_loader.Path.exists", return_value=True):
                with patch("app.ml.model_loader.Path.resolve", return_value=tmp_path):
                    with patch("app.ml.security.verify_signature", return_value=True):
                        with patch("joblib.load", return_value="loaded_model"):
                            result = get_model()
                            assert result == "loaded_model"
        finally:
            os.unlink(tmp_path)


class TestClearCache:
    """Tests for clear_cache function."""

    def setup_method(self):
        from app.ml import model_loader
        model_loader._model_cache.clear()

    def teardown_method(self):
        from app.ml import model_loader
        model_loader._model_cache.clear()

    def test_clear_cache_removes_all_entries(self):
        """clear_cache empties the model cache."""
        from app.ml import model_loader
        from app.ml.model_loader import load_model

        with patch("app.ml.security.verify_signature", return_value=True):
            with patch("app.ml.model_loader.Path.exists", return_value=True):
                with patch("app.ml.model_loader.Path.resolve", return_value="/tmp/model2.pkl"):
                    with patch("joblib.load", return_value="model"):
                        with open("/tmp/model2.pkl", "wb") as f:
                            f.write(b"dummy")
                        load_model("/tmp/model2.pkl")
                        model_loader.clear_cache()
                        assert len(model_loader._model_cache) == 0
