# QuickFlow Backend

ASP.NET Core Web API on **.NET 10**, EF Core **10.0.9** with Oracle **MySql.EntityFrameworkCore 10.0.9** on **MySQL 9.7**, and xUnit tests.

| | |
|---|---|
| Base URL (dev) | `http://localhost:5080` (fixed in `src/QuickFlow.Api/Properties/launchSettings.json`) |
| Health | `GET http://localhost:5080/api/health` |
| Swagger UI (Development) | `http://localhost:5080/swagger` |
| OpenAPI JSON (Development) | `http://localhost:5080/openapi/v1.json` |
| CORS origin | `http://localhost:4200` (`Cors:AllowedOrigins` in `appsettings.json`) |
| Features | Tasks (M02): `/api/tasks` (`TasksController`, `ITaskService`) · Habits (M03): `/api/habits` (`HabitsController`, `IHabitService`, pure `HabitProgressCalculator`) · Learning Resources (M04): `/api/learning-cards` (`LearningCardsController`, `ILearningService`) · Plan Composition (M06): `/api/plans` (`PlansController`, `IPlanService`, `IPlanSourceResolver`, pure `PlanProgressCalculator`) · Settings (M05): `/api/settings` (`SettingsController`, `ISettingsService`, singleton `UserSettings` row id 1) · Dashboard (M08): `GET /api/dashboard?today=` (`DashboardController`, `IDashboardService`, composition of the M02/M03/M04/M07 services, no own tables) |

## Prerequisites

- .NET SDK 10.0.x (`dotnet --list-sdks`)
- MySQL 9.7 running on `localhost:3306` (Windows service `MySQL97`)
- The connection string in user-secrets (see below)

## Connection string (never committed)

`appsettings*.json` contain **no credentials**. The API project declares `<UserSecretsId>quickflow-api-dev</UserSecretsId>`, so in the `Development` environment it reads:

| Key | Database |
|---|---|
| `ConnectionStrings:QuickFlow` | `quickflow` (dev, default) |
| `ConnectionStrings:QuickFlowE2E` | `quickflow_e2e` (E2E, M09) |

Set or replace them (from `backend/`):

```bash
dotnet user-secrets set "ConnectionStrings:QuickFlow" "<connection string>" --project src/QuickFlow.Api
```

Connection string format: `Server=localhost;Port=3306;Database=quickflow;User=<user>;` followed by the `Password` key and value. Don't run `dotnet user-secrets list` where the output gets logged, because it prints the password.

Alternatives:
- Environment variable `ConnectionStrings__QuickFlow`, which overrides user-secrets.
- To point the app at the E2E database, set `Database__ConnectionStringName=QuickFlowE2E` (env var) or pass `--Database:ConnectionStringName=QuickFlowE2E`.

## Build, run and test (from `backend/`)

```bash
dotnet build QuickFlow.sln
dotnet test QuickFlow.sln
dotnet run --project src/QuickFlow.Api --launch-profile http     # http://localhost:5080, Development
```

In Development (`Database:ApplyMigrationsOnStartup=true` in `appsettings.Development.json`), the app applies pending migrations at startup and creates the `quickflow` database if it is missing.

## E2E database `quickflow_e2e` (M09)

The non-secret switch `Database__ConnectionStringName=QuickFlowE2E` makes the API use `ConnectionStrings:QuickFlowE2E` (user-secrets) instead of `ConnectionStrings:QuickFlow`. Startup in Development then creates and migrates `quickflow_e2e`. The dev DB `quickflow` is never opened.

```powershell
# 1. reset (non-interactive). Stop any API using quickflow_e2e first
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reset-e2e-db.ps1          # drop + recreate quickflow_e2e, empty
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reset-e2e-db.ps1 -DryRun  # guards + table count only
# 2. start against it (use the port the frontend calls, default 5080)
$env:ASPNETCORE_ENVIRONMENT='Development'; $env:Database__ConnectionStringName='QuickFlowE2E'
dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080
```

