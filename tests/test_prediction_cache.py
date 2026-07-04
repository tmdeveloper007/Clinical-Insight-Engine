"""
Unit tests for PredictionLRUCache in app/ml/prediction_cache.py.
"""
import threading
import time
import pytest

REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent
import sys

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.ml.prediction_cache import PredictionLRUCache


class TestPredictionLRUCacheBasics:
    def test_get_returns_none_for_empty_cache(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        result = cache.get({"patient_id": "unknown"})
        assert result is None

    def test_set_and_get_returns_stored_value(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"patient_id": "p1"}, {"risk": "HIGH", "probability": 0.85})
        result = cache.get({"patient_id": "p1"})
        assert result == {"risk": "HIGH", "probability": 0.85}

    def test_set_updates_existing_key(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"id": "x"}, "first")
        cache.set({"id": "x"}, "second")
        result = cache.get({"id": "x"})
        assert result == "second"

    def test_different_inputs_have_different_keys(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"a": 1}, "val_a")
        cache.set({"a": 2}, "val_b")
        assert cache.get({"a": 1}) == "val_a"
        assert cache.get({"a": 2}) == "val_b"

    def test_empty_dict_inputs_are_distinct_from_none(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({}, "empty_dict_result")
        result = cache.get({})
        assert result == "empty_dict_result"


class TestPredictionLRUCacheLRUEviction:
    def test_evicts_oldest_entry_when_max_size_exceeded(self):
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"k": "1"}, "v1")
        cache.set({"k": "2"}, "v2")
        cache.set({"k": "3"}, "v3")
        cache.set({"k": "4"}, "v4")  # Evicts k=1

        assert cache.get({"k": "1"}) is None
        assert cache.get({"k": "2"}) == "v2"
        assert cache.get({"k": "3"}) == "v3"
        assert cache.get({"k": "4"}) == "v4"

    def test_get_moves_entry_to_most_recent(self):
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"k": "1"}, "v1")
        cache.set({"k": "2"}, "v2")
        cache.set({"k": "3"}, "v3")
        # Access k=1 (makes it most recent)
        cache.get({"k": "1"})
        # Adding k=4 should evict k=2 (the LRU)
        cache.set({"k": "4"}, "v4")

        assert cache.get({"k": "1"}) == "v1"
        assert cache.get({"k": "2"}) is None
        assert cache.get({"k": "3"}) == "v3"
        assert cache.get({"k": "4"}) == "v4"

    def test_set_on_existing_key_does_not_trigger_eviction(self):
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        cache.set({"k": "1"}, "v1")
        cache.set({"k": "2"}, "v2")
        cache.set({"k": "1"}, "v1_updated")  # update, not new key
        cache.set({"k": "3"}, "v3")  # should evict k=2

        assert cache.get({"k": "1"}) == "v1_updated"
        assert cache.get({"k": "2"}) is None
        assert cache.get({"k": "3"}) == "v3"


class TestPredictionLRUCacheTTL:
    def test_evicts_expired_entry(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=1)
        cache.set({"k": "expire"}, "value")
        time.sleep(1.1)
        result = cache.get({"k": "expire"})
        assert result is None

    def test_unexpired_entry_is_returned(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"k": "fresh"}, "value")
        time.sleep(0.1)
        result = cache.get({"k": "fresh"})
        assert result == "value"


class TestPredictionLRUCacheStats:
    def test_stats_tracks_hits_and_misses(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"k": "1"}, "v1")
        cache.get({"k": "1"})  # hit
        cache.get({"k": "1"})  # hit
        cache.get({"missing": "x"})  # miss

        stats = cache.stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == round(2 / 3, 3)

    def test_stats_hit_rate_is_zero_when_empty(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        stats = cache.stats()
        assert stats["hit_rate"] == 0

    def test_stats_size_and_max_size(self):
        cache = PredictionLRUCache(max_size=5, ttl_seconds=300)
        cache.set({"a": 1}, "x")
        cache.set({"b": 2}, "y")
        stats = cache.stats()
        assert stats["size"] == 2
        assert stats["max_size"] == 5


class TestPredictionLRUCacheClear:
    def test_clear_removes_all_entries(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"k": "1"}, "v1")
        cache.set({"k": "2"}, "v2")
        cache.clear()
        assert cache.get({"k": "1"}) is None
        assert cache.get({"k": "2"}) is None
        assert cache.stats()["size"] == 0


class TestPredictionLRUCacheThreadSafety:
    def test_concurrent_set_and_get_do_not_crash(self):
        cache = PredictionLRUCache(max_size=100, ttl_seconds=300)
        errors = []

        def writer(thread_id):
            try:
                for i in range(50):
                    cache.set({"thread": thread_id, "i": i}, f"val-{thread_id}-{i}")
            except Exception as e:
                errors.append(e)

        def reader(thread_id):
            try:
                for i in range(50):
                    cache.get({"thread": thread_id, "i": i})
            except Exception as e:
                errors.append(e)

        threads = []
        for t in range(5):
            threads.append(threading.Thread(target=writer, args=(t,)))
            threads.append(threading.Thread(target=reader, args=(t,)))

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Threading errors: {errors}"


class TestPredictionLRUCacheSingleton:
    def test_get_cache_returns_singleton_instance(self):
        from app.ml.prediction_cache import get_cache
        cache1 = get_cache()
        cache2 = get_cache()
        assert cache1 is cache2
        # Verify it is the module-level singleton
        from app.ml import prediction_cache
        assert cache1 is prediction_cache._prediction_cache
