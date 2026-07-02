"""
Visualizer — generates charts using matplotlib/seaborn.
Returns base64-encoded PNG strings so the frontend can render them as <img> tags.
"""
import io
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")          # non-interactive backend (no display needed)
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
from scipy import stats as scipy_stats

# ── Shared style ───────────────────────────────────────────────────────────────
ACCENT   = "#F9C79A"
ACCENT2  = "#F59E0B"
ACCENT3  = "#F97316"
RED      = "#EF4444"
GREEN    = "#10B981"
BG       = "#FDFCFB"
TEXT     = "#111827"
MUTED    = "#6B7280"
BORDER   = "#000000"

PALETTE  = [ACCENT, ACCENT2, ACCENT3, RED, GREEN, "#3B82F6", "#8B5CF6", "#EC4899"]

def _style():
    plt.rcParams.update({
        "figure.facecolor": BG,
        "axes.facecolor":   BG,
        "axes.edgecolor":   BORDER,
        "axes.linewidth":   1.5,
        "axes.grid":        True,
        "grid.color":       "#E5E7EB",
        "grid.linewidth":   0.7,
        "font.family":      "DejaVu Sans",
        "text.color":       TEXT,
        "xtick.color":      MUTED,
        "ytick.color":      MUTED,
        "xtick.labelsize":  9,
        "ytick.labelsize":  9,
    })

def _to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight",
                facecolor=BG, edgecolor="none")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return b64


# ── Histogram ─────────────────────────────────────────────────────────────────

def histogram(df: pd.DataFrame, column: str, bins: int = 25) -> str:
    _style()
    series = df[column].dropna()
    fig, ax = plt.subplots(figsize=(9, 4.5))

    n, edges, patches = ax.hist(series, bins=bins, color=ACCENT,
                                edgecolor=BORDER, linewidth=0.8, alpha=0.92)

    # Color bars by gradient
    norm = plt.Normalize(n.min(), n.max())
    colors = plt.cm.YlOrRd(norm(n))
    for patch, color in zip(patches, colors):
        patch.set_facecolor(color)
        patch.set_edgecolor(BORDER)

    # Mean / Median lines
    ax.axvline(series.mean(),   color=RED,   lw=1.8, ls="--", label=f"Mean: {series.mean():.2f}")
    ax.axvline(series.median(), color=GREEN, lw=1.8, ls=":",  label=f"Median: {series.median():.2f}")

    ax.set_title(f"Distribution of {column}", fontsize=13, fontweight="bold", color=TEXT, pad=12)
    ax.set_xlabel(column, fontsize=10, color=MUTED)
    ax.set_ylabel("Frequency", fontsize=10, color=MUTED)
    ax.legend(fontsize=9, framealpha=0.85)
    fig.tight_layout()
    return _to_b64(fig)


# ── Category bar ──────────────────────────────────────────────────────────────

def category_bar(df: pd.DataFrame, column: str, top_n: int = 15) -> str:
    _style()
    vc   = df[column].value_counts(dropna=True).head(top_n)
    fig, ax = plt.subplots(figsize=(9, max(4, len(vc) * 0.45)))

    colors = [PALETTE[i % len(PALETTE)] for i in range(len(vc))]
    bars   = ax.barh(vc.index.astype(str)[::-1], vc.values[::-1],
                     color=colors[::-1], edgecolor=BORDER, linewidth=0.8, height=0.65)

    # Value labels
    for bar, val in zip(bars, vc.values[::-1]):
        ax.text(bar.get_width() + vc.values.max() * 0.01, bar.get_y() + bar.get_height() / 2,
                f"{val:,}", va="center", fontsize=8.5, color=TEXT)

    ax.set_title(f"Top {top_n} values in '{column}'", fontsize=13, fontweight="bold", color=TEXT, pad=12)
    ax.set_xlabel("Count", fontsize=10, color=MUTED)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    return _to_b64(fig)


# ── Scatter plot with optional regression line ────────────────────────────────

def scatter(df: pd.DataFrame, col_x: str, col_y: str, trendline: bool = True) -> str:
    _style()
    sub = df[[col_x, col_y]].dropna()
    fig, ax = plt.subplots(figsize=(9, 5))

    ax.scatter(sub[col_x], sub[col_y],
               color=ACCENT2, edgecolor=BORDER, linewidth=0.5,
               alpha=0.65, s=28)

    if trendline and len(sub) >= 2:
        m, b, r, p, _ = scipy_stats.linregress(sub[col_x], sub[col_y])
        x_line = np.linspace(sub[col_x].min(), sub[col_x].max(), 200)
        ax.plot(x_line, m * x_line + b, color=RED, lw=2,
                label=f"Trend  r={r:.3f}  p={'<0.001' if p < 0.001 else f'{p:.3f}'}")
        ax.legend(fontsize=9, framealpha=0.85)

    ax.set_title(f"{col_x}  vs  {col_y}", fontsize=13, fontweight="bold", color=TEXT, pad=12)
    ax.set_xlabel(col_x, fontsize=10, color=MUTED)
    ax.set_ylabel(col_y, fontsize=10, color=MUTED)
    fig.tight_layout()
    return _to_b64(fig)


# ── Correlation heatmap ───────────────────────────────────────────────────────

