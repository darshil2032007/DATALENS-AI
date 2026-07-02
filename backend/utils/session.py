"""
Session store — keeps uploaded DataFrames in memory keyed by session_id.
Render free tier restarts periodically so sessions are ephemeral by design.
"""
from __future__ import annotations

import uuid
import time
import threading
from typing import Optional
import pandas as pd

# ── Config ─────────────────────────────────────────────────────────────────────
SESSION_TTL = 3600   # seconds (1 hour)

# ── Store ──────────────────────────────────────────────────────────────────────
# { session_id: { "df": DataFrame, "filename": str, "created": float, "cleaned": bool } }
_store: dict = {}
_lock  = threading.Lock()

# ── Public API ─────────────────────────────────────────────────────────────────

def create_session(df: pd.DataFrame, filename: str) -> str:
    """Store a DataFrame and return a new session_id."""
    session_id = str(uuid.uuid4())
    with _lock:
        _store[session_id] = {
            "df":       df,
            "original": df.copy(),   # keep original for reset
            "filename": filename,
            "created":  time.time(),
            "cleaned":  False,
        }
    return session_id


def get_session(session_id: str) -> Optional[dict]:
    """Return session dict or None if expired / not found."""
    with _lock:
        session = _store.get(session_id)
        if session is None:
            return None
        if time.time() - session["created"] > SESSION_TTL:
            del _store[session_id]
            return None
        return session


def get_df(session_id: str) -> Optional[pd.DataFrame]:
    """Shortcut — return just the DataFrame."""
    s = get_session(session_id)
    return s["df"] if s else None


def update_df(session_id: str, df: pd.DataFrame) -> bool:
    """Replace the DataFrame in an existing session."""
    with _lock:
        if session_id not in _store:
            return False
        _store[session_id]["df"]      = df
        _store[session_id]["cleaned"] = True
        return True


def delete_session(session_id: str) -> None:
    with _lock:
        _store.pop(session_id, None)


def list_sessions() -> list:
    """Debug endpoint — returns all active session IDs."""
    with _lock:
        return list(_store.keys())


# ── Background cleanup ─────────────────────────────────────────────────────────
def _cleanup_loop():
    while True:
        time.sleep(600)   # check every 10 minutes
        now = time.time()
        with _lock:
            expired = [k for k, v in _store.items() if now - v["created"] > SESSION_TTL]
            for k in expired:
                del _store[k]

_cleanup_thread = threading.Thread(target=_cleanup_loop, daemon=True)
_cleanup_thread.start()
