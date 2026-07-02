"""
ML Engine — trains real sklearn models and returns accurate metrics.
Supports: classification, regression, clustering.
"""
from __future__ import annotations

import time
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import io, base64

from sklearn.model_selection   import train_test_split, cross_val_score
from sklearn.preprocessing     import LabelEncoder, StandardScaler
from sklearn.impute             import SimpleImputer
from sklearn.pipeline           import Pipeline

# Classifiers
from sklearn.linear_model      import LogisticRegression, Ridge, Lasso
from sklearn.ensemble          import (RandomForestClassifier, RandomForestRegressor,
                                       GradientBoostingClassifier, GradientBoostingRegressor)
from sklearn.tree              import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.neighbors         import KNeighborsClassifier, KNeighborsRegressor
from sklearn.svm               import SVC, SVR
from sklearn.linear_model      import LinearRegression
from sklearn.cluster           import KMeans, DBSCAN
from sklearn.metrics           import (accuracy_score, precision_score, recall_score,
                                       f1_score, r2_score, mean_squared_error,
                                       mean_absolute_error, confusion_matrix,
                                       classification_report)

BG = "#FDFCFB"
TEXT = "#111827"
ACCENT = "#F9C79A"
RED = "#EF4444"


# ── Task detection ─────────────────────────────────────────────────────────────

def detect_task(df: pd.DataFrame, target_col: str) -> dict:
    """Analyse target column and return task type + reasoning."""
    series  = df[target_col].dropna()
    n_unique = series.nunique()
    is_num   = pd.api.types.is_numeric_dtype(series)

    if not is_num or n_unique <= 20:
        task = "binary_classification" if n_unique == 2 else "multiclass_classification"
        reasoning = (f"Target '{target_col}' has {n_unique} unique values "
                     f"({'binary' if n_unique == 2 else 'multi-class'} classification)")
    else:
        task = "regression"
        reasoning = (f"Target '{target_col}' is numeric with {n_unique} unique values → regression")

    return {
        "task":      task,
        "reasoning": reasoning,
        "n_classes": int(n_unique) if task != "regression" else None,
        "classes":   [str(c) for c in sorted(series.unique())] if n_unique <= 20 else [],
    }


# ── Recommend (no training — fast, based on data characteristics) ──────────────

def recommend(df: pd.DataFrame, target_col: str | None = None) -> dict:
    numeric_cols     = df.select_dtypes(include="number").columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    n_rows, n_cols   = df.shape
    missing_pct      = df.isnull().sum().sum() / max(n_rows * n_cols, 1) * 100

    # Remove target from features list
    if target_col and target_col in numeric_cols:
        numeric_cols = [c for c in numeric_cols if c != target_col]
    if target_col and target_col in categorical_cols:
        categorical_cols = [c for c in categorical_cols if c != target_col]

    # Task detection
    if target_col and target_col in df.columns:
        task_info = detect_task(df, target_col)
        task      = task_info["task"]
    else:
        task      = "clustering"
        task_info = {"task": "clustering", "reasoning": "No target column specified → unsupervised clustering", "n_classes": None, "classes": []}

    # Readiness score
    readiness = max(0, min(100, round(100 - missing_pct * 0.5 - (5 if len(numeric_cols) == 0 else 0))))

    # Model suggestions
    models = _model_suggestions(task, n_rows, n_cols, len(numeric_cols), len(categorical_cols))

    return {
        "task":                  task,
        "task_info":             task_info,
        "target_column":         target_col,
        "feature_count":         len(numeric_cols) + len(categorical_cols),
        "numeric_features":      numeric_cols,
        "categorical_features":  categorical_cols,
        "readiness":             readiness,
        "missing_pct":           round(missing_pct, 2),
        "models":                models,
        "preprocessing_steps":   _preprocessing_steps(df, numeric_cols, categorical_cols),
    }


