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

# Ensure the backend root is on the path so `db`, `routes`, etc. resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import engine, Base
from db import models  # noqa: F401 — needed so Base.metadata is populated

from routes.auth      import router as auth_router
from routes.users     import router as users_router
from routes.tenants   import router as tenants_router
from routes.surveys   import router as surveys_router
from routes.responses import router as responses_router
from routes.feedback  import router as feedback_router
from routes.dashboard import router as dashboard_router
from routes.utils     import router as utils_router
from routes.ai        import router as ai_router
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.responses import JSONResponse

from core.rate_limiter import limiter

# ── Create tables ─────────────────────────────────────────────────────────────
# In production, replace this with Alembic migrations.
Base.metadata.create_all(bind=engine)


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Axiora Pulse API",
    description="FastAPI backend for the Axiora Pulse survey science platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)
# ── Rate Limiter ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Use wildcard origins and disable credentials for maximum development compatibility.
# Since we use Bearer tokens (Authorization header) rather than cookies, 
# allow_credentials=True is NOT required.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": "Axiora Pulse API"}


@app.get("/", tags=["health"])
def root():
    return {"message": "Axiora Pulse API is running. Visit /docs for the interactive API explorer."}
