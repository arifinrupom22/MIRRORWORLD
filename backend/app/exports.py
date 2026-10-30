"""CSV and printable report generation from stored results."""

from __future__ import annotations

import csv
import html
from datetime import datetime, timezone
from io import StringIO

from . import catalog

METRIC_LABELS = {
    "conflicts_total": "Conflicts",
    "unassigned_sessions": "Displaced sessions",
    "capacity_violations_count": "Capacity violations (sessions)",
    "capacity_violations_total": "Seat deficit",
    "facility_mismatch_count": "Facility mismatches",
    "availability_violation_count": "Availability violations",
    "hard_issue_count": "Hard issues",
    "sessions_scheduled": "Sessions scheduled",
    "active_room_utilization_pct": "Active-room utilization (%)",
    "room_utilization_pct": "Campus room-hour utilization (%)",
    "seat_utilization_pct": "Seat utilization (%)",
    "peak_utilization_pct": "Peak room utilization (%)",
    "energy_kwh": "Estimated energy (kWh/week)",
    "peak_kw": "Peak demand (kW)",
    "movement_km": "Student movement (km/week)",
    "teacher_workload_std_h": "Teacher workload deviation (h)",
    "total_gap_hours": "Schedule gaps (h/week)",
    "rooms_used": "Active rooms",
    "students_total": "Students",
}


def _write_metric_rows(writer, metrics_list: list[tuple[str, dict | None]]) -> None:
    writer.writerow(["Metric"] + [name for name, _ in metrics_list])
    for key, label in METRIC_LABELS.items():
        writer.writerow([label] + ["" if metrics is None else metrics.get(key, "") for _, metrics in metrics_list])


def timetable_csv(schedule: list[dict], title: str = "MIRRORWORLD timetable") -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([title])
    writer.writerow(["Synthetic demo dataset · not measured institutional data"])
    writer.writerow([])
    writer.writerow(["Day", "Start", "End", "Session ID", "Course", "Group", "Teacher", "Room", "Building", "Students", "Length (slots)", "Status"])
    for item in sorted(
        schedule,
        key=lambda s: (
            s.get("day") if s.get("day") is not None else 99,
            s.get("start_slot") if s.get("start_slot") is not None else 99,
            s.get("course_code") or "",
        ),
    ):
        day = item.get("day")
        start = item.get("start_slot")
        end = (start + (item.get("length") or 1) - 1) if start is not None else None
        writer.writerow(
            [
                catalog.DAYS[day]["label"] if day is not None else "Displaced",
                catalog.TIME_SLOTS[start]["start"] if start is not None else "",
                catalog.TIME_SLOTS[end]["end"] if end is not None and 0 <= end < len(catalog.TIME_SLOTS) else "",
                item.get("id", ""),
                item.get("course_code", ""),
                item.get("group_name", ""),
                item.get("teacher_name", ""),
                item.get("room_code", ""),
                item.get("building_name", ""),
                item.get("group_size", ""),
                item.get("length", ""),
                "Displaced" if item.get("displaced") else "Scheduled",
            ]
        )
    return output.getvalue()


