"""
Unit tests for app.ml.prediction_cache — PredictionLRUCache with TTL and LRU eviction.
"""

import os
import sys
import time

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache, get_cache, _prediction_cache


class TestPredictionLRUCache:
    """Tests for the PredictionLRUCache class."""

    def setup_method(self):
        """Create a fresh cache instance for each test."""
        self.cache = PredictionLRUCache(max_size=3, ttl_seconds=2)

    def teardown_method(self):
        self.cache.clear()  # noqa

    def test_cache_miss_returns_none(self):
        """get() returns None when key is not present."""
        result = self.cache.get({"patient_id": "unknown"})
        assert result is None

    def test_cache_hit_returns_cached_value(self):
        """get() returns the previously stored value."""
        input_data = {"patient_id": "p1", "age": 30}
        self.cache.set(input_data, {"risk_score": 0.7})
        result = self.cache.get(input_data)
        assert result == {"risk_score": 0.7}

    def test_ttl_expiration_evicts_entry(self):
        """Entry older than ttl_seconds is evicted and returns None."""
        input_data = {"patient_id": "p1"}
        self.cache.set(input_data, {"risk_score": 0.5})
        # Wait for TTL to expire
        time.sleep(2.1)
        result = self.cache.get(input_data)
        assert result is None

    def test_lru_eviction_when_over_capacity(self):
        """When cache exceeds max_size, least recently used entry is evicted."""
        self.cache.set({"id": "a"}, "value_a")
        self.cache.set({"id": "b"}, "value_b")
        self.cache.set({"id": "c"}, "value_c")
        # Cache is now full at 3 entries
        # 'a' is LRU, should be evicted when we add 'd'
        self.cache.set({"id": "d"}, "value_d")
        # 'a' should be gone, others should remain
        assert self.cache.get({"id": "a"}) is None
        assert self.cache.get({"id": "b"}) == "value_b"
        assert self.cache.get({"id": "c"}) == "value_c"
        assert self.cache.get({"id": "d"}) == "value_d"

    def test_lru_order_updated_on_access(self):
        """Accessing a cached entry moves it to the most recently used position."""
        self.cache.set({"id": "a"}, "value_a")
        self.cache.set({"id": "b"}, "value_b")
        # Access 'a' so it becomes MRU (cache order: [b, a])
        self.cache.get({"id": "a"})
        # Add 'c' (cache order: [b, a, c])
        self.cache.set({"id": "c"}, "value_c")
        # Cache is full at 3, add 'd' which should evict 'b' (now LRU)
        self.cache.set({"id": "d"}, "value_d")
        assert self.cache.get({"id": "a"}) == "value_a"
        assert self.cache.get({"id": "b"}) is None
        assert self.cache.get({"id": "c"}) == "value_c"
        assert self.cache.get({"id": "d"}) == "value_d"

    def test_stats_returns_correct_hit_miss_counts(self):
        """stats() returns accurate size, hits, misses, and hit_rate."""
        self.cache.set({"id": "a"}, "value_a")
        self.cache.get({"id": "a"})  # hit
        self.cache.get({"id": "a"})  # hit
        self.cache.get({"id": "b"})  # miss
        stats = self.cache.stats()
        assert stats["size"] == 1
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == pytest.approx(2 / 3, rel=1e-2)

    def test_stats_hit_rate_is_zero_when_empty(self):
        """stats() returns hit_rate 0 when no operations have occurred."""
        stats = self.cache.stats()
        assert stats["hit_rate"] == 0

    def test_clear_empties_cache(self):
        """clear() removes all entries and resets stats."""
        self.cache.set({"id": "a"}, "value_a")
        self.cache.set({"id": "b"}, "value_b")
        self.cache.clear()  # noqa
        assert self.cache.get({"id": "a"}) is None
        assert self.cache.get({"id": "b"}) is None
        stats = self.cache.stats()
        assert stats["size"] == 0
        assert stats["hits"] == 0

    def test_same_input_data_produces_same_key(self):
        """Identical dict content produces the same cache key regardless of key order."""
        data1 = {"age": 30, "bmi": 25}
        data2 = {"bmi": 25, "age": 30}
        self.cache.set(data1, "result")
        # data2 should be treated as same key due to json.dumps sort_keys=True
        result = self.cache.get(data2)
        assert result == "result"

    def test_set_updates_existing_entry_and_moves_to_mru(self):
        """Updating an existing entry moves it to MRU position."""
        self.cache.set({"id": "a"}, "value_a")
        self.cache.set({"id": "b"}, "value_b")
        # Update 'a' (moves to end: [b, a])
        self.cache.set({"id": "a"}, "updated_value_a")
        # Add 'c' (cache: [b, a, c])
        self.cache.set({"id": "c"}, "value_c")
        # Add 'd' which should evict 'b' (now LRU)
        self.cache.set({"id": "d"}, "value_d")
        assert self.cache.get({"id": "a"}) == "updated_value_a"
        assert self.cache.get({"id": "b"}) is None
        assert self.cache.get({"id": "c"}) == "value_c"
        assert self.cache.get({"id": "d"}) == "value_d"


class TestModuleLevelCache:
    """Tests for module-level get_cache and singleton behavior."""

    def setup_method(self):
        # Reset module-level singleton before each test
        _prediction_cache.clear()

    def teardown_method(self):
        _prediction_cache.clear()

    def test_get_cache_returns_prediction_lru_cache_instance(self):
        """get_cache() returns a PredictionLRUCache instance."""
        cache = get_cache()
        assert isinstance(cache, PredictionLRUCache)

    def test_get_cache_returns_same_instance_on_repeated_calls(self):
        """get_cache() returns the same singleton instance."""
        cache1 = get_cache()
        cache2 = get_cache()
        assert cache1 is cache2

    def test_singleton_persists_across_get_cache_calls(self):
        """The singleton persists state across multiple get_cache() calls."""
        cache = get_cache()
        cache.set({"id": "test"}, "value")
        assert cache.get({"id": "test"}) == "value"
        # Another get_cache() call should return the same cached state
        cache2 = get_cache()
        assert cache2.get({"id": "test"}) == "value"
