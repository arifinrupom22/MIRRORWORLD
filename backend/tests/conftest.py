"""Shared fixtures for the MIRRORWORLD backend test suite.

The database URL is redirected to a temporary SQLite file *before* any
application module is imported, so tests never touch the demo database.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

_TMP_DIR = tempfile.mkdtemp(prefix="mirrorworld_test_")
os.environ["MIRRORWORLD_DATABASE_URL"] = f"sqlite:///{Path(_TMP_DIR) / 'test.db'}"

import pytest  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.jobs import seed_demo_scenarios  # noqa: E402
from app.seed import seed_if_empty  # noqa: E402


@pytest.fixture(scope="session")
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        seeded = seed_if_empty(session)
        seed_demo_scenarios(session)
        session.commit()
        assert seeded, "seed_if_empty must populate an empty test database"
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def campus(db):
    from app.campus import load_campus

    return load_campus(db)


@pytest.fixture(scope="session")
def client(db):
    from fastapi.testclient import TestClient

    from app.main import app

    # Context manager runs the lifespan (idempotent create_all + seed no-op).
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def baseline_metrics(campus):
    from app.metrics import compute_metrics

    sizes = {g["id"]: g.get("size", 0) for g in campus.groups}
    return compute_metrics(campus, campus.sessions, sizes)
