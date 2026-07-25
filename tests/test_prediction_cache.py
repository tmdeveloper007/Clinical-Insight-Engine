"""
Tests for PredictionLRUCache in app/ml/prediction_cache.py
"""
import pytest
import time
from app.ml.prediction_cache import PredictionLRUCache


class MockTime:
    """Controlled time for testing TTL behavior."""
    def __init__(self, start: float = 1000.0):
        self._current = start

    def time(self) -> float:
        return self._current

    def advance(self, seconds: float):
        self._current += seconds


class TestPredictionLRUCache:
    def test_set_and_get_returns_value(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"patient": "Alice", "risk": 0.8}, {"prediction": "high", "score": 0.95})
        result = cache.get({"patient": "Alice", "risk": 0.8})
        assert result == {"prediction": "high", "score": 0.95}

    def test_get_missing_key_returns_none(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        result = cache.get({"patient": "Nobody"})
        assert result is None

    def test_ttl_expiry_returns_none(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=30)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"input": "data"}, {"result": "value"})
        # Advance past TTL
        mock_time.advance(31)
        result = cache.get({"input": "data"})
        assert result is None

    def test_ttl_within_window_returns_value(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=30)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"input": "data"}, {"result": "value"})
        mock_time.advance(15)
        result = cache.get({"input": "data"})
        assert result == {"result": "value"}

    def test_lru_eviction_removes_oldest(self):
        cache = PredictionLRUCache(max_size=2, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"key": "a"}, {"result": "a"})
        cache.set({"key": "b"}, {"result": "b"})
        cache.set({"key": "c"}, {"result": "c"})  # Should evict "a"
        assert cache.get({"key": "a"}) is None
        assert cache.get({"key": "b"}) == {"result": "b"}
        assert cache.get({"key": "c"}) == {"result": "c"}

    def test_lru_touch_moves_to_end(self):
        cache = PredictionLRUCache(max_size=3, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"key": "a"}, {"result": "a"})
        cache.set({"key": "b"}, {"result": "b"})
        cache.set({"key": "c"}, {"result": "c"})
        # Access "a" to make it most recently used
        cache.get({"key": "a"})
        # Now "b" is oldest — should be evicted
        cache.set({"key": "d"}, {"result": "d"})
        assert cache.get({"key": "a"}) == {"result": "a"}
        assert cache.get({"key": "b"}) is None

    def test_stats_tracks_hits_and_misses(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"key": "a"}, {"result": "a"})
        cache.get({"key": "a"})  # hit
        cache.get({"key": "b"})  # miss
        cache.get({"key": "b"})  # miss
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 2
        assert stats["size"] == 1
        assert stats["max_size"] == 10

    def test_stats_hit_rate(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"key": "a"}, {"result": "a"})
        for _ in range(4):
            cache.get({"key": "a"})  # 4 hits
        for _ in range(2):
            cache.get({"key": "b"})  # 2 misses
        stats = cache.stats()
        assert stats["hits"] == 4
        assert stats["misses"] == 2
        assert stats["hit_rate"] == round(4 / 6, 3)

    def test_stats_hit_rate_zero_requests(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        stats = cache.stats()
        assert stats["hit_rate"] == 0

    def test_clear_removes_all_entries(self):
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"key": "a"}, {"result": "a"})
        cache.set({"key": "b"}, {"result": "b"})
        assert cache.get({"key": "a"}) is not None
        cache.clear()
        assert cache.get({"key": "a"}) is None
        assert cache.get({"key": "b"}) is None
        assert len(cache._cache) == 0

    def test_update_existing_key_moves_to_end(self):
        cache = PredictionLRUCache(max_size=3, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"key": "a"}, {"result": "first"})
        cache.set({"key": "b"}, {"result": "b"})
        # Update "a" — now it's most recent
        cache.set({"key": "a"}, {"result": "updated"})
        # Verify "a" has the new value
        assert cache.get({"key": "a"}) == {"result": "updated"}
        # "a" is now the most recently used (moved to end by update)
        # Add "c" — eviction fires when size > max_size; since size==3 after adding c, no eviction
        cache.set({"key": "c"}, {"result": "c"})
        assert len(cache._cache) == 3  # max_size=3, no eviction yet
        # Now add "d" — size 4 > max_size 3, so oldest (b) is evicted
        cache.set({"key": "d"}, {"result": "d"})
        assert len(cache._cache) == 3
        assert cache.get({"key": "b"}) is None  # evicted
        assert cache.get({"key": "a"}) == {"result": "updated"}
        assert cache.get({"key": "c"}) == {"result": "c"}

    def test_cache_key_is_deterministic(self):
        """Same logical input should produce the same cache result."""
        cache = PredictionLRUCache(max_size=10, ttl_seconds=60)
        mock_time = MockTime()
        cache._time = mock_time
        cache.set({"name": "Alice", "age": 30}, {"risk": "low"})
        # Different key order produces same result (json.dumps uses sort_keys=True)
        result = cache.get({"age": 30, "name": "Alice"})
        assert result == {"risk": "low"}