`reset-e2e-db.ps1`:
- **Target:** hard-coded to `quickflow_e2e`, with no parameter to change it. It aborts if `ConnectionStrings:QuickFlowE2E` names any other database (e.g. `quickflow`), or if `ConnectionStrings:QuickFlow` names `quickflow_e2e`.
- **Credentials:** read at runtime from env `ConnectionStrings__QuickFlowE2E` or user-secrets `quickflow-api-dev`. The password reaches `mysql.exe` only through the child-process variable `MYSQL_PWD` and is never printed.
- **mysql.exe:** taken from `-MySqlExe`, `MYSQL_EXE`, `PATH`, or `C:\Program Files\MySQL\MySQL Server 9.7\bin\mysql.exe`.
- **Schema:** it doesn't create tables. The next API start applies the migrations.

## API regression script (M09)

```bash
bash scripts/regression.sh [BASE_URL=http://localhost:5081] [TIMING_ROUNDS=10]
```

The script needs bash, curl and node, and no credentials. It runs 156 checks:
- every M01–M08 endpoint: happy path, a validation 400 and a 404 per resource
- the cross-module flows: BR-13, plan item → dashboard `progressPercent`, habit / milestone → dashboard
- OpenAPI completeness: 38 operations, query params and key response fields
- NFR-P1 timings: median and max per operation, each < 500 ms

It uses a unique `REG<epoch>` prefix and delta assertions, then soft-deletes all of its data and restores the settings, so it is safe on a shared DB. It exits with 1 on any failure.

## Migrations (local dotnet-ef tool, pinned to 10.0.9)

```bash
dotnet tool restore
dotnet dotnet-ef migrations add <Name> --project src/QuickFlow.Infrastructure --startup-project src/QuickFlow.Api --output-dir Persistence/Migrations
dotnet dotnet-ef database update      --project src/QuickFlow.Infrastructure --startup-project src/QuickFlow.Api
dotnet dotnet-ef migrations list      --project src/QuickFlow.Infrastructure --startup-project src/QuickFlow.Api
```

Don't use the global `dotnet-ef` (8.0.8), which is too old.

## Structure

```
backend/
  QuickFlow.sln
  dotnet-tools.json                     local dotnet-ef 10.0.9
  src/
    QuickFlow.Api/                      HTTP only: controllers, ProblemDetails handler, JSON, CORS, OpenAPI
    QuickFlow.Application/              entities (Domain/), services, validation, exceptions; no HTTP types
    QuickFlow.Infrastructure/           EF Core AppDbContext, conventions, configurations, migrations
  tests/
    QuickFlow.Tests/                    xUnit
```

Dependencies: Api → Application + Infrastructure. Infrastructure → Application. Tests → all three.

## Conventions

- **JSON:** camelCase. Enums are strings (integers and unknown names rejected → 400). `DateTime` is ISO-8601 UTC with `Z`. `DateOnly` is `YYYY-MM-DD`.
- **DB:** `DateTime` → `datetime(6)` stored as UTC. `DateOnly` → `date` (through `DateOnlyDateTimeConverter`, because the Oracle provider cannot read `date` as `DateOnly`). Enums → `varchar(50)` holding the name. Database default `utf8mb4` / `utf8mb4_0900_ai_ci` (case-insensitive).
- **Errors:** RFC 7807 ProblemDetails: 400 (with `errors`), 404, 409, 500. Throw `ValidationException`, `NotFoundException` or `ConflictException` from `QuickFlow.Application.Common.Exceptions`.
- **Clock:** inject `TimeProvider`. Never use `DateTime.Now` or `DateTime.UtcNow` directly.
- **"Today":** `[FromQuery] DateOnly? today` (strict `YYYY-MM-DD`) plus `ITodayProvider.GetToday(today)`.
- **Soft delete:** derive from `SoftDeletableEntity`. `Remove()` sets `IsDeleted`/`DeletedAt`, and the global filter `SoftDelete` hides deleted rows.