def scenario_csv(scenario: dict, baseline_metrics: dict, plans: list[dict]) -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["MIRRORWORLD scenario report"])
    writer.writerow(["Scenario", scenario.get("name", "")])
    writer.writerow(["Type", scenario.get("kind", "")])
    writer.writerow(["Status", scenario.get("status", "")])
    writer.writerow(["Created", scenario.get("created_at", "")])
    writer.writerow(["Dataset", "Synthetic demo campus · Fall 2026 · Week 7"])
    writer.writerow([])
    writer.writerow(["Scenario parameters"])
    for key, value in (scenario.get("params") or {}).items():
        writer.writerow([key, value])
    writer.writerow([])
    columns = [("Baseline", baseline_metrics), ("Scenario existing", scenario.get("metrics"))]
    for plan in plans:
        columns.append((f"Plan {plan.get('label')} · {plan.get('name')}", plan.get("metrics")))
    _write_metric_rows(writer, columns)
    writer.writerow([])

    writer.writerow(["Affected sessions"])
    writer.writerow(["Session ID", "Course / group", "Reason", "Severity", "Detail", "Slot", "Directly displaced"])
    for item in (scenario.get("affected") or {}).get("sessions", []):
        writer.writerow(
            [
                item.get("session_id", ""),
                item.get("label", ""),
                item.get("reason", ""),
                item.get("severity", ""),
                item.get("detail", ""),
                item.get("slot_label", ""),
                "Yes" if item.get("direct") else "No",
            ]
        )
    writer.writerow([])

    for plan in plans:
        writer.writerow([f"Plan {plan.get('label')} hard-constraint audit"])
        writer.writerow(["Check", "Status", "Detail"])
        for check in (plan.get("audit") or {}).get("checks", []):
            writer.writerow([check.get("name", ""), check.get("status", ""), check.get("detail", "")])
        writer.writerow(["Solver status", plan.get("solver_status", ""), ""])
        writer.writerow(["Objective value", plan.get("objective", ""), ""])
        writer.writerow(["Runtime (s)", plan.get("runtime_seconds", ""), ""])
        writer.writerow([])

    writer.writerow(["Assumptions"])
    for assumption in scenario.get("assumptions") or []:
        writer.writerow([assumption])
    writer.writerow(["Warnings"])
    for warning in scenario.get("warnings") or []:
        writer.writerow([warning])
    writer.writerow([])
    writer.writerow(
        [
            "Energy values are modeled estimates, not meter readings. The dataset is illustrative. "
            "No value in this export is hardcoded."
        ]
    )
    return output.getvalue()


def plan_timetable_csv(plan: dict, scenario_name: str) -> str:
    schedule = plan.get("schedule") or []
    title = f"MIRRORWORLD · {scenario_name} · Plan {plan.get('label')} {plan.get('name')}"
    return timetable_csv(schedule, title)


