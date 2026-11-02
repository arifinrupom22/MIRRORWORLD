# MIRRORWORLD — Project Workflow & Presentation Notes

> Campus intelligence: a real timetable, the hard diagnostics it exposes, and an assistant that explains them without pretending to know things it does not.

---

## What this is, in one line

MIRRORWORLD takes a **real weekly campus timetable** and turns it into something a non-expert can read: buildings and rooms, who teaches where and when, where students move between periods, where the schedule breaks, and — if you turn on Mirror AI — plain-language answers that are **grounded in that data**, not invented.

It is built in two layers: a **deterministic engine** that always computes the same answer from the same schedule, plus an **optional language-model layer** that narrates, summarizes, and does scenario reasoning while every number it quotes is pulled from the engine's real output.

---

## Serial workflow (how the project grew)

This is the order the work happened in. Use it as the spine of your presentation if you need one.

### Phase 0 — Pick the real problem, not a demo problem

Campus scheduling is one of those problems everyone has an opinion about and almost nobody has good tooling for. Room conflicts, teacher double-booking, over-capacity halls, student movement between buildings, what happens when a building goes down — these are real operational headaches.

The project chose to **model a real synthetic campus**, not fake numbers. That choice matters later: it means every chart, collision, and alert is the kind of thing a real registrar or facilities person would care about.

### Phase 1 — Data model: a campus that could be real

The dataset was built as a coherent synthetic campus:

- 4 buildings, 24 rooms (including 4 labs)
- 26 instructors
- 1,128 students organized into cohorts
- 112 weekly sessions across the timetable
- Distances and walking speeds between buildings, so movement and transition time are real calculations, not hand-waved

The point: **ground truth exists**. The system can point to a room, a teacher, a cohort, a time slot, and explain what is happening there. That is the foundation everything else rests on.

### Phase 2 — The deterministic engine (the "always right" core)

Before any AI, build the part that must never hallucinate: the schedule mathematics.

- **Conflict detection**: teacher double-booking, room double-booking, group/strand clashes, availability-window violations, operating-window violations.
- **Capacity checks**: session size vs room capacity, with deficit reporting.
- **Facility fit**: whether a session's room type matches what it needs (lab vs classroom, etc.).
- **Transitions**: student movement between buildings across consecutive periods, with walking-time assumptions.
- **Energy load estimate**: a per-session kWh model so the campus energy picture is derived from the timetable, not pasted in.

Why this order? Because the AI layer is only as honest as the numbers it can quote. Build the truth first.

### Phase 3 — Alerts and severity

Once the engine detects problems, turn them into something a human can act on:

- 8 alerts exist in the current dataset.
- Severity bands: critical, high, medium.
- Each alert is attached to a reason and a source — what broke, and where you can verify it.

The current baseline's headline numbers:

- 3 collisions
- 1 capacity violation (AD-101: 52 students against 32 seats, deficit 20)
- 1 facility mismatch
- 8 alerts total

These are not decoration. They are the dataset's actual answers.

### Phase 4 — Scenarios and disruption modeling

A single baseline schedule is useful; a "what if a building disappears" view is what decision-makers actually need.

- You can mark a building unavailable and the system recomputes the affected sessions.
- The active scenario in the current build is **"AI proposal · Alan Turing Hall unavailable"** — 22 displaced sessions, recovery required.
- There is also an earlier "Extended Classroom" scenario in the data.

The lesson for the presentation: the engine is **scenario-aware**. It does not just report today's timetable; it can model interruptions.

### Phase 5 — Visualization and the 3D staging model

People do not absorb schedules from spreadsheets during a presentation. They need a room they can look at.

- A schematic 3D massing view of the campus, built so a presenter can point at a building and say "this is Ada Lovelace Block, this is where the over-capacity alert is."
- Important caveat, stated plainly: **it is schematic massing, not an architectural model**. No surveyed coordinates, no facade detail, storey height is an assumption. Say this out loud — judges respect honesty about what a student project is and isn't.

### Phase 6 — The dashboard and the pages that back every claim

