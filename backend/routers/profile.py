"""
GET /api/profile/{session_id}
Returns the full pandas profile of the stored DataFrame.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from utils.session     import get_session
from services.profiler import profile_dataframe

router = APIRouter()

@router.get("/profile/{session_id}")
def get_profile(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    profile = profile_dataframe(session["df"], session["filename"])
    return {
        "session_id": session_id,
        "filename":   session["filename"],
        "cleaned":    session["cleaned"],
        "profile":    profile,
    }


@router.get("/profile/{session_id}/head")
def get_head(session_id: str, n: int = 10):
    """Return first n rows as JSON records."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df = session["df"]
    return {
        "session_id": session_id,
        "rows":       df.head(n).fillna("").to_dict(orient="records"),
        "columns":    df.columns.tolist(),
        "total_rows": len(df),
    }


@router.get("/profile/{session_id}/sample")
def get_sample(session_id: str, n: int = 5):
    """Return n random rows."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df = session["df"]
    sample = df.sample(min(n, len(df)), random_state=42)
    return {
        "session_id": session_id,
        "rows":       sample.fillna("").to_dict(orient="records"),
        "columns":    df.columns.tolist(),
    }
