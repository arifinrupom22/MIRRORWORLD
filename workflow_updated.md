# MIRRORWORLD --- Project Workflow & Presentation Guide

> **Project:** MIRRORWORLD --- Smart Campus Digital Twin & Disruption
> Recovery Platform\
> **Tagline:** Test the future of your campus before you change it.\
> **Purpose of this document:** A practical guide for understanding the
> project, explaining its workflow, demonstrating it, and answering
> judge questions.

------------------------------------------------------------------------

## 0. Important note about this guide (updated 2 November 2026)

This guide has been updated after reviewing the publicly accessible MIRRORWORLD GitHub repository and its README/source structure. The code review improves the earlier project description, but it is **not a substitute for running the application and tests locally**.

Use these evidence labels:

- **Repository-reviewed:** visible in the public repository or its documentation.
- **Runtime-verified:** personally tested by the team on the presentation machine. Only use this label after testing.
- **Prototype / modeled:** operates on the project's configured model or synthetic dataset, not live NITER infrastructure.

Important boundaries:

- The project documentation describes a synthetic/model campus dataset. Do not call it live NITER operational data.
- Do not claim live IoT, GPS, individual student tracking, or continuously synchronized campus monitoring.
- The 3D campus view is a schematic visualization generated from stored building footprint/model data; do not present it as a surveyed architectural replica.
- The repository documentation indicates that authentication and multi-user synchronization are not currently implemented. Do not claim role-based access or production multi-user deployment.
- A source file or API route existing does not prove that its feature works in the running application. Verify it before the demo.

------------------------------------------------------------------------

# REPOSITORY REVIEW UPDATE — 2 NOVEMBER 2026

## What the public repository shows

The repository's documented architecture is more specific than the earlier draft. The project is a decision-support prototype built around a modeled campus, disruption scenarios, scheduling constraints, movement estimates, optimization, and AI-assisted explanation.

### Reviewed technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Interactive web application |
| Styling / UI | Tailwind CSS | Interface styling |
| 3D visualization | Three.js | Schematic campus visualization |
| Frontend state / data | Zustand, TanStack Query | Client state and API data handling |
| Backend | Python, FastAPI | Application logic and HTTP APIs |
| Data access | SQLAlchemy, SQLite | ORM and local relational storage |
| Optimization | Google OR-Tools CP-SAT | Constraint-based schedule/recovery search |
| AI layer | Provider-configurable service | Natural-language assistance grounded in backend data |

Check the current lockfiles and README if package versions change. Do not list a technology in the presentation unless it is still present in the current branch.

### Important backend modules visible in the repository

| File / module | Responsibility |
|---|---|
| `backend/app/models.py` | Data / persistence models |
| `backend/app/campus.py` | Campus model and data handling |
| `backend/app/simulation.py` | Scenario simulation |
| `backend/app/optimizer.py` | CP-SAT optimization and recovery strategies |
| `backend/app/movement.py` | Modeled student movement analytics |
| `backend/app/alerts.py` | Alert generation |
| `backend/app/recommendations.py` | Recommendations |
| `backend/app/difference.py` | Baseline-versus-scenario differences |
| `backend/app/ai.py` | Mirror AI provider and response logic |
| `backend/app/api.py` | FastAPI route layer |

These are useful files to open when explaining the implementation. Explain their responsibilities in your own words; do not claim a particular function is correct merely because the file exists.

### Optimizer: what to explain accurately

The repository documents three recovery strategies:

- **Plan B — Space utilization:** seeks to improve use of available rooms/resources.
- **Plan C — Energy demand:** seeks to reduce modeled energy demand.
- **Plan D — Balanced recovery:** balances the modeled recovery objectives.

The optimizer uses OR-Tools CP-SAT. The code review also found explicit non-overlap constraints (including `AddNoOverlap`) in the scheduling model. The exact objective weights and every constraint should be read from `backend/app/optimizer.py` before answering a detailed mathematical question.

The project documents an audited heuristic fallback. Be precise about result status:

- `OPTIMAL` means the solver proved optimality for the formulated model.
- `FEASIBLE` means a constraint-satisfying solution was found, but optimality is not proven.
- `FEASIBLE_HEURISTIC` means the fallback heuristic produced a feasible candidate that was audited.
- Do not describe a heuristic result as a CP-SAT optimum.

### Mirror AI: verified design boundaries

The repository's AI service is designed to use backend-provided campus facts and analysis results rather than inventing numeric results. The documented design includes provider configuration, backend-side credentials, and deterministic fallback behavior when an external provider is unavailable.

Before the presentation, inspect the current `.env` configuration and test the provider status. Say “Gemini/Gemma-powered” only if the configured provider actually responds successfully during your test. Otherwise explain that the AI layer has a deterministic fallback and that external provider integration is configurable.

