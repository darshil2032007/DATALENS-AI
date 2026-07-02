"""
Profiler — generates a full pandas-accurate profile of a DataFrame.
This replaces the JS stats.js approximations with real pandas computations.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats


def profile_dataframe(df: pd.DataFrame, filename: str) -> dict:
    """
    Return a complete profile dict matching what the frontend expects.
    """
    shape        = df.shape
    mem_bytes    = df.memory_usage(deep=True).sum()
    duplicates   = int(df.duplicated().sum())
    total_cells  = shape[0] * shape[1]
    total_missing = int(df.isnull().sum().sum())

    columns_profile = [_profile_column(df, col) for col in df.columns]

    numeric_cols = [c for c in columns_profile if c["dtype_group"] == "numeric"]
    quality      = _quality_score(df, columns_profile)

    return {
        "filename":       filename,
        "rows":           shape[0],
        "columns":        shape[1],
        "memory_bytes":   int(mem_bytes),
        "memory_human":   _fmt_bytes(mem_bytes),
        "duplicates":     duplicates,
        "total_missing":  total_missing,
        "missing_pct":    round(total_missing / max(total_cells, 1) * 100, 2),
        "quality_score":  quality,
        "numeric_count":  len(numeric_cols),
        "categorical_count": sum(1 for c in columns_profile if c["dtype_group"] == "categorical"),
        "datetime_count": sum(1 for c in columns_profile if c["dtype_group"] == "datetime"),
        "columns_profile": columns_profile,
    }


def _profile_column(df: pd.DataFrame, col: str) -> dict:
    series      = df[col]
    dtype       = str(series.dtype)
    dtype_group = _dtype_group(series)
    total       = len(series)
    missing     = int(series.isnull().sum())
    unique      = int(series.nunique(dropna=True))
    missing_pct = round(missing / max(total, 1) * 100, 2)

    base = {
        "name":        col,
        "dtype":       dtype,
        "dtype_group": dtype_group,
        "total":       total,
        "missing":     missing,
        "missing_pct": missing_pct,
        "unique":      unique,
        "unique_pct":  round(unique / max(total - missing, 1) * 100, 2),
    }

    if dtype_group == "numeric":
        nums = series.dropna()
        q1, q3 = float(nums.quantile(0.25)), float(nums.quantile(0.75))
        iqr    = q3 - q1
        lower  = q1 - 1.5 * iqr
        upper  = q3 + 1.5 * iqr
        outliers = int(((nums < lower) | (nums > upper)).sum())

        # Skewness interpretation
        skew_val = float(nums.skew()) if len(nums) > 2 else 0.0
        if abs(skew_val) < 0.5:
            skew_label = "normal"
        elif abs(skew_val) < 1.0:
            skew_label = "slightly skewed"
        else:
            skew_label = "right skewed" if skew_val > 0 else "left skewed"

        base.update({
            "mean":      _fmt(nums.mean()),
            "median":    _fmt(nums.median()),
            "std":       _fmt(nums.std()),
            "min":       _fmt(float(nums.min())),
            "max":       _fmt(float(nums.max())),
            "q1":        _fmt(q1),
            "q3":        _fmt(q3),
            "iqr":       _fmt(iqr),
            "skewness":  round(skew_val, 4),
            "skew_label": skew_label,
            "kurtosis":  round(float(nums.kurtosis()), 4) if len(nums) > 3 else None,
            "outliers":  outliers,
            "outlier_pct": round(outliers / max(len(nums), 1) * 100, 2),
            "zeros":     int((nums == 0).sum()),
            "negative":  int((nums < 0).sum()),
        })

    elif dtype_group == "categorical":
        vc = series.value_counts(dropna=True)
        top_values = [
            {"value": str(k), "count": int(v), "pct": round(int(v) / max(total - missing, 1) * 100, 2)}
            for k, v in vc.head(10).items()
        ]
        base.update({
            "top_values":    top_values,
            "top_value":     str(vc.index[0]) if len(vc) else None,
            "top_value_pct": round(int(vc.iloc[0]) / max(total - missing, 1) * 100, 2) if len(vc) else 0,
            "cardinality":   "high" if unique > 50 else "medium" if unique > 10 else "low",
        })

    elif dtype_group == "datetime":
        dt = pd.to_datetime(series, errors="coerce").dropna()
        base.update({
            "min_date": str(dt.min()) if len(dt) else None,
            "max_date": str(dt.max()) if len(dt) else None,
            "range_days": (dt.max() - dt.min()).days if len(dt) > 1 else 0,
        })

    return base


def _dtype_group(series: pd.Series) -> str:
    dtype = series.dtype
    if pd.api.types.is_numeric_dtype(dtype):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return "datetime"
    # Try to parse as datetime
    if series.dtype == object:
        sample = series.dropna().head(20)
        try:
            parsed = pd.to_datetime(sample, errors="coerce")
            if parsed.notna().sum() / max(len(sample), 1) > 0.7:
                return "datetime"
        except Exception:
            pass
    return "categorical"


def _quality_score(df: pd.DataFrame, columns_profile: list) -> int:
    score = 100
    total_cells = df.shape[0] * df.shape[1] or 1

    # Missing penalty: up to -40
    missing_pct = df.isnull().sum().sum() / total_cells
    score -= missing_pct * 40

    # Duplicates penalty: up to -15
    dup_pct = df.duplicated().sum() / max(df.shape[0], 1)
    score -= dup_pct * 15

    # Outlier columns penalty: up to -15
    numeric_cols = [c for c in columns_profile if c["dtype_group"] == "numeric"]
    if numeric_cols:
        outlier_cols = sum(1 for c in numeric_cols if c.get("outlier_pct", 0) > 5)
        score -= (outlier_cols / len(numeric_cols)) * 15

    return max(0, min(100, round(score)))


def _fmt(v) -> float | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), 4)


def _fmt_bytes(b: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} GB"
