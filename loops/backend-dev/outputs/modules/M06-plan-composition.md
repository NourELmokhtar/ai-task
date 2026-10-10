# M06 Plan Composition: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 1 (no failed build, test, runtime or curl step) |
| Start / end | 2026-10-10 15:59 UTC / 16:10 UTC |
| Dependencies | M02-BE, M03-BE, M04-BE `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M06-plan-composition-handoff.md` (READY) |
| Migration | `20261010160347_AddPlans` (tables `Plans`, `PlanItems`; FK `PlanItems.PlanId` → `Plans` with cascade; unique `(PlanId, SourceType, SourceId)`; index `(PriorityOrder, StartDateTime)`) |
| Tests | 212/212 pass (165 existing + 47 new) |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Entities, mapping, migration | Done | `Plan` (soft-deletable, `Items` navigation), `PlanItem` (hard child, no FK on `SourceId`), `PlanStatus`, `PlanItemSourceType`. `PlanConfiguration`, `PlanItemConfiguration` (named `SoftDelete` filter `!i.Plan.IsDeleted`). Two DbSets. Migration `AddPlans` (local `dotnet dotnet-ef`) |
| B2 | DTOs | Done | `PlanResponse` (+ `totalItems`, `doneItems`, `progressPercent`), `PlanItemResponse` (`sourceTitle`, `sourceAvailable`), `CreatePlanRequest` + `CreatePlanItemRequest`, `UpdatePlanRequest` (metadata only), `UpdatePlanItemRequest` |
| B3 | Validation | Done | `PlanInputValidator`: A-14 title, A-15 duration, BR-11 end > start (UTC), A-16 priority, BR-10 ≥ 1 item, item structure keyed `items[i]…`, A-17 duplicates, `isDone` required. Source existence is added by the service into the same error map |
| B4 | Source resolver | Done | `IPlanSourceResolver`/`PlanSourceResolver` → `ITaskService.GetTitlesAsync` (new), `IHabitService.GetNamesAsync(includeDeleted)` (extended), `ILearningService.GetTitlesAsync(includeDeleted)` (existing). Two batched lookups per type: all incl. deleted (title) and non-deleted (availability) |
| B5 | Progress calculator | Done | `PlanProgressCalculator` (pure) + `PlanProgress` record (`IsComplete`) |
| B6 | Plan service | Done | `IPlanService`/`PlanService`: list (A-16), get, create, update metadata, soft delete, `SetItemDoneAsync` with BR-13 through `ITaskService.CompleteAsync` (one SaveChanges) |
| B7 | Endpoints + OpenAPI | Done | `PlansController` (6 operations, tag `Plans`, response types, descriptions) |
| B8 | Unit tests | Done | `tests/QuickFlow.Tests/Plans/*` (45) + 1 in `TaskServiceTests` + 1 in `HabitServiceTests` |

## Files

Added (all under `backend/`):
- `src/QuickFlow.Application/Domain/Plans/Plan.cs`, `PlanItem.cs`, `PlanItemSourceType.cs`, `PlanStatus.cs`
- `src/QuickFlow.Application/Features/Plans/PlanDtos.cs`, `PlanInputValidator.cs`, `PlanProgressCalculator.cs`, `PlanSourceResolver.cs`, `IPlanService.cs`, `PlanService.cs`
- `src/QuickFlow.Infrastructure/Persistence/Configurations/PlanConfiguration.cs`, `PlanItemConfiguration.cs`
- `src/QuickFlow.Infrastructure/Persistence/Migrations/20261010160347_AddPlans.cs` (+ `.Designer.cs`; snapshot updated)
- `src/QuickFlow.Api/Controllers/PlansController.cs`
- `tests/QuickFlow.Tests/Plans/PlanProgressCalculatorTests.cs`, `PlanInputValidatorTests.cs`, `PlanServiceTests.cs`, `PlanPersistenceTests.cs`

Modified:
- `Application/DependencyInjection.cs` (registers `IPlanSourceResolver`, `IPlanService`)
- `Infrastructure/Persistence/AppDbContext.cs` (2 DbSets + using)
- `README.md` (feature line)
- **M02** `Features/Tasks/ITaskService.cs`, `TaskService.cs`: new `GetTitlesAsync(ids, includeDeleted = false)`. Additive only; no existing method was changed. Test added to `TaskServiceTests.cs`.
- **M03** `Features/Habits/IHabitService.cs`, `HabitService.cs`: `GetNamesAsync` gets an optional `includeDeleted = false` before the `CancellationToken` (same signature style as M04). The default behavior is unchanged, and the existing test passes as-is. Test added to `HabitServiceTests.cs`.

## Unit test coverage (spec TR-1)

