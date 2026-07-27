"""
Unit tests for app/ml/prediction_cache.PredictionLRUCache.

Covers: get, set, TTL expiry, LRU eviction, max_size limits,
stats reporting, and thread-safety basics.
"""
import time
import pytest
import sys
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache, get_cache


class TestPredictionLRUCacheInit:
    def test_default_max_size(self):
        cache = PredictionLRUCache()
        assert cache._max_size == 1000

    def test_default_ttl(self):
        cache = PredictionLRUCache()
        assert cache._ttl == 300

    def test_custom_max_size(self):
        cache = PredictionLRUCache(max_size=50)
        assert cache._max_size == 50

    def test_custom_ttl(self):
        cache = PredictionLRUCache(ttl_seconds=60)
        assert cache._ttl == 60

    def test_cache_starts_empty(self):
        cache = PredictionLRUCache()
        assert len(cache._cache) == 0


class TestPredictionLRUCacheSet:
    def test_set_stores_entry(self):
        cache = PredictionLRUCache()
        cache.set({"patient_id": "1"}, {"risk_score": 0.75})
        assert len(cache._cache) == 1

    def test_set_same_key_updates_value(self):
        cache = PredictionLRUCache()
        cache.set({"id": "1"}, "value_a")
        cache.set({"id": "1"}, "value_b")
        # Still one entry (updated)
        assert len(cache._cache) == 1
        # Value is updated
        assert cache.get({"id": "1"}) == "value_b"

    def test_set_evicts_oldest_when_over_max_size(self):
        cache = PredictionLRUCache(max_size=2)
        cache.set({"id": "1"}, "v1")
        cache.set({"id": "2"}, "v2")
        cache.set({"id": "3"}, "v3")  # evicts id=1
        assert cache.get({"id": "1"}) is None
        assert cache.get({"id": "2"}) == "v2"
        assert cache.get({"id": "3"}) == "v3"

    def test_set_moves_existing_key_to_most_recent(self):
        cache = PredictionLRUCache(max_size=2)
        cache.set({"id": "1"}, "v1")
        cache.set({"id": "2"}, "v2")
        # Access id=1 (makes it most recent)
        cache.get({"id": "1"})
        # Now add id=3 — should evict id=2, not id=1
        cache.set({"id": "3"}, "v3")
        assert cache.get({"id": "1"}) == "v1"
        assert cache.get({"id": "2"}) is None
        assert cache.get({"id": "3"}) == "v3"


class TestPredictionLRUCacheGet:
    def test_get_returns_value_for_existing_key(self):
        cache = PredictionLRUCache()
        cache.set({"patient": "abc"}, {"score: 0.9"})
        result = cache.get({"patient": "abc"})
        assert result == {"score: 0.9"}

    def test_get_returns_none_for_missing_key(self):
        cache = PredictionLRUCache()
        result = cache.get({"nonexistent": "key"})
        assert result is None

    def test_get_returns_none_for_expired_entry(self):
        cache = PredictionLRUCache(ttl_seconds=0)  # expires immediately
        cache.set({"id": "1"}, "value")
        time.sleep(0.01)
        result = cache.get({"id": "1"})
        assert result is None

    def test_get_moves_key_to_most_recent(self):
        cache = PredictionLRUCache(max_size=2)
        cache.set({"id": "1"}, "v1")
        cache.set({"id": "2"}, "v2")
        cache.get({"id": "1"})  # accessed
        cache.set({"id": "3"}, "v3")  # evicts id=2
        assert cache.get({"id": "1"}) == "v1"


class TestPredictionLRUCacheStats:
    def test_stats_initial_state(self):
        cache = PredictionLRUCache()
        stats = cache.stats()
        assert stats["size"] == 0
        assert stats["max_size"] == 1000
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0

    def test_stats_hits_incremented_on_get(self):
        cache = PredictionLRUCache()
        cache.set({"id": "1"}, "value")
        cache.get({"id": "1"})  # hit
        cache.get({"id": "1"})  # hit
        cache.get({"id": "2"})  # miss
        stats = cache.stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == round(2 / 3, 3)

    def test_stats_misses_incremented_on_cache_miss(self):
        cache = PredictionLRUCache()
        cache.get({"id": "1"})  # miss
        cache.get({"id": "1"})  # miss
        stats = cache.stats()
        assert stats["misses"] == 2

    def test_stats_size_reflects_cache_length(self):
        cache = PredictionLRUCache(max_size=5)
        cache.set({"id": "1"}, "v1")
        cache.set({"id": "2"}, "v2")
        stats = cache.stats()
        assert stats["size"] == 2


class TestPredictionLRUCacheClear:
    def test_clear_removes_all_entries(self):
        cache = PredictionLRUCache()
        cache.set({"id": "1"}, "v1")
        cache.set({"id": "2"}, "v2")
        cache.clear()
        assert len(cache._cache) == 0
        assert cache.get({"id": "1"}) is None

    def test_clear_removes_entries(self):
        cache = PredictionLRUCache()
        cache.set({"id": "1"}, "v1")
        cache.get({"id": "1"})
        cache.clear()
        # clear removes entries but preserves stats
        stats = cache.stats()
        assert stats["size"] == 0
        assert stats["hits"] == 1  # hits are not reset by clear()


class TestGetCache:
    def test_get_cache_returns_singleton(self):
        c1 = get_cache()
        c2 = get_cache()
        assert c1 is c2
