"""
core/rate_limiter.py
────────────────────
Shared SlowAPI limiter.

Security (AP-SEC-009):
  - Uses a Redis storage backend when REDIS_URL is configured so limits are
    shared across all app instances and survive restarts. Falls back to
    in-memory only for local/single-process development.
  - Keys on the real client IP resolved from the X-Forwarded-For header (the
    backend always runs behind an ALB/Nginx), falling back to the socket peer.
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _real_client_ip(request: Request) -> str:
    """Resolve the originating client IP behind a trusted reverse proxy.

    ALB/Nginx append the client to X-Forwarded-For; the left-most entry is the
    original caller. Falls back to the socket peer when the header is absent.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return get_remote_address(request)


_redis_url = os.getenv("REDIS_URL")

if _redis_url:
    limiter = Limiter(key_func=_real_client_ip, storage_uri=_redis_url)
else:
    # In-memory fallback (single process only). A warning-level note: in a
    # multi-instance deployment REDIS_URL MUST be set for limits to be effective.
    limiter = Limiter(key_func=_real_client_ip)