The UI is organized so that every AI answer has a page behind it. If the assistant says "112 weekly sessions," there is a page that shows 112 weekly sessions. If it mentions the AD-101 over-capacity alert, there is an alerts page.

That architecture is the whole honesty story of the project. It is worth spending a slide on.

### Phase 7 — Mirror AI: the assistant layer

This is the part that has changed most and where most of the last stretch of work went.

Mirror AI is a multi-mode assistant:

- **Ask** — direct grounded answers
- **Analyst** — deeper breakdown
- **What-if** — scenario reasoning
- **Advisor** — recommendations
- **Research** — structured briefing

Each mode has an evidence label so the user can see whether a number came from the backend, from simulation, or is flagged as insufficient data.

The assistant sits on top of a **tool registry** and a **memory** so it can call deterministic services, quote their output, and keep context per scenario.

### Phase 8 — Connecting a real model (the work right before this presentation)

The assistant originally ran only in deterministic mode. The last stretch of work was making the language-model path real and honest.

- Configured a **Google AI Studio** key under `MIRROR_AI_API_KEY`.
- Set the model to a **Gemma** family model: `gemma-4-26b-a4b-it` (26B total parameters, ~4B active per token).
- Provider stays `google` because the Gemini API hosts both Gemini and Gemma; only the model id selects the family.
- Streaming works; non-streaming works; each response reports which model actually answered.

A few real bugs came out of making this live, and they were fixed:

1. **Retries were dead code.** Any failure broke straight out of the retry loop, so `MIRROR_AI_MAX_RETRIES` did nothing. Transient failures (5xx, timeouts) now retry with backoff; auth/bad-request failures still fail fast.
2. **Gemma 4 kept crashing with HTTP 500.** Its default thinking budget overloaded the hosted endpoint. Requests now send `thinkingLevel: minimal`, which moved failures from roughly two-thirds of calls to zero. Reasoning ("thought") parts are also filtered so they never appear as answer text.
3. **Streaming hid the real error.** A failed stream said only "All configured models failed"; it now reports the underlying provider error.
4. **A rejected key was misclassified.** Google returns HTTP 400 `API_KEY_INVALID` for a bad key. That was previously labeled "bad request" (which reads like "check your model id"); it is now labeled `auth`.
5. **Tests could spend the real key.** Because the app loads `.env` into the process environment, the test suite could make live calls with the real key. An autouse fixture now clears provider keys for every test, so the suite is isolated.

The full test suite is **81 tests**, all passing.

### Phase 9 — Presentation readiness

Right now the project is:

- Backend serving locally on `127.0.0.1:8000`
- Frontend dev server on `localhost:5173`
- Mirror AI page open in the browser, mode set to `LANGUAGE-MODEL`, model `gemma-4-26b-a4b-it`, streaming enabled
- A real streamed Gemma answer visible in the UI, with the reasoning panel showing "model narration"

What is not yet done for a public link: the site is not yet live on a hosting provider. See the deployment section below.

---

## Deployment and environment variables (the part judges and hosts care about)

### Why `.env` cannot go to GitHub

A `.env` file commonly holds secrets: API keys, database URLs, tokens. Putting it in a public or even private-but-leaked repo is how keys get stolen. So:

- `.env` is in `.gitignore`.
- `.env.example` holds the **shape** of the file — variable names and non-secret defaults — but not real values.
- The real key lives only on the machine or hosting environment that needs it.

This is normal, correct practice. If someone asks "why isn't the key in the repo," the answer is "because the key is a secret and this is the right way to handle one."

### What variables the backend needs

The backend reads these at startup:

| Variable | Purpose |
| --- | --- |
| `MIRRORWORLD_DATABASE_URL` | Path or URL to the SQLite/other database |
| `MIRROR_AI_PROVIDER` | Provider adapter, currently only `google` |
| `MIRROR_AI_API_KEY` | Google AI Studio key; unset means deterministic-only mode |
| `MIRROR_AI_MODEL` | Primary model id, e.g. `gemma-4-26b-a4b-it` |
| `MIRROR_AI_FALLBACK_MODEL` | Second model tried when the primary is unavailable |
| `MIRROR_AI_TIMEOUT` | Provider request timeout (default 30s) |
| `MIRROR_AI_MAX_RETRIES` | Retries for transient failures (default 1) |
| `MIRROR_AI_BASE_URL` | Override only for a compatible gateway |