def _model_suggestions(task: str, n_rows: int, n_cols: int,
                        n_num: int, n_cat: int) -> list:
    base = {
        "binary_classification": [
            {"name": "Random Forest",      "score": 88, "desc": "Robust ensemble — great all-rounder for tabular data.",          "complexity": "medium"},
            {"name": "Gradient Boosting",  "score": 91, "desc": "Usually best accuracy on tabular data. Slower to train.",        "complexity": "medium"},
            {"name": "Logistic Regression","score": 75, "desc": "Fast, interpretable baseline. Works well with scaled features.", "complexity": "low"},
            {"name": "SVM (RBF)",          "score": 79, "desc": "Strong for smaller datasets with clear margins.",                "complexity": "medium"},
            {"name": "KNN",                "score": 68, "desc": "Simple but slow at scale. Good quick baseline.",                 "complexity": "low"},
        ],
        "multiclass_classification": [
            {"name": "Random Forest",      "score": 87, "desc": "Handles multi-class natively, robust to noise.",                 "complexity": "medium"},
            {"name": "Gradient Boosting",  "score": 89, "desc": "Top performer; use softmax objective.",                          "complexity": "medium"},
            {"name": "Logistic Regression","score": 72, "desc": "Multi-class via one-vs-rest. Fast and interpretable.",           "complexity": "low"},
            {"name": "Decision Tree",      "score": 70, "desc": "Fully interpretable but prone to overfitting.",                  "complexity": "low"},
        ],
        "regression": [
            {"name": "Random Forest",      "score": 87, "desc": "Non-linear, handles outliers well.",                             "complexity": "medium"},
            {"name": "Gradient Boosting",  "score": 90, "desc": "Best accuracy on most regression tasks.",                        "complexity": "medium"},
            {"name": "Linear Regression",  "score": 72, "desc": "Interpretable baseline. Assumes linear relationships.",          "complexity": "low"},
            {"name": "Ridge Regression",   "score": 74, "desc": "Linear + L2 regularisation. Good when features correlate.",      "complexity": "low"},
            {"name": "SVR",                "score": 76, "desc": "Strong for non-linear patterns in small datasets.",              "complexity": "medium"},
        ],
        "clustering": [
            {"name": "K-Means",            "score": 80, "desc": "Fast, scalable. Assumes spherical clusters.",                    "complexity": "low"},
            {"name": "DBSCAN",             "score": 83, "desc": "Finds arbitrary shapes, handles outliers as noise.",             "complexity": "low"},
            {"name": "Hierarchical",       "score": 75, "desc": "Produces dendrogram — good for exploration.",                    "complexity": "medium"},
        ],
    }
    suggestions = base.get(task, base["regression"])

    # Adjust scores by data size
    for m in suggestions:
        if n_rows > 10_000 and m["name"] in ("KNN", "SVM (RBF)", "SVR"):
            m["score"] = max(50, m["score"] - 10)
            m["desc"] += " ⚠ Slow on large datasets."
        if n_rows < 200 and m["name"] == "Gradient Boosting":
            m["score"] = max(60, m["score"] - 8)
            m["desc"] += " ⚠ May overfit on small datasets."

    return sorted(suggestions, key=lambda x: x["score"], reverse=True)


def _preprocessing_steps(df: pd.DataFrame, numeric_cols: list, categorical_cols: list) -> list:
    steps = []
    missing = df.isnull().sum().sum()
    if missing > 0:
        steps.append({"step": "Handle missing values", "detail": f"{missing} missing cells detected — impute or drop"})
    if categorical_cols:
        steps.append({"step": "Encode categoricals", "detail": f"{len(categorical_cols)} categorical columns → Label/One-Hot encoding"})
    if numeric_cols:
        steps.append({"step": "Scale numeric features", "detail": "StandardScaler or MinMaxScaler recommended"})
    steps.append({"step": "Train/test split", "detail": "80/20 or 70/30 — stratify for classification"})
    return steps


# ── Train (real sklearn) ───────────────────────────────────────────────────────