Never commit or expose `.env`, API keys, tokens, or credentials. A frontend environment variable is not a safe place for a private server API key.

### Digital Campus: what the 3D view represents

The 3D view is a schematic campus visualization derived from stored building footprint/model data. It helps users understand campus layout and interact with the model. It is not a surveyed CAD/BIM model, photogrammetric reconstruction, or proof of exact building dimensions unless the team has independently validated those source measurements.

### Current limitations to disclose

- The campus dataset is synthetic/model data.
- No live IoT or GPS tracking is established by the repository documentation.
- The 3D map is schematic, not an exact architectural survey.
- Repository documentation indicates authentication and multi-user synchronization are not currently implemented.
- The system is a prototype / decision-support platform, not a production campus management system.

### Repository hygiene item to inspect

The repository listing contains an unusually named file:

`CUsersDSTAppDataLocalTempapi_alerts.json`

Check whether this is an accidental temporary/export file. If it is not required by the project, remove it from the repository after confirming it is not used. Also inspect tracked files for `.env`, API keys, database files containing private data, local caches, and generated build artifacts. If a real secret was ever pushed, revoke/rotate it; deleting it in a later commit does not remove it from Git history.

---

# PART A --- Understand MIRRORWORLD

## 1. What is MIRRORWORLD?

MIRRORWORLD is a **Smart Campus Digital Twin and Disruption Recovery
Platform**.

It creates a digital model of a campus and allows users to explore what
may happen when campus conditions change. For example:

-   What if an academic building becomes unavailable?
-   What if student enrollment increases?
-   What if classrooms become unavailable?
-   What if the timetable creates tight transitions between classes?
-   Can the campus schedule be improved after a disruption?

The platform models campus resources and academic operations, detects
problems, simulates disruptions, uses optimization to explore feasible
alternatives, compares outcomes, and helps users understand the results.

### Simple explanation for a judge

"Imagine a university wants to close one academic building for
renovation. Before making the change, administrators need to understand
how that decision could affect classrooms, schedules, and student
movement. MIRRORWORLD provides a digital environment where they can
model that disruption, analyze its impact, explore alternative
arrangements, and make a more informed decision before applying the
change in the real world."

## 2. The problem we are addressing

Campus decisions can affect several connected things:

1.  **Buildings and rooms:** A building or room may become unavailable.
2.  **Timetables:** Classes need suitable rooms and time slots.
3.  **Resources:** Room capacity and availability can limit possible
    arrangements.
4.  **Student movement:** Consecutive classes in different buildings may
    create tight transitions.
5.  **Disruptions:** A change in one part of the campus can affect other
    parts.

Making decisions without examining these dependencies can create
conflicts, inefficient schedules, and avoidable disruption.

MIRRORWORLD aims to make these consequences easier to inspect before a
real-world decision is made.

## 3. What makes it a Digital Twin?

A Digital Twin is a digital representation of a real-world system that
can be used to understand, analyze, and explore that system.

In MIRRORWORLD:

-   The **physical-world subject** is a campus and its academic
    operations.
-   The **digital representation** is the modeled campus data,
    buildings, rooms, schedules, constraints, and relationships.
-   The **experimentation layer** lets users introduce hypothetical
    changes.
-   The **analysis layer** detects impacts and evaluates possible
    alternatives.
-   The **decision-support layer** presents comparisons and
    explanations.

Important limitation: the current project uses a **synthetic/model
dataset**. It is a campus digital-twin prototype, not a continuously
synchronized live replica of NITER.

------------------------------------------------------------------------

# PART B --- Complete Project Workflow

## 4. The main workflow

The main MIRRORWORLD workflow is:

**MODEL → DETECT → SIMULATE → OPTIMIZE → COMPARE → MIRROR AI**

``` text
                 CAMPUS MODEL
                      |
                      v
               DETECT PROBLEMS
                      |
                      v
             CREATE A DISRUPTION
                      |
                      v
              RUN A SIMULATION
                      |
                      v
             OPTIMIZE ALTERNATIVES
                      |
                      v
          COMPARE BASELINE AND SCENARIO
                      |
                      v
                MIRROR AI
                      |
                      v
           INFORMED HUMAN DECISION
```

### Step 1 --- MODEL

The platform starts with a structured digital model of campus
operations.

The model may contain:

-   Buildings and their identifiers.
-   Rooms and room capacities.
-   Academic sessions and time slots.
-   Student cohorts or enrollment counts.
-   Building-to-building distance data.
-   Constraints and relationships used by the simulation and optimizer.

**Why this matters:** Without a structured model, the platform cannot
calculate the consequences of a campus change.

### Step 2 --- DETECT

The platform checks the modeled campus state for problems and
constraints.

Examples include:

-   Resource availability problems.
-   Schedule or room conflicts.
-   Capacity-related issues.
-   Disruption-related impacts.
-   Tight student movement transitions.

