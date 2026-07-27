"""
Unit tests for app.ml.prediction_cache.PredictionLRUCache.
"""
import time
import pytest
import sys
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache


class TestPredictionLRUCache:
    """Test suite for PredictionLRUCache."""

    def test_make_key_produces_stable_hash(self):
        """Same input_data dict must always produce the same key."""
        cache = PredictionLRUCache()
        key1 = cache._make_key({"a": 1, "b": 2})
        key2 = cache._make_key({"a": 1, "b": 2})
        assert key1 == key2
        assert len(key1) == 16

    def test_make_key_respects_order(self):
        """JSON serialization sorts keys so identical content produces same key."""
        cache = PredictionLRUCache()
        key1 = cache._make_key({"a": 1, "b": 2})
        key2 = cache._make_key({"b": 2, "a": 1})
        # sort_keys=True in json.dumps means content order does not affect hash
        assert key1 == key2

    def test_set_and_get_returns_stored_result(self):
        """get() must return the value stored via set()."""
        cache = PredictionLRUCache()
        input_data = {"age": 45, "bmi": 28.5, "glucose": 130}
        result = {"risk": "moderate", "score": 0.65}
        cache.set(input_data, result)
        assert cache.get(input_data) == result

    def test_get_returns_none_for_missing_key(self):
        """get() must return None when no matching entry exists."""
        cache = PredictionLRUCache()
        assert cache.get({"unknown": True}) is None

    def test_get_returns_none_after_ttl_expires(self):
        """get() must return None for entries older than ttl_seconds."""
        cache = PredictionLRUCache(ttl_seconds=1)
        cache.set({"age": 30}, "result")
        time.sleep(1.1)
        assert cache.get({"age": 30}) is None

    def test_get_updates_lru_order(self):
        """Accessing an entry via get() moves it to most-recently-used position."""
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"n": 1}, "v1")
        cache.set({"n": 2}, "v2")
        cache.set({"n": 3}, "v3")
        # Access n=1 to make it MRU
        cache.get({"n": 1})
        # Insert new entry to force eviction of LRU (n=2)
        cache.set({"n": 4}, "v4")
        assert cache.get({"n": 1}) == "v1"
        assert cache.get({"n": 2}) is None  # evicted
        assert cache.get({"n": 3}) == "v3"
        assert cache.get({"n": 4}) == "v4"

    def test_max_size_evicts_lru_on_overflow(self):
        """When cache exceeds max_size, the least-recently-used entry is evicted."""
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        cache.set({"k": 1}, "v1")
        cache.set({"k": 2}, "v2")
        cache.set({"k": 3}, "v3")
        assert cache.get({"k": 1}) is None  # evicted
        assert cache.get({"k": 2}) == "v2"
        assert cache.get({"k": 3}) == "v3"

    def test_stats_initial_state(self):
        """stats() must report zero hits/misses on a fresh cache."""
        cache = PredictionLRUCache()
        s = cache.stats()
        assert s["hits"] == 0
        assert s["misses"] == 0
        assert s["hit_rate"] == 0
        assert s["size"] == 0

    def test_stats_reflects_hits_and_misses(self):
        """stats() must correctly count hits and misses."""
        cache = PredictionLRUCache()
        cache.set({"a": 1}, "r1")
        cache.get({"a": 1})  # hit
        cache.get({"a": 1})  # hit
        cache.get({"b": 2})  # miss
        s = cache.stats()
        assert s["hits"] == 2
        assert s["misses"] == 1
        # hit_rate is rounded to 3 decimal places
        assert s["hit_rate"] == pytest.approx(0.667, abs=0.001)

    def test_stats_reflects_size(self):
        """stats() must reflect current cache size."""
        cache = PredictionLRUCache()
        cache.set({"k": 1}, "v1")
        cache.set({"k": 2}, "v2")
        assert cache.stats()["size"] == 2
        cache.set({"k": 3}, "v3")
        assert cache.stats()["size"] == 3

    def test_clear_resets_cache(self):
        """clear() must empty the cache; stats counters are not reset by clear()."""
        cache = PredictionLRUCache()
        cache.set({"a": 1}, "r1")
        cache.get({"a": 1})  # hit
        cache.clear()
        assert cache.get({"a": 1}) is None
        s = cache.stats()
        # clear() empties the cache but does not reset hit/miss counters
        assert s["size"] == 0

    def test_update_existing_key_moves_to_mru(self):
        """Updating an existing key's value moves it to MRU without changing size."""
        cache = PredictionLRUCache(max_size=3, ttl_seconds=300)
        cache.set({"n": 1}, "v1")
        cache.set({"n": 2}, "v2")
        cache.set({"n": 1}, "v1_updated")  # update key 1
        cache.set({"n": 3}, "v3")
        cache.set({"n": 4}, "v4")
        # n=2 should be evicted (was LRU after n=1 update)
        assert cache.get({"n": 1}) == "v1_updated"
        assert cache.get({"n": 2}) is None
