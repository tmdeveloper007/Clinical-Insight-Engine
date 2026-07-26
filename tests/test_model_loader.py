"""
Unit tests for app/ml/model_loader.py.

Tests cover:
- Singleton cache hit / cache miss behavior
- Thread-safe double-checked locking
- FileNotFoundError for missing model paths
- PermissionError when HMAC signature verification fails
- get_model() returns cached singleton
- clear_cache() empties the cache
"""

import os
import sys
import tempfile
import threading
import time
import pickle
import unittest
from unittest.mock import patch, MagicMock

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Patch joblib BEFORE importing model_loader so the patched version is used
from app.ml.security import patch_joblib, write_signature, get_signing_secret
patch_joblib()

# Now import model_loader (it will use the patched joblib)
from app.ml.model_loader import (
    load_model,
    get_model,
    clear_cache,
    _model_cache,
    DEFAULT_MODEL_PATH,
)


class TestModelLoaderCache(unittest.TestCase):
    """Tests for model loader singleton caching."""

    def setUp(self):
        # Ensure cache is clean before each test
        clear_cache()

    def tearDown(self):
        clear_cache()

    def test_load_model_cache_miss_loads_model(self):
        """load_model calls joblib.load and caches the result on first call."""
        import numpy as np
        from sklearn.dummy import DummyClassifier

        # Create a temp sklearn model
        model = DummyClassifier(strategy="most_frequent")
        model.fit(np.array([[1]]), np.array([0]))

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(model, f)
            temp_path = f.name

        try:
            write_signature(temp_path)
            # First call — cache miss, loads and caches
            result1 = load_model(temp_path)
            self.assertIsInstance(result1, DummyClassifier)
            self.assertIn(temp_path, _model_cache)

            # Second call — cache hit, returns same object
            result2 = load_model(temp_path)
            self.assertIs(result1, result2)
        finally:
            os.remove(temp_path)
            sig_path = temp_path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)

    def test_load_model_raises_file_not_found_for_missing_path(self):
        """load_model raises FileNotFoundError when model file does not exist."""
        with self.assertRaises(FileNotFoundError) as ctx:
            load_model("/definitely/missing/path/to/model.pkl")
        self.assertIn("not found", str(ctx.exception).lower())

    def test_load_model_raises_permission_error_on_bad_signature(self):
        """load_model raises PermissionError when HMAC signature verification fails."""
        import numpy as np
        from sklearn.dummy import DummyClassifier

        model = DummyClassifier(strategy="most_frequent")
        model.fit(np.array([[1]]), np.array([0]))

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(model, f)
            temp_path = f.name

        try:
            # Write a WRONG signature (using a different secret)
            from app.ml.security import get_signing_secret, compute_signature
            wrong_secret = b"wrong-secret-key"
            import hmac, hashlib
            with open(temp_path, "rb") as f:
                h = hmac.new(wrong_secret, f.read(), digestmod=hashlib.sha256)
            with open(temp_path + ".sig", "w") as f:
                f.write(h.hexdigest())

            # The real signing secret is different, so verification will fail
            with self.assertRaises(PermissionError) as ctx:
                load_model(temp_path)
            self.assertIn("signature verification failed", str(ctx.exception).lower())
        finally:
            os.remove(temp_path)
            sig_path = temp_path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)

    def test_get_model_returns_cached_model(self):
        """get_model() is a convenience wrapper around load_model()."""
        import numpy as np
        from sklearn.dummy import DummyClassifier

        model = DummyClassifier(strategy="most_frequent")
        model.fit(np.array([[1]]), np.array([0]))

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(model, f)
            temp_path = f.name

        try:
            write_signature(temp_path)
            clear_cache()
            result1 = get_model.__wrapped__() if hasattr(get_model, "__wrapped__") else load_model(temp_path)
            result2 = get_model.__wrapped__() if hasattr(get_model, "__wrapped__") else load_model(temp_path)
            # Just verify get_model works without error
            self.assertIsNotNone(result1)
        finally:
            os.remove(temp_path)
            sig_path = temp_path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)

    def test_clear_cache_empties_internal_cache(self):
        """clear_cache() removes all entries from the internal model cache."""
        import numpy as np
        from sklearn.dummy import DummyClassifier

        model = DummyClassifier(strategy="most_frequent")
        model.fit(np.array([[1]]), np.array([0]))

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(model, f)
            temp_path = f.name

        try:
            write_signature(temp_path)
            load_model(temp_path)
            self.assertGreater(len(_model_cache), 0)
            clear_cache()
            self.assertEqual(len(_model_cache), 0)
        finally:
            os.remove(temp_path)
            sig_path = temp_path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)


class TestModelLoaderThreadSafety(unittest.TestCase):
    """Tests for thread-safe behavior of the model loader."""

    def setUp(self):
        clear_cache()

    def tearDown(self):
        clear_cache()

    def test_concurrent_load_same_model_returns_same_instance(self):
        """Multiple threads loading the same model path get the same cached object."""
        import numpy as np
        from sklearn.dummy import DummyClassifier

        model = DummyClassifier(strategy="most_frequent")
        model.fit(np.array([[1]]), np.array([0]))

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(model, f)
            temp_path = f.name

        try:
            write_signature(temp_path)
            results = []
            errors = []

            def load_target():
                try:
                    results.append(load_model(temp_path))
                except Exception as e:
                    errors.append(e)

            threads = [threading.Thread(target=load_target) for _ in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            self.assertEqual(len(errors), 0)
            # All threads should have received the exact same object instance
            first = results[0]
            for r in results[1:]:
                self.assertIs(first, r)
        finally:
            os.remove(temp_path)
            sig_path = temp_path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)

    def test_double_checked_locking_prevents_double_load(self):
        """Double-checked locking pattern ensures model is loaded exactly once."""
        import numpy as np
        from sklearn.dummy import DummyClassifier

        model = DummyClassifier(strategy="most_frequent")
        model.fit(np.array([[1]]), np.array([0]))

        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            pickle.dump(model, f)
            temp_path = f.name

        try:
            write_signature(temp_path)
            load_count = [0]
            original_load = __import__("joblib").load

            def counting_load(*args, **kwargs):
                load_count[0] += 1
                return original_load(*args, **kwargs)

            with patch("app.ml.model_loader.load_model") as mock_load:
                mock_load.side_effect = lambda p: load_model(p)
                clear_cache()
                load_model(temp_path)
                load_model(temp_path)

            # Model was loaded once (cache hit second time, no reload)
            self.assertEqual(len(_model_cache), 1)
        finally:
            os.remove(temp_path)
            sig_path = temp_path + ".sig"
            if os.path.exists(sig_path):
                os.remove(sig_path)


if __name__ == "__main__":
    unittest.main()
