# M01 — Foundation: Platform & App Shell

| Field | Value |
|---|---|
| ID | M01 |
| Type | Foundation |
| Backend status | `READY` *(stack confirmed (D-01). MySQL credentials in user-secrets `quickflow-api-dev` (D-05))* |
| Frontend status | `WAITING` (needs M01-BE) |
| Module dependencies | — |
| Backend dependencies | — |
| Frontend dependencies | M01-BE |
| Handoff | `loops/orchestrator/outputs/handoffs/M01-foundation-handoff.md` |
| Backend project | `backend/` |
| Frontend project | `frontend/` |

## Goal

Create runnable backend and frontend projects, set the shared conventions, persistence, error format and test infrastructure, and build the persistent six-page navigation shell. Every feature module builds on this. This module contains **no feature logic**.

## Requirements Covered

- §4 Application Structure, UX-NAV, DOD-1 (navigation part)
- NFR-R1 (persistence), NFR-M1 (layering), NFR-P1 (baseline), NFR-U2 (shared empty-state component)
- BR-14 (soft-delete mechanism)
- TR-1 (test project infrastructure)
- Assumptions: A-04, A-29, A-30 (default route = Dashboard until M05)
- Decisions: **D-01** (stack, confirmed) · **D-05** (MySQL credentials)

## Technology Stack (D-01, confirmed by user)

| Layer | Choice |
|---|---|
| Backend | ASP.NET Core Web API, **.NET 10** |
| Persistence | EF Core + MySQL provider (Pomelo or Oracle). See the compatibility rule below |
| Database | **MySQL 9.7**, local service `MySQL97` on `localhost:3306`. Dev DB `quickflow`, E2E DB `quickflow_e2e` |
| Backend tests | xUnit |
| Frontend | **Angular** (CLI 20.3.8 available): standalone components, Angular Router, `HttpClient`, signals |
| Frontend tests | Angular CLI default unit-test runner. Playwright for E2E (M09) |

**Provider compatibility rule:** pick the newest EF Core version that has a **stable** MySQL provider release that works with MySQL 9.7. If none supports EF Core 10, use EF Core 9 on .NET 10. If the provider doesn't auto-detect 9.7, set the server version explicitly. Record exact package versions in the handoff.

**Credentials (D-05, resolved):** already stored in the **user-secrets store with id `quickflow-api-dev`** (`%APPDATA%\Microsoft\UserSecrets\quickflow-api-dev\secrets.json`). It holds:
- `ConnectionStrings:QuickFlow` → database `quickflow`
- `ConnectionStrings:QuickFlowE2E` → database `quickflow_e2e`

The API `.csproj` **must** declare `<UserSecretsId>quickflow-api-dev</UserSecretsId>` so Development picks them up. An env var `ConnectionStrings__QuickFlow` may override. **Never commit credentials.** `appsettings*.json` hold no password. Verified 2026-10-10: login works, server 9.7.0, `utf8mb4` / `utf8mb4_0900_ai_ci`, `quickflow*` databases do not exist yet (migrations will create them).

## Scope

**In:** project scaffolding, layering, database + migrations, base entity conventions, clock abstraction, JSON/enum/date conventions, ProblemDetails error handling, OpenAPI/Swagger, CORS, health endpoint, "today" helper, backend unit-test project. Frontend app, six routes with placeholder pages, persistent navigation, API client, shared UI states, toast host, date/duration utilities, connectivity banner.

**Out:** any feature entity, endpoint or page content; settings persistence (M05); E2E suite (M09).

## Backend Tasks

