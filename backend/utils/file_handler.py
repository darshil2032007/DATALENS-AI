"""
File handler — parses uploaded files into pandas DataFrames.
Supports: CSV, Excel (.xlsx / .xls), JSON
"""
from __future__ import annotations

import io
import json
import pandas as pd
from fastapi import UploadFile, HTTPException


ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json"}
MAX_SIZE_MB = 25


async def parse_upload(file: UploadFile) -> tuple[pd.DataFrame, str]:
    """
    Read an UploadFile and return (DataFrame, filename).
    Raises HTTPException on error.
    """
    filename = file.filename or "upload"
    ext = _get_ext(filename)

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()

    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content)/1_000_000:.1f} MB). Max is {MAX_SIZE_MB} MB."
        )

    try:
        if ext == ".csv":
            df = _parse_csv(content)
        elif ext in (".xlsx", ".xls"):
            df = _parse_excel(content)
        elif ext == ".json":
            df = _parse_json(content)
        else:
            raise ValueError("Unknown extension")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=422, detail="File parsed but contains no data.")

    return df, filename


# ── Parsers ────────────────────────────────────────────────────────────────────

def _parse_csv(content: bytes) -> pd.DataFrame:
    """Try common encodings and delimiters."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(encoding)
            # Detect delimiter: comma, semicolon, tab, pipe
            for sep in (",", ";", "\t", "|"):
                try:
                    df = pd.read_csv(io.StringIO(text), sep=sep, low_memory=False)
                    if df.shape[1] > 1:       # more than 1 column = correct delimiter
                        return df
                except Exception:
                    continue
            # Fallback: just use comma
            return pd.read_csv(io.StringIO(text), low_memory=False)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode CSV file. Try saving it as UTF-8.")


def _parse_excel(content: bytes) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(content), sheet_name=0)
    return df


def _parse_json(content: bytes) -> pd.DataFrame:
    raw = json.loads(content.decode("utf-8"))
    if isinstance(raw, list):
        return pd.DataFrame(raw)
    # Unwrap common envelopes: {"data": [...]}
    if isinstance(raw, dict):
        for key in ("data", "results", "rows", "records", "items"):
            if key in raw and isinstance(raw[key], list):
                return pd.DataFrame(raw[key])
        # Single-level dict of arrays
        return pd.DataFrame(raw)
    raise ValueError("JSON must be an array or object with an array field.")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_ext(filename: str) -> str:
    parts = filename.rsplit(".", 1)
    return f".{parts[-1].lower()}" if len(parts) > 1 else ""
