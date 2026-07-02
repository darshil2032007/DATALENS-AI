"""
POST /api/groq/summary  — AI executive summary (streaming)
POST /api/groq/insights — AI insight cards (JSON)
POST /api/groq/ask      — Ask your dataset (streaming chat)
"""
from __future__ import annotations

import os
import json
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from utils.session import get_session

router = APIRouter()

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama3-8b-8192"


# ── Request models ─────────────────────────────────────────────────────────────

class SummaryRequest(BaseModel):
    session_id: str

class InsightsRequest(BaseModel):
    session_id: str

class AskRequest(BaseModel):
    session_id:   str
    question:     str
    chat_history: list[dict] = []


# ── Helpers ────────────────────────────────────────────────────────────────────

def _api_key() -> str:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500,
                            detail="GROQ_API_KEY not set on the server. Add it to your .env file.")
    return key


def _build_context(session: dict) -> str:
    """Build a compact, information-rich context string from the session profile."""
    from services.profiler import profile_dataframe
    df       = session["df"]
    filename = session["filename"]
    profile  = profile_dataframe(df, filename)

    lines = [
        f'Dataset: "{filename}"',
        f'Shape: {profile["rows"]} rows × {profile["columns"]} columns',
        f'Memory: {profile["memory_human"]}',
        f'Missing values: {profile["total_missing"]} ({profile["missing_pct"]}%)',
        f'Duplicate rows: {profile["duplicates"]}',
        f'Data quality score: {profile["quality_score"]}/100',
        "",
        "Column profiles:",
    ]

    for c in profile["columns_profile"]:
        if c["dtype_group"] == "numeric":
            lines.append(
                f'  • {c["name"]} [numeric/{c["dtype"]}] '
                f'missing={c["missing"]} mean={c["mean"]} median={c["median"]} '
                f'std={c["std"]} min={c["min"]} max={c["max"]} '
                f'skew={c["skewness"]} ({c["skew_label"]}) outliers={c["outliers"]}'
            )
        elif c["dtype_group"] == "categorical":
            top = ", ".join(f'"{v["value"]}"({v["count"]})' for v in c["top_values"][:5])
            lines.append(
                f'  • {c["name"]} [categorical] '
                f'unique={c["unique"]} missing={c["missing"]} top=[{top}]'
            )
        else:
            lines.append(f'  • {c["name"]} [{c["dtype_group"]}/{c["dtype"]}] missing={c["missing"]}')

    return "\n".join(lines)


async def _groq_stream(messages: list[dict]):
    """Generator that yields SSE chunks from Groq streaming API."""
    key = _api_key()
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST", GROQ_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages,
                  "temperature": 0.4, "max_tokens": 1024, "stream": True},
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(status_code=resp.status_code, detail=body.decode())
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or line == "data: [DONE]":
                    continue
                if line.startswith("data: "):
                    try:
                        chunk = json.loads(line[6:])
                        text  = chunk["choices"][0]["delta"].get("content", "")
                        if text:
                            yield text
                    except Exception:
                        continue


async def _groq_complete(messages: list[dict]) -> str:
    """Non-streaming Groq call — returns full response text."""
    key = _api_key()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages,
                  "temperature": 0.3, "max_tokens": 1024, "stream": False},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/groq/summary")
async def groq_summary(body: SummaryRequest):
    """Streaming AI executive summary."""
    session = get_session(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    ctx      = _build_context(session)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a senior data analyst writing executive summaries. "
                "Be concise, structured, and data-driven. "
                "Structure: 1) What this dataset is about, "
                "2) Key patterns and statistics, "
                "3) Data quality observations, "
                "4) One actionable recommendation. "
                "Keep it under 250 words. Use plain English."
            ),
        },
        {"role": "user", "content": f"Write an executive summary for this dataset:\n\n{ctx}"},
    ]

    async def event_stream():
        async for chunk in _groq_stream(messages):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/plain")


@router.post("/groq/insights")
async def groq_insights(body: InsightsRequest):
    """Returns 4 AI insight cards as JSON."""
    session = get_session(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    ctx      = _build_context(session)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a data science expert. "
                "Return ONLY a valid JSON array of exactly 4 insight objects. "
                "No markdown, no explanation, no code fences. Just the JSON array. "
                'Each object: {"type": string, "title": string, "body": string}. '
                'Types must be one of: "correlation", "quality", "trend", "ml_readiness". '
                "Keep each body under 60 words. Be specific — use actual column names and numbers."
            ),
        },
        {"role": "user", "content": f"Generate 4 data insights for:\n\n{ctx}"},
    ]

    raw = await _groq_complete(messages)

    # Strip markdown fences if model adds them
    clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()

    try:
        insights = json.loads(clean)
        if not isinstance(insights, list):
            raise ValueError("Response is not a JSON array")
    except Exception:
        # Fallback — return raw as single insight
        insights = [{"type": "quality", "title": "AI Insight", "body": raw[:300]}]

    return {"insights": insights}


@router.post("/groq/ask")
async def groq_ask(body: AskRequest):
    """Streaming chat — answer questions about the dataset."""
    session = get_session(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")

    ctx = _build_context(session)

    system_msg = {
        "role": "system",
        "content": (
            "You are a helpful data analyst assistant. "
            "Answer questions about the dataset below accurately and concisely. "
            "Use specific numbers and column names from the data. "
            "If a question requires computation you cannot do, say so clearly.\n\n"
            f"Dataset context:\n{ctx}"
        ),
    }

    # Build message history (last 10 turns)
    history = body.chat_history[-10:]
    messages = [system_msg] + history + [{"role": "user", "content": body.question}]

    async def event_stream():
        async for chunk in _groq_stream(messages):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/plain")