### How to run it locally

Roughly:

1. Install backend deps into `backend/.venv`.
2. Copy `backend/.env.example` to `backend/.env` and fill in the values you actually have.
3. Start the backend: something like `cd backend && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`.
4. Start the frontend: `cd frontend && npm run dev` (Vite, `localhost:5173`).

If you only want the deterministic dashboard without AI, leave `MIRROR_AI_API_KEY` unset — the assistant falls back to the rule engine and says so explicitly.

### Hosting it (Render, or any similar platform)

The platform matters less than knowing what to configure. The generic recipe:

1. Push the repo to GitHub (without `.env`).
2. Create the app on the host and connect the repo.
3. In the host's **environment variables** UI, set the same variables the local `.env` would have held:
   - the database URL
   - `MIRROR_AI_API_KEY` if you want AI answers live
   - `MIRROR_AI_MODEL` if you want a specific model
   - any other vars your host requires (build command, start command, Python version, etc.)
4. Deploy. The host injects those variables at runtime the same way a local `.env` would.

So **the key question "where do I put the API key on render" has a simple answer**: in the host's environment-variable settings, not in the repo. The code does not care whether the variable came from a local `.env` or from the host's runtime environment — that is the whole point of the pattern.

### The netlify / API-access point

If the site is not yet live and the API is not reachable from outside the laptop, that is a deployment state, not a code state. For a presentation, you have two honest options:

- **Demo from localhost** with the backend and frontend running on the machine, if the presentation setup allows it.
- **Deploy to a host** and set the env vars there, so the link works for the audience.

Do not claim a live link exists if it does not. Say what state the project is in — that is the more impressive answer when it is true.

---

## Important questions a judge might ask — and how to answer them

These are the questions that actually get asked at tech-fest presentations, written as if a judge is standing at the booth. Answer them in your own words, but know the substance.

### 1. "What does this project actually do?"

MIRRORWORLD takes a real weekly campus timetable and turns it into a readable, visual, queryable campus view: buildings and rooms, teachers and students, collisions, capacity problems, movement between buildings, energy load, and — if you turn on Mirror AI — plain-language answers that are grounded in that data rather than invented.

### 2. "Is the AI doing the scheduling, or are you?"

The scheduling math is fully deterministic and rule-based. Mirror AI can **explain, summarize, and reason about scenarios**, and can propose scenarios, but it never invents rooms, teachers, cohorts, distances, energy values, or solver statuses. Every number it quotes is pulled from the deterministic engine's real output. When there is not enough data for an answer, it says so.

### 3. "What is the AI actually good for here?"

Three things:

- **Translation** — turning the engine's output into plain language a non-expert can follow.
- **Scenario narration** — explaining what a "building unavailable" disruption means in human terms.
- **Guided questions** — helping a user ask the next useful question instead of staring at a chart.

It is not doing optimization. It is not pretending to be an operations system. It is an explanation layer over one.

### 4. "Why Gemma? Why not a bigger model? Why not Gemini?"

Two reasons.

First, the project is about grounding and honesty, not raw model size. A smaller model that stays inside the data is better here than a bigger one that hallucinates.

Second, the Gemma family is hosted on the same Google API endpoint, so the project's provider code does not need a second integration. Only the model id changes. The current model is `gemma-4-26b-a4b-it` — 26B total parameters with about 4B active per token — chosen because it is the hosted Gemma-4 id that fits the "small, efficient, grounded" intent.

If a judge asks "is 4B enough?", the honest answer is: enough for this job, because the job is mostly quoting and narrating real data, not open-ended generation. The architecture is what makes it safe, not the model size alone.

