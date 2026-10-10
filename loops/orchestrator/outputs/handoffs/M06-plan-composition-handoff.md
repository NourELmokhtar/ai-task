# M06 Plan Composition: Backend Handoff

Handoff Status: READY

This handoff is for the M06 frontend loop and for M07, M08 and M09. There is no auth. The dev base URL is `http://localhost:5080`, the same API as M01–M04 (the backend loop verified it on 5081). All M01 conventions apply: camelCase JSON, string enums, UTC `DateTime` ending in `Z`, and ProblemDetails errors. Migration: `20261010160347_AddPlans`, which creates the tables `Plans` and `PlanItems`. The frontend snapshot on 5080 must be rebuilt from the current `backend/` to include M06.

## 1. Endpoints

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/plans` | none | 200 `PlanResponse[]` | none |
| GET | `/api/plans/{id}` | none | 200 `PlanResponse` | 404 |
| POST | `/api/plans` | `CreatePlanRequest` | 201 `PlanResponse` + `Location: /api/plans/{id}` | 400 |
| PUT | `/api/plans/{id}` | `UpdatePlanRequest` (metadata only) | 200 `PlanResponse` | 400, 404 |
| DELETE | `/api/plans/{id}` | none | 204 (no body) | 404 |
| PATCH | `/api/plans/{id}/items/{itemId}` | `{ "isDone": true \| false }` | 200 **full** `PlanResponse` (progress refreshed) | 400, 404 |

- `{id}` and `{itemId}` are integers. A non-integer value gives 404.
- **List order (A-16):** `priorityOrder` ascending, then `startDateTime` ascending, then `id`. There is no pagination and no filter.
- No query parameters. There is no `today` parameter: M06 has no date-dependent fields.
- CORS preflight for PATCH from `http://localhost:4200` is allowed (verified).

## 2. Models

### PlanResponse

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `title` | string | 1–200 chars, trimmed |
| `estimatedDurationMinutes` | int | > 0 |
| `startDateTime` | ISO UTC string | e.g. `"2026-10-11T06:00:00Z"` |
| `endDateTime` | ISO UTC string | after `startDateTime` |
| `priorityOrder` | int | ≥ 1, lower = higher priority, duplicates allowed |
| `status` | `"NotStarted"` \| `"InProgress"` \| `"Completed"` | Always `"NotStarted"` in M06. **M07 computes it** |
| `createdAt` | ISO UTC string | |
| `updatedAt` | ISO UTC string | Changes on PUT only (not on item PATCH) |
| `totalItems` | int | All items, including ones whose source was deleted |
| `doneItems` | int | Items with `isDone=true` |
| `progressPercent` | int 0–100 | `round(doneItems / totalItems × 100)`, midpoint away from zero (1/3 = 33, 2/3 = 67) |
| `items` | `PlanItemResponse[]` | Creation order (`id` ascending, same order as in the create request) |

### PlanItemResponse

| Field | Type | Notes |
|---|---|---|
| `id` | int | Use for the PATCH route |
| `sourceType` | `"Task"` \| `"Habit"` \| `"LearningResource"` | |
| `sourceId` | int | Task / habit / learning-card id |
| `sourceTitle` | string \| null | Task title, habit name or card title. Still resolved after the source is deleted. `null` only if the source row cannot be found at all (not expected, since deletes are soft) |
| `sourceAvailable` | boolean | `false` once the source is soft-deleted (A-24): show a "source removed" label |
| `isDone` | boolean | `false` on create |

Example (201 from POST, start/end sent with `+03:00`):
```json
{"id":1,"title":"M06V Morning plan","estimatedDurationMinutes":120,"startDateTime":"2026-10-11T06:00:00Z","endDateTime":"2026-10-11T09:00:00Z","priorityOrder":2,"status":"NotStarted","createdAt":"2026-10-10T16:06:49.8879311Z","updatedAt":"2026-10-10T16:06:49.8879311Z","totalItems":3,"doneItems":0,"progressPercent":0,"items":[{"id":1,"sourceType":"Task","sourceId":42,"sourceTitle":"M06V task","sourceAvailable":true,"isDone":false},{"id":2,"sourceType":"Habit","sourceId":16,"sourceTitle":"M06V habit","sourceAvailable":true,"isDone":false},{"id":3,"sourceType":"LearningResource","sourceId":3,"sourceTitle":"M06V card","sourceAvailable":true,"isDone":false}]}
```

### CreatePlanRequest (`POST`)

```json
{ "title": "Morning plan", "estimatedDurationMinutes": 120,
  "startDateTime": "2026-10-11T09:00:00+03:00", "endDateTime": "2026-10-11T12:00:00+03:00",
  "priorityOrder": 1,
  "items": [ { "sourceType": "Task", "sourceId": 42 }, { "sourceType": "Habit", "sourceId": 16 }, { "sourceType": "LearningResource", "sourceId": 3 } ] }
```
All fields are required. Date-times are ISO-8601. An offset is converted to UTC, and no offset is treated as UTC, so send `new Date(local).toISOString()`. `sourceType` is case-insensitive. Items are **fixed after creation** (A-17).

