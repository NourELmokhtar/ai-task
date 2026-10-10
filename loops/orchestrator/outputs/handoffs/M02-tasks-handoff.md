# M02 Tasks: Backend Handoff

Handoff Status: READY

For the M02 frontend loop and for M06/M08/M09. Auth: none. Base URL (dev): `http://localhost:5080` (same API as M01; verified by the backend loop on 5081). All conventions from the M01 handoff apply: camelCase JSON, string enums, UTC `DateTime` with `Z`, `DateOnly` as `YYYY-MM-DD`, and ProblemDetails errors.

## 1. Endpoints

| Method | Path | Query | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/tasks` | `search`, `status`, `priority`, `dueFrom`, `dueTo`, `overdue`, `archived`, `sortBy`, `sortDir`, `today` | none | 200 `TaskResponse[]` | 400 |
| GET | `/api/tasks/{id}` | `today` | none | 200 `TaskResponse` | 404 |
| POST | `/api/tasks` | `today` | `CreateTaskRequest` | 201 `TaskResponse` + `Location: /api/tasks/{id}` | 400 |
| PUT | `/api/tasks/{id}` | `today` | `UpdateTaskRequest` | 200 `TaskResponse` | 400, 404 |
| POST | `/api/tasks/{id}/complete` | `today` | none | 200 `TaskResponse` | 404 |
| POST | `/api/tasks/{id}/archive` | `today` | none | 200 `TaskResponse` | 404 |
| POST | `/api/tasks/{id}/restore` | `today` | none | 200 `TaskResponse` | 404 |
| DELETE | `/api/tasks/{id}` | none | none | 204 (no body) | 404 |

- `{id}` is an integer. A non-integer id gives 404.
- `today=YYYY-MM-DD` is optional on every endpoint that returns tasks. It only affects `isOverdue` and the `overdue` filter. Without it, the server's local date is used. An invalid format gives 400 with `errors.today`.
- complete, archive and restore are idempotent. Completing an already-Done task keeps its original `completedAt`.
- No pagination. The list returns all matching tasks.

### List query parameters (`GET /api/tasks`)

| Param | Type / values | Default | Behaviour |
|---|---|---|---|
| `search` | string | none | Case-insensitive substring of `title`, trimmed. Empty means no filter |
| `status` | `Todo` \| `InProgress` \| `Done` (case-insensitive) | none | Exact match. One value only |
| `priority` | `Low` \| `Medium` \| `High` (case-insensitive) | none | Exact match. One value only |
| `dueFrom` | `YYYY-MM-DD` | none | `dueDate >= dueFrom`. Tasks without a due date are excluded |
| `dueTo` | `YYYY-MM-DD` | none | `dueDate <= dueTo`. Tasks without a due date are excluded. `dueTo < dueFrom` gives 400 |
| `overdue` | `true` \| `false` | none | `true` returns only overdue tasks (rule in §4). `false` or absent applies no filter |
| `archived` | `true` \| `false` | `false` | `false` returns non-archived tasks only. `true` returns archived tasks **only** |
| `sortBy` | `createdAt` \| `dueDate` (case-insensitive) | `createdAt` | Tie-break by `id` in the same direction |
| `sortDir` | `asc` \| `desc` | `desc` | With `sortBy=dueDate`, null due dates are **always last** (asc and desc) |
| `today` | `YYYY-MM-DD` | server local date | Used for `isOverdue` and `overdue=true` |

Filters combine with AND. Frontend recipes: "Due today" is `dueFrom=D&dueTo=D`. "Overdue" is `overdue=true`. "Show archived" is `archived=true`.

## 2. Models

### TaskResponse

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `title` | string | 1–200 chars, trimmed |
| `description` | string \| null | ≤ 2000 chars |
| `status` | `"Todo"` \| `"InProgress"` \| `"Done"` | |
| `priority` | `"Low"` \| `"Medium"` \| `"High"` | |
| `dueDate` | `"YYYY-MM-DD"` \| null | |
| `createdAt` | ISO UTC string | e.g. `"2026-10-10T15:28:21.23648Z"` |
| `updatedAt` | ISO UTC string | changes on every successful modification |
| `isArchived` | boolean | |
| `completedAt` | ISO UTC string \| null | Set when status becomes Done, cleared when it leaves Done |
| `isOverdue` | boolean | Computed for the effective `today` (§4) |

Example:
```json
{"id":1,"title":"M02V-Alpha report v3","description":"updated again","status":"Done","priority":"High","dueDate":"2026-10-20","createdAt":"2026-10-10T15:28:21.23648Z","updatedAt":"2026-10-10T15:29:44.909481Z","isArchived":false,"completedAt":"2026-10-10T15:29:44.9094206Z","isOverdue":false}
```

### CreateTaskRequest (`POST`)

| Field | Type | Required | Default |
|---|---|---|---|
| `title` | string | yes | |
| `description` | string \| null | no | null |
| `status` | `"Todo"` \| `"InProgress"` \| `"Done"` | no | `"Todo"` |
| `priority` | `"Low"` \| `"Medium"` \| `"High"` | no | `"Medium"` |
| `dueDate` | `"YYYY-MM-DD"` \| null | no | null |

Creating with `status:"Done"` sets `completedAt`.

### UpdateTaskRequest (`PUT`, full replacement)

Same fields as create, but `status` and `priority` are **required**. `description` and `dueDate` are replaced as sent: omitted or null **clears** them. Send the full current object when editing. Archive state is not part of PUT; use archive/restore.

## 3. Validation (400) and error bodies

Rules (all field errors are returned together):

| Field | Rule | Message (exact) |
|---|---|---|
| `title` | missing, empty or whitespace-only (BR-01) | `Title is required.` |
| `title` | > 200 chars after trimming | `Title must be at most 200 characters.` |
| `description` | > 2000 chars (whitespace-only is stored as null) (BR-02) | `Description must be at most 2000 characters.` |
| `status` | not a valid name (BR-03) | `Status must be one of: Todo, InProgress, Done.` |
| `priority` | not a valid name (BR-03) | `Priority must be one of: Low, Medium, High.` |
| `status` / `priority` | missing on PUT | `Status is required.` / `Priority is required.` |
| query `sortBy` | invalid | `SortBy must be one of: dueDate, createdAt.` |
| query `sortDir` | invalid | `SortDir must be one of: asc, desc.` |
| query `dueTo` | before `dueFrom` | `dueTo must be on or after dueFrom.` |
| query `dueFrom` / `dueTo` / `today` | not `YYYY-MM-DD` | `The value '10-10-2026' is not a valid date. Use the format YYYY-MM-DD.` |
| query `overdue` / `archived` | not a boolean | `The value 'maybe' is not valid.` |

Status and priority names are accepted case-insensitively (`"inprogress"` works). Numbers are rejected. Responses always use the canonical names.

Observed bodies:
```json
// POST {"description":"x"}  (also an empty body or "title":"   ")
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"title":["Title is required."]},"traceId":"00-..."}

