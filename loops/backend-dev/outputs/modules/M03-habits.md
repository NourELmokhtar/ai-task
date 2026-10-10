# M03 Habits: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 1 (no failed build, test or runtime step) |
| Start / end | 2026-10-10 15:34 UTC / 15:46 UTC |
| Dependencies | M01-BE `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M03-habits-handoff.md` (READY) |
| Migration | `20261010153933_AddHabits` (tables `Habits`, `HabitCompletions`, unique index `IX_HabitCompletions_HabitId_CompletionDate`, FK cascade) |
| Tests | 119/119 pass (64 existing + 55 new) |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Entities, mapping, unique index, migration | Done | `Habit` (soft-deletable), `HabitCompletion` (hard-deleted), `HabitFrequency`. `HabitConfiguration`, `HabitCompletionConfiguration` (unique (HabitId, CompletionDate), named `SoftDelete` filter `!c.Habit.IsDeleted`). `AppDbContext.Habits`/`HabitCompletions`. Migration `AddHabits` |
| B2 | DTOs | Done | `HabitResponse` (+ computed fields), `CreateHabitRequest`, `UpdateHabitRequest`, `CompletionRequest { date }`, `CompletionResponse` |
| B3 | Validation | Done | `HabitInputValidator`: BR-06 name, description ≤ 2000, frequency required/valid, A-11 inactive/future, completions range |
| B4 | Service | Done | `IHabitService`/`HabitService`: list/get/create/update/activate/deactivate/soft delete, add/remove/list completions, `ExistsAsync`/`GetNamesAsync` for M06. Duplicate → 409 from the service check, and from a caught `DbUpdateException` on a unique-index race |
| B5 | Progress calculator | Done | Static, pure `HabitProgressCalculator.Calculate(frequency, dates, today)` → `HabitProgress`, plus `GetPeriodStart/End` (ISO weeks) |
| B6 | Endpoints + OpenAPI | Done | `HabitsController` (10 operations, tag `Habits`, response types, parameter descriptions) |
| B7 | Unit tests | Done | `tests/QuickFlow.Tests/Habits/*` (55 test cases: calculator 19, validator 20, service 14, persistence 2) |

## Files

Added (all under `backend/`):
- `src/QuickFlow.Application/Domain/Habits/Habit.cs`, `HabitCompletion.cs`, `HabitFrequency.cs`
- `src/QuickFlow.Application/Features/Habits/HabitDtos.cs`, `HabitInputValidator.cs`, `HabitProgressCalculator.cs`, `IHabitService.cs`, `HabitService.cs`
- `src/QuickFlow.Infrastructure/Persistence/Configurations/HabitConfiguration.cs`, `HabitCompletionConfiguration.cs`
- `src/QuickFlow.Infrastructure/Persistence/Migrations/20261010153933_AddHabits.cs` (+ `.Designer.cs`; snapshot updated)
- `src/QuickFlow.Api/Controllers/HabitsController.cs`
- `tests/QuickFlow.Tests/Habits/HabitProgressCalculatorTests.cs`, `HabitInputValidatorTests.cs`, `HabitServiceTests.cs`, `HabitPersistenceTests.cs`

Modified: `Application/DependencyInjection.cs` (registers `IHabitService`), `Infrastructure/Persistence/AppDbContext.cs` (2 DbSets), `README.md` (feature line). No M02 file was changed.

## Verification (executed and observed)

