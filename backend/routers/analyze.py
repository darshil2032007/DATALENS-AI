"""
GET /api/analyze/{session_id}             — full analysis (correlation + distributions + outliers)
GET /api/analyze/{session_id}/correlation — correlation matrix only
GET /api/analyze/{session_id}/outliers    — outlier report only
GET /api/analyze/{session_id}/skewness   — skewness report only
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from utils.session      import get_session
from services.analyzer  import (full_analysis, correlation_matrix,
                                 outlier_report, skewness_report,
                                 distribution_analysis, categorical_analysis)

router = APIRouter()


@router.get("/analyze/{session_id}")
def analyze(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df     = session["df"]
    result = full_analysis(df)
    return {"session_id": session_id, "filename": session["filename"], **result}


@router.get("/analyze/{session_id}/correlation")
def get_correlation(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df           = session["df"]
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    result       = correlation_matrix(df, numeric_cols)
    return {"session_id": session_id, "correlation": result}


@router.get("/analyze/{session_id}/outliers")
def get_outliers(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df           = session["df"]
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    result       = outlier_report(df, numeric_cols)
    return {"session_id": session_id, "outliers": result}


@router.get("/analyze/{session_id}/skewness")
def get_skewness(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df           = session["df"]
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    result       = skewness_report(df, numeric_cols)
    return {"session_id": session_id, "skewness": result}


@router.get("/analyze/{session_id}/distributions")
def get_distributions(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df           = session["df"]
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    result       = distribution_analysis(df, numeric_cols)
    return {"session_id": session_id, "distributions": result}