def printable_report(
    scenario: dict,
    baseline_metrics: dict,
    plans: list[dict],
    comparison_rows: list[dict],
    explanation: dict,
) -> str:
    e = html.escape
    generated = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    param_rows = "".join(
        f"<tr><th>{e(str(k).replace('_', ' ').title())}</th><td>{e(str(v))}</td></tr>"
        for k, v in (scenario.get("params") or {}).items()
    )
    metric_rows = ""
    for row in comparison_rows:
        if row["key"] in {"students_total", "sessions_scheduled", "peak_utilization_pct"}:
            continue
        metric_rows += (
            "<tr>"
            f"<td>{e(row['label'])}</td>"
            f"<td class='num'>{e(_val(row['baseline'], row['unit']))}</td>"
            f"<td class='num'>{e(_val(row['scenario'], row['unit']))}</td>"
            f"<td class='num'>{e(_val(row.get('plan'), row['unit']))}</td>"
            "</tr>"
        )
    explanation_html = "".join(
        f"<li class='{e(item['tone'])}'><strong>{e(item['title'])}.</strong> {e(item['text'])}</li>"
        for item in explanation.get("statements", [])
    )
    affected_rows = "".join(
        f"<tr><td>{e(str(item.get('label', '')))}</td><td>{e(str(item.get('reason', '')))}</td>"
        f"<td>{e(str(item.get('detail', '')))}</td><td>{e(str(item.get('slot_label', '')))}</td></tr>"
        for item in (scenario.get("affected") or {}).get("sessions", [])[:40]
    )
    plan_cards = ""
    for plan in plans:
        metrics = plan.get("metrics") or {}
        checks = (plan.get("audit") or {}).get("checks", [])
        passed = sum(1 for c in checks if c.get("status") == "pass")
        plan_cards += f"""
        <section class='plan'>
          <h3>Plan {e(plan.get('label', ''))} · {e(plan.get('name', ''))}</h3>
          <p class='muted'>{e(plan.get('solver_status', ''))} · objective {e(str(plan.get('objective', '—')))} · runtime {e(str(plan.get('runtime_seconds', '—')))}s</p>
          <p>Conflicts <b>{e(str(metrics.get('conflicts_total', '—')))}</b> · Capacity violations <b>{e(str(metrics.get('capacity_violations_count', '—')))}</b> · Energy <b>{e(str(metrics.get('energy_kwh', '—')))} kWh/wk</b> · Active utilisation <b>{e(str(metrics.get('active_room_utilization_pct', '—')))}%</b></p>
          <p>Hard-constraint audit: <b>{passed}/{len(checks) or '—'}</b> checks passed.</p>
        </section>"""
    rec = explanation.get("recommendation")
    rec_text = (
        f"Plan {e(rec['label'])} · {e(rec['name'])} is recommended. {e(rec['rationale'])}"
        if rec
        else "No candidate plan passed the hard-constraint audit."
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>MIRRORWORLD report · {e(scenario.get('name', ''))}</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, "Segoe UI", Inter, sans-serif; margin: 0; color: #0f1b2e; background: #f6f8fb; }}
  main {{ max-width: 980px; margin: 0 auto; background: white; padding: 48px 56px; }}
  header {{ border-bottom: 2px solid #0b1424; padding-bottom: 18px; margin-bottom: 28px; display:flex; justify-content:space-between; align-items:flex-end; gap:24px; }}
  h1 {{ font-size: 26px; margin: 0 0 4px; letter-spacing: .04em; }}
  h2 {{ font-size: 15px; text-transform: uppercase; letter-spacing: .1em; margin: 30px 0 10px; color:#0b4b63; }}
  h3 {{ font-size: 15px; margin: 0 0 6px; }}
  .brand {{ font-size: 11px; letter-spacing:.18em; text-transform: uppercase; color:#0b4b63; font-weight:700; }}
  .muted {{ color:#5b6b80; font-size: 12px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0 16px; }}
  th, td {{ border-bottom: 1px solid #dce4ee; padding: 7px 8px; text-align: left; vertical-align: top; }}
  th {{ background: #f1f5f9; font-weight: 600; }}
  td.num {{ font-variant-numeric: tabular-nums; text-align: right; }}
  .plan {{ border: 1px solid #dce4ee; border-radius: 8px; padding: 14px 16px; margin: 10px 0; page-break-inside: avoid; }}
  ul {{ padding-left: 20px; }}
  li {{ margin-bottom: 8px; font-size: 12.5px; line-height: 1.55; }}
  li.positive strong {{ color: #067a55; }}
  li.warning strong {{ color: #9a6100; }}
  li.critical strong {{ color: #b01e3c; }}
  .callout {{ background: #eef8fc; border-left: 3px solid #0784a8; padding: 12px 16px; font-size: 13px; line-height:1.55; }}
  footer {{ margin-top: 36px; padding-top: 14px; border-top: 1px solid #dce4ee; font-size: 11px; color:#5b6b80; }}
  @media print {{ body {{ background: white; }} main {{ padding: 0; max-width: none; }} @page {{ margin: 16mm; }} }}
</style></head>
<body><main>
<header>
  <div><div class="brand">MIRRORWORLD · Campus digital twin</div><h1>{e(scenario.get('name', 'Scenario report'))}</h1>
  <div class="muted">Scenario report · generated {e(generated)} · synthetic demo dataset</div></div>
  <div class="muted">Fall 2026 · Week 7</div>
</header>

<div class="callout"><strong>Recommendation.</strong> {rec_text}</div>

<h2>Scenario configuration</h2>
<table><tbody>{param_rows}</tbody></table>

<h2>Measured outcomes</h2>
<table><thead><tr><th>Metric</th><th>Baseline</th><th>Scenario existing</th><th>Selected plan</th></tr></thead><tbody>{metric_rows}</tbody></table>

<h2>Computed findings</h2>
<ul>{explanation_html}</ul>

<h2>Candidate recovery plans</h2>
{plan_cards}

<h2>Affected sessions</h2>
<table><thead><tr><th>Session</th><th>Reason</th><th>Detail</th><th>Slot</th></tr></thead><tbody>{affected_rows or '<tr><td colspan="4">No affected sessions recorded.</td></tr>'}</tbody></table>

<h2>Assumptions and warnings</h2>
<ul>{''.join(f'<li>{e(a)}</li>' for a in scenario.get('assumptions') or [])}{''.join(f'<li><strong>Warning.</strong> {e(w)}</li>' for w in scenario.get('warnings') or [])}</ul>

<footer>
  Generated by MIRRORWORLD. All values are computed by the simulation and CP-SAT engines from the synthetic demo campus.
  Energy values are modeled estimates and movement is a simplified distance model. Print or save as PDF from the browser.
</footer>
</main></body></html>"""


def _val(value, unit: str) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:,.1f} {unit}".strip()
    return f"{value:,} {unit}".strip()
