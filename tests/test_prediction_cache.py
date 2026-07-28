"""
Unit tests for app/ml/prediction_cache.py — PredictionLRUCache.
Tests cache get/set/clear operations, TTL expiration, LRU eviction,
and statistics.
"""

import os
import sys
import time
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.ml.prediction_cache import PredictionLRUCache


class MockTime:
    """Controllable time source for TTL testing."""

    def __init__(self, start=0.0):
        self._current = start

    def time(self):
        return self._current

    def advance(self, seconds):
        self._current += seconds


class TestPredictionLRUCache:
    """Test suite for PredictionLRUCache."""

    def test_get_returns_none_for_empty_cache(self):
        cache = PredictionLRUCache()
        result = cache.get({"patient_id": "p1", "feature": 1.0})
        assert result is None

    def test_set_and_get_returns_stored_value(self):
        cache = PredictionLRUCache()
        cache._time = MockTime(1000)
        cache.set({"patient_id": "p1"}, {"risk": 0.8, "confidence": 0.95})
        result = cache.get({"patient_id": "p1"})
        assert result == {"risk": 0.8, "confidence": 0.95}

    def test_get_returns_none_for_expired_entry(self):
        cache = PredictionLRUCache(ttl_seconds=300)
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.8})
        mock_time.advance(301)  # TTL is 300, advance past it

        result = cache.get({"patient_id": "p1"})
        assert result is None

    def test_get_returns_value_within_ttl(self):
        cache = PredictionLRUCache(ttl_seconds=300)
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.8})
        mock_time.advance(299)  # Still within TTL

        result = cache.get({"patient_id": "p1"})
        assert result == {"risk": 0.8}

    def test_lru_eviction_removes_oldest_entry(self):
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.1})
        cache.set({"patient_id": "p2"}, {"risk": 0.2})
        # p1 is oldest, p2 is most recent

        cache.set({"patient_id": "p3"}, {"risk": 0.3})
        # p1 should now be evicted (LRU)

        assert cache.get({"patient_id": "p1"}) is None
        assert cache.get({"patient_id": "p2"}) == {"risk": 0.2}
        assert cache.get({"patient_id": "p3"}) == {"risk": 0.3}

    def test_get_updates_recency_of_entry(self):
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.1})
        cache.set({"patient_id": "p2"}, {"risk": 0.2})
        cache.get({"patient_id": "p1"})  # p1 becomes most recent
        cache.set({"patient_id": "p3"}, {"risk": 0.3})
        # p2 should now be evicted (was least recent before p1's access)

        assert cache.get({"patient_id": "p2"}) is None
        assert cache.get({"patient_id": "p1"}) == {"risk": 0.1}

    def test_stats_returns_correct_hits_and_misses(self):
        cache = PredictionLRUCache()
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.1})
        cache.get({"patient_id": "p1"})  # hit
        cache.get({"patient_id": "p2"})  # miss
        cache.get({"patient_id": "p1"})  # hit

        stats = cache.stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["hit_rate"] == round(2 / 3, 3)

    def test_stats_hit_rate_zero_when_no_requests(self):
        cache = PredictionLRUCache()
        stats = cache.stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0

    def test_clear_removes_all_entries(self):
        cache = PredictionLRUCache()
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.1})
        cache.set({"patient_id": "p2"}, {"risk": 0.2})
        cache.clear()

        assert cache.get({"patient_id": "p1"}) is None
        assert cache.get({"patient_id": "p2"}) is None
        assert cache.stats()["size"] == 0

    def test_set_same_key_updates_and_moves_to_most_recent(self):
        cache = PredictionLRUCache(max_size=2, ttl_seconds=300)
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.1})
        cache.set({"patient_id": "p2"}, {"risk": 0.2})
        cache.set({"patient_id": "p1"}, {"risk": 0.99})  # update p1, moves to most recent
        cache.set({"patient_id": "p3"}, {"risk": 0.3})
        # p2 should be evicted (LRU), p1 should still be there with new value

        assert cache.get({"patient_id": "p1"}) == {"risk": 0.99}
        assert cache.get({"patient_id": "p2"}) is None
        assert cache.get({"patient_id": "p3"}) == {"risk": 0.3}

    def test_get_cache_returns_singleton_instance(self):
        from app.ml.prediction_cache import get_cache
        cache1 = get_cache()
        cache2 = get_cache()
        assert cache1 is cache2

    def test_different_inputs_generate_different_keys(self):
        cache = PredictionLRUCache()
        mock_time = MockTime(1000)
        cache._time = mock_time

        cache.set({"patient_id": "p1"}, {"risk": 0.1})
        cache.set({"patient_id": "p2"}, {"risk": 0.2})

        # Different inputs should have different keys and both cached
        assert cache.get({"patient_id": "p1"}) == {"risk": 0.1}
        assert cache.get({"patient_id": "p2"}) == {"risk": 0.2}
        assert cache.stats()["size"] == 2
