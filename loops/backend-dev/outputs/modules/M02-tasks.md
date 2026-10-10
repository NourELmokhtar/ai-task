# M02 Tasks: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 2 (runtime attempt 1 failed on a provider `DateOnly` read issue, fixed in attempt 2) |
| Start / end | 2026-10-10 15:22 UTC / 15:35 UTC |
| Dependencies | M01-BE `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M02-tasks-handoff.md` (READY) |
| Migration | `20261010152625_AddTasks` |
| Tests | 64/64 pass (18 M01 + 46 new) |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Entity, mapping, migration | Done | `TaskItem` (+ `TaskItemStatus`, `TaskPriority`), `TaskItemConfiguration` (table `Tasks`, max lengths, indexes on `IsArchived` and `DueDate`), `AppDbContext.Tasks`, migration `AddTasks` |
| B2 | DTOs | Done | `TaskResponse` (incl. `isOverdue`), `CreateTaskRequest`, `UpdateTaskRequest`, `TaskListQuery` |
| B3 | Validation BR-01..03 | Done | `TaskInputValidator` collects field errors into `ValidationException` (camelCase keys) |
| B4 | Service + reusable completion | Done | `ITaskService`/`TaskService`. `CompleteAsync(int id, CancellationToken)` is reusable. `CompletedAt` lives only in `TaskItem.SetStatus`/`MarkCompleted` |
| B5 | Query | Done | search, status, priority, dueFrom/dueTo, overdue, archived, sortBy/sortDir (null due dates last), today |
| B6 | Endpoints + OpenAPI | Done | `TasksController` (8 endpoints, tag `Tasks`, response types, parameter descriptions) |
| B7 | Unit tests | Done | `tests/QuickFlow.Tests/Tasks/*` + 2 persistence tests |

## Files

Added (all under `backend/`):
- `src/QuickFlow.Application/Domain/Tasks/TaskItem.cs`, `TaskItemStatus.cs`, `TaskPriority.cs`
- `src/QuickFlow.Application/Features/Tasks/TaskDtos.cs`, `TaskInputValidator.cs`, `ITaskService.cs`, `TaskService.cs`
- `src/QuickFlow.Infrastructure/Persistence/Configurations/TaskItemConfiguration.cs`
- `src/QuickFlow.Infrastructure/Persistence/Conventions/DateOnlyDateTimeConverter.cs`
- `src/QuickFlow.Infrastructure/Persistence/Migrations/20261010152625_AddTasks.cs` (+ `.Designer.cs`; snapshot updated)
- `src/QuickFlow.Api/Controllers/TasksController.cs`
- `tests/QuickFlow.Tests/Tasks/TaskInputValidatorTests.cs`, `TaskItemTests.cs`, `TaskServiceTests.cs`

Modified: `Application/DependencyInjection.cs` (registers `ITaskService`), `Infrastructure/Persistence/AppDbContext.cs` (DbSet and `DateOnly` converter), `tests/.../Persistence/MySqlModelConventionTests.cs` (+2 tests), `README.md` (feature line, DateOnly note).

## Verification (executed and observed)