| # | Task |
|---|---|
| B1 | Create a .NET 10 solution in `backend/` with layers: **API** (ASP.NET Core Web API; endpoints/controllers only), **Application/Domain** (entities, services, validation; no HTTP types), **Infrastructure** (EF Core + MySQL). Add an **xUnit test project** referencing Application/Domain |
| B2 | Configure **MySQL** persistence: EF Core MySQL provider (per the compatibility rule), DbContext, `utf8mb4` charset with case-insensitive collation, initial migration, auto-apply migrations on startup in Development (creates DB `quickflow` if missing). Connection string `ConnectionStrings:QuickFlow` from user-secrets id `quickflow-api-dev` (set `<UserSecretsId>` in the API project) or env var, never committed. Switchable to `ConnectionStrings:QuickFlowE2E` for M09 |
| B2a | Add a **local `dotnet-ef` tool manifest** in `backend/` pinned to the EF Core version in use. The global tool is 8.0.8 and too old |
| B3 | Base entity conventions: integer `Id`. `CreatedAt`/`UpdatedAt` set automatically from the clock for entities that have them. Soft delete (`IsDeleted`, `DeletedAt`) with a global query filter so deleted rows never appear in normal queries (BR-14) |
| B4 | Register a clock abstraction (e.g. `TimeProvider`) in DI. Domain/application code must never read the system clock directly |
| B5 | JSON: camelCase, enums as strings, ISO-8601 timestamps (UTC), date-only fields as `YYYY-MM-DD` (`DateOnly` → MySQL `date`, UTC timestamps → `datetime(6)`) |
| B6 | Error handling: global exception handler → ProblemDetails. Validation failures → 400 with field `errors`. Not-found → 404. Conflict → 409. Provide a shared mechanism (exceptions or result type) that feature services use |
| B7 | OpenAPI document + Swagger UI (Development) |
| B8 | CORS policy allowing the Angular dev origin `http://localhost:4200` |
| B9 | `GET /api/health` → `200 { "status": "Healthy", "serverTime": "<ISO UTC>" }` |
| B10 | "Today" helper: read optional `today=YYYY-MM-DD` query param, else server local date. Used by date-relative endpoints in later modules |
| B11 | Fixed dev port. `backend/README.md` with build/run/test/migration commands, URLs, and how to set the MySQL connection string |
| B12 | One sample unit test proving the test project runs (e.g. soft-delete filter or error mapping) |

## Proposed API Contract

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | 200 `{ status, serverTime }` |
| GET | Swagger/OpenAPI JSON | 200 |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Create an **Angular** app in `frontend/` with Angular CLI: standalone components, routing enabled, strict TypeScript. Structure: `core/` (API client, interceptors, app-wide services), `shared/` (reusable UI), `features/<module>/` (one folder per feature module) |
| F2 | Angular Router routes (lazy-loaded feature routes): `/dashboard`, `/tasks`, `/habits`, `/learning`, `/plans`, `/settings`. `/` redirects to `/dashboard` (M05 makes it configurable). Wildcard not-found route |
| F3 | Persistent layout with main navigation in PRD order: Dashboard, Tasks, Habits, Learning Resources, Todo Plans, Settings. Active-item highlight. Usable on narrow screens |
| F4 | Placeholder page per route showing the page title (feature modules replace it) |
| F5 | API access via `HttpClient`: base URL from Angular `environment` files, plus an **HTTP error interceptor** that turns ProblemDetails into a typed error with field errors. Every feature API service (`@Injectable`) uses this setup |
| F6 | Shared standalone components in `shared/`: `EmptyState` (message + primary action), `LoadingState`, `ErrorState` (with retry), `ConfirmDialog`, `Dialog/Modal`, form-field error display (Reactive Forms), global **Toast host component + `ToastService`** (used by M07) |
| F7 | Date/time utils: local today (`YYYY-MM-DD`), date/datetime formatting, local ↔ UTC ISO conversion, duration formatting (`h m s`) |
| F8 | Connectivity check: call `/api/health` on load. Show a non-blocking banner if the backend is unreachable |
| F9 | `frontend/README.md` with run (`ng serve`, port 4200), build and test commands |

## Testing Tasks

**Unit (backend):** the test project builds and runs. At least one test covers a foundation behavior (soft-delete filter or ProblemDetails mapping).

**Curl verification:**
1. `GET /api/health` → 200, `status=Healthy`, `serverTime` present.
2. Swagger JSON endpoint → 200.
3. Unknown API route → 404.
4. CORS preflight (`OPTIONS` with frontend `Origin`) → allowed.
5. MySQL database `quickflow` exists after startup, and `__EFMigrationsHistory` contains the initial migration.
6. No credentials appear in committed config files (`appsettings*.json` contain no password).

**Playwright MCP verification:**
1. App loads with no console errors.
2. Navigation shows all six entries in PRD order.
3. Clicking each entry navigates to its route and highlights the entry.
4. Direct URL load of each route works. `/` lands on Dashboard.
5. With backend running there's no connectivity banner. With backend stopped, the banner appears.

## Completion Criteria

**Backend:** build succeeds · app starts against MySQL · `quickflow` DB created with migrations applied · Swagger available · curl checks 1–6 pass · unit tests pass · README written · handoff created with base URL/port, error format, enum/date conventions, `today` param convention, soft-delete behavior, and exact .NET / EF Core / MySQL provider versions.

**Frontend:** app runs · six routes reachable from persistent nav · API client reaches `/api/health` · shared components exist · Playwright checks 1–5 pass · progress/state/output updated.
