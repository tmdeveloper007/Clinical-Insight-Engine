"""
Unit tests for app/ml/prediction_cache.py — thread-safe LRU cache for ML inference results.
"""

import os
import sys
import threading
import time

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache


class TestPredictionLRUCache:
    def test_cache_miss_returns_none(self):
        """Cache returns None when key is not present."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        result = cache.get({"patientId": "P001"})
        assert result is None

    def test_cache_set_and_get(self):
        """Cache stores and returns a value correctly."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"patientId": "P001"}, {"riskScore": 0.3, "category": "LOW"})
        result = cache.get({"patientId": "P001"})
        assert result == {"riskScore": 0.3, "category": "LOW"}

    def test_cache_key_deterministic(self):
        """Same input dict always produces the same cache key."""
        cache = PredictionLRUCache()
        # _make_key is internal but we verify get+set roundtrip is deterministic
        input_data = {"age": 45, "bmi": 28.5, "hba1c": 5.4}
        cache.set(input_data, "result_a")
        # Different key order should still be same result
        cache.set({"bmi": 28.5, "age": 45, "hba1c": 5.4}, "result_b")
        # Both inputs should map to the same cached value (last one wins)
        assert cache.get({"age": 45, "bmi": 28.5, "hba1c": 5.4}) == "result_b"

    def test_lru_eviction(self):
        """Oldest entry is evicted when cache exceeds max_size."""
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"id": "1"}, "val1")
        cache.set({"id": "2"}, "val2")
        cache.set({"id": "3"}, "val3")
        # Now cache is full; adding a new entry evicts the oldest
        cache.set({"id": "4"}, "val4")
        # First entry should be evicted
        assert cache.get({"id": "1"}) is None
        # Others should still be present
        assert cache.get({"id": "2"}) == "val2"
        assert cache.get({"id": "3"}) == "val3"
        assert cache.get({"id": "4"}) == "val4"

    def test_lru_move_to_end_on_access(self):
        """Accessing an entry moves it to the most-recently-used position."""
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"id": "1"}, "val1")
        cache.set({"id": "2"}, "val2")
        cache.set({"id": "3"}, "val3")
        # Access id=1, making it most recently used
        cache.get({"id": "1"})
        # Now adding a new entry should evict id=2 instead of id=1
        cache.set({"id": "4"}, "val4")
        assert cache.get({"id": "1"}) == "val1"  # Still there
        assert cache.get({"id": "2"}) is None     # Evicted
        assert cache.get({"id": "3"}) == "val3"
        assert cache.get({"id": "4"}) == "val4"

    def test_ttl_expiration(self):
        """Entry is evicted after TTL expires."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=1)
        cache.set({"id": "t1"}, "value")
        # Not yet expired
        assert cache.get({"id": "t1"}) == "value"
        # Wait for TTL to pass
        time.sleep(1.2)
        assert cache.get({"id": "t1"}) is None

    def test_stats_initial(self):
        """Stats return zero hits/misses on empty cache."""
        cache = PredictionLRUCache()
        stats = cache.stats()
        assert stats["size"] == 0
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0

    def test_stats_hit(self):
        """Stats track cache hits correctly."""
        cache = PredictionLRUCache()
        cache.set({"id": "x"}, "val")
        cache.get({"id": "x"})  # hit
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 1.0

    def test_stats_miss(self):
        """Stats track cache misses correctly."""
        cache = PredictionLRUCache()
        cache.get({"id": "notthere"})  # miss
        stats = cache.stats()
        assert stats["misses"] == 1
        assert stats["hits"] == 0
        assert stats["hit_rate"] == 0

    def test_clear(self):
        """Clear removes all entries and resets stats."""
        cache = PredictionLRUCache()
        cache.set({"id": "1"}, "v1")
        cache.set({"id": "2"}, "v2")
        cache.clear()
        assert cache.get({"id": "1"}) is None
        assert cache.get({"id": "2"}) is None
        stats = cache.stats()
        assert stats["size"] == 0

    def test_update_existing_key(self):
        """Setting a value for an existing key updates it and moves to end."""
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"id": "1"}, "original")
        cache.set({"id": "2"}, "val2")
        cache.set({"id": "3"}, "val3")
        # Update key 1 (oldest), then add key 4 - should evict key 2
        cache.set({"id": "1"}, "updated")
        cache.set({"id": "4"}, "val4")
        assert cache.get({"id": "1"}) == "updated"
        assert cache.get({"id": "2"}) is None  # evicted
        assert cache.get({"id": "3"}) == "val3"
        assert cache.get({"id": "4"}) == "val4"

    def test_thread_safety_concurrent_access(self):
        """Concurrent get/set operations do not cause race conditions."""
        cache = PredictionLRUCache(max_size=1000, ttl_seconds=300)
        errors = []

        def writer():
            for i in range(50):
                cache.set({"key": i}, f"value_{i}")

        def reader():
            for i in range(50):
                try:
                    cache.get({"key": i})
                except Exception as e:
                    errors.append(e)

        threads = []
        for _ in range(4):
            t1 = threading.Thread(target=writer)
            t2 = threading.Thread(target=reader)
            threads.extend([t1, t2])

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Thread errors: {errors}"
