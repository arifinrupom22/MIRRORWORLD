# MIRRORWORLD Production Deployment

This document describes how to deploy the **frontend to Netlify** and the **backend to Render**, and how to keep the Gemma API key out of the frontend, the repo, and the build output.

The intended production topology is:

```
Browser ──> Netlify (React SPA) ──> https://mirrorworld.onrender.com (FastAPI backend) ──> Google Gemma API
```

Local development is different: Vite proxies `/api` to `http://127.0.0.1:8000` so you can run the backend on your laptop. Production uses the same frontend code, built once, pointed at the live backend through one environment variable.

---

## 1. What is already in the repo

The repo now contains the pieces needed for production deployment:

- `netlify.toml` — Netlify build command, publish directory, SPA rewrite, and the production `VITE_API_BASE` baked into build-time environment.
- `frontend/vite.config.ts` — centralized API base, read from `VITE_API_BASE` and defaulting to the local dev proxy only when that variable is absent.
- `backend/app/main.py` — CORS allow-list plus the `/api/health` endpoint.
- `backend/app/ai.py` — Gemma key handling and deployment note.
- `backend/.env.example` — the shape of the backend environment, without any real key.

Two things are intentionally **not** in the repo:

- The real Gemma key.
- `backend/.env` with a real key.

That is correct and required. The backend secret only ever lives in env vars.

---

## 2. Backend requirements

The backend is a FastAPI app. The relevant files:

- `backend/app/main.py` — FastAPI app entry point.
- `backend/requirements.txt` — Python dependencies.
- `backend/.env` or host environment variables — backend configuration.

The backend does not need the frontend build at all. It is a separate service.

---

## 3. Backend environment variables

The backend reads these at startup. All are backend-only. None are frontend variables and none should be placed in Netlify.

| Variable | Purpose | Required |
| --- | --- | --- |
| `MIRRORWORLD_DATABASE_URL` | Database URL. The default is a local SQLite file. | No, unless you want a different DB |
| `MIRROR_AI_PROVIDER` | AI provider id. Currently only `google` is implemented. | No |
| `MIRROR_AI_API_KEY` | Google AI Studio key. This is the backend key for Gemma / Gemini. Leave unset for deterministic-only mode. | Only if you want AI answers |
| `MIRROR_AI_MODEL` | Primary model id. For the Gemma path in this project, use `gemma-4-26b-a4b-it`. | No |
| `MIRROR_AI_FALLBACK_MODEL` | Second model tried when the primary is unavailable. | No |
| `MIRROR_AI_TIMEOUT` | Provider request timeout in seconds. Default 30. | No |
| `MIRROR_AI_MAX_RETRIES` | Retry attempts for transient failures. Default 1. | No |
| `MIRROR_AI_BASE_URL` | Provider endpoint override. Default is the Google Generative Language endpoint. | No |
| `MIRRORWORLD_PRODUCTION_ORIGINS` | Extra comma-separated allow-list origins for CORS. Used if you add new frontend hostnames. | No |
| `PORT` | Port the backend listens on. Render sets this automatically. | No, if the host sets it |

If the key is missing, Mirror AI falls back to the deterministic rule engine and labels every answer as rule-engine output. It does not fabricate a model response.

The backend also accepts a few legacy key variable names (`GOOGLE_API_KEY`, `GEMINI_API_KEY`, `AI_API_KEY`) so existing config and documentation keep working. The canonical variable for this project is still `MIRROR_AI_API_KEY`.

---

## 4. Render setup

Render is the backend host. The existing backend URL should remain:

```
https://mirrorworld.onrender.com
```

### 4.1 Create the service

Create a new **Web Service** on Render and connect it to the repository. If you are deploying from a subdirectory, point Render at `backend`, or set the root directory/`context` to `backend` if the host supports that.

### 4.2 Build command

Use something like:

```bash
pip install -r requirements.txt
```

If Render runs the build from the repo root and the backend is in a subdirectory, you may need:

```bash
cd backend && pip install -r requirements.txt
```

### 4.3 Start command

The backend is a FastAPI app served with uvicorn. Render sets the `PORT` environment variable, so the app must bind to `$PORT`.

A correct start command looks like:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Important details:

- Bind to `0.0.0.0`, not `127.0.0.1`. Render needs the process reachable on the container interface.
- Use the `PORT` environment variable. Hardcoding `8000` will fail if Render assigns a different port.
- The app entry point is `app.main:app`, because the FastAPI instance lives in `backend/app/main.py`.

### 4.4 Environment variable configuration

In Render's environment variables UI, set at least:

- `MIRROR_AI_API_KEY` if you want AI answers in production.
- `MIRROR_AI_MODEL` if you want a specific model, for example `gemma-4-26b-a4b-it`.