### UpdatePlanRequest (`PUT`, full replacement of metadata)

`{ title, estimatedDurationMinutes, startDateTime, endDateTime, priorityOrder }`, all required. An `items` property in the body is ignored, and items never change. `status` is not accepted.

### UpdatePlanItemRequest (`PATCH`)

`{ "isDone": true }`. `isDone` is required.

## 3. Validation and error responses (exact)

All field errors are collected into one 400 `application/problem+json` with an `errors` map (camelCase keys). **Item errors are keyed by the 0-based index in the request's `items` array.**

| Key | Rule | Message |
|---|---|---|
| `title` | required, not whitespace-only | `Title is required.` |
| `title` | ≤ 200 after trim | `Title must be at most 200 characters.` |
| `estimatedDurationMinutes` | required | `Estimated duration is required.` |
| `estimatedDurationMinutes` | > 0 (A-15) | `Estimated duration must be greater than 0 minutes.` |
| `startDateTime` | required | `Start date/time is required.` |
| `endDateTime` | required | `End date/time is required.` |
| `endDateTime` | after start, compared in UTC (BR-11, POST and PUT) | `End date/time must be after the start date/time.` |
| `priorityOrder` | required | `Priority order is required.` |
| `priorityOrder` | ≥ 1 (A-16) | `Priority order must be at least 1.` |
| `items` | missing or empty (BR-10) | `At least one item is required.` |
| `items[i]` | `null` entry | `Item is required.` |
| `items[i].sourceType` | missing | `Source type is required.` |
| `items[i].sourceType` | not a valid name | `Source type must be one of: Task, Habit, LearningResource.` |
| `items[i].sourceId` | missing | `Source id is required.` |
| `items[i].sourceId` | source missing or soft-deleted (BR-10) | `Task with id '999' does not exist or has been deleted.` (also `Habit with id …`, `Learning resource with id …`) |
| `items[i]` | duplicate (sourceType, sourceId) (A-17) | `Duplicate item: Task 42 is already in the plan (items[0]).` (later occurrences are flagged) |
| `isDone` (PATCH) | required | `IsDone is required.` |

Observed bodies:
```json
// POST items:[]
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"items":["At least one item is required."]},"traceId":"00-..."}
// POST with a non-existent task as the 2nd item
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"items[1].sourceId":["Task with id '999999' does not exist or has been deleted."]},"traceId":"00-..."}
// POST with a duplicate
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"items[2]":["Duplicate item: Task 42 is already in the plan (items[0])."]},"traceId":"00-..."}
// POST or PUT with end before start
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"endDateTime":["End date/time must be after the start date/time."]},"traceId":"00-..."}
// POST with an empty body: title, estimatedDurationMinutes, startDateTime, endDateTime, priorityOrder and items errors together
```
- JSON type errors come from model binding and use `$.`-paths. For example, `"sourceType":1` gives `errors["$.items[0].sourceType"]`, and a malformed date gives `errors["$.startDateTime"]`, both with a technical message. Validate types and dates on the client.
- 404 `detail`s: `Plan with id '1' was not found.` (missing or deleted plan, on every route) and `Plan item with id '1' was not found on plan '2'.` (item missing or on another plan).
- On PUT and PATCH, the plan and item lookup runs before validation, so a missing plan gives 404 even with an invalid body.
- Frontend: map `errors` keys to fields, `items[i]...` to the i-th selected item, otherwise show `detail ?? title`.

## 4. Business rules relevant to the UI

- **BR-10 / A-18:** ≥ 1 item. Valid sources are any **non-deleted** task (archived tasks are accepted), habit (inactive habits are accepted) or learning card. The builder UI should still list only non-archived tasks, active habits and all cards (spec F3).
- **BR-11:** end must be after start (equal is rejected), on create and update.
- **A-17:** no duplicate (sourceType, sourceId) per plan. The same id with a different type is fine. Items cannot be added or removed after creation. Edit mode shows items read-only.
- **BR-13 / A-19 (PATCH):**
  - `isDone=true` on a **Task** item also completes the task (`status=Done`, `completedAt` set) by calling `ITaskService.CompleteAsync`. This is idempotent: an already-Done task keeps its `completedAt`. The item flag and the task completion are saved in **one** `SaveChanges` (atomic).
  - `isDone=false` only clears the item flag. **The task stays Done.**
  - **Habit** and **LearningResource** items only change the item flag. No habit completion is created and the card is unchanged.
  - No reverse sync: changing a task, habit or card never changes plan items.
  - After toggling a Task item, refresh any cached task list, because the task's status changed server-side.
- **A-24:** when a source is soft-deleted later, the item stays, shows the original title with `sourceAvailable=false`, and still counts in `totalItems`/`progressPercent`. It can still be toggled. A Task item whose task was deleted changes only the item flag, with no error.
- **BR-14:** DELETE is a soft delete. Afterwards every route for that plan gives 404 and the plan is absent from the list. Its item rows stay in the DB, hidden.
- `status` is always `NotStarted` from M06. Don't derive UI state from it until M07.

