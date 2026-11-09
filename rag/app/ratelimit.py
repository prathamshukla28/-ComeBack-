"""Per-user request throttle.

Every authenticated request costs real money (a Gemini embedding, usually a
generation too, on the service's key), so one session must not be able to run the
bill up or starve everyone else.

SCOPE — read before scaling out. The default backend is a sliding window per
subject kept in PROCESS MEMORY. It is dependency-free and exact for a single
worker, but:
  * with N uvicorn/gunicorn workers each keeps its own counts, so the effective
    ceiling is `limit x N`;
  * with several replicas (containers, autoscaling) it is per replica;
  * counts reset on restart/deploy.
Run one worker per replica, or plug in a shared backend: anything implementing the
`Limiter` protocol below (e.g. a Redis sorted-set or `INCR`+`EXPIRE` window) can be
installed at startup with `set_limiter(...)` without touching the routes.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Protocol

from fastapi import Depends, HTTPException

from .config import get_settings
from .security import UserToken, require_user

# Above this many tracked subjects, expired windows are swept so memory stays bounded.
_PRUNE_AT = 10_000


class Limiter(Protocol):
    """A rate-limit backend. `check` records one hit for `key` and returns
    (allowed, seconds until the caller may retry)."""

    def check(self, key: str, now: float | None = None) -> tuple[bool, float]: ...


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str, now: float | None = None) -> tuple[bool, float]:
        """Record one hit for `key`. Returns (allowed, seconds until a slot frees).

        `limit <= 0` disables throttling. `now` is injectable so the policy is
        unit-testable without sleeping.
        """
        if self.limit <= 0:
            return True, 0.0
        now = time.monotonic() if now is None else now
        cutoff = now - self.window_s

        if len(self._hits) > _PRUNE_AT:
            self._prune(cutoff)

        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            return False, max(0.0, hits[0] + self.window_s - now)
        hits.append(now)
        return True, 0.0

    def _prune(self, cutoff: float) -> None:
        for key, hits in list(self._hits.items()):
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if not hits:
                del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()


_limiter: Limiter | None = None


def get_limiter() -> Limiter:
    """The installed backend; defaults to the in-process sliding window."""
    global _limiter
    if _limiter is None:
        _limiter = SlidingWindowLimiter(get_settings().rate_limit_per_minute, 60.0)
    return _limiter


def set_limiter(limiter: Limiter | None) -> None:
    """Install a backend (e.g. a shared Redis limiter at startup). None = default."""
    global _limiter
    _limiter = limiter


async def rate_limited(user: UserToken = Depends(require_user)) -> UserToken:
    """Dependency: `require_user`, then take one slot from the caller's window.

    Verification runs first, so an anonymous flood is rejected without being
    counted against anyone; a 429 here has spent nothing on Gemini.
    """
    key = user.subject or user.raw
    allowed, retry_after = get_limiter().check(key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests — slow down",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )
    return user