The project has reported modules for state handling, differences,
alerts, recommendations, and severity.

### Step 3 --- SIMULATE

The user introduces a hypothetical disruption or changes scenario
parameters.

Examples:

-   Make a modeled building unavailable.
-   Change an available resource.
-   Increase modeled enrollment.
-   Introduce another supported disruption.

The backend evaluates the changed state against the campus model.

**Key idea:** The user can explore a possible future without changing
the real campus.

### Step 4 --- OPTIMIZE

The platform attempts to find a better or feasible arrangement under the
modeled constraints.

The project reports using:

-   **Google OR-Tools CP-SAT** for constraint programming and
    optimization.
-   An audited heuristic fallback when the primary optimization route
    cannot provide a usable result.

Understand these result labels:

-   **OPTIMAL:** The solver found an optimal solution for the formulated
    model.
-   **FEASIBLE:** A solution satisfies the modeled constraints, but
    optimality is not established.
-   **FEASIBLE_HEURISTIC:** A feasible result was produced through the
    project's heuristic fallback.
-   **UNKNOWN:** No conclusive result is available.

Never call a heuristic result an optimal CP-SAT result.

### Step 5 --- COMPARE

The platform compares the baseline campus state with the disrupted or
optimized scenario.

The purpose is to answer:

-   What changed?
-   Which resources were affected?
-   Did the disruption create new problems?
-   Did the proposed arrangement improve the modeled situation?
-   What trade-offs remain?

The comparison should use actual backend results---not values invented
by an AI model.

### Step 6 --- MIRROR AI

Mirror AI is intended to be the natural-language explanation and
decision-support layer.

Its role is to help a user understand:

-   Campus model information.
-   Disruptions and scenario proposals.
-   Simulation differences.
-   Alerts and recommendations.
-   Optimization results.
-   Student movement analytics.

The AI should explain evidence and limitations. It must not invent
numerical results or claim that an action was executed if it was not.

**Provider note:** The planned architecture supports Google Gemini/Gemma
through backend configuration, with a deterministic fallback when no API
key is configured. Before the presentation, verify which provider is
actually configured and working. If no key is configured, describe
Mirror AI as operating in fallback mode---not as a live Gemini/Gemma
integration.

------------------------------------------------------------------------

# PART C --- Major Modules and Technologies

## 5. Technology stack

  -----------------------------------------------------------------------
  Technology                          Role in MIRRORWORLD
  ----------------------------------- -----------------------------------
  React 19                            Builds the interactive frontend
                                      interface

  TypeScript                          Adds type safety to frontend code

  Vite                                Frontend development server and
                                      build tooling

  Tailwind CSS                        Frontend styling

  Three.js                            Schematic 3D campus visualization

  Zustand / TanStack Query            Frontend state and API data handling

  Python / FastAPI                    Backend application and API layer

  SQLAlchemy / SQLite                 ORM and local relational storage

  Google OR-Tools CP-SAT              Constraint-based optimization

  Provider-configurable AI service    Natural-language assistance grounded
                                      in backend data when configured
  -----------------------------------------------------------------------

Do not claim every listed component is active in the final deployed
build without checking the repository and runtime.

## 6. Frontend --- what users interact with

The frontend is the user-facing part of MIRRORWORLD.

It is responsible for:

-   Displaying campus information.
-   Letting users inspect and select scenarios.
-   Showing alerts and recommendations.
-   Presenting simulation and comparison results.
-   Visualizing student movement.
-   Providing the Mirror AI interface.

React builds the UI from reusable components. TypeScript helps catch
type-related mistakes during development. Vite supports the frontend
development and production build process.

## 7. Backend --- where the core logic lives

The backend handles the application's data and decision logic.

FastAPI exposes endpoints that the frontend can call. Python services
process the modeled campus state, calculate differences, generate
alerts, evaluate movement, and coordinate optimization.

Reported modules include:

-   `backend/app/state.py`
-   `backend/app/difference.py`
-   `backend/app/alerts.py`
-   `backend/app/recommendations.py`
-   `backend/app/severity.py`
-   `backend/app/templates.py`
-   `backend/app/movement.py`

These filenames are based on prior development reports. Confirm that
they still exist in the current repository before showing them to
judges.

## 8. Database

The project reports using SQLAlchemy with SQLite.

In simple terms:

-   SQLite stores structured project data locally.
-   SQLAlchemy provides Python code with a structured way to interact
    with the database.
-   The backend uses application models and services to read or update
    the data.

Do not claim that the system currently uses a cloud database or live
university database unless the current implementation confirms it.

## 9. Optimization --- OR-Tools CP-SAT

A central technical element of MIRRORWORLD is constraint-based
optimization.

A campus scheduling problem can involve constraints such as:

-   A room must be available.
-   A room must have sufficient capacity.
-   A session must be assigned to a valid time and resource.
-   Conflicting sessions must not use the same unavailable resource at
    the same time.

The CP-SAT solver searches for assignments that satisfy the constraints
and optimize the defined objective.

**How to explain it simply:**

"Instead of asking an AI chatbot to guess a schedule, we formulate the
scheduling problem as variables, constraints, and an objective. OR-Tools
CP-SAT then searches for a mathematically feasible or optimal solution
under that model."

Be prepared to explain the actual objective function and constraints
from the source code if a judge asks for technical details. Do not
invent them.

------------------------------------------------------------------------

# PART D --- Student Movement Analytics

## 10. What does the movement module do?

The reported Phase 3 implementation analyzes modeled student movement
between consecutive academic sessions.

It uses:

-   Effective timetable sessions.
-   Cohort or enrollment counts.
-   Actual start and end times from the configured time-slot data.
-   Modeled building-to-building distances.

The reported walking-speed assumption is **84 metres per minute**.

### What is a tight transition?

A tight transition occurs when the time between consecutive sessions may
be insufficient for the modeled walking time.

For example, if a student cohort has one class in one building and
another class shortly afterward in a different building, the system can
estimate whether the transition is tight.

### What does the system calculate?

The reported implementation includes:

-   Directed movement routes.
-   Distance estimates.
-   Walking-time estimates.
-   Tight/feasible transition indicators where sufficient data exists.
-   Unknown-distance warnings.
-   Student-weighted movement totals.

A student-weighted distance total accounts for both route distance and
the number of students represented by that route.

### Important limitations

-   This is **not live GPS tracking**.
-   It does not show the real-time location of individual students.
-   It depends on the modeled timetable and distance data.
-   Unknown building distances should remain unknown, not be guessed.
-   The walking-time result is an estimate based on the configured speed
    assumption.

### Reported movement API endpoints

-   `GET /api/movement`
-   `GET /api/scenarios/{scenario_id}/movement`

Confirm the current API documentation before presenting these exact
routes.

------------------------------------------------------------------------

# PART E --- Mirror AI: How to Explain It

## 11. What is Mirror AI?

Mirror AI is designed to be the intelligent explanation and interaction
layer of MIRRORWORLD.

It should connect natural-language questions with the platform's actual
campus data and analysis services.

### Example

A user asks:

"What happens if Academic Building 1 becomes unavailable?"

A safe workflow is:

1.  Identify the building using the actual campus model.
2.  Convert the request into a structured scenario proposal.
3.  Validate the proposed change against backend rules.
4.  Show the proposed change to the user.
5.  Ask for explicit confirmation.
6.  Run the existing simulation workflow after confirmation.
7.  Present actual backend results.
8.  Explain the impact and possible alternatives.

The AI should not silently change scenarios or fabricate simulation
results.

### AI provider and fallback

The intended provider architecture is:

-   Google Gemini/Gemma API when configured.
-   Backend-only environment variables for credentials.
-   Deterministic fallback responses when no provider is configured or
    available.

Never show API keys in the frontend, screenshots, source control, or
presentation.

### What to say if Gemini/Gemma is not connected

"Mirror AI is designed with a provider-based architecture. The
application can still provide deterministic, backend-grounded assistance
when an external AI provider is not configured. The Google AI
integration can be activated through secure backend environment
configuration."

Do not claim live LLM reasoning unless you have tested it successfully.

------------------------------------------------------------------------

# PART F --- How to Run and Verify Before the Presentation

## 12. Pre-presentation technical checklist

Use the actual project root:

`F:\BCS ICT FEST Project Showcase`

Open PowerShell.

### A. Check the repository

``` powershell
cd "F:\BCS ICT FEST Project Showcase"
git status
```

Check whether there are uncommitted changes. Do not reset or discard
changes just to make the output clean.

### B. Backend tests

``` powershell
cd "F:\BCS ICT FEST Project Showcase\backend"
pytest -q
```

If the project uses a different test command or virtual environment,
follow its README.

### C. Frontend build

``` powershell
cd "F:\BCS ICT FEST Project Showcase\frontend"
npm install
npm run build
```

Only run `npm install` if dependencies have not already been installed
or the lockfile requires it.

### D. Lint

``` powershell
npm run lint
```

If the project does not define a lint script, record that honestly. Do
not claim lint passed.

### E. Start the application

Use the exact run commands from the project's README. Do not guess a
start command if the scripts differ.

### F. Verify these features manually

