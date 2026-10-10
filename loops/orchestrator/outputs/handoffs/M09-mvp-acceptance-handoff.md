# M09 MVP Acceptance: Backend Handoff

Handoff Status: READY

For the M09 frontend loop (E2E author, tasks F1–F8). The backend part of M09 is `COMPLETED`: build is clean, tests pass 302/302, the curl regression passes 156/156 on the dev DB and on a fresh `quickflow_e2e`, OpenAPI is complete (38/38 operations), NFR-P1 holds (max 33 ms) and no regressions were found. There are no API or contract changes in M09. Every contract in the M01–M08 handoffs still applies.

## 1. Backend against the isolated E2E database `quickflow_e2e`

| | |
|---|---|
| Switch (non-secret) | env `Database__ConnectionStringName=QuickFlowE2E`, plus `ASPNETCORE_ENVIRONMENT=Development` (needed for user-secrets and startup migrations) |
| Credentials | already in user-secrets `quickflow-api-dev` as `ConnectionStrings:QuickFlowE2E`. **Don't put any connection string or password in the Playwright config** |
| Base URL | whatever you pass to `--urls`. The Angular app calls `apiBaseUrl` = `http://localhost:5080` (`frontend/src/environments/`), so the E2E backend must listen on **5080** unless you change `apiBaseUrl`. Only one process can own 5080: stop the dev API on 5080 first, or reuse it only if it was started with the switch |
| Startup | applies all 6 migrations to an empty `quickflow_e2e`. Health is ready in about 3 s (observed) |
| Health check URL | `http://localhost:5080/api/health` → `200 {"status":"Healthy",...}` |

Exact command (from `backend/`). I verified it as written, with `--urls http://localhost:5081`:

```powershell
$env:ASPNETCORE_ENVIRONMENT='Development'; $env:Database__ConnectionStringName='QuickFlowE2E'
dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080
```
```bash
ASPNETCORE_ENVIRONMENT=Development Database__ConnectionStringName=QuickFlowE2E \
  dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080
```

Playwright `webServer` entry (sketch, no secrets):
```ts
{ command: 'dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080',
  cwd: '../backend', url: 'http://localhost:5080/api/health', reuseExistingServer: false, timeout: 120_000,
  env: { ASPNETCORE_ENVIRONMENT: 'Development', Database__ConnectionStringName: 'QuickFlowE2E' } }
```
`reuseExistingServer: true` would silently reuse a dev-DB API on 5080. Use it only if you're sure the running API was started with the switch.

