"""
Cleaner — applies cleaning operations to a DataFrame.
Each operation is a dict with a "type" key.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from fastapi import HTTPException


def apply_operations(df: pd.DataFrame, operations: list[dict]) -> tuple[pd.DataFrame, list[str]]:
    """
    Apply a list of cleaning operations to a DataFrame.
    Returns (cleaned_df, log_of_changes).
    """
    df    = df.copy()
    log   = []

    for op in operations:
        op_type = op.get("type", "")
        try:
            df, msg = _apply_one(df, op_type, op)
            log.append(f"✓ {msg}")
        except Exception as e:
            log.append(f"✗ {op_type}: {str(e)}")

    return df, log


def _apply_one(df: pd.DataFrame, op_type: str, op: dict) -> tuple[pd.DataFrame, str]:

    # ── Drop duplicates ───────────────────────────────────────────────────────
    if op_type == "drop_duplicates":
        before = len(df)
        df = df.drop_duplicates()
        removed = before - len(df)
        return df, f"Dropped {removed} duplicate rows ({before} → {len(df)})"

    # ── Fill missing — single column ──────────────────────────────────────────
    if op_type == "fill_missing":
        col    = _require(op, "column", df)
        method = op.get("method", "median")
        series = df[col]
        before = series.isnull().sum()

        if method == "mean":
            fill_val = series.mean()
        elif method == "median":
            fill_val = series.median()
        elif method == "mode":
            fill_val = series.mode().iloc[0] if not series.mode().empty else None
        elif method == "ffill":
            df[col] = series.ffill()
            return df, f"Forward-filled {before} missing values in '{col}'"
        elif method == "bfill":
            df[col] = series.bfill()
            return df, f"Backward-filled {before} missing values in '{col}'"
        elif method == "zero":
            fill_val = 0
        elif method == "custom":
            fill_val = op.get("value")
            if fill_val is None:
                raise ValueError("custom fill requires a 'value' field")
        elif method == "drop_rows":
            before_rows = len(df)
            df = df.dropna(subset=[col])
            removed = before_rows - len(df)
            return df, f"Dropped {removed} rows with missing '{col}'"
        else:
            raise ValueError(f"Unknown fill method '{method}'")

        df[col] = series.fillna(fill_val)
        filled  = before - df[col].isnull().sum()
        return df, f"Filled {filled} missing values in '{col}' with {method} ({fill_val:.4g})" \
                   if isinstance(fill_val, float) else \
               f"Filled {filled} missing values in '{col}' with {method} ('{fill_val}')"

    # ── Fill all missing numeric columns ──────────────────────────────────────
    if op_type == "fill_all_numeric":
        method  = op.get("method", "median")
        changed = 0
        for col in df.select_dtypes(include="number").columns:
            before = df[col].isnull().sum()
            if before == 0:
                continue
            if method == "mean":
                df[col] = df[col].fillna(df[col].mean())
            else:
                df[col] = df[col].fillna(df[col].median())
            changed += before - df[col].isnull().sum()
        return df, f"Filled {changed} missing numeric values using {method}"

    # ── Drop column ───────────────────────────────────────────────────────────
    if op_type == "drop_column":
        col = _require(op, "column", df)
        df  = df.drop(columns=[col])
        return df, f"Dropped column '{col}'"

    # ── Drop columns with high missing % ─────────────────────────────────────
    if op_type == "drop_high_missing":
        threshold = op.get("threshold", 50)     # %
        before    = df.shape[1]
        missing_pct = (df.isnull().sum() / len(df) * 100)
        to_drop   = missing_pct[missing_pct > threshold].index.tolist()
        df        = df.drop(columns=to_drop)
        return df, f"Dropped {len(to_drop)} columns with >{threshold}% missing: {to_drop}"

    # ── Remove outliers (IQR) ─────────────────────────────────────────────────
    if op_type == "remove_outliers":
        col    = _require(op, "column", df)
        method = op.get("method", "iqr")
        before = len(df)

        if method == "iqr":
            q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
            iqr    = q3 - q1
            df     = df[(df[col] >= q1 - 1.5 * iqr) & (df[col] <= q3 + 1.5 * iqr)]
        elif method == "zscore":
            z = np.abs((df[col] - df[col].mean()) / df[col].std())
            df = df[z <= 3]

        removed = before - len(df)
        return df, f"Removed {removed} outlier rows from '{col}' using {method}"

    # ── Convert dtype ─────────────────────────────────────────────────────────
    if op_type == "convert_dtype":
        col      = _require(op, "column", df)
        target   = op.get("target_dtype", "numeric")
        if target == "numeric":
            df[col] = pd.to_numeric(df[col], errors="coerce")
        elif target == "datetime":
            df[col] = pd.to_datetime(df[col], errors="coerce")
        elif target == "string":
            df[col] = df[col].astype(str)
        elif target == "category":
            df[col] = df[col].astype("category")
        return df, f"Converted '{col}' to {target}"

    # ── Rename column ─────────────────────────────────────────────────────────
    if op_type == "rename_column":
        col     = _require(op, "column", df)
        new_name = op.get("new_name")
        if not new_name:
            raise ValueError("rename_column requires 'new_name'")
        df = df.rename(columns={col: new_name})
        return df, f"Renamed '{col}' → '{new_name}'"

    # ── String clean ──────────────────────────────────────────────────────────
    if op_type == "string_clean":
        col = _require(op, "column", df)
        if df[col].dtype == object:
            df[col] = df[col].str.strip().str.lower()
        return df, f"Cleaned string values in '{col}' (stripped, lowercased)"

    # ── Reset index ───────────────────────────────────────────────────────────
    if op_type == "reset_index":
        df = df.reset_index(drop=True)
        return df, "Reset DataFrame index"

    raise HTTPException(status_code=400, detail=f"Unknown operation type: '{op_type}'")


def suggest_cleaning(df: pd.DataFrame) -> list[dict]:
    """
    Automatically suggest cleaning operations based on the DataFrame.
    Returns a list of suggestion dicts the frontend can display as checkboxes.
    """
    suggestions = []

    # Duplicates
    dups = int(df.duplicated().sum())
    if dups > 0:
        suggestions.append({
            "type":        "drop_duplicates",
            "severity":    "warning" if dups < len(df) * 0.05 else "error",
            "title":       f"{dups} duplicate rows detected",
            "description": f"Exactly identical rows: {dups} ({dups/len(df)*100:.1f}%)",
            "operation":   {"type": "drop_duplicates"},
            "auto_apply":  dups > 0,
        })

    # Missing values per column
    for col in df.columns:
        missing = int(df[col].isnull().sum())
        if missing == 0:
            continue
        pct = missing / len(df) * 100
        is_numeric = pd.api.types.is_numeric_dtype(df[col])

        # Suggest method based on type + skewness
        if is_numeric:
            skew = abs(df[col].skew()) if df[col].notna().sum() > 2 else 0
            method = "median" if skew > 0.5 else "mean"
        else:
            method = "mode"

        suggestions.append({
            "type":        "fill_missing",
            "severity":    "error" if pct > 20 else "warning",
            "title":       f"'{col}': {missing} missing values ({pct:.1f}%)",
            "description": f"Suggested fix: fill with {method}",
            "operation":   {"type": "fill_missing", "column": col, "method": method},
            "auto_apply":  pct < 30,
        })

    # High missing columns → suggest dropping
    for col in df.columns:
        pct = df[col].isnull().sum() / len(df) * 100
        if pct > 60:
            suggestions.append({
                "type":        "drop_column",
                "severity":    "error",
                "title":       f"'{col}' is {pct:.0f}% empty — consider dropping",
                "description": "More than 60% missing. Dropping may improve model quality.",
                "operation":   {"type": "drop_column", "column": col},
                "auto_apply":  False,
            })

    # Outlier columns
    for col in df.select_dtypes(include="number").columns:
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr    = q3 - q1
        if iqr == 0:
            continue
        outliers = int(((df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)).sum())
        pct      = outliers / len(df) * 100
        if outliers > 0 and pct > 2:
            suggestions.append({
                "type":        "remove_outliers",
                "severity":    "warning",
                "title":       f"'{col}': {outliers} outliers ({pct:.1f}%)",
                "description": "IQR-based outlier detection. Removing may improve model accuracy.",
                "operation":   {"type": "remove_outliers", "column": col, "method": "iqr"},
                "auto_apply":  False,
            })

    return suggestions


def _require(op: dict, key: str, df: pd.DataFrame) -> str:
    val = op.get(key)
    if not val:
        raise ValueError(f"Operation requires '{key}' field")
    if key == "column" and val not in df.columns:
        raise ValueError(f"Column '{val}' not found in dataset")
    return val
