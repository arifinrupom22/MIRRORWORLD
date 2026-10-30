"""Campus dependency graph and impact traversal.

Edges are derived exclusively from the campus model: located-in, teaches,
attends, enrolled-in, assigned-to, requires and has-equipment. No inferred or
random connections are added.
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timezone

from . import catalog
from .campus import Campus, allowed_rooms_for_course
from .simulation import build_context

TYPE_ORDER = ["building", "room", "teacher", "group", "course", "session", "equipment"]


def _node_id(kind: str, identifier: str) -> str:
    return f"{kind}:{identifier}"


def build_graph(campus: Campus, schedule: list[dict] | None = None, scenario: dict | None = None) -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def add_node(kind: str, identifier: str, label: str, sublabel: str, meta: dict | None = None) -> str:
        nid = _node_id(kind, identifier)
        if nid not in nodes:
            nodes[nid] = {
                "id": nid,
                "type": kind,
                "raw_id": identifier,
                "label": label,
                "sublabel": sublabel,
                "meta": meta or {},
                "degree": 0,
                "affected": False,
                "severity": None,
            }
        return nid

    def add_edge(source: str, target: str, relation: str) -> None:
        if source == target:
            return
        edges.append({"id": f"{source}->{target}:{relation}", "source": source, "target": target, "relation": relation})

    for b in campus.buildings:
        add_node("building", b["id"], b["name"], b["zone"], {"purpose": b["purpose"], "floors": b["floors"]})
    equipment_tags = set()
    for r in campus.rooms:
        add_node(
            "room",
            r["id"],
            r["code"],
            f"{r['kind'].title()} · {r['capacity']} seats",
            {
                "name": r["name"],
                "kind": r["kind"],
                "capacity": r["capacity"],
                "building_id": r["building_id"],
                "lab_types": r["lab_types"],
                "equipment": r["equipment"],
                "power_kw": r["power_kw"],
                "floor": r["floor"],
            },
        )
        add_edge(_node_id("room", r["id"]), _node_id("building", r["building_id"]), "located_in")
        for tag in r["equipment"]:
            equipment_tags.add(tag)
            add_edge(_node_id("room", r["id"]), _node_id("equipment", tag), "has_equipment")
    for t in campus.teachers:
        add_node(
            "teacher",
            t["id"],
            t["name"],
            f"{t['department']} · {t['title']}",
            {"max_weekly_hours": t["max_weekly_hours"], "department": t["department"], "unavailable": t["unavailable"]},
        )
    for g in campus.groups:
        add_node(
            "group",
            g["id"],
            g["name"],
            f"{g['department']} · {g['size']} students",
            {"size": g["size"], "department": g["department"], "home_building_id": g["home_building_id"]},
        )
    for c in campus.courses:
        add_node(
            "course",
            c["id"],
            c["code"],
            c["title"],
            {
                "teacher_id": c["teacher_id"],
                "department": c["department"],
                "needs_lab": c["needs_lab"],
                "weekly_sessions": c["weekly_sessions"],
                "length": c["length"],
                "required_equipment": c["required_equipment"],
            },
        )
        add_edge(_node_id("course", c["id"]), _node_id("teacher", c["teacher_id"]), "taught_by")
        for tag in c["required_equipment"]:
            equipment_tags.add(tag)
            add_edge(_node_id("course", c["id"]), _node_id("equipment", tag), "requires")
    for tag in sorted(equipment_tags):
        add_node("equipment", tag, tag.replace("_", " ").title(), "Equipment / capability", {"tag": tag})

    for gc in campus.group_courses:
        add_edge(_node_id("group", gc["group_id"]), _node_id("course", gc["course_id"]), "enrolled_in")

    if schedule is None:
        from .simulation import simulate

        schedule = simulate(campus, {}, name="Baseline")["schedule"]

    for s in schedule:
        sid = s.get("id")
        if not sid:
            continue
        course = campus.course_index.get(s.get("course_id") or "")
        group = campus.group_index.get(s.get("group_id") or "")
        teacher = campus.teacher_index.get(s.get("teacher_id") or "")
        room = campus.room_index.get(s.get("room_id") or "") if s.get("room_id") else None
        label = f"{(course['code'] if course else s.get('course_code', sid))} · {(group['name'] if group else s.get('group_name', ''))}"
        slot = "Displaced"
        if s.get("day") is not None and s.get("start_slot") is not None:
            slot = f"{catalog.DAYS[s['day']]['short']} {catalog.TIME_SLOTS[s['start_slot']]['start']}"
        add_node(
            "session",
            sid,
            label,
            f"{slot}{' · ' + room['code'] if room else ''}",
            {
                "day": s.get("day"),
                "start_slot": s.get("start_slot"),
                "length": s.get("length"),
                "room_id": s.get("room_id"),
                "displaced": s.get("displaced", False),
                "displaced_reason": s.get("displaced_reason"),
            },
        )
        if course:
            add_edge(_node_id("session", sid), _node_id("course", course["id"]), "scheduled_as")
        if group:
            add_edge(_node_id("session", sid), _node_id("group", group["id"]), "attended_by")
        if teacher:
            add_edge(_node_id("session", sid), _node_id("teacher", teacher["id"]), "taught_by")
        if room:
            add_edge(_node_id("session", sid), _node_id("room", room["id"]), "assigned_to")

    if scenario:
        affected = scenario.get("affected") or {}
        by_type = {
            "room": affected.get("resources", {}).get("rooms", []),
            "teacher": affected.get("resources", {}).get("teachers", []),
            "group": affected.get("resources", {}).get("groups", []),
            "course": affected.get("resources", {}).get("courses", []),
        }
        for kind, items in by_type.items():
            for item in items:
                nid = _node_id(kind, item["id"])
                if nid in nodes:
                    nodes[nid]["affected"] = True
                    nodes[nid]["severity"] = "critical" if "unavailable" in (item.get("reason") or "").lower() else "warning"
                    nodes[nid]["impact_reason"] = item.get("reason")
        for item in affected.get("sessions", []):
            nid = _node_id("session", item["session_id"])
            if nid in nodes:
                nodes[nid]["affected"] = True
                nodes[nid]["severity"] = item.get("severity", "warning")
                nodes[nid]["impact_reason"] = item.get("reason")

    degree: dict[str, int] = defaultdict(int)
    for edge in edges:
        degree[edge["source"]] += 1
        degree[edge["target"]] += 1
    for nid, node in nodes.items():
        node["degree"] = degree[nid]

    counts = defaultdict(int)
    for node in nodes.values():
        counts[node["type"]] += 1
    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "counts": dict(counts),
        "scenario_id": scenario.get("id") if scenario else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "synthetic-demo",
    }


def impact_analysis(campus: Campus, graph: dict, node_id: str, scenario_params: dict | None = None, depth: int = 3) -> dict:
    if not any(n["id"] == node_id for n in graph["nodes"]):
        raise KeyError(node_id)
    adjacency: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for edge in graph["edges"]:
        adjacency[edge["source"]].append((edge["target"], edge["relation"]))
        adjacency[edge["target"]].append((edge["source"], edge["relation"]))
    levels: dict[str, int] = {node_id: 0}
    queue = deque([node_id])
    while queue:
        current = queue.popleft()
        if levels[current] >= depth:
            continue
        for neighbor, _relation in adjacency[current]:
            if neighbor not in levels:
                levels[neighbor] = levels[current] + 1
                queue.append(neighbor)
    node_by_id = {n["id"]: n for n in graph["nodes"]}
    direct = [node_by_id[nid] for nid, level in levels.items() if level == 1]
    indirect = [node_by_id[nid] for nid, level in levels.items() if level >= 2]
    sessions = [n for n in direct + indirect if n["type"] == "session"]
    ctx = build_context(campus, scenario_params or {})
    alternatives = []
    affected_courses = {n["raw_id"] for n in direct + indirect if n["type"] == "course"}
    affected_rooms = {n["raw_id"] for n in direct + indirect if n["type"] == "room"}
    for course_id in affected_courses:
        course = campus.course_index[course_id]
        for room in campus.rooms:
            if room["id"] in affected_rooms or room["id"] not in ctx["available_rooms"]:
                continue
            if allowed_rooms_for_course(course, room, max(ctx["group_sizes"].values())):
                alternatives.append(
                    {
                        "room_id": room["id"],
                        "code": room["code"],
                        "building_id": room["building_id"],
                        "capacity": room["capacity"],
                        "kind": room["kind"],
                        "course_code": course["code"],
                    }
                )
        if len(alternatives) >= 10:
            break
    summary = defaultdict(int)
    for n in direct:
        summary[n["type"]] += 1
    indirect_summary = defaultdict(int)
    for n in indirect:
        indirect_summary[n["type"]] += 1
    return {
        "node": node_by_id[node_id],
        "direct": direct,
        "indirect": indirect,
        "sessions": sessions,
        "alternatives": alternatives[:10],
        "summary": {
            "direct_nodes": len(direct),
            "indirect_nodes": len(indirect),
            "sessions": len([n for n in direct + indirect if n["type"] == "session"]),
            "groups": len([n for n in direct + indirect if n["type"] == "group"]),
            "teachers": len([n for n in direct + indirect if n["type"] == "teacher"]),
            "rooms": len([n for n in direct + indirect if n["type"] == "room"]),
            "courses": len([n for n in direct + indirect if n["type"] == "course"]),
        },
        "depth": depth,
        "direct_by_type": dict(summary),
        "indirect_by_type": dict(indirect_summary),
        "dataset": "synthetic-demo",
    }