// POST {"title":"x","priority":"Urgent"}
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"priority":["Priority must be one of: Low, Medium, High."]},"traceId":"00-..."}

// PUT {"title":"x"}
{"type":"...#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"status":["Status is required."],"priority":["Priority is required."]},"traceId":"00-..."}

// GET /api/tasks/999999 (also PUT/complete/archive/restore/DELETE, and any deleted task)
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.5","title":"Not Found","status":404,"detail":"Task with id '999999' was not found.","traceId":"00-..."}
```
- A malformed `dueDate` in the body (e.g. `"10/10/2026"`) is a JSON conversion error. It returns 400 with key `$.dueDate` and a technical message, so validate the date format on the client.
- Frontend: map `errors.title|description|status|priority|dueDate` to form fields. Otherwise show `detail ?? title`.

## 4. Business rules relevant to the UI

- **Defaults:** status `Todo`, priority `Medium`, `isArchived=false`, `completedAt=null`.
- **Completion (BR-05):** `POST /complete` sets `status=Done` and `completedAt=now`. A PUT that sets `status=Done` does the same. Any change away from Done clears `completedAt`. Done→Done keeps the original `completedAt`. For "un-complete" (checkbox off), PUT with `status:"Todo"` and the other current fields.
- **Overdue (A-05):** `isOverdue = dueDate < today && status != Done && !isArchived`. Due **today** is not overdue. No due date is never overdue.
- **Archive (BR-04):** archived tasks are hidden from the default list. `archived=true` shows only archived tasks. Archived tasks can still be read, edited, completed and deleted.
- **Delete (BR-14):** soft delete. Afterwards every endpoint returns 404 for that id and the task is absent from all lists (including `archived=true`). There is no undelete endpoint.
- Default list order is newest first (`createdAt desc`).

## 5. Reusable completion method (for M06, BR-13)

```csharp
// QuickFlow.Application.Features.Tasks.ITaskService (scoped; registered in AddApplication())
Task<TaskItem> CompleteAsync(int id, CancellationToken cancellationToken = default);
```
- Loads the task (throws `NotFoundException` → 404 if missing or deleted), calls `TaskItem.MarkCompleted(utcNow)`, saves and returns the tracked entity.
- Idempotent (keeps the existing `CompletedAt`). Works on archived tasks.
- It calls `SaveChangesAsync` on the shared scoped `AppDbContext`, so the caller's pending changes in the same request scope are saved in the same call. Call it after staging your own changes, or save them first.
- Domain-level alternative when you already hold a tracked `TaskItem`: `task.MarkCompleted(DateTime utcNow)` or `task.SetStatus(TaskItemStatus status, DateTime utcNow)`. These are the only way to change `Status`, because the setter is private and `CompletedAt` is maintained there. Map with `TaskResponse.From(task, today)`.
- Other service methods: `ListAsync(TaskListQuery, DateOnly today)`, `GetAsync`, `CreateAsync(CreateTaskRequest)`, `UpdateAsync(id, UpdateTaskRequest)`, `ArchiveAsync`, `RestoreAsync`, `DeleteAsync`. Overdue rule: `TaskItem.IsOverdue(DateOnly today)` (M08 can reuse it).

## 6. Backend notes for later modules

- Entity `QuickFlow.Application.Domain.Tasks.TaskItem` (table `Tasks`). Enums are `TaskItemStatus` (not `TaskStatus`, which clashes with `System.Threading.Tasks`) and `TaskPriority`. `AppDbContext.Tasks` is the DbSet.
- Migration: `20261010152625_AddTasks` (applied to `quickflow`). Table collation `utf8mb4_0900_ai_ci`.
- **Foundation fix:** the Oracle provider throws `InvalidCastException` when reading `date` columns as `DateOnly`. `AppDbContext.ConfigureConventions` now maps `DateOnly`/`DateOnly?` through `DateOnlyDateTimeConverter` (column type stays `date`, no migration change). Every later `DateOnly` property gets this automatically.
