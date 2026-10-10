# QuickFlow

QuickFlow is a single-user personal productivity app with six pages:

| Page | What it does |
|---|---|
| Dashboard | Today's tasks (due and overdue), habit progress, active plans with live rest time, learning progress |
| Tasks | Create, edit, complete, archive and remove tasks. Filter by status, priority, due date and overdue |
| Habits | Daily and weekly habits, completion toggle, streaks |
| Learning Resources | Learning cards with milestones and notes |
| To-Do Plans | Time-boxed plans built from existing tasks, habits and learning cards. Shows progress, status (NotStarted / InProgress / Completed) and rest time |
| Settings | Display name, plan-start notifications, default start page |

| Layer | Technology | Folder | Details |
|---|---|---|---|
| Frontend | Angular 20 (standalone components, signals) | `frontend/` | [`frontend/README.md`](frontend/README.md) |
| Backend | ASP.NET Core Web API on .NET 10, EF Core 10 | `backend/` | [`backend/README.md`](backend/README.md) |
| Database | MySQL 9.x (`quickflow` for dev, `quickflow_e2e` for E2E) | | |

There is no authentication (single local user).

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| .NET SDK | 10.0.x | `dotnet --list-sdks` |
| MySQL Server | 9.x (developed on 9.7), on `localhost:3306` | `mysql --version` |
| Node.js / npm | Node 24, npm 11 | `node --version` |
| Angular CLI | 20.3 (a devDependency, so `npx ng ...` works without a global install) | `npx ng version` |
| Chrome | any current version, for headless unit tests | |
| Playwright Chromium | for E2E: `npx playwright install chromium` (run in `frontend/`) | |

## One-time setup: connection strings (user-secrets)

Credentials are **never committed**. `appsettings*.json` contain none. The API project uses user-secrets id `quickflow-api-dev` and reads two keys in the Development environment:

| Key | Database | Used for |
|---|---|---|
| `ConnectionStrings:QuickFlow` | `quickflow` | normal development (default) |
| `ConnectionStrings:QuickFlowE2E` | `quickflow_e2e` | automated E2E runs (isolated, resettable) |

Set them once, from `backend/`. Replace `<...>` with your own values.

```bash
dotnet user-secrets set "ConnectionStrings:QuickFlow"    "Server=localhost;Port=3306;Database=quickflow;User=<user>;Password=<password>"     --project src/QuickFlow.Api
dotnet user-secrets set "ConnectionStrings:QuickFlowE2E" "Server=localhost;Port=3306;Database=quickflow_e2e;User=<user>;Password=<password>" --project src/QuickFlow.Api
```

Don't run `dotnet user-secrets list` where the output is logged, because it prints the password. You can use the environment variables `ConnectionStrings__QuickFlow` / `ConnectionStrings__QuickFlowE2E` instead of user-secrets. Neither database has to exist beforehand: the API creates the database and applies all migrations at startup in Development.

## Run the app

Start the backend first, then the frontend, each in its own terminal.

```bash
# 1. Backend API on http://localhost:5080 (Development, DB quickflow)
cd backend
dotnet run --project src/QuickFlow.Api --launch-profile http
#    health:  http://localhost:5080/api/health
#    swagger: http://localhost:5080/swagger      openapi: http://localhost:5080/openapi/v1.json

# 2. Frontend on http://localhost:4200
cd frontend
npm install          # first time only
npm start            # ng serve --port 4200
```

Open http://localhost:4200. The frontend calls the API at `apiBaseUrl` (`http://localhost:5080`, set in `frontend/src/environments/`). The API allows CORS from `http://localhost:4200`.

## Tests

### Backend unit/integration tests (xUnit)

```bash
cd backend
dotnet test QuickFlow.sln          # 302 tests, no database needed (EF Core InMemory)
```

### Backend API regression (curl, optional)

This runs against a **running** API and needs bash, curl and node. It checks every endpoint (happy path, validation 400, 404), the cross-module flows (plan item → task Done, plan/habit/milestone changes → dashboard), OpenAPI completeness and NFR-P1 timings. It is safe on a shared DB: it uses a unique prefix, delta assertions and soft-deletes everything it created.

```bash
bash backend/scripts/regression.sh http://localhost:5080 10   # base URL, timing rounds (0 = skip timings)
```

### Frontend unit tests (Karma + Jasmine)

```bash
cd frontend
npm run test:ci      # ng test --watch=false --browsers=ChromeHeadless
```

### End-to-end tests (Playwright)

E2E runs use the separate database **`quickflow_e2e`**, so they never touch your dev data. The switch is the non-secret setting `Database__ConnectionStringName=QuickFlowE2E`. The password stays in user-secrets and never appears in the Playwright config.

1. **Reset the E2E database** (non-interactive). Stop any API that uses `quickflow_e2e` first.
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/reset-e2e-db.ps1           # drop + recreate quickflow_e2e (empty)
   powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/reset-e2e-db.ps1 -DryRun   # check guards only, change nothing
   ```
   The script can only ever drop `quickflow_e2e`. It refuses to run if `ConnectionStrings:QuickFlowE2E` points to any other database, or if the dev connection string points to `quickflow_e2e`. It reads credentials at runtime and never prints them.
2. **Start the backend against `quickflow_e2e`** on the port the frontend calls (`apiBaseUrl`, default 5080). Stop the normal dev API on that port first. Startup applies all migrations to the empty database (about 3 s).
   ```bash
   cd backend
   # bash
   ASPNETCORE_ENVIRONMENT=Development Database__ConnectionStringName=QuickFlowE2E \
     dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080
   ```
   ```powershell
   # PowerShell
   $env:ASPNETCORE_ENVIRONMENT='Development'; $env:Database__ConnectionStringName='QuickFlowE2E'
   dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080
   ```
3. **Run the suite** (Playwright reuses `ng serve` on 4200, or starts it):
   ```bash
   cd frontend
   npx playwright install chromium   # once
   npm run e2e                       # playwright test
   ```

See [`frontend/README.md`](frontend/README.md) for spec-specific options and [`backend/README.md`](backend/README.md) for migrations, conventions and the scripts.

## Repository layout

```
backend/            .NET solution (Api, Application, Infrastructure, Tests) + scripts/ (regression.sh, reset-e2e-db.ps1)
frontend/           Angular app + e2e/ (Playwright specs)
requirements/       product requirements (PRD)
docs/               project documentation
loops/              development-loop working files (orchestrator, backend-dev, frontend-dev)
```
