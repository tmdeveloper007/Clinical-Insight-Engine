"""
Tests for PredictionLRUCache class in app/ml/prediction_cache.py
"""
import pytest
import time
import threading
from unittest.mock import patch
from collections import OrderedDict

# Import the module
import sys
sys.path.insert(0, ".")
from app.ml.prediction_cache import PredictionLRUCache, get_cache


class TestPredictionLRUCache:
    """Unit tests for PredictionLRUCache."""

    def test_get_returns_none_for_empty_cache(self):
        """Cache get on empty cache returns None."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        result = cache.get({"patient_id": "123"})
        assert result is None

    def test_set_and_get_stores_and_retrieves_result(self):
        """Cache set stores result; get retrieves it."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"patient_id": "123"}, {"risk_score": 0.75})
        result = cache.get({"patient_id": "123"})
        assert result == {"risk_score": 0.75}

    def test_get_increments_miss_on_empty(self):
        """Get on empty cache increments miss counter."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.get({"patient_id": "x"})
        stats = cache.stats()
        assert stats["misses"] == 1
        assert stats["hits"] == 0

    def test_get_increments_hit_on_cache_hit(self):
        """Get on existing key increments hit counter."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"id": "1"}, "result")
        cache.get({"id": "1"})
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 0

    def test_lru_eviction_removes_oldest_entry(self):
        """When cache exceeds max_size, oldest entry is evicted."""
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        cache.set({"id": "1"}, "a")
        cache.set({"id": "2"}, "b")
        cache.set({"id": "3"}, "c")  # Should evict id=1
        assert cache.get({"id": "1"}) is None
        assert cache.get({"id": "2"}) == "b"
        assert cache.get({"id": "3"}) == "c"

    def test_lru_move_to_end_on_get(self):
        """Cache hit moves entry to most-recently-used position."""
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        cache.set({"id": "1"}, "a")
        cache.set({"id": "2"}, "b")
        cache.get({"id": "1"})  # Touch id=1
        cache.set({"id": "3"}, "c")  # Should evict id=2 (LRU after id=1 was touched)
        assert cache.get({"id": "1"}) == "a"
        assert cache.get({"id": "2"}) is None

    def test_lru_move_to_end_on_set(self):
        """Updating an existing key moves it to most-recently-used."""
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        cache.set({"id": "1"}, "a")
        cache.set({"id": "2"}, "b")
        cache.set({"id": "1"}, "a-updated")  # Re-set id=1
        cache.set({"id": "3"}, "c")  # Should evict id=2
        assert cache.get({"id": "1"}) == "a-updated"
        assert cache.get({"id": "2"}) is None

    def test_ttl_expiry_returns_none(self):
        """Cache entry expires after ttl_seconds."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=1)
        cache.set({"id": "1"}, "value")
        time.sleep(1.1)
        result = cache.get({"id": "1"})
        assert result is None

    def test_ttl_expiry_increments_miss(self):
        """Expired entry increments miss counter."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=1)
        cache.set({"id": "1"}, "value")
        cache.get({"id": "1"})  # Hit before expiry
        time.sleep(1.1)
        cache.get({"id": "1"})  # Miss after expiry
        stats = cache.stats()
        assert stats["misses"] == 1
        assert stats["hits"] == 1

    def test_stats_returns_correct_hit_rate(self):
        """Stats reports correct hit rate."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"id": "1"}, "a")
        cache.get({"id": "1"})  # hit
        cache.get({"id": "1"})  # hit
        cache.get({"id": "2"})  # miss
        stats = cache.stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == round(2 / 3, 3)

    def test_stats_returns_correct_size(self):
        """Stats reports correct current cache size."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"id": "1"}, "a")
        cache.set({"id": "2"}, "b")
        stats = cache.stats()
        assert stats["size"] == 2
        assert stats["max_size"] == 10

    def test_clear_removes_all_entries(self):
        """Clear empties the cache."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        cache.set({"id": "1"}, "a")
        cache.set({"id": "2"}, "b")
        cache.clear()
        assert cache.get({"id": "1"}) is None
        assert cache.get({"id": "2"}) is None
        stats = cache.stats()
        assert stats["size"] == 0
        # clear() removes cache entries but preserves hit/miss counters
        assert stats["hits"] == 0
        assert stats["misses"] == 2

    def test_key_is_deterministic_same_input(self):
        """Same input dict always produces same cache key."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        key1 = cache._make_key({"a": 1, "b": 2})
        key2 = cache._make_key({"a": 1, "b": 2})
        assert key1 == key2

    def test_key_is_deterministic_key_order(self):
        """Dict key order does not affect cache key."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        key1 = cache._make_key({"a": 1, "b": 2})
        key2 = cache._make_key({"b": 2, "a": 1})
        assert key1 == key2

    def test_key_is_hex_digest_16_chars(self):
        """Cache key is a 16-character hex string."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        key = cache._make_key({"id": "test"})
        assert len(key) == 16
        assert all(c in "0123456789abcdef" for c in key)

    def test_thread_safety_set_and_get(self):
        """Cache can handle concurrent set/get operations safely."""
        cache = PredictionLRUCache(max_size=100, ttl_seconds=300)
        errors = []

        def worker(i):
            try:
                for j in range(50):
                    cache.set({"id": f"{i}-{j}"}, f"result-{i}-{j}")
                    cache.get({"id": f"{i}-{j}"})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        stats = cache.stats()
        assert stats["size"] <= 100

    def test_get_cache_returns_singleton(self):
        """get_cache returns the module singleton."""
        cache1 = get_cache()
        cache2 = get_cache()
        assert cache1 is cache2
