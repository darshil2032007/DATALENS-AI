"""
POST /api/clean/{session_id}         — apply cleaning operations
GET  /api/clean/{session_id}/suggest — get auto-suggestions
POST /api/clean/{session_id}/reset   — restore original DataFrame
GET  /api/clean/{session_id}/download — download cleaned CSV
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from utils.session    import get_session, update_df
from services.cleaner import apply_operations, suggest_cleaning
from services.profiler import profile_dataframe

router = APIRouter()


class CleanRequest(BaseModel):
    operations: list[dict]


@router.get("/clean/{session_id}/suggest")
def get_suggestions(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    suggestions = suggest_cleaning(session["df"])
    return {"session_id": session_id, "suggestions": suggestions}


@router.post("/clean/{session_id}")
def apply_cleaning(session_id: str, body: CleanRequest):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df_clean, log = apply_operations(session["df"], body.operations)
    update_df(session_id, df_clean)

    profile = profile_dataframe(df_clean, session["filename"])
    new_suggestions = suggest_cleaning(df_clean)

    return {
        "session_id":          session_id,
        "log":                 log,
        "profile":             profile,
        "cleaning_suggestions": new_suggestions,
        "rows_after":          len(df_clean),
        "cols_after":          df_clean.shape[1],
    }


@router.post("/clean/{session_id}/reset")
def reset_to_original(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    original = session.get("original")
    if original is None:
        raise HTTPException(status_code=400, detail="No original backup found.")

    update_df(session_id, original.copy())
    profile = profile_dataframe(original, session["filename"])
    return {"session_id": session_id, "message": "Reset to original dataset.", "profile": profile}


@router.get("/clean/{session_id}/download")
def download_cleaned(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df  = session["df"]
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    filename = session["filename"].replace(".csv", "_cleaned.csv")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