def correlation_heatmap(df: pd.DataFrame, numeric_cols: list) -> str:
    _style()
    if len(numeric_cols) < 2:
        return ""

    sub  = df[numeric_cols].dropna()
    corr = sub.corr(method="pearson")

    size = max(7, len(numeric_cols) * 0.75)
    fig, ax = plt.subplots(figsize=(size, size * 0.85))

    cmap = sns.diverging_palette(10, 130, as_cmap=True)   # red–white–green
    sns.heatmap(
        corr, ax=ax, cmap=cmap, center=0,
        annot=len(numeric_cols) <= 15,
        fmt=".2f", annot_kws={"size": 8},
        linewidths=0.5, linecolor="#E5E7EB",
        square=True, vmin=-1, vmax=1,
        cbar_kws={"shrink": 0.75, "label": "Pearson r"},
    )
    ax.set_title("Correlation Matrix", fontsize=13, fontweight="bold", color=TEXT, pad=14)
    ax.tick_params(axis="x", rotation=35, labelsize=8)
    ax.tick_params(axis="y", rotation=0,  labelsize=8)
    fig.tight_layout()
    return _to_b64(fig)


# ── Box plot ──────────────────────────────────────────────────────────────────

def box_plot(df: pd.DataFrame, column: str) -> str:
    _style()
    series = df[column].dropna()
    fig, ax = plt.subplots(figsize=(9, 4.5))

    bp = ax.boxplot(series, vert=False, patch_artist=True,
                    widths=0.5, notch=False,
                    boxprops=dict(facecolor=ACCENT, color=BORDER, linewidth=1.5),
                    medianprops=dict(color=RED, linewidth=2.5),
                    whiskerprops=dict(color=BORDER, linewidth=1.5),
                    capprops=dict(color=BORDER, linewidth=1.5),
                    flierprops=dict(marker="o", markerfacecolor=RED,
                                    markersize=4, alpha=0.6, markeredgewidth=0.5))

    # Annotate Q1, median, Q3
    q1, med, q3 = series.quantile([0.25, 0.5, 0.75])
    for val, label in [(q1, "Q1"), (med, "Median"), (q3, "Q3")]:
        ax.text(val, 1.32, f"{label}\n{val:.2f}", ha="center",
                fontsize=8, color=TEXT, fontweight="bold")

    ax.set_title(f"Box Plot — {column}", fontsize=13, fontweight="bold", color=TEXT, pad=12)
    ax.set_xlabel(column, fontsize=10, color=MUTED)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    fig.tight_layout()
    return _to_b64(fig)


# ── Multi box plot (all numeric columns) ─────────────────────────────────────

def multi_box_plot(df: pd.DataFrame, numeric_cols: list) -> str:
    _style()
    cols = numeric_cols[:12]     # cap at 12 for readability
    sub  = df[cols].dropna()

    # Normalise so all columns are on same scale
    norm = (sub - sub.min()) / (sub.max() - sub.min() + 1e-9)

    fig, ax = plt.subplots(figsize=(max(9, len(cols) * 0.9), 5))
    bp = ax.boxplot(
        [norm[c].values for c in cols],
        labels=cols, patch_artist=True,
        boxprops=dict(facecolor=ACCENT, color=BORDER, linewidth=1.2),
        medianprops=dict(color=RED, linewidth=2),
        whiskerprops=dict(color=BORDER, linewidth=1.2),
        capprops=dict(color=BORDER, linewidth=1.2),
        flierprops=dict(marker="o", markerfacecolor=RED, markersize=3, alpha=0.5),
    )

    ax.set_title("Box Plots (normalised 0–1)", fontsize=13, fontweight="bold", color=TEXT, pad=12)
    ax.set_ylabel("Normalised value", fontsize=10, color=MUTED)
    ax.tick_params(axis="x", rotation=30, labelsize=8)
    fig.tight_layout()
    return _to_b64(fig)


# ── Missing values heatmap ────────────────────────────────────────────────────

def missing_heatmap(df: pd.DataFrame) -> str:
    _style()
    miss = df.isnull()
    if not miss.any().any():
        return ""

    # Only show columns with missing values
    cols_with_missing = miss.columns[miss.any()].tolist()
    if not cols_with_missing:
        return ""

    sub  = miss[cols_with_missing].head(200)   # cap rows for visual clarity
    fig, ax = plt.subplots(figsize=(max(8, len(cols_with_missing) * 0.7), 5))

    sns.heatmap(sub, ax=ax, cbar=False,
                cmap=["#F0FDF4", "#EF4444"],
                linewidths=0, yticklabels=False)

    ax.set_title("Missing Values Map (red = missing)", fontsize=12,
                 fontweight="bold", color=TEXT, pad=12)
    ax.tick_params(axis="x", rotation=35, labelsize=8)
    fig.tight_layout()
    return _to_b64(fig)


# ── Line chart (time series) ──────────────────────────────────────────────────

def line_chart(df: pd.DataFrame, date_col: str, value_col: str) -> str:
    _style()
    sub = df[[date_col, value_col]].dropna().copy()
    sub[date_col] = pd.to_datetime(sub[date_col], errors="coerce")
    sub = sub.dropna(subset=[date_col]).sort_values(date_col)

    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.plot(sub[date_col], sub[value_col],
            color=ACCENT2, lw=1.8, marker="o", markersize=3.5,
            markerfacecolor=RED, markeredgewidth=0.5, markeredgecolor=BORDER)

    ax.fill_between(sub[date_col], sub[value_col],
                    alpha=0.15, color=ACCENT2)

    ax.set_title(f"{value_col} over time", fontsize=13, fontweight="bold", color=TEXT, pad=12)
    ax.set_xlabel(date_col, fontsize=10, color=MUTED)
    ax.set_ylabel(value_col, fontsize=10, color=MUTED)
    fig.autofmt_xdate(rotation=25)
    fig.tight_layout()
    return _to_b64(fig)