-   [ ] Frontend opens without a blank screen.
-   [ ] Backend starts without errors.
-   [ ] Campus model/map loads.
-   [ ] Scenario list or scenario selection works.
-   [ ] A supported disruption can be selected or created.
-   [ ] Simulation completes and shows results.
-   [ ] Optimization returns a real status.
-   [ ] Baseline and scenario comparison displays actual values.
-   [ ] Alerts and recommendations load.
-   [ ] Movement analytics loads and shows its assumptions.
-   [ ] Mirror AI displays its real provider/fallback state.
-   [ ] No important button is decorative or broken.
-   [ ] No Japanese or unintended language text remains in the English
    UI.
-   [ ] No API key or secret is visible in browser code or Git.

**If a feature fails:** skip that part of the live demo. A smaller
reliable demonstration is better than a broken ambitious one.

------------------------------------------------------------------------

# PART G --- Presentation Workflow

## 13. Recommended live demonstration sequence

Do not click randomly through the application. Follow one story from
beginning to end.

### Demo story: A campus building becomes unavailable

**1. Opening --- 20 to 30 seconds**

Say:

"Universities are complex systems. A change in one building can affect
classrooms, timetables, resources, and student movement. MIRRORWORLD is
designed to help explore those effects before making a real-world
decision."

**2. Show the campus model --- 30 to 45 seconds**

Explain that the platform represents campus resources and academic
operations using a structured model.

Do not claim it is live synchronized with the university.

**3. Show the baseline --- 30 seconds**

Explain that this is the starting modeled condition against which a
disruption can be compared.

**4. Introduce a disruption --- 30 to 45 seconds**

Choose one supported scenario. For example, make a modeled academic
building unavailable.

Explain that this is a hypothetical experiment, not a real campus
change.

**5. Run the simulation --- 45 to 60 seconds**

Show the actual result. Explain what changed and which constraints or
resources were affected.

**6. Show optimization --- 45 to 60 seconds**

Explain that the optimizer searches for a feasible or better arrangement
under the modeled constraints.

Read the actual status. Do not call every result optimal.

**7. Compare outcomes --- 30 to 45 seconds**

Show baseline versus disrupted/optimized results. Point to actual
differences, not just colors or animations.

**8. Show movement analytics --- 30 to 45 seconds**

Explain how consecutive sessions, modeled distances, and estimated
walking times help identify tight transitions.

**9. Show Mirror AI --- 30 to 60 seconds**

Ask a question that the currently configured AI mode can answer. Point
out the evidence and limitations.

**10. Close --- 15 to 20 seconds**

Say:

"MIRRORWORLD does not replace campus decision-makers. It gives them a
way to model disruptions, understand their consequences, compare
alternatives, and make more informed decisions before implementing
changes."

### If time is very short

Prioritize:

1.  Problem.
2.  Campus model.
3.  One disruption.
4.  Simulation.
5.  Optimization.
6.  Comparison.
7.  One AI explanation.

Do not spend most of the presentation navigating menus.

------------------------------------------------------------------------

# PART H --- Presentation Script

## 14. Short opening script

"Good morning respected judges.

We are presenting MIRRORWORLD, a Smart Campus Digital Twin and
Disruption Recovery Platform.

A campus is a connected system. Buildings, classrooms, schedules,
resources, and student movement all affect one another. When a building
becomes unavailable or enrollment changes, the consequences can spread
across the campus.

Our goal is to help decision-makers explore these possible consequences
before making real-world changes.

MIRRORWORLD models campus operations, detects issues, simulates
disruptions, explores optimized alternatives, compares outcomes, and
provides explanations through Mirror AI.

Let me demonstrate how it works."

## 15. Short closing script

"To summarize, MIRRORWORLD turns campus disruption planning into a
structured, data-driven workflow. It helps users understand the current
modeled situation, test hypothetical changes, examine their effects, and
compare possible alternatives.

It is a decision-support prototype---not a replacement for human
judgment or a live campus management system.

Thank you."

------------------------------------------------------------------------

# PART I --- Judge Questions and Suggested Answers

## 16. Basic project questions

### Q1. What is MIRRORWORLD?

**Answer:** MIRRORWORLD is a Smart Campus Digital Twin and Disruption
Recovery Platform. It models campus operations and lets users explore
hypothetical disruptions, analyze their effects, optimize alternatives,
and compare outcomes.

### Q2. What problem does it solve?

**Answer:** Campus changes can affect buildings, rooms, timetables,
resources, and student movement. MIRRORWORLD helps users examine these
connected effects before making real-world decisions.

### Q3. Why did you choose this problem?

**Answer:** Campus operations are interconnected, but decisions are
often evaluated in separate pieces. We wanted to build a platform where
users can model a change and examine its wider operational impact.

### Q4. Who are the target users?

**Answer:** Potential users include university administrators, campus
planners, academic coordinators, and facilities or scheduling teams. The
current project is a prototype intended to demonstrate this
decision-support workflow.

### Q5. Why is it called MIRRORWORLD?