def train_models(df: pd.DataFrame, target_col: str, feature_cols: list,
                 test_size: float = 0.2, random_state: int = 42) -> dict:
    """
    Train multiple models and return real accuracy metrics + feature importance.
    """
    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' not found")

    task_info = detect_task(df, target_col)
    task      = task_info["task"]

    # ── Prepare data ──────────────────────────────────────────────────────────
    sub = df[feature_cols + [target_col]].copy()
    sub = sub.dropna(subset=[target_col])

    # Encode categoricals in features
    for col in feature_cols:
        if sub[col].dtype == object or str(sub[col].dtype) == "category":
            le = LabelEncoder()
            sub[col] = le.fit_transform(sub[col].astype(str))

    # Encode target if classification
    le_target = None
    y = sub[target_col]
    if task != "regression" and y.dtype == object:
        le_target = LabelEncoder()
        y = pd.Series(le_target.fit_transform(y.astype(str)), index=y.index)

    X = sub[feature_cols]

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state,
        stratify=y if task != "regression" and y.nunique() <= 20 else None
    )

    # ── Build pipelines ───────────────────────────────────────────────────────
    imputer = SimpleImputer(strategy="median")
    scaler  = StandardScaler()

    def make_pipeline(model):
        return Pipeline([("impute", imputer), ("scale", scaler), ("model", model)])

    if task == "regression":
        model_map = {
            "Linear Regression":  make_pipeline(LinearRegression()),
            "Ridge Regression":   make_pipeline(Ridge(alpha=1.0)),
            "Random Forest":      make_pipeline(RandomForestRegressor(n_estimators=100, random_state=random_state, n_jobs=-1)),
            "Gradient Boosting":  make_pipeline(GradientBoostingRegressor(n_estimators=100, random_state=random_state)),
            "Decision Tree":      make_pipeline(DecisionTreeRegressor(max_depth=8, random_state=random_state)),
        }
    elif task in ("binary_classification", "multiclass_classification"):
        model_map = {
            "Logistic Regression": make_pipeline(LogisticRegression(max_iter=1000, random_state=random_state)),
            "Random Forest":       make_pipeline(RandomForestClassifier(n_estimators=100, random_state=random_state, n_jobs=-1)),
            "Gradient Boosting":   make_pipeline(GradientBoostingClassifier(n_estimators=100, random_state=random_state)),
            "Decision Tree":       make_pipeline(DecisionTreeClassifier(max_depth=8, random_state=random_state)),
            "KNN":                 make_pipeline(KNeighborsClassifier(n_neighbors=5)),
        }
    else:
        return _clustering_result(X, task_info)

    # ── Train + evaluate ──────────────────────────────────────────────────────
    results = []
    feature_importance_chart = None
    best_model = None
    best_score = -np.inf

    for name, pipeline in model_map.items():
        t0 = time.time()
        try:
            pipeline.fit(X_train, y_train)
            y_pred = pipeline.predict(X_test)
            elapsed = round(time.time() - t0, 2)

            if task == "regression":
                r2   = round(float(r2_score(y_test, y_pred)), 4)
                rmse = round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4)
                mae  = round(float(mean_absolute_error(y_test, y_pred)), 4)
                row  = {"model": name, "r2": r2, "rmse": rmse, "mae": mae,
                        "primary_metric": r2, "train_time_s": elapsed}
                if r2 > best_score:
                    best_score = r2
                    best_model = (name, pipeline)
            else:
                avg = "binary" if task == "binary_classification" else "weighted"
                acc  = round(float(accuracy_score(y_test, y_pred)), 4)
                prec = round(float(precision_score(y_test, y_pred, average=avg, zero_division=0)), 4)
                rec  = round(float(recall_score(y_test, y_pred, average=avg, zero_division=0)), 4)
                f1   = round(float(f1_score(y_test, y_pred, average=avg, zero_division=0)), 4)
                row  = {"model": name, "accuracy": acc, "precision": prec,
                        "recall": rec, "f1": f1,
                        "primary_metric": acc, "train_time_s": elapsed}
                if acc > best_score:
                    best_score = acc
                    best_model = (name, pipeline)

            results.append(row)
        except Exception as e:
            results.append({"model": name, "error": str(e), "primary_metric": -1})

    # Sort by primary metric desc
    results = sorted(results, key=lambda x: x.get("primary_metric", -1), reverse=True)
    if results:
        results[0]["is_best"] = True

    # ── Feature importance ────────────────────────────────────────────────────
    fi_chart = None
    cm_chart = None

    if best_model:
        bname, bpipe = best_model
        bmodel = bpipe.named_steps["model"]

        if hasattr(bmodel, "feature_importances_"):
            fi = bmodel.feature_importances_
            fi_chart = _feature_importance_chart(feature_cols, fi, bname)

        if task != "regression":
            y_pred_best = bpipe.predict(X_test)
            cm_chart    = _confusion_matrix_chart(y_test, y_pred_best, task_info)

    # ── Cross-validation on best ──────────────────────────────────────────────
    cv_score = None
    if best_model:
        try:
            scoring = "r2" if task == "regression" else "accuracy"
            cv_scores = cross_val_score(best_model[1], X, y, cv=5, scoring=scoring, n_jobs=-1)
            cv_score  = {"mean": round(float(cv_scores.mean()), 4),
                         "std":  round(float(cv_scores.std()), 4),
                         "scores": [round(float(s), 4) for s in cv_scores]}
        except Exception:
            pass

    return {
        "task":              task,
        "task_info":         task_info,
        "target_column":     target_col,
        "feature_columns":   feature_cols,
        "n_train":           len(X_train),
        "n_test":            len(X_test),
        "results":           results,
        "best_model":        results[0]["model"] if results else None,
        "cv_score":          cv_score,
        "feature_importance_chart": fi_chart,
        "confusion_matrix_chart":   cm_chart,
    }


