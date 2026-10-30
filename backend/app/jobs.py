"""In-process background jobs for CP-SAT optimization.

The demo runs as a single API process. Jobs are serialized through a one-worker
thread pool, persisted to the relational store on completion, and exposed via
polling endpoints. This mirrors the documented asynchronous solve flow without
requiring an external broker.
"""

from __future__ import annotations

import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy import delete, select

from .campus import load_campus
from .db import SessionLocal
from .models import AuditLog, Scenario, ScenarioPlan
from .optimizer import InfeasibleScenario, PlanCancelled, solve_plans
from .simulation import simulate

JOBS: dict[str, dict] = {}
JOB_LOCK = threading.Lock()
EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mirrorworld-solver")
ACTIVE_STATUSES = {"queued", "running", "cancelling"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def find_active_job(scenario_id: str) -> dict | None:
    with JOB_LOCK:
        for job in JOBS.values():
            if job["scenario_id"] == scenario_id and job["status"] in ACTIVE_STATUSES:
                return public_job(job)
    return None


def create_optimize_job(scenario_id: str, weights: dict, time_limit: float) -> dict:
    with JOB_LOCK:
        for job in JOBS.values():
            if job["scenario_id"] == scenario_id and job["status"] in ACTIVE_STATUSES:
                return public_job(job)
        job_id = str(uuid.uuid4())
        job = {
            "id": job_id,
            "scenario_id": scenario_id,
            "status": "queued",
            "stage": "queued",
            "message": "Queued for the constraint solver.",
            "plan_index": 0,
            "total_plans": 3,
            "plans_done": 0,
            "weights": weights,
            "time_limit": time_limit,
            "error": None,
            "diagnostics": [],
            "created_at": _now(),
            "started_at": None,
            "finished_at": None,
            "cancel_requested": False,
            "result": None,
        }
        JOBS[job_id] = job
    EXECUTOR.submit(_run_job, job_id)
    return public_job(job)


def public_job(job: dict) -> dict:
    return {
        "id": job["id"],
        "scenario_id": job["scenario_id"],
        "status": job["status"],
        "stage": job["stage"],
        "message": job["message"],
        "plan_index": job["plan_index"],
        "total_plans": job["total_plans"],
        "plans_done": job["plans_done"],
        "weights": job["weights"],
        "time_limit": job["time_limit"],
        "error": job["error"],
        "diagnostics": job["diagnostics"],
        "created_at": job["created_at"],
        "started_at": job["started_at"],
        "finished_at": job["finished_at"],
        "result": job["result"],
    }


def get_job(job_id: str) -> dict | None:
    with JOB_LOCK:
        job = JOBS.get(job_id)
        return public_job(job) if job else None


def cancel_job(job_id: str) -> dict | None:
    with JOB_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return None
        if job["status"] in ACTIVE_STATUSES:
            job["cancel_requested"] = True
            job["status"] = "cancelling"
            job["message"] = "Cancellation requested; the solver stops between plans."
        return public_job(job)


def _update(job_id: str, **fields) -> None:
    with JOB_LOCK:
        job = JOBS.get(job_id)
        if job:
            job.update(fields)


def _progress(job_id: str, stage: str, index: int, total: int, message: str) -> None:
    with JOB_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        if stage == "solved":
            job["plans_done"] = max(job["plans_done"], index + 1)
        job["stage"] = stage
        job["plan_index"] = index
        job["total_plans"] = total
        job["message"] = message
        job["status"] = "running"


def _should_cancel(job_id: str) -> bool:
    with JOB_LOCK:
        job = JOBS.get(job_id)
        return bool(job and job.get("cancel_requested"))


def _run_job(job_id: str) -> None:
    db = SessionLocal()
    scenario: Scenario | None = None
    try:
        job = get_job(job_id)
        if not job:
            return
        if _should_cancel(job_id):
            raise PlanCancelled()
        scenario = db.get(Scenario, job["scenario_id"])
        if scenario is None:
            _update(job_id, status="failed", stage="failed", error="Scenario not found.", finished_at=_now())
            return

        _update(job_id, status="running", stage="loading", started_at=_now(), message="Loading campus model and scenario constraints.")
        scenario.status = "optimizing"
        db.execute(delete(ScenarioPlan).where(ScenarioPlan.scenario_id == scenario.id))
        db.commit()

        campus = load_campus(db)
        weights = job["weights"]
        time_limit = job["time_limit"]
        _update(job_id, stage="building", message="Building CP-SAT model · validating hard constraints.")

        result = solve_plans(
            campus,
            scenario.params,
            weights,
            time_limit,
            progress=lambda stage, index, total, message: _progress(job_id, stage, index, total, message),
            cancelled=lambda: _should_cancel(job_id),
        )

        if _should_cancel(job_id):
            raise PlanCancelled()

        feasible_count = 0
        for plan in result["plans"]:
            has_metrics = bool(plan.get("metrics"))
            if plan.get("status") == "FEASIBLE" and has_metrics:
                feasible_count += 1
            db.add(
                ScenarioPlan(
                    scenario_id=scenario.id,
                    label=plan["label"],
                    name=plan["name"],
                    strategy=plan["strategy"],
                    status=plan["status"],
                    solver_status=plan["solver_status"],
                    objective=plan.get("objective"),
                    metrics=plan.get("metrics") or {},
                    schedule=plan.get("schedule") or [],
                    assignments=plan.get("assignments") or [],
                    warnings=plan.get("warnings") or [],
                    assumptions=scenario.assumptions or [],
                    audit=plan.get("audit") or {},
                    objective_terms=plan.get("objective_terms") or {},
                    runtime_seconds=plan.get("runtime_seconds") or 0,
                )
            )
        scenario.status = "optimized" if feasible_count else "infeasible"
        diagnostics = dict(scenario.diagnostics or {})
        diagnostics.update(
            {
                "optimization": {
                    "weights": result["weights"],
                    "time_limit": time_limit,
                    "solver_status": "COMPLETED",
                    "feasible_plans": feasible_count,
                    "session_count": result["session_count"],
                    "seed": 42,
                    "generated_at": _now(),
                }
            }
        )
        scenario.diagnostics = diagnostics
        db.add(
            AuditLog(
                action="OPTIMIZATION_COMPLETED",
                scenario_id=scenario.id,
                detail={
                    "weights": result["weights"],
                    "time_limit": time_limit,
                    "feasible_plans": feasible_count,
                    "solver_seed": 42,
                },
            )
        )
        db.commit()
        _update(
            job_id,
            status="completed",
            stage="completed",
            plans_done=feasible_count,
            message=f"Optimization complete · {feasible_count} feasible plan(s) generated.",
            finished_at=_now(),
            result={"scenario_id": scenario.id, "feasible_plans": feasible_count},
        )
    except PlanCancelled:
        db.rollback()
        try:
            if scenario is not None:
                db.execute(delete(ScenarioPlan).where(ScenarioPlan.scenario_id == scenario.id))
                scenario.status = "simulated"
                db.commit()
                db.add(AuditLog(action="OPTIMIZATION_CANCELLED", scenario_id=scenario.id, detail={}))
                db.commit()
        except Exception:
            db.rollback()
        _update(
            job_id,
            status="cancelled",
            stage="cancelled",
            message="Optimization cancelled. No plans were saved.",
            finished_at=_now(),
        )
    except InfeasibleScenario as exc:
        db.rollback()
        try:
            if scenario is not None:
                scenario.status = "infeasible"
                diagnostics = dict(scenario.diagnostics or {})
                diagnostics["infeasibility"] = exc.diagnostics
                scenario.diagnostics = diagnostics
                db.add(AuditLog(action="OPTIMIZATION_INFEASIBLE", scenario_id=scenario.id, detail={"diagnostics": exc.diagnostics}))
                db.commit()
        except Exception:
            db.rollback()
        _update(
            job_id,
            status="infeasible",
            stage="infeasible",
            error=str(exc),
            diagnostics=exc.diagnostics,
            message="No feasible timetable satisfies the current hard constraints.",
            finished_at=_now(),
        )
    except Exception as exc:  # pragma: no cover - defensive boundary
        db.rollback()
        traceback.print_exc()
        try:
            if scenario is not None:
                scenario.status = "failed"
                db.commit()
                db.add(AuditLog(action="OPTIMIZATION_FAILED", scenario_id=scenario.id, detail={"error": str(exc)[:300]}))
                db.commit()
        except Exception:
            db.rollback()
        _update(
            job_id,
            status="failed",
            stage="failed",
            error="The optimization run failed. The scenario configuration has been preserved.",
            message="Optimization failed.",
            finished_at=_now(),
        )
    finally:
        db.close()


def job_summary_for_scenario(scenario_id: str) -> dict | None:
    with JOB_LOCK:
        for job in JOBS.values():
            if job["scenario_id"] == scenario_id:
                return public_job(job)
    return None


def seed_demo_scenarios(db) -> None:
    """Create two real, reproducible simulation-only runs on first boot."""
    from .models import Scenario

    existing = db.scalar(select(Scenario).limit(1))
    if existing:
        return
    specs = [
        (
            "S1 · +200 enrolment pressure",
            "demand",
            {"enrollment_delta": 200, "lab_policy": "default", "operating_end_slot": 6, "energy_mode": "standard"},
        ),
        (
            "S4 · HPC lab closure",
            "facility",
            {"unavailable_room_ids": ["AT-L1"], "lab_policy": "default", "operating_end_slot": 6, "energy_mode": "standard"},
        ),
    ]
    for name, kind, raw_params in specs:
        params = {
            "enrollment_delta": 0,
            "unavailable_room_ids": [],
            "unavailable_teacher_ids": [],
            "lab_policy": "default",
            "operating_end_slot": 6,
            "energy_mode": "standard",
            "notes": "",
            **raw_params,
        }
        try:
            result = simulate_mode(db, name, kind, params)
            db.add(result)
            db.commit()
            db.add(AuditLog(action="SCENARIO_SEEDED", scenario_id=result.id, detail={"name": name}))
            db.commit()
        except Exception:
            db.rollback()


def simulate_mode(db, name: str, kind: str, params: dict) -> Scenario:
    campus = load_campus(db)
    result = simulate(campus, params, name=name, kind=kind)
    scenario = Scenario(
        name=name,
        kind=kind,
        params=params,
        status="simulated",
        metrics=result["metrics"],
        schedule=result["schedule"],
        affected=result["affected"],
        warnings=result["warnings"],
        assumptions=result["assumptions"],
        diagnostics=result["diagnostics"],
    )
    return scenario
