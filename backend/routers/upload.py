"""
POST /api/upload
Accepts a file, parses it into a DataFrame, creates a session, returns session_id + basic profile.
"""
from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, HTTPException
from utils.file_handler import parse_upload
from utils.session      import create_session
from services.profiler  import profile_dataframe
from services.cleaner   import suggest_cleaning

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a CSV / Excel / JSON file.
    Returns session_id + full profile + cleaning suggestions.
    """
    df, filename = await parse_upload(file)
    session_id   = create_session(df, filename)
    profile      = profile_dataframe(df, filename)
    suggestions  = suggest_cleaning(df)

    return {
        "session_id":          session_id,
        "profile":             profile,
        "cleaning_suggestions": suggestions,
    }
