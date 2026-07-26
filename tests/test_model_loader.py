"""
Unit tests for app.ml.model_loader — ML model singleton caching with thread-safety.
"""

import os
import sys
import tempfile

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.model_loader import (
    load_model,
    get_model,
    clear_cache,
    _model_cache,
    _lock,
    patch_joblib,
)


class TestLoadModel:
    """Tests for load_model function."""

    def setup_method(self):
        # Reset the module-level cache before each test
        clear_cache()

    def teardown_method(self):
        clear_cache()

    def test_load_model_raises_file_not_found_for_missing_path(self):
        """load_model raises FileNotFoundError when the model file does not exist."""
        with pytest.raises(FileNotFoundError, match="not found"):
            load_model("/tmp/does_not_exist_model.pkl")

    def test_load_model_returns_value_on_successful_load(self):
        """load_model returns a value when the model file exists and has valid signature."""
        import pickle
        import numpy as np

        arr = np.array([1, 2, 3])
        fd, path = tempfile.mkstemp(suffix=".pkl")
        try:
            with os.fdopen(fd, "wb") as f:
                pickle.dump(arr, f)
            # Write a signature file
            import hmac
            import hashlib
            secret = b"clinical-insight-engine-dev-secret"
            with open(path, "rb") as f:
                sig = hmac.new(secret, f.read(), digestmod=hashlib.sha256).hexdigest()
            with open(path + ".sig", "w") as f:
                f.write(sig)

            result = load_model(path)
            assert result.tolist() == [1, 2, 3]
        finally:
            os.remove(path)
            sig_path = path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)

    def test_load_model_raises_permission_error_for_missing_signature(self):
        """load_model raises PermissionError when the .sig sidecar file is missing."""
        import pickle
        import numpy as np

        fd, path = tempfile.mkstemp(suffix=".pkl")
        try:
            with os.fdopen(fd, "wb") as f:
                pickle.dump(np.array([1]), f)
            # No .sig file — signature verification should fail
            with pytest.raises(PermissionError, match="signature verification failed"):
                load_model(path)
        finally:
            os.remove(path)

    def test_load_model_raises_permission_error_for_tampered_signature(self):
        """load_model raises PermissionError when .sig does not match file content."""
        import pickle
        import numpy as np
        import hmac
        import hashlib

        fd, path = tempfile.mkstemp(suffix=".pkl")
        try:
            with os.fdopen(fd, "wb") as f:
                pickle.dump(np.array([1]), f)
            # Write a wrong signature
            secret = b"clinical-insight-engine-dev-secret"
            with open(path + ".sig", "w") as f:
                f.write("a" * 64)
            with pytest.raises(PermissionError, match="signature verification failed"):
                load_model(path)
        finally:
            os.remove(path)
            if os.path.exists(path + ".sig"):
                os.remove(path + ".sig")


class TestModelCacheSingleton:
    """Tests for singleton caching behavior."""

    def setup_method(self):
        clear_cache()

    def teardown_method(self):
        clear_cache()

    def test_model_is_cached_after_first_load(self):
        """Same model path returns the cached instance on subsequent calls."""
        import pickle
        import numpy as np

        fd, path = tempfile.mkstemp(suffix=".pkl")
        try:
            with os.fdopen(fd, "wb") as f:
                pickle.dump(np.array([99]), f)
            import hmac
            import hashlib
            secret = b"clinical-insight-engine-dev-secret"
            with open(path, "rb") as f:
                sig = hmac.new(secret, f.read(), digestmod=hashlib.sha256).hexdigest()
            with open(path + ".sig", "w") as f:
                f.write(sig)

            result1 = load_model(path)
            result2 = load_model(path)
            # Should be the exact same object (singleton)
            assert result1 is result2
        finally:
            os.remove(path)
            if os.path.exists(path + ".sig"):
                os.remove(path + ".sig")

    def test_different_model_paths_load_different_models(self):
        """Different model paths return different cached instances."""
        import pickle
        import numpy as np
        import hmac
        import hashlib

        secret = b"clinical-insight-engine-dev-secret"

        fd1, path1 = tempfile.mkstemp(suffix=".pkl")
        fd2, path2 = tempfile.mkstemp(suffix=".pkl")
        try:
            with os.fdopen(fd1, "wb") as f:
                pickle.dump(np.array([1]), f)
            with os.fdopen(fd2, "wb") as f:
                pickle.dump(np.array([2]), f)
            for path in [path1, path2]:
                with open(path, "rb") as f:
                    sig = hmac.new(secret, f.read(), digestmod=hashlib.sha256).hexdigest()
                with open(path + ".sig", "w") as f:
                    f.write(sig)

            result1 = load_model(path1)
            result2 = load_model(path2)
            assert result1 is not result2
            assert result1.tolist() == [1]
            assert result2.tolist() == [2]
        finally:
            for path in [path1, path2]:
                os.remove(path)
                if os.path.exists(path + ".sig"):
                    os.remove(path + ".sig")


class TestClearCache:
    """Tests for clear_cache function."""

    def setup_method(self):
        clear_cache()

    def teardown_method(self):
        clear_cache()

    def test_clear_cache_removes_all_cached_models(self):
        """clear_cache() empties the module-level model cache."""
        import pickle
        import numpy as np
        import hmac
        import hashlib

        secret = b"clinical-insight-engine-dev-secret"
        fd, path = tempfile.mkstemp(suffix=".pkl")
        try:
            with os.fdopen(fd, "wb") as f:
                pickle.dump(np.array([1]), f)
            with open(path, "rb") as f:
                sig = hmac.new(secret, f.read(), digestmod=hashlib.sha256).hexdigest()
            with open(path + ".sig", "w") as f:
                f.write(sig)

            model1 = load_model(path)
            assert model1 is not None
            clear_cache()
            model2 = load_model(path)
            # Should be a fresh instance, not the same object
            assert model2 is not model1
        finally:
            os.remove(path)
            if os.path.exists(path + ".sig"):
                os.remove(path + ".sig")


class TestGetModel:
    """Tests for get_model function (delegates to load_model)."""

    def setup_method(self):
        clear_cache()

    def teardown_method(self):
        clear_cache()

    def test_get_model_uses_default_path(self):
        """get_model() attempts to load from the default model path."""
        # The default path likely does not exist in test environment,
        # so it should raise FileNotFoundError
        with pytest.raises(FileNotFoundError):
            get_model()