# ── Charts ────────────────────────────────────────────────────────────────────

def _feature_importance_chart(features: list, importances: list, model_name: str) -> str:
    pairs  = sorted(zip(features, importances), key=lambda x: x[1])
    labels = [p[0] for p in pairs]
    vals   = [p[1] for p in pairs]

    fig, ax = plt.subplots(figsize=(9, max(4, len(labels) * 0.38)))
    colors  = [f"#F59E0B" if v == max(vals) else "#F9C79A" for v in vals]
    ax.barh(labels, vals, color=colors, edgecolor="#000", linewidth=0.8)
    ax.set_title(f"Feature Importance — {model_name}", fontsize=12,
                 fontweight="bold", color=TEXT, pad=10)
    ax.set_xlabel("Importance", fontsize=9, color="#6B7280")
    ax.tick_params(labelsize=8)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight", facecolor=BG)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return b64


def _confusion_matrix_chart(y_true, y_pred, task_info: dict) -> str:
    cm     = confusion_matrix(y_true, y_pred)
    labels = task_info.get("classes", []) or [str(i) for i in range(cm.shape[0])]
    labels = labels[:cm.shape[0]]

    fig, ax = plt.subplots(figsize=(max(5, cm.shape[0] * 0.9), max(4, cm.shape[0] * 0.8)))
    import seaborn as sns
    sns.heatmap(cm, ax=ax, annot=True, fmt="d", cmap="YlOrRd",
                xticklabels=labels, yticklabels=labels,
                linewidths=0.5, linecolor="#E5E7EB",
                cbar_kws={"shrink": 0.7})
    ax.set_title("Confusion Matrix", fontsize=12, fontweight="bold", color=TEXT, pad=10)
    ax.set_xlabel("Predicted", fontsize=9)
    ax.set_ylabel("Actual", fontsize=9)
    ax.tick_params(labelsize=8)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight", facecolor=BG)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    plt.close(fig)
    return b64


def _clustering_result(X: pd.DataFrame, task_info: dict) -> dict:
    """Run K-Means for clustering tasks."""
    imputer = SimpleImputer(strategy="median")
    scaler  = StandardScaler()
    X_clean = scaler.fit_transform(imputer.fit_transform(X))

    results = []
    for k in [2, 3, 4, 5]:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        km.fit(X_clean)
        results.append({"k": k, "inertia": round(float(km.inertia_), 2)})

    return {
        "task":        "clustering",
        "task_info":   task_info,
        "kmeans_sweep": results,
        "recommendation": "Use the Elbow method — pick k where inertia stops dropping sharply.",
    }
