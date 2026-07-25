"""
Unit tests for app/ml/model_loader.py ML model loading and caching.
"""
import os
import sys
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import app.ml.model_loader as ml_mod


@pytest.fixture(autouse=True)
def reset_model_cache():
    """Reset the model cache between tests for isolation."""
    ml_mod._model_cache.clear()
    yield
    ml_mod._model_cache.clear()


class TestLoadModel:
    def test_load_model_returns_same_instance_on_cache_hit(self, monkeypatch, tmp_path):
        """Once loaded, the same model instance is returned from cache."""
        model_file = tmp_path / "test_model.pkl"
        sig_file = tmp_path / "test_model.pkl.sig"
        model_file.write_bytes(b"mock model data")
        sig_file.write_text("fake-signature")

        mock_model = object()
        call_count = {}
        def fake_load(path):
            call_count["n"] = call_count.get("n", 0) + 1
            return mock_model

        # Patch verify_signature at its definition site so the local import picks it up
        monkeypatch.setattr("app.ml.security.verify_signature", lambda p: True)
        # Patch joblib.load after patch_joblib has run
        import joblib
        monkeypatch.setattr(joblib, "load", fake_load)

        result = ml_mod.load_model(str(model_file))
        assert result is mock_model

        # Second call should hit cache (fake_load not called again)
        result2 = ml_mod.load_model(str(model_file))
        assert result2 is mock_model
        assert call_count.get("n") == 1

    def test_load_model_raises_file_not_found_when_model_missing(self, tmp_path):
        """load_model raises FileNotFoundError when the model file does not exist."""
        ml_mod._model_cache.clear()
        missing_path = str(tmp_path / "nonexistent_model.pkl")

        with pytest.raises(FileNotFoundError) as exc_info:
            ml_mod.load_model(missing_path)
        assert "not found" in str(exc_info.value).lower()

    def test_load_model_raises_permission_error_when_signature_fails(self, monkeypatch, tmp_path):
        """load_model raises PermissionError when signature verification fails."""
        model_file = tmp_path / "unsigned_model.pkl"
        model_file.write_bytes(b"unsigned model")
        # No .sig file — verify_signature will return False
        ml_mod._model_cache.clear()
        monkeypatch.setattr("app.ml.security.verify_signature", lambda p: False)

        with pytest.raises(PermissionError) as exc_info:
            ml_mod.load_model(str(model_file))
        assert "signature" in str(exc_info.value).lower()

    def test_load_model_caches_after_first_load(self, monkeypatch, tmp_path):
        """Second call to load_model for same path hits the cache."""
        model_file = tmp_path / "cached_model.pkl"
        sig_file = tmp_path / "cached_model.pkl.sig"
        model_file.write_bytes(b"cached model")
        sig_file.write_text("valid-signature")

        ml_mod._model_cache.clear()
        call_count = {}
        def counting_load(path):
            call_count["n"] = call_count.get("n", 0) + 1
            return object()
        import joblib
        monkeypatch.setattr(joblib, "load", counting_load)
        monkeypatch.setattr("app.ml.security.verify_signature", lambda p: True)

        ml_mod.load_model(str(model_file))
        assert call_count.get("n") == 1
        ml_mod.load_model(str(model_file))
        assert call_count.get("n") == 1  # cache hit, no second load

    def test_load_model_accepts_relative_path(self, monkeypatch, tmp_path):
        """load_model resolves relative paths via Path.resolve()."""
        model_file = tmp_path / "relative_model.pkl"
        sig_file = tmp_path / "relative_model.pkl.sig"
        model_file.write_bytes(b"relative model")
        sig_file.write_text("sig")

        ml_mod._model_cache.clear()
        monkeypatch.setattr(joblib if "joblib" in dir() else __import__("joblib"), "load", lambda p: object())
        import joblib as jb
        monkeypatch.setattr(jb, "load", lambda p: object())
        monkeypatch.setattr("app.ml.security.verify_signature", lambda p: True)

        monkeypatch.chdir(tmp_path)
        result = ml_mod.load_model("relative_model.pkl")
        assert result is not None


class TestGetModel:
    def test_get_model_calls_load_model(self, monkeypatch):
        """get_model() delegates to load_model() with default path."""
        ml_mod._model_cache.clear()
        fake_model = object()
        call_args = {}
        def capture_call(path=None):
            call_args["path"] = path
            return fake_model
        monkeypatch.setattr(ml_mod, "load_model", capture_call)

        result = ml_mod.get_model()
        assert result is fake_model


class TestClearCache:
    def test_clear_cache_removes_all_entries(self):
        """clear_cache() empties the internal _model_cache."""
        ml_mod._model_cache["/fake/path"] = object()
        assert len(ml_mod._model_cache) == 1

        ml_mod.clear_cache()
        assert len(ml_mod._model_cache) == 0

    def test_load_after_clear_fetches_model_again(self, monkeypatch, tmp_path):
        """After clear_cache, the next load_model call re-fetches the model."""
        model_file = tmp_path / "reloaded_model.pkl"
        sig_file = tmp_path / "reloaded_model.pkl.sig"
        model_file.write_bytes(b"reloaded")
        sig_file.write_text("valid-sig")

        ml_mod._model_cache.clear()
        call_count = {}
        def counting_load(path):
            call_count["n"] = call_count.get("n", 0) + 1
            return object()
        import joblib
        monkeypatch.setattr(joblib, "load", counting_load)
        monkeypatch.setattr("app.ml.security.verify_signature", lambda p: True)

        ml_mod.load_model(str(model_file))
        assert call_count.get("n") == 1
        ml_mod.clear_cache()
        ml_mod.load_model(str(model_file))
        assert call_count.get("n") == 2  # Second load after cache cleared
