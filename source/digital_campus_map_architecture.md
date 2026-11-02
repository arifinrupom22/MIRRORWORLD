# MIRRORWORLD Digital Campus — As-Built Map Architecture

**Status:** implemented in `frontend/src/pages/DigitalCampusPage.tsx`
**Map basis:** the campus dataset's stored `building.map` boxes — not surveyed geography
**Movement basis:** `backend/app/movement.py`, surfaced through `GET /api/movement`

This document supersedes an earlier draft that proposed copying a third-party control-room
dashboard. That draft would have required inventing water features, courts, parking counts,
asset values and energy readings that do not exist in the MIRRORWORLD dataset. Copying those
visuals produced fabricated metrics and translated labels, so the draft was rejected.

## 1. Non-negotiable rules

1. The campus payload is the only source of buildings, rooms, capacities, schedules and
   distances. The map does not add facilities that the payload does not contain.
2. Building positions come from `buildings[].map` (`{x, y, w, h}`) in the existing dataset.
   They are **illustrative schematic placement**, not cadastral or GPS coordinates.
3. Every visible number is either a stored value or a deterministic calculation. No asset
   totals, energy figures, fault rows, parking counts or "live" sensor values are invented.
4. All user-facing text is English. No labels are copied from a reference image.
5. Movement is labelled as a timetable-derived estimate. It is not real-time tracking.

## 2. Page composition

`DigitalCampusPage` keeps the existing MIRRORWORLD design system:

| Region | Content | Data source |
| --- | --- | --- |
| Header | Campus name, dataset badge, building count, edit/simulate actions | `/api/campus` |
| KPI row | Buildings, teaching spaces, seat capacity, busy-at-slot, baseline collisions | `/api/campus` |
| Filter bar | Room search, kind, floor | `/api/campus` |
| Map panel | Schematic campus plan, building selection, movement overlay | `buildings[].map`, `/api/movement` |
| Student movement panel | Slot flow summary, transition rows, engine warnings | `/api/movement?day=&slot=` |
| Availability board | Room occupancy for the selected day/slot | `baseline_schedule` |
| Right inspector | Building/room detail, utilisation, sessions | `baseline_schedule` |
| Space register | Filtered room table | `/api/campus` |

## 3. Map rendering

- SVG viewBox: `0 0 1000 640`.
- Each building is drawn from its stored `map` box; selection is handled by the existing
  `selectedBuilding` state.
- Roads and grid lines are decorative schematic circulation, explicitly labelled
  "illustrative site plan · not to scale".
- Labels show the stored code, name, zone, room count, lab count, seat count, floors and
  weekly utilisation. No area, cost or live-status values are shown.
- The map legend distinguishes selection, filtered-out blocks, north, and movement states.
- Fills and strokes resolve from theme variables (`--c-mapBlock`, `--c-mapStroke`,
  `--c-mapRoad`, `--c-mapLane`, `--c-mapHatch`) so the plan is legible in both Bright Mode
  (default) and Dark Mode; the previous build hard-coded a dark palette and rendered as a
  dark island on the light canvas.

## 4. Movement overlay

For the selected day and slot the page requests `/api/movement?day={day}&slot={slot}`.
The backend returns transitions **arriving into** that slot. The client:

1. Drops same-building transitions from the drawn routes (toggleable in the list).
2. Groups the remaining transitions by directed building pair.
3. Draws a quadratic curve between the two buildings' box edges, offset to one side so
   opposite directions never overprint.
4. Encodes severity by colour: feasible walk (cyan), tight transfer (amber), insufficient
   time (red), unknown distance (grey dashed).
5. Encodes volume by stroke width (`1.4 + min(4.2, log2(studentTrips + 1))`).
6. Shows the student-trip count only for the selected route to keep the plan legible.
7. Opens an inline detail strip with cohort, courses, times, gap, walk time, distance and
   the derived feasibility state.

Numbers in the movement panel are sums over the returned transitions. "Student trips"
counts transition events weighted by cohort size, not unique students; the panel says so.

## 5. Data-integrity notes

- Missing inter-building distances stay `null` and are rendered as "distance unknown".
- Cross-day gaps are shown in hours; they are not clamped or hidden.
- The baseline payload is never mutated by selecting a day, slot, building or route.
- No fallback movement values are generated in the browser.

## 6. Explicit non-goals

- No 3D photo-realistic campus, water feature, sports court, parking lot, tree cluster or
  gate is rendered, because the dataset has no geometry for them.
- No Japanese or Chinese labels. The interface is English only.
- No "main gate", "library", "mosque", "hostel" or other NITER facilities are drawn unless
  they are added to the campus dataset with real identifiers and map boxes.
- No fabricated energy, asset-value, fault or vehicle panels.

## 7. Verification checklist

- Campus payload loads and all four dataset buildings render with stored names.
- Movement requests return 200 for every day/slot combination.
- Route geometry uses the same `building.map` coordinate system as the buildings.
- Selecting a route highlights it and opens the transition strip.
- Toggling the overlay removes/restores the routes without removing buildings.
- Day/slot buttons update both availability and movement.
- Production build and TypeScript checks pass; no CJK characters appear in `frontend/src`.
