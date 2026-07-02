"""
GET  /api/ml/{session_id}/recommend               — fast recommendations (no training)
POST /api/ml/{session_id}/train                   — real sklearn training
GET  /api/ml/{session_id}/detect_task?target=col  — detect task type for a target column
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from utils.session      import get_session
from services.ml_engine import recommend, train_models, detect_task

router = APIRouter()


class TrainRequest(BaseModel):
    target_column:  str
    feature_columns: list[str] | None = None   # None = use all except target
    test_size:      float = 0.2


@router.get("/ml/{session_id}/recommend")
def ml_recommend(session_id: str, target: str | None = Query(default=None)):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    result = recommend(session["df"], target_col=target)
    return {"session_id": session_id, **result}


@router.get("/ml/{session_id}/detect_task")
def ml_detect_task(session_id: str, target: str = Query(...)):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    df = session["df"]
    if target not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{target}' not found.")
    result = detect_task(df, target)
    return {"session_id": session_id, "target": target, **result}


@router.post("/ml/{session_id}/train")
def ml_train(session_id: str, body: TrainRequest):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    df = session["df"]

    if body.target_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Target '{body.target_column}' not found.")

    # Default features = all columns except target
    feature_cols = body.feature_columns
    if not feature_cols:
        feature_cols = [c for c in df.columns if c != body.target_column]

    # Validate all feature cols exist
    missing_cols = [c for c in feature_cols if c not in df.columns]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Columns not found: {missing_cols}")

    # Only keep numeric features for now (categorical will be auto-encoded inside ml_engine)
    result = train_models(
        df=df,
        target_col=body.target_column,
        feature_cols=feature_cols,
        test_size=body.test_size,
    )
    return {"session_id": session_id, **result}
