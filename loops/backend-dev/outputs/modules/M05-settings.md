# M05 Settings: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 1 (no failed build, runtime or curl step; one unit test fixed during the first run, see Attempts) |
| Start / end | 2026-10-10 18:50 UTC / 18:57 UTC |
| Dependencies | M01-BE `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M05-settings-handoff.md` (READY) |
| Migration | `20261010185230_AddUserSettings` (table `UserSettings`: `Id` int PK **without** auto-increment, `DisplayName` varchar(100) NULL, `PlanStartNotificationsEnabled` tinyint(1), `DefaultView` varchar(50), `CreatedAt`/`UpdatedAt` datetime(6)). Applied to `quickflow` |
| Tests | 282/282 pass (248 existing + 34 new) |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Entity, mapping, migration | Done | `UserSettings : AuditableEntity` (not soft-deletable), fixed `SingletonId = 1`, `CreateDefault()`. `DefaultView` enum (6 values). `UserSettingsConfiguration` with `ValueGeneratedNever()` key. `AppDbContext.UserSettings` DbSet. Lazy creation, no seed |
| B2 | DTOs | Done | `SettingsResponse(displayName, planStartNotificationsEnabled, defaultView, updatedAt)`, `UpdateSettingsRequest` (`bool?`, `string?` so missing/invalid values give field-keyed errors) |
| B3 | Validation | Done | `SettingsInputValidator`: displayName trimmed, empty → null, ≤ 100; `planStartNotificationsEnabled` required; `defaultView` required and one of the six names (case-insensitive, numbers rejected). All errors collected |
| B4 | Service | Done | `ISettingsService`/`SettingsService`: `GetAsync` (get-or-create), `UpdateAsync` (full replacement, get-or-create first). Concurrency: the fixed PK makes a second concurrent insert fail with a duplicate key (`DbUpdateException`). The loser detaches its row and re-reads the saved one |
| B5 | Endpoints + OpenAPI | Done | `SettingsController` (`GET`/`PUT /api/settings`, tag `Settings`, response types, field descriptions) |
| B6 | Unit tests | Done | `tests/QuickFlow.Tests/Settings/*` (34 cases: validator 24, service 9, persistence 1) |

## Files

Added (all under `backend/`):
- `src/QuickFlow.Application/Domain/Settings/UserSettings.cs`, `DefaultView.cs`
- `src/QuickFlow.Application/Features/Settings/SettingsDtos.cs`, `SettingsInputValidator.cs`, `ISettingsService.cs`, `SettingsService.cs`
- `src/QuickFlow.Infrastructure/Persistence/Configurations/UserSettingsConfiguration.cs`
- `src/QuickFlow.Infrastructure/Persistence/Migrations/20261010185230_AddUserSettings.cs` (+ `.Designer.cs`; snapshot updated)
- `src/QuickFlow.Api/Controllers/SettingsController.cs`
- `tests/QuickFlow.Tests/Settings/SettingsInputValidatorTests.cs`, `SettingsServiceTests.cs`, `SettingsPersistenceTests.cs`

Modified: `Application/DependencyInjection.cs` (registers `ISettingsService`), `Infrastructure/Persistence/AppDbContext.cs` (DbSet + using), `README.md` (feature line). No other module's file was changed. `frontend/` was not touched.

## Unit test coverage (spec)

| Spec item | Tests |
|---|---|
| defaults on first read | `First_read_returns_defaults_and_creates_the_row` |
| display name 101 chars → invalid | `Display_name_of_101_characters_is_invalid` (+ 100 valid, 100 + spaces valid after trimming) |
| invalid default view → invalid | `Invalid_default_view_is_invalid` (×5: `Unknown`, `1`, `0`, `Learning`, `Tasks,Habits`), `Default_view_is_required` (×3) |
| update persists all fields | `Update_persists_all_fields` (re-read through a new context) |
| get-or-create idempotency | `Get_or_create_is_idempotent`, `Concurrent_first_reads_create_a_single_row` (8 parallel contexts), `Losing_the_first_insert_race_returns_the_saved_row_instead_of_failing` |
| extra | all six views accepted, empty name → null, notifications required, empty request reports both required fields, identical PUT keeps `UpdatedAt`, PUT before GET creates the row, rejected PUT changes nothing, MySQL DDL (no `AUTO_INCREMENT`, no `IsDeleted`) |

## Verification (executed and observed)

