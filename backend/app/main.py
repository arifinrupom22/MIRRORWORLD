from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Final

import os as _os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load backend/.env before anything reads configuration. Real environment
# variables always win; this only fills in what the file provides.
from .env import load_env

load_env()

from .api import router
from .db import Base, SessionLocal, engine, ensure_schema
from .jobs import seed_demo_scenarios
from .seed import seed_if_empty

# CORS is configured for the known Netlify production origin, local dev servers
# and a safety-net regex for the live Render backend host / new Netlify preview
# domains. Origin allow-list is the primary control; the regex is only a fallback
# for the specific production backend host and local HTTP dev servers.
_ALLOWED_ORIGINS: Final[list[str]] = [
    "https://mirrorworld-project-showcase.netlify.app",
]
_prod = _os.environ.get("MIRRORWORLD_PRODUCTION_ORIGINS", "")
if _prod:
    _ALLOWED_ORIGINS.extend(
        origin.strip() for origin in _prod.split(",") if origin.strip()
    )


app = FastAPI(
    title="MIRRORWORLD API",
    description=(
        "Constraint-aware campus digital twin: counterfactual simulation, "
        "dependency impact analysis and OR-Tools CP-SAT recovery planning."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=r"https://mirrorworld\.onrender\.com|http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        seeded = seed_if_empty(db)
        seed_demo_scenarios(db)
        if seeded:
            print("[MIRRORWORLD] Seeded synthetic campus, baseline timetable and demo runs.")
    finally:
        db.close()
    yield


@app.get("/")
def root():
    return {
        "name": "MIRRORWORLD",
        "tagline": "See the Impact. Simulate the Future. Optimize the Recovery.",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    """Lightweight backend check for production monitoring.

    Deliberately omits the API key, model id, database path and any other
    secret. Reports process health only.
    """
    from .env import loaded_names as _loaded

    return {
        "ok": True,
        "name": "MIRRORWORLD",
        "service": "backend",
        "version": "1.0.0",
        "loaded_env_file": bool(_loaded),
        "env_keys_loaded": len(_loaded),
    }
