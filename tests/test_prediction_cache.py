"""
Unit tests for app/ml/prediction_cache.py LRU prediction result cache.
"""
import os
import sys
import time
import threading
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache


class TestPredictionLRUCacheBasic:
    def test_set_and_get_returns_same_result(self):
        """set() followed by get() returns the stored result."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        input_data = {"age": 45, "bmi": 25.0}
        result = {"prediction": 0, "probability": 0.3}

        cache.set(input_data, result)
        assert cache.get(input_data) == result

    def test_get_none_for_unseen_key(self):
        """get() returns None for keys that have not been set."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=300)
        assert cache.get({"foo": "bar"}) is None

    def test_key_generation_is_stable(self):
        """Same input dict always produces the same key."""
        cache = PredictionLRUCache()
        input_a = {"age": 45, "bmi": 25.0}
        input_b = {"bmi": 25.0, "age": 45}  # same data, different order

        key_a = cache._make_key(input_a)
        key_b = cache._make_key(input_b)
        assert key_a == key_b  # JSON sort_keys ensures stability

    def test_different_inputs_produce_different_keys(self):
        """Different input dicts produce different keys."""
        cache = PredictionLRUCache()
        key1 = cache._make_key({"age": 45})
        key2 = cache._make_key({"age": 46})
        assert key1 != key2

    def test_get_increments_miss_counter_for_unseen_key(self):
        """get() on an unseen key increments _misses."""
        cache = PredictionLRUCache()
        initial_stats = cache.stats()
        cache.get({"unknown": "key"})
        final_stats = cache.stats()
        assert final_stats["misses"] == initial_stats["misses"] + 1

    def test_get_increments_hit_counter_on_cache_hit(self):
        """get() on a cached key increments _hits and returns the value."""
        cache = PredictionLRUCache()
        cache.set({"x": 1}, "value")
        cache.get({"x": 1})  # miss (key created but timestamp may be fresh)
        # First get after set should be a hit
        result = cache.get({"x": 1})
        assert result == "value"
        assert cache.stats()["hits"] >= 1


class TestPredictionLRUCacheLRU:
    def test_lru_eviction_removes_oldest_entry(self):
        """When capacity is exceeded, the oldest entry is evicted."""
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)

        cache.set({"k": 1}, "v1")
        cache.set({"k": 2}, "v2")
        # Cache is now full: [k1, k2]

        # Add third entry, should evict k1
        cache.set({"k": 3}, "v3")

        # k1 should be evicted
        assert cache.get({"k": 1}) is None
        # k2 and k3 should still be present
        assert cache.get({"k": 2}) == "v2"
        assert cache.get({"k": 3}) == "v3"

    def test_lru_move_to_end_on_access(self):
        """Accessing an entry via get() moves it to the most-recently-used position."""
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)

        cache.set({"a": 1}, "v1")
        cache.set({"b": 2}, "v2")
        cache.set({"c": 3}, "v3")
        # Order: [a, b, c]

        # Access 'a' — it becomes most recently used
        cache.get({"a": 1})

        # Add new entry — should evict 'b' (now the oldest)
        cache.set({"d": 4}, "v4")

        assert cache.get({"a": 1}) == "v1"  # still present
        assert cache.get({"b": 2}) is None  # evicted
        assert cache.get({"c": 3}) == "v3"
        assert cache.get({"d": 4}) == "v4"

    def test_lru_move_to_end_on_set_for_existing_key(self):
        """Updating an existing key via set() moves it to the most-recently-used position."""
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)

        cache.set({"a": 1}, "v1")
        cache.set({"b": 2}, "v2")

        # Update 'a' — becomes most recently used
        cache.set({"a": 1}, "v1_updated")

        # Add new entry — should evict 'b' (oldest)
        cache.set({"c": 3}, "v3")

        assert cache.get({"a": 1}) == "v1_updated"
        assert cache.get({"b": 2}) is None


class TestPredictionLRUCacheTTL:
    def test_expired_entry_returns_none_and_is_removed(self):
        """Entries past TTL are treated as misses and removed from cache."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=1)
        cache.set({"k": 1}, "v")

        # Immediately: should be a hit
        assert cache.get({"k": 1}) == "v"

        # Wait for TTL to expire
        time.sleep(1.1)

        # Should now be a miss and removed
        assert cache.get({"k": 1}) is None
        assert len(cache._cache) == 0  # cleaned up


class TestPredictionLRUCacheStats:
    def test_stats_initial_state(self):
        """stats() returns correct initial values."""
        cache = PredictionLRUCache(max_size=100, ttl_seconds=60)
        s = cache.stats()
        assert s["size"] == 0
        assert s["max_size"] == 100
        assert s["hits"] == 0
        assert s["misses"] == 0
        assert s["hit_rate"] == 0

    def test_stats_hit_rate_calculation(self):
        """hit_rate is computed as hits / (hits + misses)."""
        cache = PredictionLRUCache()
        cache.set({"a": 1}, "v")
        cache.get({"a": 1})  # 1 hit
        cache.get({"b": 2})  # 1 miss
        s = cache.stats()
        assert s["hit_rate"] == round(1 / 2, 3)


class TestPredictionLRUCacheClear:
    def test_clear_removes_all_entries(self):
        """clear() empties the cache."""
        cache = PredictionLRUCache()
        cache.set({"a": 1}, "v1")
        cache.set({"b": 2}, "v2")
        assert len(cache._cache) == 2

        cache.clear()
        assert len(cache._cache) == 0
        assert cache.get({"a": 1}) is None
        assert cache.get({"b": 2}) is None


class TestPredictionLRUCacheThreadSafety:
    def test_concurrent_set_and_get_do_not_crash(self):
        """Multiple threads reading and writing simultaneously does not raise."""
        cache = PredictionLRUCache(max_size=100, ttl_seconds=300)
        errors = []

        def writer(thread_id):
            try:
                for i in range(50):
                    cache.set({"thread": thread_id, "i": i}, f"result_{thread_id}_{i}")
            except Exception as e:
                errors.append(e)

        def reader():
            try:
                for _ in range(50):
                    cache.get({"thread": 0, "i": 0})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(3)]
        threads.append(threading.Thread(target=reader))

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Threading errors: {errors}"
        assert len(cache._cache) <= cache._max_size