## 5. Reusable pieces for M07 / M08 (namespace `QuickFlow.Application.Features.Plans`)

```csharp
// Pure progress calculator (B5)
public sealed record PlanProgress(int TotalItems, int DoneItems, int ProgressPercent) { public static readonly PlanProgress Empty; public bool IsComplete { get; } } // IsComplete: total > 0 && done == total
public static class PlanProgressCalculator
{
    public static PlanProgress Calculate(int totalItems, int doneItems);      // throws ArgumentOutOfRange if negative or done > total; 0 items -> Empty (0%)
    public static PlanProgress Calculate(IEnumerable<bool> itemDoneFlags);
}

// Source resolver (B4), scoped. Uses ITaskService.GetTitlesAsync / IHabitService.GetNamesAsync / ILearningService.GetTitlesAsync
public readonly record struct PlanSourceKey(PlanItemSourceType SourceType, int SourceId);
public sealed record PlanSourceInfo(string Title, bool Available);
public interface IPlanSourceResolver
{   // titles incl. soft-deleted sources (Available=false); never-existing sources absent
    Task<IReadOnlyDictionary<PlanSourceKey, PlanSourceInfo>> ResolveAsync(IEnumerable<PlanSourceKey> sources, CancellationToken ct = default);
}

// Plan service, scoped
public interface IPlanService
{
    Task<IReadOnlyList<PlanResponse>> ListAsync(CancellationToken ct = default);   // A-16 order
    Task<PlanResponse> GetAsync(int id, CancellationToken ct = default);
    Task<PlanResponse> CreateAsync(CreatePlanRequest request, CancellationToken ct = default);
    Task<PlanResponse> UpdateAsync(int id, UpdatePlanRequest request, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
    Task<PlanResponse> SetItemDoneAsync(int planId, int itemId, UpdatePlanItemRequest request, CancellationToken ct = default);
}
// PlanResponse.From(Plan, IReadOnlyList<PlanItem>, IReadOnlyDictionary<PlanSourceKey, PlanSourceInfo>) builds the API model.
```

Entities (`QuickFlow.Application.Domain.Plans`): `Plan` (SoftDeletableEntity: `Title`, `EstimatedDurationMinutes`, `StartDateTime`/`EndDateTime` UTC `datetime(6)`, `PriorityOrder`, `Status` (`PlanStatus` stored as varchar(50), settable), `Items`) and `PlanItem` (`PlanId`, `Plan`, `SourceType` (`PlanItemSourceType`), `SourceId` (no FK), `IsDone`). The tables are `Plans` (index `(PriorityOrder, StartDateTime)`) and `PlanItems` (FK cascade, unique index `(PlanId, SourceType, SourceId)`, `SoftDelete` filter `!i.Plan.IsDeleted`). `AppDbContext.Plans` and `AppDbContext.PlanItems` are available.

**For M07:** compute `status` from the clock (`TimeProvider`) and `PlanProgress.IsComplete`, either by persisting it to `Plan.Status` or by mapping at read time. M06 deliberately has no lifecycle logic. `PlanItem` has no `CompletedAt`, so add one in M07 if history needs it. To delete a plan, load it **without** `Items`. Otherwise EF's client-side cascade hard-deletes tracked items.

**For M08:** `IPlanService.ListAsync()` already returns per-plan progress. For aggregates, query `db.Set<Plan>()` / `db.Set<PlanItem>()` (filters apply) and use `PlanProgressCalculator`.

## 6. Changes to dependency modules (smallest additions, default behavior unchanged)

- **M02:** `ITaskService.GetTitlesAsync(IEnumerable<int> ids, bool includeDeleted = false, CancellationToken ct = default)` (new). It returns titles of non-deleted tasks (archived included), plus soft-deleted ones when `includeDeleted`. Test: `TaskServiceTests.Titles_for_other_modules_cover_archived_and_optionally_deleted_tasks`.
- **M03:** `IHabitService.GetNamesAsync(ids, bool includeDeleted = false, ct)` gains the optional `includeDeleted` parameter, in the same style as M04. With the default `false` it behaves as before. Test: `HabitServiceTests.Names_including_deleted_resolve_soft_deleted_habits_for_M06`.
- **M04:** none (uses `ILearningService.GetTitlesAsync(ids, includeDeleted)`).
- **M02:** `ITaskService.CompleteAsync` is reused unchanged for BR-13.

## 7. Verification state

Build 0 errors / 0 warnings · tests 212/212 (165 existing + 47 new) · `AddPlans` applied to `quickflow` · Swagger lists all 6 operations (tag `Plans`) · curl checks 1–10 passed on 5081 · M02/M03/M04 endpoints still 200. Test data was soft-deleted, so `GET /api/plans` returns `[]`. Plan ids continue from 4. Details: `loops/backend-dev/outputs/modules/M06-plan-composition.md`.