**Answer:** It represents a digital mirror of modeled campus operations.
Users can explore possible changes in that digital environment before
considering changes in the physical campus.

## 17. Digital Twin and data questions

### Q6. Is this a real-time Digital Twin?

**Answer:** The current prototype uses a structured synthetic/model
dataset. It demonstrates the digital-twin workflow, but it is not
continuously synchronized with live NITER operations. Live data
integration would be a future extension.

### Q7. Where does your data come from?

**Answer:** The current prototype uses modeled or synthetic campus data
for buildings, resources, schedules, and related operations. We do not
claim that the current dataset is a live university database.

### Q8. Why use synthetic data?

**Answer:** Synthetic data lets us develop and test the system without
depending on private institutional records or live campus integrations.
It also makes controlled disruption experiments reproducible.

### Q9. How can it become useful for a real university?

**Answer:** With institutional permission, the model could be populated
using verified building, room, timetable, capacity, and distance data.
Appropriate data validation, access control, and integration would be
needed before operational use.

## 18. Technical questions

### Q10. What technologies did you use?

**Answer:** The reported stack includes React, TypeScript, and Vite for
the frontend; Python and FastAPI for the backend; SQLAlchemy and SQLite
for data persistence; and Google OR-Tools CP-SAT for constraint-based
optimization.

### Q11. Why FastAPI?

**Answer:** FastAPI provides a structured way to expose Python backend
functionality through APIs, supports request validation, and works well
with Python-based data and optimization services.

### Q12. Why OR-Tools CP-SAT?

**Answer:** Campus scheduling and resource allocation are constraint
problems. CP-SAT is designed to search for solutions that satisfy
constraints and optimize a defined objective. It is more appropriate
than asking a general-purpose language model to guess a schedule.

### Q13. What is the difference between simulation and optimization?

**Answer:** Simulation evaluates what happens under a specified
scenario. Optimization searches for a better or feasible arrangement
under the defined constraints. One analyzes a situation; the other
searches for an alternative.

### Q14. What happens if the optimizer cannot find an optimal solution?

**Answer:** The system should report the actual solver status. A
feasible solution is not necessarily proven optimal. The project also
reports a heuristic fallback, which must be identified as heuristic
rather than presented as an optimal CP-SAT result.

### Q15. What is a constraint?

**Answer:** A constraint is a rule that a solution must respect. For
example, a room cannot host two conflicting classes at the same time, or
a room may need enough capacity for the assigned students. The exact
constraints are those implemented in our model.

### Q16. How do you compare scenarios?

**Answer:** The platform compares the baseline state with the changed
scenario using backend-calculated differences. This helps identify which
modeled resources or outcomes changed.

## 19. Student movement questions

### Q17. How do you calculate student movement?

**Answer:** The reported movement module uses consecutive timetable
sessions, cohort or enrollment counts, actual time-slot start and end
times, and modeled distances between buildings to estimate transitions.

### Q18. Is the movement tracking real-time?

**Answer:** No. It is timetable-based movement estimation, not GPS
tracking or live student location monitoring.

### Q19. How do you estimate walking time?

**Answer:** The reported implementation uses a configured assumption of
84 metres per minute and modeled route distances. It is an estimate, not
a measurement of an individual student's actual walking speed.

### Q20. What if a building distance is unknown?

**Answer:** The system should preserve that uncertainty and report the
distance or feasibility as unknown where appropriate. It should not
invent a distance.

## 20. AI questions

### Q21. What is Mirror AI?

**Answer:** Mirror AI is designed as the natural-language explanation
and decision-support layer of MIRRORWORLD. It helps users understand
campus data, scenario changes, simulation differences, optimization
outcomes, and movement analytics.

### Q22. Why use AI if you already have an optimizer?

**Answer:** They have different responsibilities. The optimizer performs
constraint-based computation. Mirror AI helps users ask questions and
understand the results. The AI should explain backend results, not
replace the optimizer.

### Q23. Does the AI calculate the simulation results?

**Answer:** No. Numerical results should come from backend calculations,
simulation services, or optimizer output. The AI can interpret and
explain those results.

### Q24. What happens if the AI API key is unavailable?

**Answer:** The intended architecture supports a deterministic
backend-powered fallback. Core simulation and optimization should remain
usable without an external AI provider. We must report the actual
provider status honestly.

### Q25. How do you protect the API key?

**Answer:** The key belongs in backend environment configuration, not
frontend code or public source control. The `.env` file should be
excluded from Git, and only the backend should communicate with the
provider.

### Q26. Can Mirror AI change a scenario by itself?

**Answer:** It should first convert the request into a validated
proposal and show the proposed changes. The user must explicitly confirm
before a state-changing action is executed.

## 21. Limitations and future scope

### Q27. What are the current limitations?