## 2. Reset before each run (non-interactive, never touches `quickflow`)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/reset-e2e-db.ps1           # DROP + CREATE quickflow_e2e (empty, utf8mb4_0900_ai_ci)
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/reset-e2e-db.ps1 -DryRun   # guards + table count only
```
- **Order:** stop the E2E API, then reset, then start the E2E API (startup creates the schema). A running API whose DB is dropped underneath it will fail its queries until restarted.
- **Exit codes:** 0 on success, 1 on any refusal or error (message on stderr). You can call it from Playwright `globalSetup` (`execFileSync('powershell', ['-NoProfile','-ExecutionPolicy','Bypass','-File', '<repo>/backend/scripts/reset-e2e-db.ps1'])`) **before** the backend starts. Playwright normally starts `webServer` entries **before** `globalSetup`, so check the order in your Playwright version. The safest option is to run the reset in an npm script before `playwright test`, e.g. `"e2e:fresh": "powershell -NoProfile -ExecutionPolicy Bypass -File ../backend/scripts/reset-e2e-db.ps1 && playwright test"`.
- **Guards:**
  - the target is hard-coded to `quickflow_e2e`, with no parameter
  - it refuses if `ConnectionStrings:QuickFlowE2E` names any other DB (`quickflow`, case-insensitive)
  - it refuses if the dev string `ConnectionStrings:QuickFlow` names `quickflow_e2e`
  - all four refusal cases were tested and exit 1 without touching MySQL
- **Credentials:** read at runtime (env `ConnectionStrings__QuickFlowE2E`, else user-secrets) and passed only through the child `MYSQL_PWD`. Never printed.
- **mysql.exe:** `-MySqlExe` / `MYSQL_EXE` / `PATH` / `C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe`.
- **Current state:** `quickflow_e2e` was reset at the end of my run (0 tables). The first API start migrates it.
- **Alternative without the script:** every spec can create its own uniquely named data and assert relative to it. The dashboard counts are global, so on a non-reset DB assert deltas.

## 3. Isolation evidence

- A task created through the E2E instance existed in `quickflow_e2e.Tasks` (1 row) and not in `quickflow.Tasks` (0 rows), checked in MySQL.
- The `quickflow` row counts per table were identical before and after two resets (tasks 152, plans 36, … , 6 migrations).
- The E2E instance on an empty DB returned `[]` for every list and all-zero dashboard metrics.

## 4. Regression results (`backend/scripts/regression.sh`, re-runnable)

Command: `bash backend/scripts/regression.sh <baseUrl> [timingRounds]`. It needs bash, curl and node, and no credentials. It exits 1 on failure and soft-deletes its own `REG<epoch>` data.

| Section | Checks | Result |
|---|---:|---|
| M01 health, unknown route 404 ProblemDetails, CORS preflight from 4200 | 7 | PASS |
| M02 tasks: CRUD, all filters, invalid sort/today 400, complete/archive/restore, 404s | 35 | PASS |
| M03 habits: CRUD, completions, 409 duplicate, future 400, activate/deactivate, 404s | 27 | PASS |
| M04 learning: cards, milestones, notes, status filter, 400s, 404s | 28 | PASS |
| M05 settings: GET/PUT, invalid 400, rejected PUT changes nothing, restore | 8 | PASS |
| M06/M07 plans: create/validation, get/put/404, `group` active/upcoming/completed/invalid, PATCH 400/404 | 19 | PASS |
| Cross-module and M08 dashboard | 29 | PASS |
| OpenAPI completeness and NFR-P1 | 3 | PASS |
| **Total** | **156** | **156 passed, 0 failed** (dev DB and fresh `quickflow_e2e`) |

The cross-module checks behind the TR-4 journey:
- **BR-13:** PATCH a Task plan item `isDone=true` → the task becomes `Done` with `completedAt`. Un-marking the item keeps the task Done.
- **Plan item toggle:** 1 of 3 done → `progressPercent` 33 in the PATCH response and in dashboard `plans.active[]` for that plan. Dashboard `tasks.doneCount` and `completedTodayCount` +1.
- **Habit completion** (POST, no body) → dashboard `habits.completedTodayCount` +1, and the habit item shows `completedToday: true` with `currentStreak: 1`. The plan's habit item is unchanged (no reverse sync).
- **Milestone done** → dashboard `learning.milestonesDone` +1, `milestonesCompletedLast7Days` +1.
- **All items done** → plan `Completed`, 100 %, `restTimeSeconds: null`, appears in `group=completed`. Dashboard `inProgressCount` −1, `completedCount` +1, and the plan leaves `plans.active`.
- **A-24:** deleting a source task keeps the item title with `sourceAvailable: false`.

## 5. Notes for the E2E specs

- **Timestamps:** don't compare `updatedAt` strings. A freshly created row is returned with 7 fractional digits, while DB reads have 6 (M05 handoff §2). Compare instants.
- **"Today":** the backend's default is the server's **local** date. The browser and the server run on the same machine, so the frontend's local "today" matches.
- **Live plan spec (F6):** create a plan with `startDateTime` about 1–2 min ahead. The status flips to `InProgress` on the first read after the start (it is computed per request). Notifications are client-side only.
- **Habit completions:** `POST` completions for an already-completed date returns 409. Treat it as "done".
- **Plan builder:** it accepts archived tasks and inactive habits on the backend. The UI lists non-archived tasks and active habits only.
- **Settings:** a singleton row with defaults on the first GET (`displayName: null`, notifications on, `Dashboard`). After a reset the app starts on the Dashboard.
