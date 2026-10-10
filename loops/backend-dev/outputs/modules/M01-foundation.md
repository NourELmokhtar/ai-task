# M01 Foundation: Backend Module Output

| Field | Value |
|---|---|
| Module | M01 Foundation (backend layer) |
| Final status | **COMPLETED** |
| Dependencies | None |
| Date | 2026-10-10 (14:59–15:20 UTC) |
| Handoff | `loops/orchestrator/outputs/handoffs/M01-foundation-handoff.md` (READY) |

## Versions chosen

- .NET SDK 10.0.401, runtime 10.0.12, `net10.0`.
- EF Core 10.0.9, with Oracle `MySql.EntityFrameworkCore` 10.0.9 (the newest stable EF Core 10 provider; Pomelo's stable releases stop at 9.0.0).
- Local `dotnet-ef` 10.0.9.
- Microsoft.AspNetCore.OpenApi 10.0.12 and Swashbuckle.AspNetCore.SwaggerUI 10.3.0.
- xUnit 2.9.3.
- EF Core is pinned to 10.0.9 to match the provider's exact dependency.

## Tasks

| # | Task | Status | Notes |
|---|---|---|---|
| B1 | Solution and layers | Done | `QuickFlow.sln`: Api / Application (+Domain) / Infrastructure / Tests |
| B2 | MySQL persistence | Done | `AppDbContext`, `UseMySQL`, initial migration, auto-migrate when `Database:ApplyMigrationsOnStartup` (true in Development), `Database:ConnectionStringName` switch (QuickFlow / QuickFlowE2E), user-secrets id `quickflow-api-dev` |
| B2a | Local dotnet-ef manifest | Done | `backend/dotnet-tools.json`, dotnet-ef 10.0.9 |
| B3 | Base entity conventions | Done | `Entity`, `AuditableEntity`, `SoftDeletableEntity`, `IAuditable`, `ISoftDeletable`. Timestamps set in `SaveChanges`. `Remove()` becomes a soft delete. Named global filter `SoftDelete` |
| B4 | Clock | Done | `TimeProvider.System` singleton |
| B5 | JSON and DB types | Done | camelCase, strict string enums, UTC `Z` DateTime converter, DateOnly `YYYY-MM-DD`. EF conventions: `datetime(6)`, `date`, enum → `varchar(50)` |
| B6 | Error handling | Done | `GlobalExceptionHandler` (IExceptionHandler) + `ExceptionProblemDetailsMapper`. App exceptions map to 400/404/409, anything else to 500. `UseStatusCodePages` for empty-body errors |
| B7 | OpenAPI and Swagger | Done | `/openapi/v1.json`, `/swagger` (Development) |
| B8 | CORS | Done | `http://localhost:4200`, exposes `Location` |
| B9 | Health | Done | `GET /api/health` |
| B10 | Today helper | Done | `ITodayProvider.GetToday(DateOnly?)` + strict `IsoDateOnlyModelBinder` for query/route DateOnly |
| B11 | Fixed port and README | Done | Port 5080. `backend/README.md` |
| B12 | Unit tests | Done | 18 tests: soft-delete filter, audit timestamps, named filter, MySQL DDL conventions, ProblemDetails mapping, JSON conventions, today provider and strict date parsing |

## Files (backend/)

- Root: `QuickFlow.sln`, `dotnet-tools.json`, `.gitignore`, `README.md`.
- `src/QuickFlow.Api`:
  - `Program.cs`
  - `Controllers/HealthController.cs`, `Contracts/HealthResponse.cs`
  - `ErrorHandling/{GlobalExceptionHandler, ExceptionProblemDetailsMapper}.cs`
  - `Json/{JsonConventions, UtcDateTimeJsonConverter}.cs`
  - `ModelBinding/IsoDateOnlyModelBinder.cs`
  - `appsettings.json`, `appsettings.Development.json`, `Properties/launchSettings.json`, `QuickFlow.Api.http`
- `src/QuickFlow.Application`:
  - `Domain/Common/*`
  - `Common/Exceptions/*`
  - `Common/Interfaces/IApplicationDbContext.cs`
  - `Common/Time/{ITodayProvider, TodayProvider}.cs`
  - `DependencyInjection.cs`
- `src/QuickFlow.Infrastructure`:
  - `Persistence/AppDbContext.cs`
  - `Persistence/Conventions/{UtcDateTimeConverter, SoftDeleteModelBuilderExtensions}.cs`
  - `Persistence/DatabaseOptions.cs`
  - `Persistence/Migrations/20261010151522_InitialCreate*`, `AppDbContextModelSnapshot.cs`
  - `DependencyInjection.cs`
- `tests/QuickFlow.Tests`: `TestSupport/TestDbContext.cs`, `Persistence/*`, `Api/*`, `Application/*`.

## Verification (executed and observed)

| Check | Command | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln` | PASS: Build succeeded, 0 warnings |
| Unit tests | `dotnet test QuickFlow.sln` | PASS: 18/18 |
| App start | `dotnet run --project src/QuickFlow.Api --launch-profile http` | PASS: "Applying migration '20261010151522_InitialCreate'", "Now listening on: http://localhost:5080" |
| 1 Health | `curl -i http://localhost:5080/api/health` | PASS: 200 `{"status":"Healthy","serverTime":"2026-10-10T15:16:30.6683303Z"}` |
| 2 OpenAPI | `curl http://localhost:5080/openapi/v1.json` and `/swagger/index.html` | PASS: 200 application/json (openapi 3.1.1, contains `/api/health`). Swagger UI 200 text/html |
| 3 Unknown route | `curl -i http://localhost:5080/api/does-not-exist` | PASS: 404 `application/problem+json` `{"type":"...15.5.5","title":"Not Found","status":404,"traceId":...}` |
| 4 CORS preflight | `curl -i -X OPTIONS .../api/health -H "Origin: http://localhost:4200" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"` | PASS: 204 with `Access-Control-Allow-Origin: http://localhost:4200`. A disallowed origin gets no ACAO header. GET exposes `Location` |
| 5 DB | `mysql -e "SHOW DATABASES LIKE 'quickflow%'; SELECT * FROM quickflow.__EFMigrationsHistory; ...SCHEMATA"` (password via `MYSQL_PWD` from secrets, never echoed) | PASS: `quickflow` exists. History row `20261010151522_InitialCreate / 10.0.9`. Charset `utf8mb4`, collation `utf8mb4_0900_ai_ci` |
| 6 No credentials | `grep -rniE "password=\|pwd=" backend --exclude-dir=bin --exclude-dir=obj` | PASS: no matches |
| Extra | `curl -i -X DELETE .../api/health` | 405 ProblemDetails with `Allow: GET` |
| Cleanup | Stopped the processes and checked port 5080 | PASS: port 5080 free, no QuickFlow processes left |

The 400 and 409 shapes are covered by unit tests (`ExceptionProblemDetailsMapperTests`). No M01 endpoint can produce them at runtime.

## Attempts and issues

- **Build/tests:** first build passed. The NU1903 warning (vulnerable transitive `SQLitePCLRaw` 2.1.11 from the EF SQLite test provider) was resolved by switching the tests to EF InMemory.
- **DDL test, attempt 1:** model-level `HasCharSet` was not reflected in CREATE TABLE. Fixed by moving to per-entity charset, then replaced by the final approach below.
- **Runtime step:**
  - Attempt 1: the build failed because the Oracle provider's generated migration and snapshot referenced `MySQLModelBuilderExtensions` without a using.
  - Attempt 2: a global using made `UseCollation` ambiguous in the generated snapshot.
  - Attempt 3: no provider charset APIs in the model. The hand-edited initial migration runs `ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`. Passed.
  - A scratch-copy probe confirmed that a feature-entity migration generates and compiles.

## Assumptions

- Enums are stored in the DB as strings (`varchar(50)`) to mirror the JSON contract. The spec didn't set a DB representation.
- Integer JSON enum values are rejected (400) per "invalid values → 400".
- The health endpoint doesn't check the DB. The spec requires only `{status, serverTime}`.
- Swagger and OpenAPI are Development-only, matching the spec wording.
- The base `appsettings.json` keeps migrations off. Development turns them on.
- Controllers were chosen over minimal APIs.
- The Application layer references EF Core (`IApplicationDbContext` exposes `DbSet`) as a pragmatic layering choice. It has no HTTP types.
- A standard `.gitignore` was added to `backend/` (the workspace now has `.git`).