| Check | Command | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln --no-incremental` | PASSED: 0 errors, 0 warnings |
| Tests | `dotnet test QuickFlow.sln` | PASSED: 64/64 |
| Pending model changes | `dotnet dotnet-ef migrations has-pending-model-changes ...` | None (after the converter fix) |
| Run | `ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5081` | PASSED: `Applying migration '20261010152625_AddTasks'`, listening on 5081. `__EFMigrationsHistory` holds both migrations |
| Swagger | `GET /swagger/index.html`, `/openapi/v1.json` | 200. All 8 task operations listed with params and 200/201/204/400/404. `TaskItemStatus`/`TaskPriority` enums in schema |
| Curl 1 | POST `{"title":"M02V-Alpha report","description":"first"}` | 201, `Location: /api/tasks/1`, `status=Todo`, `priority=Medium`, `completedAt=null` |
| Curl 2 | POST missing title / empty body / blank title, 201-char title, invalid priority, invalid status, 2001-char description | 400 with `errors.title` (Required / at most 200), `errors.priority`, `errors.status`, `errors.description`. A 200-char title returns 201 |
| Curl 3 | GET 1, PUT 1 (new title, description, status, priority, dueDate), PUT without status/priority, PUT/GET 999999 | 200. PUT 200 with new values and `updatedAt` changed (`createdAt` unchanged). 400 `status`+`priority` required. 404 |
| Curl 4 | POST /1/complete, again, PUT status Todo, complete 999999 | `status=Done`, `completedAt` set. Second complete keeps `completedAt`. PUT Todo gives `completedAt=null`. 404 |
| Curl 5 | archive 5, list, `archived=true`, restore 5, archive/restore 999999 | Absent from default list, only item with `archived=true`. Back after restore. 404 |
| Curl 6 | `search=gAmMa`, `status=InProgress`/`done`, `priority=High`/`Low`, `dueFrom=2026-10-10&dueTo=2026-10-15`, `sortBy=dueDate&sortDir=asc|desc`, `sortBy=createdAt&sortDir=asc`, invalid values | Correct subsets. asc `[6(10-01),3(10-09),5(10-12),4(10-15),1(10-20),2(null)]`, desc `[1,4,5,3,6,2]` (null last). 400s for bad status/priority/sortBy/sortDir, `dueTo<dueFrom`, bad date, `overdue=maybe` |
| Curl 7 | task 3 due 2026-10-09: `overdue=true&today=2026-10-10`, GET 3 with `today=2026-10-10`/`2026-10-09`, `today=2026-10-13`, archived past task, bad `today` | `[3]` with `isOverdue=true`. Due-today gives false. `[5,3]` for 10-13 (Done task 6 and undated 2 excluded). Archived gives `[]`. 400 `errors.today` |
| Curl 8 | DELETE 4, GET 4, lists, DELETE/complete/restore 4 again, DELETE 999999 | 204. 404. Absent from default, archived and status lists. 404s. DB row kept with `IsDeleted=1` and `DeletedAt` set |
| Extra | health 200. CORS preflight from `http://localhost:4200` allowed. Non-int id gives 404 | PASSED |
| Secrets | Password scan in `backend/` (excl. bin/obj), value not printed | No credential found. The 4-letter password appears only as an ordinary word in 3 untouched M01 files (`.gitignore`, `README.md`, `SoftDeleteModelBuilderExtensions.cs`), never in a credential context, and in no M02 file |
| Cleanup | DELETE of test tasks 1, 2, 3, 5, 6 (4 already deleted) | Lists empty. Rows remain soft-deleted in `quickflow` (ids 1–6). Processes I started (PIDs 27168/27176, then 27184/30084) were stopped and 5081 is free. Port 5080 was untouched |

## Attempts

1. Runtime attempt 1: POST and the first GET worked, but every tracked lookup of a task with a `dueDate` returned 500 `InvalidCastException: Unable to cast 'System.DateTime' to 'System.DateOnly'` (MySql.Data `GetFieldValue<DateOnly>`). M01 had verified only the DDL for `DateOnly`.
2. Fix: `DateOnlyDateTimeConverter` (`DateOnly` ↔ `DateTime`) in `AppDbContext.ConfigureConventions` for `DateOnly`/`DateOnly?`. The column type stays `date` and there were no pending model changes. Added a regression test. Re-run: all checks pass.

## Assumptions and ambiguities

- Request `status`/`priority` are strings validated in the service, so invalid values give `errors.status`/`errors.priority`. Names are matched case-insensitively and numbers are rejected. Responses use real enums.
- PUT is full replacement: `status` and `priority` are required, and an omitted `description`/`dueDate` is cleared.
- Whitespace-only `description` is stored as null. The title is trimmed before the length check.
- `overdue=false` means no filter. `archived=true` means archived only (per B5).
- `dueTo < dueFrom` returns 400 (smallest reading of "400 invalid filter value"). Date-range filters exclude tasks without a due date.
- complete/archive/restore are idempotent. Completing a Done task keeps the original `completedAt`. Archived tasks can be completed or edited.
- `today` is accepted on all task-returning endpoints (M01 convention), not just the list.
- No pagination (not in spec).