If the project uses a persistent database on Render, also set `MIRRORWORLD_DATABASE_URL` to a Render PostgreSQL URL, or use the Render disk/SQLite approach the host supports. For a demo that can recreate its data on boot, the existing SQLite default is acceptable.

### 4.5 Gemma API key

Set `MIRROR_AI_API_KEY` in Render's environment variables. Do **not** put the key in the repo, in `backend/.env` committed to Git, in the frontend build, or in Netlify.

If Render rebuilds the service from a fresh container, the key still comes from the environment, so it survives redeployments as long as it is stored in the Render UI.

---

## 5. Netlify setup

Netlify hosts only the compiled frontend. It never runs the backend and never needs the backend key.

### 5.1 Connect the site

Create a new Netlify site connected to the repository.

### 5.2 Build settings

The repo includes `netlify.toml`, which already specifies:

- Build base: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- SPA rewrite: `/*` -> `/index.html` with status `200`
- Build-time environment: `VITE_API_BASE=https://mirrorworld.onrender.com`

If Netlify picks up `netlify.toml`, you do not need to duplicate these settings in the Netlify UI.

### 5.3 Frontend environment variable

The only frontend build variable is:

- `VITE_API_BASE`

In the current repo this is set in `netlify.toml` to:

```
https://mirrorworld.onrender.com
```

That is the only environment variable the frontend build needs. Do **not** put backend secrets in Netlify. Do **not** set `MIRROR_AI_API_KEY` in Netlify. It has no place in the frontend build.

If the backend moves to a different host later, change `VITE_API_BASE` in `netlify.toml` and redeploy the frontend.

### 5.4 SPA routing

The rewrite rule in `netlify.toml` ensures client-side routes like `/campus`, `/simulation`, `/optimizer`, and `/mirror-ai` fall back to `index.html` instead of Netlify's 404 page. Keep that rule. Removing it will break direct navigation and page refresh on those routes.

---

## 6. How the frontend chooses the API base

The frontend uses one centralized value: `VITE_API_BASE`.

- In local development, when `VITE_API_BASE` is not set, the app defaults to the Vite dev proxy origin `http://127.0.0.1:8000`.
- In the Netlify production build, `VITE_API_BASE` is set to `https://mirrorworld.onrender.com`.
- The compiled frontend does not know about localhost for production requests.

The API wrapper in `frontend/src/lib/api.ts` builds request URLs from that base. It does not hardcode any backend origin.

---

## 7. CORS

The backend now allows:

- The known Netlify production origin.
- Local development origins via the existing regex for `http://localhost` and `http://127.0.0.1` on any port.
- The live Render backend host as a fallback for CORS checks.

Credentials are not relied on (`allow_credentials=False`), so the origin can be an explicit list rather than a wildcard.

If you later put the frontend on additional hostnames, add them either to the explicit list in `backend/app/main.py` or via the `MIRRORWORLD_PRODUCTION_ORIGINS` environment variable on Render.

---

## 8. Health endpoint

The backend exposes:

```
GET /api/health
```

It returns:

```json
{
  "ok": true,
  "name": "MIRRORWORLD",
  "service": "backend",
  "version": "1.0.0",
  "loaded_env_file": true,
  "env_keys_loaded": 1
}
```

It does **not** expose the API key, model id, database path, or any other secret. Use it in uptime checks, load balancer health checks, or manual debugging.

The root endpoint is:

```
GET /
```

It returns a small JSON document pointing at `/docs`, `/api/health`, and the project metadata.

---

## 9. Deploying updates

### 9.1 Backend-only change

1. Push the code change to the repo.
2. Render redeploys the backend service automatically if it is connected to the repo.
3. Confirm the backend is healthy with `GET /api/health`.

### 9.2 Frontend-only change

1. Push the code change to the repo.
2. Netlify rebuilds the frontend automatically if it is connected to the repo.
3. Confirm the frontend can reach the backend by loading the site and checking that API calls succeed in the browser dev tools.

### 9.3 Change the backend host

If the backend URL changes:

1. Update `VITE_API_BASE` in `netlify.toml`.
2. Redeploy the frontend on Netlify.

Do not change the frontend code per environment. Change the single build-time variable instead.

---

## 10. How to test the production application

### 10.1 Backend health

```bash
curl -s https://mirrorworld.onrender.com/api/health | jq .
```

Expected: a JSON response with `"ok": true` and no secrets.

### 10.2 Backend docs

```bash
curl -s https://mirrorworld.onrender.com/docs | head
```

This should return the FastAPI interactive docs page. If it does not, the backend may not be running or may be unreachable.

### 10.3 Frontend reachability

Open the Netlify production URL in a browser. The page should load without console errors about missing modules or failed asset loads.

### 10.4 API connectivity from the frontend

Open the browser dev tools network panel and reload the app. Look for requests to `https://mirrorworld.onrender.com/api/...`.

Expected:

- Requests go to the Render backend, not to localhost.
- Responses are JSON.
- No CORS error appears in the console.

If the console shows a CORS error, check:

- That the frontend origin is allowed in the backend CORS configuration.
- That `VITE_API_BASE` is correct in the deployed Netlify build.
- That the backend is actually running on Render.

### 10.5 Core API routes

You can sanity-check the main backend routes directly:

```bash
curl -s https://mirrorworld.onrender.com/api/campus | jq .
curl -s https://mirrorworld.onrender.com/api/overview | jq .
curl -s https://mirrorworld.onrender.com/api/alerts | jq .
curl -s https://mirrorworld.onrender.com/api/templates | jq .
curl -s https://mirrorworld.onrender.com/api/ai/status | jq .
```

These should return JSON. If one returns 404 or 500, check Render logs.

### 10.6 Simulation and optimization

Simulation results are returned from existing scenario records. To exercise the full flow:

1. Open the simulation or optimizer page in production.
2. Trigger a simulation or optimization run.
3. Watch the job state in the UI and in the network panel.
4. Confirm the result page loads after the job completes.

Note that optimization runs on the backend may take real time and may be rate-limited or slow on free tiers. That is a hosting constraint, not a code defect.

### 10.7 AI

To test Mirror AI:

1. Open `/mirror-ai`.
2. Confirm the page shows the AI status panel.
3. Ask a grounded question.

If the key is configured in Render, the assistant should answer using the configured model and label the answer accordingly. If the key is not configured, the assistant should answer from the deterministic rule engine and say so.

Do not test the key by searching the frontend source, the Netlify deploy artifacts, or the browser network requests for the raw key value. If the key appears anywhere except the backend environment and the backend's outbound request to Google, that is a deployment bug.

---

## 11. Local verification before deploy

Before pushing a production deploy, run locally:

1. Start the backend:
   ```bash
   cd backend
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
   On Windows, use the local equivalent for the virtual environment.

2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open `http://localhost:5173` and confirm the app loads, the pages render, and the backend calls succeed through the Vite proxy.

4. Run the frontend build locally to confirm the production bundle compiles:
   ```bash
   cd frontend
   npm run build
   ```

5. Check that the production build references the Render backend, not localhost, by inspecting the built output or running a production preview:
   ```bash
   cd frontend
   npx vite preview --port 4173
   ```

If the preview is started with `VITE_API_BASE` unset, it will call localhost, which is expected for a local preview without the backend. To preview production behavior locally, set the variable first:

```bash
VITE_API_BASE=https://mirrorworld.onrender.com npx vite preview --port 4173
```

---

## 12. Common errors and solutions

### The frontend loads, but all API calls fail

Check:

- `VITE_API_BASE` in the Netlify build.
- That the Render backend is running.
- That the browser network panel shows requests to the Render host.

### CORS error in the browser console

Check:

- The frontend origin is in the backend allow-list or matched by the regex.
- The backend is not sending `Access-Control-Allow-Origin: *` while also expecting credentials.
- The request URL is correct and not duplicated with an extra `/api` prefix.

### Backend returns 502 or refuses connections

Check:

- The Render service is running.
- The start command binds to `$PORT` and `0.0.0.0`.
- The process did not crash during startup.

### Mirror AI says no model is configured

Check:

- `MIRROR_AI_API_KEY` is set in Render.
- `MIRROR_AI_ENABLED` is not set to `false`.
- The model id is valid for the key.

### Mirror AI answers from the rule engine even though the key is set

Check:

- The key is actually present in the running backend environment, not just in the repo or the Render UI draft.
- The backend was restarted after the variable was added.
- The key has access to the configured model.

### Local dev works, production does not

Most often this is an environment difference:

- Local dev uses the Vite proxy to `127.0.0.1:8000`.
- Production uses `VITE_API_BASE=https://mirrorworld.onrender.com`.
- The backend CORS policy must allow the production frontend origin.

Do not assume local success implies production success. Test the deployed frontend against the deployed backend.

### The site works on refresh in dev but not on Netlify

Make sure the SPA rewrite in `netlify.toml` is present and not accidentally removed. Without it, direct navigation to client-side routes returns Netlify's 404 page.

---

## 13. Security reminders

- The Gemma API key belongs only in the backend environment.
- It must not be committed to Git.
- It must not be placed in `VITE_` variables.
- It must not be baked into the frontend build.
- It must not be logged by the backend.
- The frontend should never make direct calls to the Gemma API.

If any of those happen, treat it as a leak and rotate the key.

---

## 14. Modified files

This deployment pass touched:

- `frontend/vite.config.ts`
- `netlify.toml`
- `backend/app/main.py`
- `backend/app/ai.py`
- `DEPLOYMENT.md` (this file)

Those changes are limited to deployment wiring, CORS, the health endpoint, and the centralized API base. Existing features, routes, and UI behavior were not redesigned.
