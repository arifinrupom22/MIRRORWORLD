from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .db import Base, SessionLocal, engine
from .jobs import seed_demo_scenarios
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seeded = seed_if_empty(db)
        seed_demo_scenarios(db)
        if seeded:
            print("[MIRRORWORLD] Seeded synthetic campus, baseline timetable and demo runs.")
    finally:
        db.close()
    yield


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
    allow_origins=["https://mirrorworld-project-showcase.netlify.app"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {
        "name": "MIRRORWORLD",
        "tagline": "See the Impact. Simulate the Future. Optimize the Recovery.",
        "docs": "/docs",
        "health": "/api/health",
    }
