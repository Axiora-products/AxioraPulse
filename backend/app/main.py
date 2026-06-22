# ruff: noqa: E402
"""
app/main.py
───────────
FastAPI application entry-point.

Startup sequence:
  1. Create all DB tables (SQLAlchemy create_all — code-first migrations)
  2. Register CORS middleware (allows the Vite dev server at localhost:5173)
  3. Mount all route modules
  4. Health-check endpoint
"""

import sys
import os
import logging

# Ensure the backend root is on the path so `db`, `routes`, etc. resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import engine
from db import models  # noqa: F401 — needed so Base.metadata is populated
from routes.demo import router as demo_router
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.tenants import router as tenants_router
from routes.surveys import router as surveys_router
from routes.responses import router as responses_router
from routes.feedback import router as feedback_router
from routes.dashboard import router as dashboard_router
from routes.utils import router as utils_router
from routes.ai import router as ai_router
from routes.payments import router as payments_router
from routes.public import router as public_router
from routes.uploads import router as uploads_router
from routes.otp import router as otp_router
from routes.ca_agent import router as ca_agent_router
from routes.super_admin import router as super_admin_router
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from core import config
from core.rate_limiter import limiter


# ── Create tables ─────────────────────────────────────────────────────────────
# In production, replace this with Alembic migrations.


# ── App ───────────────────────────────────────────────────────────────────────
# Interactive API docs are disabled in production to avoid exposing the full API
# surface map. (AP-SEC-020)
_docs_enabled = not config.IS_PRODUCTION
app = FastAPI(
    title="Nexora Pulse API",
    description="FastAPI backend for the Nexora Pulse survey science platform",
    version="1.0.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
    root_path="/api",
)
# ── Rate Limiter ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Restrict origins to the configured frontend(s). FRONTEND_URL may contain a
# comma-separated list. In non-production, fall back to wildcard for local dev
# convenience. We use Bearer tokens (not cookies), so credentials stay disabled.
# (AP-SEC-019)
_allowed_origins = [o.strip() for o in config.FRONTEND_URL.split(",") if o.strip()]
if not _allowed_origins:
    if config.IS_PRODUCTION:
        # Fail safe: no origins configured in prod => allow none rather than all.
        _allowed_origins = []
    else:
        _allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down."},
    )


# ── Security headers ───────────────────────────────────────────────────────────
# Applied to every response. The SPA sets its own page CSP at the edge; for this
# API we focus on transport, sniffing and clickjacking protections. (AP-SEC-031)
_CSP_EXEMPT_PREFIXES = ("/docs", "/redoc", "/openapi.json", "/surveys/og/")


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    if config.IS_PRODUCTION:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"
        )
    # A restrictive CSP for JSON API responses; exempt doc UIs and the OG HTML
    # page (consumed by social crawlers) which legitimately need inline content.
    path = request.url.path
    if not any(path.startswith(p) for p in _CSP_EXEMPT_PREFIXES):
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
    return response


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(tenants_router)
app.include_router(surveys_router)
app.include_router(responses_router)
app.include_router(feedback_router)
app.include_router(dashboard_router)
app.include_router(utils_router)
app.include_router(ai_router)
app.include_router(payments_router)
app.include_router(uploads_router)
app.include_router(demo_router)
app.include_router(public_router)
app.include_router(otp_router)
app.include_router(ca_agent_router)
app.include_router(super_admin_router)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    # Return 503 (not 200) when unhealthy so load balancers/orchestrators gate
    # traffic correctly, and never leak the raw DB error/connection string.
    # (AP-SEC-026)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "healthy", "service": "Nexora Pulse API", "database": "connected"}
    except Exception as exc:
        logging.getLogger(__name__).error("Health check DB failure: %s", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected"},
        )


@app.get("/", tags=["health"])
def root():
    return {"message": "Nexora Pulse API is running. Visit /docs for the interactive API explorer."}
