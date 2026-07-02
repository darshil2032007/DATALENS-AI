"""
DataLens AI — FastAPI Backend
Deployed on Render.com
"""
from __future__ import annotations
import os
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from routers import upload, profile, clean, analyze, visualize, ml, groq

load_dotenv()

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="DataLens AI API",
    description="Backend for DataLens AI — pandas-powered data analysis platform",
    version="1.0.0",
)

# ── CORS ── must be added BEFORE any routes ────────────────────────────────────
raw_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
IS_DEV = not allowed_origins

if IS_DEV:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    dev_fallback = [
        "http://localhost:5500", "http://127.0.0.1:5500",
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:8080", "http://127.0.0.1:8080",
    ]
    all_origins = list(set(allowed_origins + dev_fallback))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=all_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ── Global error handler — ensures CORS headers survive 500 errors ─────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[DataLens] Unhandled error on {request.url}:\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb[-1000:]},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(upload.router,    prefix="/api", tags=["Upload"])
app.include_router(profile.router,   prefix="/api", tags=["Profile"])
app.include_router(clean.router,     prefix="/api", tags=["Clean"])
app.include_router(analyze.router,   prefix="/api", tags=["Analyze"])
app.include_router(visualize.router, prefix="/api", tags=["Visualize"])
app.include_router(ml.router,        prefix="/api", tags=["ML"])
app.include_router(groq.router,      prefix="/api", tags=["Groq AI"])

# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "service": "DataLens AI API", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
