"""Supabase client singleton for the all-platform module."""

from __future__ import annotations

import os
import time
from typing import TYPE_CHECKING, Callable, TypeVar

from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions

if TYPE_CHECKING:
    pass

T = TypeVar("T")
_supabase_client: Client | None = None
_TRANSIENT_ERROR_MARKERS = (
    "Server disconnected",
    "ConnectionTerminated",
    "RemoteProtocolError",
    "PROTOCOL_ERROR",
    "COMPRESSION_ERROR",
    "ReadTimeout",
    "ConnectTimeout",
    "PoolTimeout",
    "timed out",
    "timeout",
    "502 Bad Gateway",
    "503 Service Unavailable",
    "504 Gateway",
    "cloudflare",
)


def reset_supabase_client() -> None:
    """Drop the cached Supabase client after a broken HTTP connection."""
    global _supabase_client
    _supabase_client = None


def is_transient_supabase_error(exc: Exception) -> bool:
    """Return True for upstream/network failures that are safe to retry."""
    msg = f"{type(exc).__name__}: {exc}"
    return any(marker in msg for marker in _TRANSIENT_ERROR_MARKERS)


def execute_supabase_query(
    operation: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 0.18,
) -> T:
    """Execute a Supabase query with retry/reset for flaky HTTP connections."""
    last_exc: Exception | None = None
    for attempt in range(max(1, attempts)):
        try:
            return operation()
        except Exception as exc:
            last_exc = exc
            if not is_transient_supabase_error(exc) or attempt >= attempts - 1:
                raise
            reset_supabase_client()
            time.sleep(base_delay * (attempt + 1))
    if last_exc:
        raise last_exc
    raise RuntimeError("Supabase operation failed without an exception")


def get_supabase_client() -> Client:
    """Return a singleton Supabase client.

    Reads ``SUPABASE_URL`` and ``SUPABASE_SERVICE_ROLE_KEY`` from environment.
    Raises ``RuntimeError`` if either is missing.
    """
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _supabase_client = create_client(
            url,
            key,
            options=SyncClientOptions(),
        )
    return _supabase_client
