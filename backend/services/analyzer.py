"""
Analyzer — deep statistical analysis using pandas + scipy.
Correlation matrices, distribution analysis, cross-tabulation.
"""
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats


def full_analysis(df: pd.DataFrame) -> dict:
    numeric_cols     = df.select_dtypes(include="number").columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    return {
        "correlation":       correlation_matrix(df, numeric_cols),
        "distributions":     distribution_analysis(df, numeric_cols),
        "categorical_summary": categorical_analysis(df, categorical_cols),
        "outlier_report":    outlier_report(df, numeric_cols),
        "skewness_report":   skewness_report(df, numeric_cols),
    }


# ── Correlation ────────────────────────────────────────────────────────────────

def correlation_matrix(df: pd.DataFrame, numeric_cols: list) -> dict:
    if len(numeric_cols) < 2:
        return {"columns": [], "matrix": [], "strong_pairs": []}

    sub  = df[numeric_cols].dropna()
    corr = sub.corr(method="pearson").round(4)

    # Find strong correlations (|r| > 0.7, excluding diagonal)
    strong_pairs = []
    cols = corr.columns.tolist()
    for i, c1 in enumerate(cols):
        for j, c2 in enumerate(cols):
            if i >= j:
                continue
            r = corr.loc[c1, c2]
            if abs(r) >= 0.7:
                strong_pairs.append({
                    "col_a": c1,
                    "col_b": c2,
                    "r":     round(float(r), 4),
                    "label": "strong positive" if r > 0 else "strong negative",
                })

    return {
        "columns":      cols,
        "matrix":       corr.values.tolist(),
        "strong_pairs": sorted(strong_pairs, key=lambda x: abs(x["r"]), reverse=True),
    }


# ── Distribution ───────────────────────────────────────────────────────────────

def distribution_analysis(df: pd.DataFrame, numeric_cols: list) -> list:
    result = []
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 4:
            continue

        skew = float(series.skew())
        kurt = float(series.kurtosis())

        # Normality test (Shapiro-Wilk for small, D'Agostino for large)
        try:
            if len(series) <= 5000:
                stat, p = scipy_stats.shapiro(series.sample(min(len(series), 5000), random_state=42))
            else:
                stat, p = scipy_stats.normaltest(series)
            is_normal = bool(p > 0.05)
        except Exception:
            is_normal = False
            p = None

        result.append({
            "column":     col,
            "skewness":   round(skew, 4),
            "kurtosis":   round(kurt, 4),
            "is_normal":  is_normal,
            "normality_p": round(float(p), 6) if p is not None else None,
            "shape":      _shape_label(skew, kurt),
            "histogram":  _histogram(series),
        })
    return result


def _histogram(series: pd.Series, bins: int = 20) -> dict:
    counts, edges = np.histogram(series, bins=bins)
    labels = [f"{edges[i]:.2g}–{edges[i+1]:.2g}" for i in range(len(edges) - 1)]
    return {"labels": labels, "counts": counts.tolist()}


def _shape_label(skew: float, kurt: float) -> str:
    if abs(skew) < 0.5:
        return "normal"
    if skew > 1.0:
        return "right skewed"
    if skew < -1.0:
        return "left skewed"
    if kurt > 1.0:
        return "heavy-tailed"
    return "slightly skewed"


# ── Categorical ────────────────────────────────────────────────────────────────

def categorical_analysis(df: pd.DataFrame, categorical_cols: list) -> list:
    result = []
    for col in categorical_cols:
        vc  = df[col].value_counts(dropna=True)
        top = vc.head(15)
        result.append({
            "column":     col,
            "unique":     int(df[col].nunique()),
            "top_values": [{"label": str(k), "count": int(v)} for k, v in top.items()],
            "entropy":    round(float(scipy_stats.entropy(vc.values)), 4) if len(vc) > 0 else 0,
        })
    return result


# ── Outliers ───────────────────────────────────────────────────────────────────

def outlier_report(df: pd.DataFrame, numeric_cols: list) -> list:
    result = []
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 4:
            continue
        q1, q3 = float(series.quantile(0.25)), float(series.quantile(0.75))
        iqr    = q3 - q1
        if iqr == 0:
            continue
        lower  = q1 - 1.5 * iqr
        upper  = q3 + 1.5 * iqr
        mask   = (series < lower) | (series > upper)
        out_vals = series[mask]

        result.append({
            "column":      col,
            "count":       int(mask.sum()),
            "pct":         round(float(mask.sum()) / len(series) * 100, 2),
            "lower_fence": round(lower, 4),
            "upper_fence": round(upper, 4),
            "min_outlier": round(float(out_vals.min()), 4) if len(out_vals) else None,
            "max_outlier": round(float(out_vals.max()), 4) if len(out_vals) else None,
        })
    return sorted(result, key=lambda x: x["pct"], reverse=True)


# ── Skewness ───────────────────────────────────────────────────────────────────

def skewness_report(df: pd.DataFrame, numeric_cols: list) -> list:
    result = []
    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 3:
            continue
        skew = float(series.skew())
        result.append({
            "column":  col,
            "skewness": round(skew, 4),
            "label":    _shape_label(skew, 0),
            "action":   "Apply log transform" if skew > 1 else
                        "Apply sqrt transform" if skew > 0.5 else
                        "No transform needed",
        })
    return sorted(result, key=lambda x: abs(x["skewness"]), reverse=True)
