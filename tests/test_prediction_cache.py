"""
Unit tests for app/ml/prediction_cache.py.

Tests cover:
- LRU cache get/set operations (write-through, not read-through)
- TTL expiration behavior
- LRU eviction when max_size is exceeded
- Hit/miss statistics tracking
- Thread-safe concurrent access
- Cache key stability (deterministic hashing)
"""

import os
import sys
import threading
import time
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache, get_cache


class TestPredictionLRUCache(unittest.TestCase):
    """Tests for PredictionLRUCache core behavior."""

    def setUp(self):
        self.cache = PredictionLRUCache(max_size=5, ttl_seconds=2)

    def test_get_returns_none_for_missing_key(self):
        """get() returns None when key is not in cache."""
        result = self.cache.get({"patient": "Alice"})
        self.assertIsNone(result)

    def test_set_and_get_returns_stored_result(self):
        """set() stores result; get() retrieves it (write-through)."""
        input_data = {"age": 45, "bmi": 24.5}
        expected = {"riskScore": 12.3, "riskCategory": "LOW"}
        self.cache.set(input_data, expected)
        result = self.cache.get(input_data)
        self.assertEqual(result, expected)

    def test_ttl_expiry_returns_none_after_ttl(self):
        """Entry is treated as miss after TTL seconds elapse."""
        input_data = {"age": 30, "bmi": 22.0}
        self.cache.set(input_data, {"riskScore": 5.0})
        result1 = self.cache.get(input_data)
        self.assertEqual(result1, {"riskScore": 5.0})
        time.sleep(2.1)
        result2 = self.cache.get(input_data)
        self.assertIsNone(result2)

    def test_lru_eviction_removes_oldest_entry(self):
        """When max_size is exceeded, the oldest (least recently used) entry is evicted."""
        for i in range(5):
            self.cache.set({"key": i}, {"result": i})
        self.assertEqual(self.cache.stats()["size"], 5)
        self.cache.set({"key": 99}, {"result": 99})
        self.assertEqual(self.cache.stats()["size"], 5)
        self.assertIsNone(self.cache.get({"key": 0}))
        self.assertEqual(self.cache.get({"key": 99}), {"result": 99})
        self.assertEqual(self.cache.get({"key": 4}), {"result": 4})

    def test_stats_records_hits_and_misses(self):
        """stats() correctly increments hits on get-found and misses on get-miss or expired."""
        # Cache a and b first via set
        self.cache.set({"a": 1}, "ra")
        self.cache.set({"b": 2}, "rb")
        self.cache.get({"a": 1})  # hit
        self.cache.get({"a": 1})  # hit
        self.cache.get({"b": 1})  # miss (different key)
        self.cache.get({"c": 3})  # miss (not cached)
        stats = self.cache.stats()
        # hits: a(1st), a(2nd) = 2; misses: b(1st), c = 2
        self.assertEqual(stats["hits"], 2)
        self.assertEqual(stats["misses"], 2)

    def test_stats_hit_rate_calculation(self):
        """Hit rate is hits / (hits + misses) rounded to 3 decimals."""
        self.cache.set({"x": 0}, "rx")
        self.cache.set({"y": 1}, "ry")
        self.cache.get({"x": 0})  # hit
        self.cache.get({"x": 0})  # hit
        self.cache.get({"z": 2})  # miss
        self.cache.get({"w": 3})  # miss
        stats = self.cache.stats()
        self.assertEqual(stats["hits"], 2)
        self.assertEqual(stats["misses"], 2)
        self.assertEqual(stats["hit_rate"], round(2 / 4, 3))

    def test_clear_empties_cache_and_resets_size(self):
        """clear() removes all entries (counters are not reset by design)."""
        self.cache.set({"a": 1}, "result")
        self.cache.get({"a": 1})
        self.cache.get({"b": 2})
        self.cache.clear()
        stats = self.cache.stats()
        self.assertEqual(stats["size"], 0)
        self.assertIsNone(self.cache.get({"a": 1}))

    def test_cache_key_stable_for_same_input(self):
        """Same input dict always produces the same cache key."""
        input1 = {"age": 45, "bmi": 24.5}
        key1 = self.cache._make_key(input1)
        key2 = self.cache._make_key(input1)
        self.assertEqual(key1, key2)

    def test_cache_key_order_independent_due_to_sort_keys(self):
        """Keys are consistent regardless of dict insertion order."""
        input_a = {"age": 45, "bmi": 24.5}
        input_b = {"bmi": 24.5, "age": 45}
        key_a = self.cache._make_key(input_a)
        key_b = self.cache._make_key(input_b)
        self.assertEqual(key_a, key_b)

    def test_set_with_different_keys_adds_separate_entries(self):
        """set() with different key values creates separate cache entries."""
        self.cache.set({"k": 1}, "v1")
        self.cache.set({"k": 2}, "v2")
        self.assertEqual(self.cache.stats()["size"], 2)
        self.assertEqual(self.cache.get({"k": 1}), "v1")
        self.assertEqual(self.cache.get({"k": 2}), "v2")


class TestPredictionLRUCacheThreadSafety(unittest.TestCase):
    """Tests for thread-safe behavior of the cache."""

    def setUp(self):
        self.cache = PredictionLRUCache(max_size=4, ttl_seconds=10)

    def test_concurrent_set_and_get_no_errors(self):
        """Multiple threads can safely call set() and get() concurrently."""
        errors = []

        def writer(thread_id):
            try:
                for i in range(20):
                    self.cache.set({"thread": thread_id, "i": i}, {"result": i})
            except Exception as e:
                errors.append(str(e))

        def reader():
            try:
                for _ in range(20):
                    self.cache.get({"thread": 0, "i": 0})
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(5)]
        threads.append(threading.Thread(target=reader))
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0)

    def test_get_moves_entry_to_mru_position(self):
        """get() moves accessed entry to most-recently-used (end) position."""
        # Use a fresh cache with max_size=3 for this specific test
        local_cache = PredictionLRUCache(max_size=3, ttl_seconds=10)
        for i in range(3):
            local_cache.set({"key": i}, {"result": i})
        # Cache order: [key=0, key=1, key=2] — key=0 is oldest
        local_cache.get({"key": 0})  # Moves key=0 to MRU: [key=1, key=2, key=0]
        # Now add key=99: appends, exceeds max_size=3 → evicts oldest [key=1]
        local_cache.set({"key": 99}, {"result": 99})
        # key=0 should still be present (was moved to MRU)
        self.assertEqual(local_cache.get({"key": 0}), {"result": 0})
        # key=1 should be evicted (was oldest after key=0 was moved)
        self.assertIsNone(local_cache.get({"key": 1}))
        # key=2 should still be present
        self.assertEqual(local_cache.get({"key": 2}), {"result": 2})
        # key=99 is the newest entry
        self.assertEqual(local_cache.get({"key": 99}), {"result": 99})


class TestGetCacheSingleton(unittest.TestCase):
    """Tests for the module-level get_cache() singleton."""

    def test_get_cache_returns_prediction_lru_cache_instance(self):
        """get_cache() returns a PredictionLRUCache instance."""
        cache = get_cache()
        self.assertIsInstance(cache, PredictionLRUCache)
        self.assertEqual(cache._max_size, 1000)
        self.assertEqual(cache._ttl, 300)


if __name__ == "__main__":
    unittest.main()