| Check | Command | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln --no-incremental` | PASSED: 0 errors, 0 warnings |
| Tests | `dotnet test QuickFlow.sln` | PASSED: 119/119 |
| Pending model changes | `dotnet dotnet-ef migrations has-pending-model-changes …` | None |
| Run | `ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5081` | PASSED: `Applying migration '20261010153933_AddHabits'`, listening on 5081 |
| Swagger | `/swagger/index.html`, `/openapi/v1.json` | 200. All 10 habit operations listed with params and status codes. `HabitFrequency` enum `[Daily, Weekly]` in schema |
| Curl 1 | POST daily `"  M03V Drink water "`, POST weekly `frequency:"weekly"` | 201 + `Location: /api/habits/1`, name trimmed. 201 `frequency=Weekly`, `isActive=true`, progress zero/null |
| Curl 2 | missing name, 151-char name, `Monthly`, numeric frequency, missing frequency, empty body, 2001-char description | 400 with `errors.name`, `errors.frequency`, `$.frequency`, both keys for empty body, `errors.description`. 150-char name returns 201 |
| Curl 3 | POST `/1/completions` (no body), GET 1 | 201 (`Location …?from=2026-10-10&to=2026-10-10`). `completedToday=true`, `currentStreak=1`, `lastCompletionDate=2026-10-10` |
| Curl 4 | same date again (no body, then explicit date) | 409 `Habit with id '1' is already completed on 2026-10-10.` |
| Curl 5 | DELETE `/1/completions/2026-10-10`, GET, DELETE again, re-complete with `{}` | 204 → `completedToday=false`, streak 0. 404 on the second DELETE. 201 → `completedToday=true` |
| Curl 6 | date 2026-10-11, date 10-10 with `?today=2026-10-09`, bad body date, bad route date | 400 `errors.date` (future) twice. 400 `$.date`. 400 `errors.date` (format) |
| Streak values | daily 10-07..10-10, then `?today=2026-10-09`. Weekly Sun 10-04 + Tue 10-06, then `?today=2026-10-12` | streak 4. Streak 3 with last 10-09. Weekly `completedToday=false`, `completedForCurrentPeriod=true`, streak 2 (Sun→Mon boundary). On Monday 10-12 `currentPeriod=false` and streak 2 |
| DB unique index | 8 parallel POSTs, then 4×40 parallel POSTs (`curl --parallel`) for the same date | Exactly one 201 per date, all others 409, no 500. Log shows MySQL `Duplicate entry '3-2026-09-21' for key 'habitcompletions…'`, so the DB index fired and was mapped to 409. One row per date |
| Completions list | all, `from=10-08&to=10-09`, `to<from`, habit 999 | Ascending by date. Range correct. 400 `errors.to`. 404 |
| Curl 7 | deactivate 2, complete, list `active=false/true`, activate, complete, deactivate 999 | `isActive=false`. 400 `errors.habit`. `[2]` / `[1,3]`. `isActive=true`. 201. 404 |
| Curl 8 | PUT 2 (trimmed name, description, frequency Daily), PUT invalid, PUT 999 | 200 with new values, `updatedAt` changed, `createdAt` same. 400 `name`+`frequency`. 404 |
| Curl 9 | DELETE 2, GET 2, list, completions/complete/remove-completion/activate/DELETE on 2, DELETE 999 | 204. 404. Absent from list. All 404 |
| Extra | `?today=10-10-2026`. CORS preflight from `http://localhost:4200`. `GET /api/tasks` | 400 `errors.today`. 204 with allow-origin. 200 `[]` (M02 unaffected) |
| Secrets | Password scan in `backend/` (excl. bin/obj), value never printed | No credential. The 4-letter value appears only as an ordinary word in the same 3 untouched M01 files as in M02, and in no M03 file. No `password=` pattern |
| Cleanup | DELETE habits 1, 3 (2 already deleted) | `GET /api/habits` (all/active/inactive) returns `[]`. Rows remain soft-deleted (ids 1–3). My processes (QuickFlow.Api PID 29228, `dotnet run` PID 5116) were stopped and 5081 is free |

Port 5080: never used or signalled. At the start it was held by PID 28772 (a scratchpad snapshot `backend-snapshot-m01`). At the end that process no longer existed. It exited independently of this loop, since only PIDs 29228/5116 were stopped.

## Assumptions and ambiguities

- `GET /api/habits` without `active` returns all habits (active and inactive). `active=true|false` filters. The order is `createdAt` ascending.
- The calculator ignores completions dated after `today`. This only matters with a past `?today=`. `lastCompletionDate` is the latest completion on or before `today`.
- Streak = 0 when neither the current nor the previous period is complete. Several completions in one ISO week count as one period.
- Completions are hard-deleted on removal (so the date can be re-completed under the unique index). A habit's completions stay in the DB after the habit is soft-deleted, and the query filter hides them.
- Removing a completion of an **inactive** habit is allowed (A-11 only restricts completing). There is no lower bound on past completion dates.
- POST completions returns `CompletionResponse` (as in spec B2), not the updated habit. The frontend refetches the habit.
- Completion JSON field is `date` (request and response). The DB column is `CompletionDate`.
- `frequency` is a string validated in the service (as M02 does for status/priority), so an invalid value gives `errors.frequency`. Frequency is required on both create and PUT. PUT doesn't change `isActive`.
- `HabitCompletion.CreatedAt` is set by the service from `TimeProvider`. It isn't `IAuditable` (the spec has no `UpdatedAt` for completions).
- `GetNamesAsync` filters in memory to avoid depending on the Oracle provider's translation of list parameters (the data set is small and single-user).
- EF Core logs the caught unique-index `DbUpdateException` at `fail` level during races. The response is still 409.

## Attempts

1. Everything passed on the first attempt. The only issue was a shell heredoc quoting error while writing files, which was a tooling problem and not a verification failure. The files were written with the editor instead.