### 5. "How do you know the AI is not lying?"

Because of the architecture: every claim is renderable from a real page. The assistant does not "know" the answer and then say it; it calls the deterministic services, gets their output, and narrates that. The UI shows evidence labels — what came from the backend, what came from simulation, what is flagged as insufficient data.

A judge-friendly short version: "The model never invents a number. If it mentions 112 weekly sessions, that number came from the schedule engine, and there is a page that shows 112 weekly sessions."

### 6. "What happens when the model is wrong or the API is down?"

Two layers of defense:

- If the model path fails transiently, the backend retries before giving up.
- If it still cannot answer, the system degrades to the deterministic engine and says so explicitly — it does not fabricate an answer.

There is also a fallback-model setting (`MIRROR_AI_FALLBACK_MODEL`) for when a primary model is unavailable. It is not configured right now, which is a fair thing to admit.

### 7. "Where does the data come from? Is it real?"

It is a carefully built **synthetic** campus — real in structure and scale, synthetic in specifics. 4 buildings, 24 rooms, 26 instructors, 1,128 students, 112 weekly sessions. The dataset is coherent: distances, capacities, availability windows, and room types all line up.

For a student project, that is the right call: you cannot require a real university's live data, and a fake-but-coherent dataset is enough to show the whole system working. Say that plainly.

### 8. "What are the limitations you are not hiding?"

Good answer to have ready:

- The 3D view is schematic massing, not an architectural model.
- The project is single-operator and synthetic by design.
- No live tracking, IoT telemetry, or real-time occupancy — those are not claimed.
- Multimodal inputs (map images, PDFs, dataset uploads, voice) are not implemented, though the architecture keeps them additive.
- Conversation context is browser-local and per scenario, not a persistent user profile.

Saying these out loud is a strength, not a weakness. It shows you know the boundary of your work.

### 9. "What is the hardest part you actually built?"

Pick one that is true and specific.

Good options:

- "Making the assistant honest — forcing every number to come from the engine and every claim to be verifiable on a page."
- "Building the deterministic engine first so the AI has something real to talk about."
- "Making streaming and retries actually work instead of looking like they work — including fixing a Gemma 4 crash that came from its own thinking budget."

### 10. "What would you add next?"

Honest roadmap candidates:

- A second provider adapter behind the same `ask()` contract.
- Guided-tour deep links from alerts.
- Optional server-side answer caching for repeated questions.
- Configuring a fallback model so the assistant degrades gracefully instead of going silent.

---

## A 2-minute presentation spine (if you need one)

If you only have a couple of minutes, this order holds together:

1. **The problem** — campus scheduling is real, messy, and under-tooled.
2. **The data** — a coherent synthetic campus, built so every number has a home.
3. **The engine** — deterministic conflict, capacity, facility-fit, transition, and energy math that always gives the same answer.
4. **The alerts** — 8 of them, with severity, reasons, and pages behind each claim.
5. **The scenarios** — what happens when a building goes down, with the active "Alan Turing Hall unavailable" example.
6. **The view** — schematic 3D massing as a presentation aid, with the limitation stated.
7. **Mirror AI** — an explanation layer over the engine, with evidence labels and honest degradation.
8. **Live proof** — the browser showing the mode, the model, and a streamed answer that names the model and quotes real numbers.
9. **What you learned** — that the hard part was honesty, not generation; and that a small grounded model can be more useful than a bigger hallucinating one.
10. **What is left** — deployment to a public link, a fallback model, and the roadmap above.

---

## Quick "what is the state right now" note

- Backend local: `127.0.0.1:8000`
- Frontend local: `localhost:5173`
- Mirror AI page: mode `LANGUAGE-MODEL`, model `gemma-4-26b-a4b-it`, streaming on
- AI configured, validated, and answering with a real streamed Gemma response
- Tests: 81 passing
- Public link: not yet deployed — treat that as a deployment task, not a code task, and say so honestly if asked

---

*Write this once. Update the deployment state line when the site is actually live. Keep the limitation list honest — it is the part that makes the rest credible.*
