# M01 Foundation: Backend Handoff

Handoff Status: READY

For the M01 frontend loop and every later backend module. No feature endpoints exist yet. Auth: none.

## 1. Endpoints and URLs

| | |
|---|---|
| Base URL (dev) | `http://localhost:5080`, fixed via launch profile `http` |
| Health | `GET /api/health` → `200 {"status":"Healthy","serverTime":"2026-10-10T15:16:30.6683303Z"}` |
| Swagger UI | `http://localhost:5080/swagger` (Development only) |
| OpenAPI JSON | `http://localhost:5080/openapi/v1.json` (OpenAPI 3.1, Development only) |
| CORS | Origin `http://localhost:4200`, any method or header, exposes `Location` |
| Unknown route | `404` `application/problem+json` |

Frontend: set `apiBaseUrl = 'http://localhost:5080'` in the Angular environment. All feature APIs live under `/api/...`.

## 2. Commands (run from `backend/`)

```bash
dotnet build QuickFlow.sln
dotnet test QuickFlow.sln
dotnet run --project src/QuickFlow.Api --launch-profile http        # applies migrations, creates DB `quickflow` if missing
dotnet tool restore                                                   # local dotnet-ef 10.0.9 (dotnet-tools.json)
dotnet dotnet-ef migrations add <Name> --project src/QuickFlow.Infrastructure --startup-project src/QuickFlow.Api --output-dir Persistence/Migrations
dotnet dotnet-ef database update      --project src/QuickFlow.Infrastructure --startup-project src/QuickFlow.Api
```

## 3. Versions

| Component | Version |
|---|---|
| .NET SDK / runtime | 10.0.401 / 10.0.12 (`net10.0`) |
| EF Core (`Microsoft.EntityFrameworkCore`, `.Relational`, `.Design`) | 10.0.9 |
| MySQL provider | **Oracle `MySql.EntityFrameworkCore` 10.0.9** (uses `MySql.Data` 26.7.0). Pomelo's latest stable is 9.0.0 (EF Core 9 only), so it wasn't chosen |
| dotnet-ef (local tool) | 10.0.9 |
| Microsoft.AspNetCore.OpenApi | 10.0.12 |
| Swashbuckle.AspNetCore.SwaggerUI | 10.3.0 (UI only. The document comes from Microsoft.AspNetCore.OpenApi) |
| Tests | xunit 2.9.3, xunit.runner.visualstudio 3.1.4, Microsoft.NET.Test.Sdk 17.14.1, Microsoft.EntityFrameworkCore.InMemory 10.0.9 |
| MySQL server | 9.7.0. The Oracle provider needs no server-version setting |

## 4. Structure: where future modules add code

```
backend/src/QuickFlow.Application/
  Domain/<Feature>/...              entities (derive from SoftDeletableEntity) + enums
  Features/<Feature>/...            services, DTOs, validation (suggested folder; no HTTP types here)
  Common/Exceptions/                ValidationException, NotFoundException, ConflictException
  Common/Interfaces/IApplicationDbContext.cs
  Common/Time/ITodayProvider.cs
  DependencyInjection.cs            AddApplication(): register feature services here
backend/src/QuickFlow.Infrastructure/
  Persistence/AppDbContext.cs       add DbSet<T> properties here
  Persistence/Configurations/       IEntityTypeConfiguration<T> classes (auto-applied)
  Persistence/Migrations/           generated migrations
backend/src/QuickFlow.Api/
  Controllers/<Feature>Controller.cs   [ApiController][Route("api/<feature>")], thin, calls Application services
backend/tests/QuickFlow.Tests/      xUnit; TestSupport/ has TestDbContext + FixedTimeProvider
```

Steps for a new feature:
1. Add the entity in `Application/Domain/<Feature>`.
2. Add `public DbSet<X> Xs => Set<X>();` to `AppDbContext`, plus an `IEntityTypeConfiguration<X>` (max lengths, indexes).
3. Add a service in Application that uses `IApplicationDbContext` (`db.Set<X>()` or a typed property you add to the interface) and register it in `AddApplication()`.
4. Add the controller.
5. Run `migrations add`.

## 5. Error format (RFC 7807 ProblemDetails, `application/problem+json`)

Throw these from Application services. The global handler maps them:

| Exception | Status | Example body |
|---|---|---|
| `ValidationException(field, msg)` or `ValidationException(IDictionary<string,string[]>)` | 400 | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"title":["Title is required."]},"traceId":"..."}` |
| `NotFoundException("Task", id)` | 404 | `{"type":"...#section-15.5.5","title":"Not Found","status":404,"detail":"Task with id '42' was not found.","traceId":"..."}` |
| `ConflictException(msg)` | 409 | `{"type":"...#section-15.5.10","title":"Conflict","status":409,"detail":"...","traceId":"..."}` |
| any other exception | 500 | `{"title":"An unexpected error occurred.","status":500,"traceId":"..."}` (no internals) |

- Model-binding and DataAnnotations failures (`[ApiController]`) also return 400 with `errors`. Keys use the camelCase JSON names, and body JSON errors use paths such as `$.status`.
- Empty-body error statuses (unknown route 404, 405) are ProblemDetails too.
- Use camelCase field names in `ValidationException` keys.
- Frontend: read `errors` (field → messages[]) for form errors, otherwise `detail ?? title`.

## 6. JSON, enum and date conventions

- Properties use camelCase.
- Enums are strings using the C# member name (`"InProgress"`). Integers and unknown names are rejected → 400.
- `DateTime` is ISO-8601 **UTC** with `Z` (`"2026-10-10T08:30:00Z"`). Input with an offset is converted to UTC, and input without an offset is treated as UTC.
- `DateOnly` is `"YYYY-MM-DD"`.
- DB mapping: `DateTime` → `datetime(6)` (UTC, read back as `Kind=Utc`). `DateOnly` → `date`. Enums → `varchar(50)` holding the name. Integer identity `Id`.
- DB charset: database default `utf8mb4` / `utf8mb4_0900_ai_ci` (case- and accent-insensitive). New tables and columns inherit it.

## 7. "Today" helper (B10)

```csharp
[HttpGet]
public async Task<ActionResult<...>> Get([FromQuery] DateOnly? today, [FromServices] ITodayProvider todayProvider /* or ctor-inject */)
{
    var effectiveToday = todayProvider.GetToday(today); // ?today=YYYY-MM-DD, else server local date
    ...
}
```
- The `today` value must be exactly `YYYY-MM-DD`. Anything else → 400 with `errors.today`.
- Services take a `DateOnly today` parameter and never compute it themselves.

## 8. Soft delete (BR-14)

- Entities derive from `SoftDeletableEntity` (`Id`, `CreatedAt`, `UpdatedAt`, `IsDeleted`, `DeletedAt`). The building blocks are `Entity`, `AuditableEntity`, `IAuditable` and `ISoftDeletable`.
- Delete by calling `db.Set<X>().Remove(x); await db.SaveChangesAsync();`. `AppDbContext` turns this into `IsDeleted=true` and `DeletedAt=now`, so the row is kept.
- The global named query filter `"SoftDelete"` hides deleted rows from all queries. To bypass it (e.g. a restore), use `.IgnoreQueryFilters([SoftDeleteModelBuilderExtensions.SoftDeleteFilter])`.
- `CreatedAt` and `UpdatedAt` are set automatically on save from `TimeProvider`. Never set them manually.
- A soft-deleted item looked up by id should throw `NotFoundException` → 404. The filter does this naturally.

## 9. Clock

`TimeProvider` is registered as a singleton (`TimeProvider.System`). Inject it and use `GetUtcNow()` or `GetLocalNow()`. Never use `DateTime.Now` or `DateTime.UtcNow`. In tests, use `TestSupport/FixedTimeProvider`.

## 10. User-secrets and configuration

- The API csproj has `<UserSecretsId>quickflow-api-dev</UserSecretsId>`.
- Keys: `ConnectionStrings:QuickFlow` (DB `quickflow`) and `ConnectionStrings:QuickFlowE2E` (DB `quickflow_e2e`). They are loaded in the Development environment.
- Env var `ConnectionStrings__QuickFlow` overrides user-secrets.
- To switch to the E2E DB (M09): `Database__ConnectionStringName=QuickFlowE2E`.
- `Database:ApplyMigrationsOnStartup` is `true` in `appsettings.Development.json` and `false` in the base file.
- `appsettings*.json` contain no credentials.

## 11. Known issues for later modules

- **Don't use the Oracle provider's charset/collation APIs** (`HasCharSet`, `UseCollation` from `MySql.EntityFrameworkCore.Extensions`, `ForMySQLHasCharset`/`Collation`). Its migration code generator then emits `MySQLModelBuilderExtensions...` calls that don't compile (missing using), and adding the using makes `UseCollation` ambiguous. The database default collation already covers case-insensitivity.
- `DateOnly` mapping is verified with the provider (`date`), as is an entity migration (identity, `datetime(6)`, `date`, `varchar(50)` enum, index). It was generated and compiled in a scratch copy.
- Startup logs the warning `No instantiatable types implementing IEntityTypeConfiguration` until the first feature adds a configuration. This is expected.
- The initial migration `20261010151522_InitialCreate` was hand-edited to run `ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`. Don't regenerate it.
