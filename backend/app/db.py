from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DB_URL = f"sqlite:///{(DATA_DIR / 'mirrorworld.db').as_posix()}"
DATABASE_URL = os.environ.get("MIRRORWORLD_DATABASE_URL", DEFAULT_DB_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


def ensure_schema() -> None:
    """Apply the small additive migrations this demo needs.

    ``create_all`` creates missing tables but never adds columns to an
    existing SQLite table. The plan ``source`` field was introduced after the
    first demo build, so add it in place while preserving saved runs.
    """
    inspector = inspect(engine)
    if "scenario_results" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("scenario_results")}
    if "source" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE scenario_results ADD COLUMN source VARCHAR DEFAULT 'solver'")
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
