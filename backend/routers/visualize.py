"""
GET /api/charts/{session_id}/histogram?col=price
GET /api/charts/{session_id}/category?col=brand
GET /api/charts/{session_id}/scatter?col_x=price&col_y=rating&trendline=true
GET /api/charts/{session_id}/heatmap
GET /api/charts/{session_id}/boxplot?col=price
GET /api/charts/{session_id}/boxplot_all
GET /api/charts/{session_id}/missing
GET /api/charts/{session_id}/timeseries?date_col=date&value_col=revenue
"""
from fastapi import APIRouter, HTTPException, Query
from utils.session       import get_session
from services.visualizer import (histogram, category_bar, scatter,
                                  correlation_heatmap, box_plot,
                                  multi_box_plot, missing_heatmap, line_chart)

router = APIRouter()

def _get_df(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    return session["df"]


@router.get("/charts/{session_id}/histogram")
def chart_histogram(session_id: str, col: str = Query(...), bins: int = 25):
    df = _get_df(session_id)
    if col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col}' not found.")
    return {"chart": histogram(df, col, bins)}


@router.get("/charts/{session_id}/category")
def chart_category(session_id: str, col: str = Query(...), top_n: int = 15):
    df = _get_df(session_id)
    if col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col}' not found.")
    return {"chart": category_bar(df, col, top_n)}


@router.get("/charts/{session_id}/scatter")
def chart_scatter(session_id: str,
                  col_x: str = Query(...),
                  col_y: str = Query(...),
                  trendline: bool = True):
    df = _get_df(session_id)
    for c in [col_x, col_y]:
        if c not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{c}' not found.")
    return {"chart": scatter(df, col_x, col_y, trendline)}


@router.get("/charts/{session_id}/heatmap")
def chart_heatmap(session_id: str):
    df           = _get_df(session_id)
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if len(numeric_cols) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 numeric columns for heatmap.")
    return {"chart": correlation_heatmap(df, numeric_cols)}


@router.get("/charts/{session_id}/boxplot")
def chart_boxplot(session_id: str, col: str = Query(...)):
    df = _get_df(session_id)
    if col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{col}' not found.")
    return {"chart": box_plot(df, col)}


@router.get("/charts/{session_id}/boxplot_all")
def chart_boxplot_all(session_id: str):
    df           = _get_df(session_id)
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if not numeric_cols:
        raise HTTPException(status_code=400, detail="No numeric columns found.")
    return {"chart": multi_box_plot(df, numeric_cols)}


@router.get("/charts/{session_id}/missing")
def chart_missing(session_id: str):
    df    = _get_df(session_id)
    chart = missing_heatmap(df)
    if not chart:
        return {"chart": None, "message": "No missing values — dataset is complete."}
    return {"chart": chart}


@router.get("/charts/{session_id}/timeseries")
def chart_timeseries(session_id: str,
                     date_col:  str = Query(...),
                     value_col: str = Query(...)):
    df = _get_df(session_id)
    for c in [date_col, value_col]:
        if c not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{c}' not found.")
    return {"chart": line_chart(df, date_col, value_col)}