| Check | Command | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln --no-incremental` | PASSED: 0 errors, 0 warnings |
| Tests | `dotnet test QuickFlow.sln` (run 3× for the parallel test, then after the last test was added) | PASSED: 282/282 |
| Pending model changes | `dotnet dotnet-ef migrations has-pending-model-changes …` | None |
| Run | `ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5081` | PASSED: `Applying migration '20261010185230_AddUserSettings'`, listening on 5081 |
| Concurrent first reads (real MySQL) | 10 parallel `GET /api/settings` right after startup, table empty | 10 × 200 with identical defaults. 9 requests lost the insert (`Duplicate entry '1'` on the PK, logged by EF as `fail`) and returned the saved row. No unhandled exception, no 500, and the PK rules out a second row |
| Swagger | `/swagger/index.html`, `/openapi/v1.json` | 200. `/api/settings` `get` (200) and `put` (200, 400), tag `Settings`. `DefaultView` enum `[Dashboard, Tasks, Habits, LearningResources, TodoPlans, Settings]`. `SettingsResponse` and `UpdateSettingsRequest` with descriptions |
| Curl 1 | GET | 200 `{"displayName":null,"planStartNotificationsEnabled":true,"defaultView":"Dashboard",...}` |
| Curl 2 | PUT `"  Nour M05  "`, false, `Tasks`; then GET | 200 name trimmed to `Nour M05`. GET returns the same values |
| Curl 3 | PUT `defaultView:"Unknown"`; PUT 101-char name; GET | 400 `errors.defaultView`; 400 `errors.displayName` (`Display name must be at most 100 characters.`); GET unchanged |
| Curl extras | `{}`; no body; `"1"`; JSON number `1`; `"yes"` for the bool; 100-char name + `learningresources`; CORS preflight PUT from `:4200`; M02/M03/M04/M06 list endpoints + health | 400 both required keys (×2); 400 `errors.defaultView`; 400 `$.defaultView`; 400 `$.planStartNotificationsEnabled`; 200 `LearningResources`; 204 allow-origin `http://localhost:4200`; all 200 |
| Curl 4 | PUT `Nour Restart`/false/`TodoPlans`, stop my processes, `dotnet run` again, GET | Restart logged `No migrations were applied`. GET returns `Nour Restart`/false/`TodoPlans` (NFR-R1) |
| Restore defaults | PUT `displayName:"   "`, true, `Dashboard`; GET | 200 `displayName:null`, true, `Dashboard` (also confirms whitespace → null at runtime) |
| Secrets | Pattern scan (`password=`, `pwd=`, `uid=`) and a value scan against user-secrets in `backend/` (excl. bin/obj), value never printed | No credential. The 4-letter value only appears as an ordinary word in untouched M01 files (`.gitignore`, `dotnet-tools.json`, `README.md`, `SoftDeleteModelBuilderExtensions.cs`), and in no M05 file |
| Cleanup | Stopped my processes by PID (run 1: QuickFlow.Api 28104 / `dotnet run` 10912; run 2: 29252 / 29584) | 5081 free. Port 5080 (PID 6224, frontend loop) was never used or signalled and was still listening at the end |

## Decisions, assumptions and ambiguities

- **Lazy creation instead of a seed row.** The spec allows either. Lazy creation needs no hand-written seed data with a fixed `UpdatedAt`. It's made safe by the fixed, non-generated PK `Id = 1`, so concurrent first inserts can't create a second row, plus catching `DbUpdateException` and re-reading the saved row.
- `UserSettings` derives from `AuditableEntity`, so it also has a `CreatedAt` column that the API doesn't expose. This lets the DbContext set `UpdatedAt` automatically (M01 convention "never set timestamps manually"). `UpdatedAt` changes only when a value changes.
- PUT is a full replacement. `planStartNotificationsEnabled` and `defaultView` are required, and an omitted `displayName` clears it. This matches the "full update" wording and the M02–M04 PUT behavior.
- `defaultView` is accepted case-insensitively on input and always returned in canonical case (same as `status` in M02–M04). Numeric values are rejected.
- `displayName` length is checked after trimming. Inner whitespace is kept. No character restrictions.
- No 404 on GET and no DELETE. Settings always exist logically (A-03).
- The `fail` log entries from EF for a lost first-insert race are expected. They can occur only on the very first concurrent reads of an empty table.
- The `DefaultView` → route mapping comes from the assignment and is documented in the handoff. The backend stores only the enum.

## Attempts

1. On the first test run, `Losing_the_first_insert_race_returns_the_saved_row_instead_of_failing` failed with `ArgumentException: An item with the same key has already been added`. Cause: the EF in-memory provider reports a duplicate key as `ArgumentException`, while relational providers (MySQL) throw `DbUpdateException`, which the service handles. This is a test-double artifact. Fix: the test's `RacingContext` wrapper converts the in-memory exception to `DbUpdateException`, as a relational provider would. The concurrent-reads test was also made truly parallel (`Task.Run`) through the same wrapper. The production behavior was then confirmed on real MySQL (10 parallel first GETs, 9 duplicate-key losers recovered). Build, runtime and curl verification all passed on the first run.
