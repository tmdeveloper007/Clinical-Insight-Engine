"""
Unit tests for app.ml.prediction_cache.PredictionLRUCache.

Tests cover:
- Cache miss (key not found)
- Cache hit within TTL
- TTL expiry
- LRU eviction when over max_size
- Hit/miss counters and hit_rate calculation
- Zero-division guard in stats()
- clear() behavior
"""

import sys
from collections import OrderedDict
from unittest.mock import MagicMock

import pytest

# Add app/ to sys.path for import
sys.path.insert(0, "app")

from app.ml.prediction_cache import PredictionLRUCache, get_cache


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class FakeTime:
    """Fake time module for deterministic TTL testing."""

    def __init__(self, now: float = 0.0):
        self._now = now

    def time(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


def make_cache(ttl: int = 300, max_size: int = 3, fake_time: FakeTime = None) -> PredictionLRUCache:
    """Create a PredictionLRUCache with injected fake time module."""
    cache = PredictionLRUCache(ttl_seconds=ttl, max_size=max_size)
    if fake_time is None:
        fake_time = FakeTime()
    cache._time = fake_time
    return cache


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------

def test_constructor_sets_max_size_and_ttl():
    """Constructor stores max_size and ttl_seconds correctly."""
    cache = make_cache(ttl=60, max_size=50)
    assert cache._max_size == 50
    assert cache._ttl == 60


def test_constructor_initializes_counters_to_zero():
    """Counters start at zero."""
    cache = make_cache()
    stats = cache.stats()
    assert stats["hits"] == 0
    assert stats["misses"] == 0
    assert stats["size"] == 0


# ---------------------------------------------------------------------------
# get() — cache miss
# ---------------------------------------------------------------------------

def test_get_cache_miss_increments_miss_counter():
    """A cache miss must increment the miss counter."""
    cache = make_cache()
    cache.set({"age": 45}, {"risk": "low"})
    stats_before = cache.stats()
    result = cache.get({"age": 99})  # different key -> miss
    assert result is None
    assert cache.stats()["misses"] == stats_before["misses"] + 1


def test_get_nonexistent_key_returns_none():
    """get() on a key that was never set returns None."""
    cache = make_cache()
    assert cache.get({"age": 45}) is None


# ---------------------------------------------------------------------------
# get() — cache hit
# ---------------------------------------------------------------------------

def test_get_cache_hit_returns_stored_result():
    """A cache hit within TTL returns the stored prediction."""
    cache = make_cache(ttl=300)
    cache.set({"age": 45, "bmi": 24.5}, {"risk": "low", "score": 0.2})
    result = cache.get({"age": 45, "bmi": 24.5})
    assert result == {"risk": "low", "score": 0.2}


def test_get_cache_hit_increments_hit_counter():
    """A cache hit must increment the hit counter."""
    cache = make_cache()
    cache.set({"age": 45}, {"risk": "low"})
    cache.get({"age": 45})  # hit
    assert cache.stats()["hits"] == 1


def test_get_updates_lru_order():
    """A cache hit must move the accessed entry to the most-recently-used end."""
    cache = make_cache(max_size=3)
    cache.set({"a": 1}, "r1")
    cache.set({"b": 2}, "r2")
    cache.set({"c": 3}, "r3")
    # Access 'a' to make it most-recent
    cache.get({"a": 1})
    # Now add a new entry — LRU eviction should kick out 'b', not 'a'
    cache.set({"d": 4}, "r4")
    assert cache.get({"a": 1}) == "r1"   # still there
    assert cache.get({"b": 2}) is None     # evicted (LRU)
    assert cache.get({"c": 3}) == "r3"    # still there


# ---------------------------------------------------------------------------
# get() — TTL expiry
# ---------------------------------------------------------------------------

def test_get_expired_entry_returns_none_and_counts_as_miss():
    """An expired entry is treated as a cache miss."""
    fake_time = FakeTime(now=1000.0)
    cache = make_cache(ttl=300, fake_time=fake_time)
    cache.set({"age": 45}, {"risk": "low"})

    fake_time.advance(301)  # past TTL of 300s

    result = cache.get({"age": 45})
    assert result is None
    # The miss from expired eviction counts as a miss
    assert cache.stats()["misses"] >= 1


def test_get_within_ttl_returns_value():
    """An entry accessed within TTL must return the stored value."""
    fake_time = FakeTime(now=1000.0)
    cache = make_cache(ttl=300, fake_time=fake_time)
    cache.set({"age": 45}, {"risk": "low"})

    fake_time.advance(299)  # just under TTL

    result = cache.get({"age": 45})
    assert result == {"risk": "low"}


# ---------------------------------------------------------------------------
# set() — basic
# ---------------------------------------------------------------------------

def test_set_adds_new_entry():
    """set() must store the result and increment cache size."""
    cache = make_cache()
    stats_before = cache.stats()
    cache.set({"age": 45}, {"risk": "low"})
    assert cache.get({"age": 45}) == {"risk": "low"}
    assert cache.stats()["size"] == stats_before["size"] + 1


def test_set_updates_existing_entry():
    """set() on an existing key must update the value."""
    cache = make_cache()
    cache.set({"age": 45}, {"risk": "low"})
    cache.set({"age": 45}, {"risk": "high"})
    assert cache.get({"age": 45}) == {"risk": "high"}
    assert cache.stats()["size"] == 1  # no size inflation


# ---------------------------------------------------------------------------
# set() — LRU eviction
# ---------------------------------------------------------------------------

def test_set_evicts_lru_when_over_max_size():
    """When size exceeds max_size, the oldest entry is evicted."""
    cache = make_cache(max_size=3)
    cache.set({"a": 1}, "r_a")
    cache.set({"b": 2}, "r_b")
    cache.set({"c": 3}, "r_c")

    assert cache.stats()["size"] == 3

    cache.set({"d": 4}, "r_d")  # oldest is 'a'

    assert cache.get({"a": 1}) is None  # evicted
    assert cache.get({"b": 2}) == "r_b"
    assert cache.get({"c": 3}) == "r_c"
    assert cache.get({"d": 4}) == "r_d"
    assert cache.stats()["size"] == 3  # back to max


def test_set_resets_ttl_on_update():
    """Updating an existing key must reset its TTL to the current time."""
    fake_time = FakeTime(now=1000.0)
    cache = make_cache(ttl=300, fake_time=fake_time)
    cache.set({"age": 45}, {"risk": "low"})

    fake_time.advance(200)  # 200s elapsed

    cache.set({"age": 45}, {"risk": "high"})  # refresh TTL

    fake_time.advance(250)  # another 250s elapsed — old TTL would have expired

    # New TTL started at t=1200, expires at t=1500; we are at t=1450 -> still valid
    assert cache.get({"age": 45}) == {"risk": "high"}


# ---------------------------------------------------------------------------
# stats()
# ---------------------------------------------------------------------------

def test_stats_hit_rate_calculation():
    """hit_rate must be hits / (hits + misses)."""
    cache = make_cache()
    cache.set({"a": 1}, "r1")
    cache.get({"a": 1})   # hit
    cache.get({"b": 2})    # miss
    stats = cache.stats()
    assert stats["hits"] == 1
    assert stats["misses"] == 1
    assert stats["hit_rate"] == 0.5


def test_stats_zero_division_guard():
    """stats() must not raise when no lookups have been made."""
    cache = make_cache()
    stats = cache.stats()
    assert stats["hit_rate"] == 0
    assert stats["hits"] == 0
    assert stats["misses"] == 0


def test_stats_reflects_current_size():
    """stats size must match current cache length."""
    cache = make_cache(max_size=5)
    cache.set({"a": 1}, "r1")
    cache.set({"b": 2}, "r2")
    assert cache.stats()["size"] == 2
    cache.set({"c": 3}, "r3")
    assert cache.stats()["size"] == 3


# ---------------------------------------------------------------------------
# clear()
# ---------------------------------------------------------------------------

def test_clear_removes_all_entries():
    """clear() must empty the cache."""
    cache = make_cache(max_size=5)
    cache.set({"a": 1}, "r1")
    cache.set({"b": 2}, "r2")
    assert cache.stats()["size"] == 2

    cache.clear()

    assert cache.stats()["size"] == 0
    assert cache.get({"a": 1}) is None
    assert cache.get({"b": 2}) is None


def test_clear_does_not_reset_counters():
    """clear() empties the cache but does NOT reset hit/miss counters (they persist)."""
    cache = make_cache()
    cache.set({"a": 1}, "r1")
    cache.get({"a": 1})
    cache.get({"b": 2})
    assert cache.stats()["hits"] == 1
    assert cache.stats()["misses"] == 1

    cache.clear()

    # Cache is empty after clear
    assert cache.stats()["hits"] == 1
    assert cache.stats()["misses"] == 1


# ---------------------------------------------------------------------------
# _make_key() determinism
# ---------------------------------------------------------------------------

def test_make_key_is_deterministic():
    """Same input dict must always produce the same key regardless of insertion order."""
    cache = make_cache()
    key1 = cache._make_key({"age": 45, "bmi": 24.5})
    key2 = cache._make_key({"bmi": 24.5, "age": 45})  # different insertion order
    assert key1 == key2  # JSON dumps with sort_keys=True makes it stable


def test_make_key_differs_for_different_inputs():
    """Different inputs must produce different keys."""
    cache = make_cache()
    key1 = cache._make_key({"age": 45})
    key2 = cache._make_key({"age": 46})
    assert key1 != key2


# ---------------------------------------------------------------------------
# get_cache() singleton
# ---------------------------------------------------------------------------

def test_get_cache_returns_singleton():
    """get_cache() must return the same instance on repeated calls."""
    c1 = get_cache()
    c2 = get_cache()
    assert c1 is c2