| Spec item | Tests |
|---|---|
| empty items → invalid | `PlanInputValidatorTests.Empty_items_are_invalid` (`[]` and null), `PlanServiceTests.Duplicate_item_and_empty_items_are_invalid` |
| non-existent source → invalid | `PlanServiceTests.Non_existent_source_is_invalid_and_names_the_item` (Task/Habit/Learning, index keys, nothing saved), `Deleted_source_cannot_be_added_but_archived_task_and_inactive_habit_can` |
| duplicate item → invalid | `PlanInputValidatorTests.Duplicate_item_is_invalid_and_names_the_index`, `PlanServiceTests.Duplicate_item_and_empty_items_are_invalid` |
| end ≤ start → invalid | `PlanInputValidatorTests.End_not_after_start_is_invalid` (equal and before; create and update), `Start_and_end_compare_in_utc`, `PlanServiceTests.Update_with_end_before_start_is_invalid_and_changes_nothing` |
| duration ≤ 0 → invalid | `Duration_not_positive_is_invalid` (0, −5) |
| priority < 1 → invalid | `Priority_below_one_is_invalid` (0, −1) |
| progress 0/3, 1/3, 2/3, 3/3 = 0, 33, 67, 100 | `PlanProgressCalculatorTests.Percent_is_rounded_done_over_total` (+ 1/8 = 13, 3/7 = 43), `PlanServiceTests.Progress_goes_0_33_67_33` (end-to-end to 100) |
| task item done → task Done + CompletedAt (via M02) | `Task_item_done_completes_the_task_via_M02_and_progress_rises` |
| task item un-done → task unchanged | `Task_item_undone_leaves_the_task_done` (status and original `CompletedAt`) |
| habit item done → no habit completion | `Habit_item_done_creates_no_habit_completion` |
| learning item done → card unchanged | `Learning_item_done_leaves_the_card_unchanged` (deep-equal card detail) |
| deleted source → `sourceAvailable=false`, still counted | `Source_deleted_later_is_unavailable_with_title_and_still_counts` (card + habit, list = get), `Task_item_of_deleted_task_can_be_marked_done_without_touching_the_task` |
| extra | create response/defaults, metadata + source errors in one response, list order A-16, PUT metadata only (items/progress kept, `updatedAt`), delete → 404 on all routes with rows kept, item from another plan → 404, `isDone` required, calculator guards, MySQL DDL, M02/M03 helper tests |

## Verification (executed and observed)

| Check | Command / request | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln --no-incremental` | PASSED: 0 errors, 0 warnings |
| Tests | `dotnet test QuickFlow.sln` | PASSED: 212/212 |
| Pending model changes | `dotnet dotnet-ef migrations has-pending-model-changes …` | None |
| Run | `ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5081` | PASSED: `Applying migration '20261010160347_AddPlans'`, listening on 5081 |
| Swagger | `/swagger/index.html`, `/openapi/v1.json` | 200. `/api/plans` get,post · `/api/plans/{id}` get,put,delete · `/api/plans/{id}/items/{itemId}` patch. Enums `PlanItemSourceType [Task, Habit, LearningResource]`, `PlanStatus [NotStarted, InProgress, Completed]` |
| Prereq | POST task, habit, learning card | task 42, habit 16, card 3 |
| Curl 1 | POST plan with 3 items, times with `+03:00`, title with spaces | 201, `Location: /api/plans/1`, `progressPercent=0`, `totalItems=3`, times returned as UTC `Z` (09:00+03 → 06:00Z), title trimmed, titles resolved, all `sourceAvailable=true` |
| Curl 2 | `items: []`. Non-existent task as 2nd item. Duplicate (`task` 42 at index 2). Invalid `sourceType`. Empty body. `sourceType: 1` | 400 `items`. 400 `items[1].sourceId` "Task with id '999999' does not exist or has been deleted.". 400 `items[2]` "Duplicate item: Task 42 is already in the plan (items[0]).". 400 `items[0].sourceType`. 400 with all 6 field keys. 400 `$.items[0].sourceType`. No plan created |
| Curl 3 | end before start. Duration 0 + priority 0 | 400 `endDateTime`. 400 `estimatedDurationMinutes` + `priorityOrder` |
| Curl 4 | 2 more plans (p1 start 10-12, p2 start 10-10). GET list. GET 1. GET 999 | Order 2 (p1), 3 (p2, earlier), 1 (p2, later). 200 full plan. 404 `Plan with id '999' was not found.` |
| Curl 5 | PATCH task item `isDone=true`. GET task 42 | 200 `progressPercent=33`. Task `status=Done`, `completedAt` set |
| Curl 6 | PATCH habit item `isDone=true`. GET habit 16 + completions | 200 `progressPercent=67`. `completedToday=false` (unchanged), completions `[]` |
| Curl 7 | PATCH task item `isDone=false`. GET task 42 | 200 `progressPercent=33`. Task still `Done`, same `completedAt` |
| Curl 7 extras | PATCH `{}`. PATCH item 1 via plan 2. PATCH item 999. GET card 3 | 400 `isDone` "IsDone is required.". 404 "Plan item with id '1' was not found on plan '2'.". 404. Card `NotStarted`, `updatedAt` unchanged |
| Curl 8 | PUT new title/duration/times/priority 1 (+ `items: []`, ignored). Order. PUT end before start. PUT `{title}` only. PUT 999 | 200, metadata updated, `updatedAt` changed, items and progress (33) unchanged. Plan 1 first (p1, earlier start than plan 2). 400 `endDateTime`. 400 with 4 required-field keys. 404. Plan 1 unchanged after the failed PUTs |
| Curl 9 | DELETE learning card 3. GET plan 1, plan 3. PATCH the unavailable item. POST a plan with card 3 | 204. Item 3 `sourceTitle="M06V card"`, `sourceAvailable=false`, still counted (3 items, 33%). Plan 3 likewise. 200 `isDone=true`, 67%. 400 `items[0].sourceId` "Learning resource with id '3' does not exist or has been deleted." |
| A-24 extra | DELETE task 42, PATCH its item `isDone=true` | 200, 100%, `sourceAvailable=false`, title kept. No error, and task 42 stays 404 |
| Curl 10 | DELETE plan 1. GET 1. DELETE / PATCH / PUT on 1 again. List. GET `/api/plans/abc` | 204. 404 `Plan with id '1' was not found.`. 404 ×3. List has only 2 and 3. 404 |
| Extra | CORS preflight PATCH from `http://localhost:4200`. `GET /api/tasks`, `/habits`, `/learning-cards`, `/health` | 204 with `Access-Control-Allow-Origin` and `-Methods: PATCH`. All 200 (M02–M04 unaffected) |
| Secrets | Pattern scan (`password=`, `pwd=`, `uid=`, `user id=`) in `backend/` (excl. bin/obj) + value scan against user-secrets (value never printed) | No pattern hits. The 4-letter value matches only ordinary words in 4 untouched M01 files (case-insensitive scan: `.gitignore`, `README.md`, `dotnet-tools.json`, `SoftDeleteModelBuilderExtensions.cs`). No M06 file and no credential |
| Cleanup | DELETE plans 2, 3, habit 16 (task 42, card 3, plan 1 already deleted) | `GET /api/plans` → `[]`. Task 42, habit 16 and card 3 → 404. Rows remain soft-deleted (plan ids 1–3). My processes (QuickFlow.Api PID 25896, `dotnet run` PID 2124) were stopped by PID, and 5081 is free |