**Answer:** The current prototype depends on its modeled dataset and
implemented constraints. It is not a live synchronized campus system.
Movement estimates depend on modeled distances and a walking-speed
assumption. AI capabilities depend on provider configuration and
integration status.

### Q28. What would you improve next?

**Answer:** We would prioritize verified campus data integration, more
complete building and room modeling, stronger scenario coverage,
additional validation, improved explainability, and carefully controlled
AI-assisted workflows.

### Q29. Can it support multiple campuses?

**Answer:** The concept can be extended to multiple campuses, but that
requires a properly designed campus-specific data model, configuration,
validation, and testing. We should not claim multi-campus support unless
it has been implemented.

### Q30. Is MIRRORWORLD ready to control a real campus?

**Answer:** No. It is a decision-support prototype. Real deployment
would require verified institutional data, security and privacy
controls, operational validation, user acceptance, and integration with
university systems.

### Q31. What is the most innovative part of your project?

**Answer:** The combination of campus disruption modeling,
constraint-based optimization, scenario comparison, and student movement
analysis in one workflow. The goal is to help users explore consequences
before making real-world changes.

### Q32. What happens if your model data is wrong?

**Answer:** The quality of the results depends on the quality of the
input model. Incorrect or incomplete data can produce misleading
outcomes. A real deployment would need verified data, validation rules,
and clear disclosure of assumptions and unknown values.

------------------------------------------------------------------------

# PART J --- How to Answer Questions You Do Not Know

## 22. Do not bluff

If a judge asks something you cannot verify, do not invent an answer.

Use one of these responses:

-   "That is not implemented in the current prototype yet."
-   "Our current model uses synthetic data; integrating verified
    institutional data is a future step."
-   "I don't want to give you an inaccurate technical detail. I can
    explain the current design, but I would need to verify that exact
    implementation."
-   "That is outside the current scope, but the architecture could be
    extended to support it."
-   "The result depends on the actual solver status. Let me show you the
    status returned by the system."

A confident and honest answer is better than an impressive but incorrect
claim.

------------------------------------------------------------------------

# PART K --- Team Preparation

## 23. Divide the presentation responsibilities

If there are multiple team members, divide the work clearly:

  -----------------------------------------------------------------------
  Role                                Responsibility
  ----------------------------------- -----------------------------------
  Presenter 1                         Problem, motivation, and project
                                      overview

  Presenter 2                         Campus model, data, and scenario
                                      creation

  Presenter 3                         Simulation, optimization, and
                                      technical architecture

  Presenter 4 (if available)          Movement analytics, Mirror AI,
                                      limitations, and future scope
  -----------------------------------------------------------------------

If the team has fewer members, combine roles. Everyone should understand
the complete main workflow.

## 24. What every team member must know

Every member should be able to explain:

1.  What problem MIRRORWORLD solves.
2.  What the digital campus model represents.
3.  The difference between baseline and scenario.
4.  The difference between simulation and optimization.
5.  What CP-SAT does.
6.  What the optimizer status means.
7.  How movement estimates are calculated.
8.  What Mirror AI does---and what it does not do.
9.  Why the current dataset is synthetic/model data.
10. The system's current limitations.

------------------------------------------------------------------------

# PART L --- Final Presentation Checklist

## 25. The night before / before entering the venue

-   [ ] Run the project once from a clean start.
-   [ ] Test the exact demo scenario.
-   [ ] Confirm the backend and frontend both start.
-   [ ] Confirm the map and key pages load.
-   [ ] Confirm the optimizer returns a result.
-   [ ] Confirm comparison values are visible.
-   [ ] Confirm movement analytics loads.
-   [ ] Confirm Mirror AI's actual provider/fallback status.
-   [ ] Keep a backup screenshot or short recording of the working demo.
-   [ ] Keep a local backup of the project.
-   [ ] Make sure no secret/API key is visible.
-   [ ] Close unrelated tabs and applications.
-   [ ] Keep the demo sequence short and repeatable.
-   [ ] Decide who answers technical questions.
-   [ ] Practice the opening and closing scripts aloud.

## 26. The five sentences to remember

If you forget everything else, remember these:

1.  **MIRRORWORLD is a Smart Campus Digital Twin and Disruption Recovery
    Platform.**
2.  **It models campus operations and allows users to test hypothetical
    disruptions.**
3.  **It uses backend logic and constraint-based optimization to
    evaluate alternatives.**
4.  **It compares modeled outcomes and helps explain their
    consequences.**
5.  **It supports better-informed decisions before real-world campus
    changes are made.**

------------------------------------------------------------------------

## Final advice

You do not need to memorize every file or every line of code to present
well. You do need to understand the problem, the main workflow, what
each major component contributes, and the limitations of the current
prototype.

Tell one clear story: **a campus disruption happens → MIRRORWORLD models
it → the system analyzes it → the optimizer explores alternatives → the
platform compares the outcomes → Mirror AI helps explain the evidence.**