Port 5080: never used or signalled. At the start, PID 27192 (the frontend loop's snapshot API) was listening. At the end it was no longer running. The frontend loop starts and stops its snapshot by PID itself, and this loop stopped only PIDs 25896 and 2124.

## Decisions, assumptions and ambiguities

- **Item error keys:** `items[i]` (null entry, duplicate), `items[i].sourceType`, `items[i].sourceId` (missing, not found, deleted). `i` is the 0-based index in the request. Duplicates flag every later occurrence and name the first index. Metadata errors and item/source errors are returned together in one 400.
- **Valid sources (A-18):** any non-deleted task (archived accepted), habit (inactive accepted) or learning card (any status). Filtering to non-archived tasks and active habits is a UI concern (spec F3).
- **BR-13 propagation:** every PATCH with `isDone=true` on a Task item calls `ITaskService.CompleteAsync`, which is idempotent and keeps an existing `completedAt`. So re-marking an already-done item re-completes a task the user re-opened on the Tasks page, which matches "marking done completes the task". The item change is staged first and saved by `CompleteAsync`'s `SaveChanges` (one implicit transaction). If it throws, nothing is saved.
- **Task item of a task deleted later:** marking it done changes only the item flag (availability is checked via the resolver first), instead of returning the task's 404. The smallest choice consistent with A-24 ("item is kept", still toggleable).
- **PUT:** a full replacement of the 5 metadata fields, all required. `items` in the body is ignored (default System.Text.Json behavior), and `status` is not accepted. `updatedAt` changes on PUT only, not on item PATCH.
- **Status:** stored, defaults to `NotStarted`, settable on the entity. No lifecycle logic (M07).
- **Time comparison:** BR-11 is checked in UTC after offset conversion. Equal start and end is rejected. The duration is not checked against the window (A-15).
- **Item rows on plan delete:** kept (soft-deleted plan, items hidden by the filter), as in M04. `DeleteAsync` loads only the plan, so EF's client-side cascade cannot hard-delete tracked items.
- **List order tie-break:** `id` after `priorityOrder`, `startDateTime`.
- **Rounding:** `progressPercent` rounds midpoints away from zero (12.5 → 13). Spec examples 33 and 67 hold either way.
- **Resolver cost:** up to 2 in-memory-filtered lookups per source type per response (style of the M03/M04 helpers). This is fine for single-user data. Lookups are sequential because the services share one scoped DbContext.
- Timestamps on POST responses have 7 fractional digits (in-memory value). Values read back from `datetime(6)` have 6. This is the same as M02–M04.

## Attempts

1. Everything passed on the first run: build (0 warnings), 212/212 tests, migration applied at startup, Swagger, curl checks 1–10 and the extras. No retries were needed.