Be honest about what is implemented and tested. A reliable, clearly
explained demonstration is stronger than claiming features that fail
during judging.


# PART K — Final code-review-based presentation plan

## 30. Recommended live demo sequence (about 5–7 minutes)

Keep the demo short. The judges should understand one complete story rather than seeing every menu.

1. **Problem (30 seconds):** A campus disruption can affect rooms, schedules, resources, and student movement.
2. **Campus model (45 seconds):** Show the modeled campus and explain that it is a schematic digital representation using synthetic/model data.
3. **Detect / baseline (45 seconds):** Show the starting state, relevant alerts, or current constraints.
4. **Create disruption (45 seconds):** Choose one supported disruption, such as making a modeled building unavailable. Explain that this is a hypothetical scenario.
5. **Simulate and optimize (90 seconds):** Run the scenario and show the actual optimizer status and selected recovery plan. Mention CP-SAT and the heuristic fallback only if relevant to the displayed result.
6. **Compare (60 seconds):** Show the actual differences between baseline and the changed/optimized scenario.
7. **Movement (45 seconds):** If working, show modeled cohort movement and clarify that it is estimated—not GPS tracking.
8. **Mirror AI (60 seconds):** Ask it to explain the displayed result. Point out the evidence/data it uses. Do not claim live Gemini/Gemma unless the provider is confirmed working.
9. **Close (20 seconds):** “MIRRORWORLD helps campus decision-makers test possible changes digitally before making real-world decisions.”

If a feature fails during rehearsal, skip it. A reliable smaller demo is better than a broken full tour.

## 31. Must-run checks before presenting

Run these from the actual repository root and use the commands documented by the project README. Example commands (adjust if the repository defines different scripts):

```powershell
cd "F:\BCS ICT FEST Project Showcase"
git status
git branch --show-current
```

Backend:

```powershell
cd "F:\BCS ICT FEST Project Showcase\backend"
pytest -q
```

Frontend:

```powershell
cd "F:\BCS ICT FEST Project Showcase\frontend"
npm run build
```

Then manually verify in the browser:

- [ ] Frontend starts and can reach the backend.
- [ ] Campus page loads without console errors.
- [ ] Scenario creation / disruption works.
- [ ] Simulation returns a result.
- [ ] Optimizer status is displayed correctly.
- [ ] Baseline/scenario comparison matches the backend response.
- [ ] Movement view does not invent missing distances.
- [ ] Mirror AI explains the current scenario and does not invent numbers.
- [ ] No API key or `.env` content is exposed in browser devtools or Git.
- [ ] Presentation laptop has working internet only if the chosen AI provider requires it.

## 32. Quick answers to likely judge questions

**Q: Is this connected to the real NITER campus system?**  
A: “This version is a prototype using a modeled/synthetic campus dataset. It demonstrates the workflow and decision-support logic. A future deployment could connect validated institutional data through secure integrations.”

**Q: Is the 3D campus map an exact replica?**  
A: “It is a schematic 3D representation based on stored campus model/footprint data. It is intended for visualization, not as a surveyed architectural or BIM model.”

**Q: Does it track students live?**  
A: “No. The movement module estimates cohort-level transitions from modeled timetable sessions, enrollment counts, time slots, and available building-distance data. It does not track individual students or use live GPS.”

**Q: Why use OR-Tools instead of asking an LLM to create a timetable?**  
A: “Scheduling is a constraint problem. OR-Tools lets us define variables, hard constraints, and optimization objectives. The AI layer explains results; it is not trusted to invent a mathematically valid timetable.”

**Q: What happens if CP-SAT cannot find an optimal result?**  
A: “The application can use an audited heuristic fallback where implemented. We report the result status honestly, such as FEASIBLE_HEURISTIC, rather than calling it OPTIMAL.”

**Q: Is Mirror AI always connected to Gemini/Gemma?**  
A: “The AI layer is provider-configurable. The external provider must be configured and tested. If unavailable, the application can use its deterministic fallback. We disclose which mode is active.”

**Q: Is this production-ready?**  
A: “No. It is a prototype demonstrating campus modeling, disruption analysis, optimization, and decision support. Production deployment would require validated live data integrations, authentication, multi-user controls, security hardening, monitoring, and operational testing.”

**Q: What is the main innovation?**  
A: “The main value is connecting campus disruption modeling with constraint-based recovery, movement impact analysis, before-and-after comparison, and an AI explanation layer in one workflow.”

## 33. Final presentation rule

Never invent a metric, claim a live integration that is not present, or hide a solver/fallback status. Show the actual result on screen, explain what data produced it, and state the limitations clearly. Judges generally trust a team that understands its prototype and its boundaries more than a team that makes exaggerated claims.
