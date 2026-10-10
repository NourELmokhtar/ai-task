# M04 Learning Resources: Backend Handoff

Handoff Status: READY

This handoff is for the M04 frontend loop and for M06, M08 and M09. There is no auth. The dev base URL is `http://localhost:5080`, the same API as M01–M03 (the backend loop verified it on 5081). All M01 conventions apply: camelCase JSON, string enums, UTC `DateTime` ending in `Z`, `DateOnly` as `YYYY-MM-DD`, and ProblemDetails errors. Migration: `20261010155041_AddLearningResources`, which creates the tables `LearningCards`, `LearningMilestones` and `LearningNotes`.

## 1. Endpoints

| Method | Path | Query | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/learning-cards` | `status` (optional) | none | 200 `LearningCardSummary[]` | 400 (invalid `status`) |
| GET | `/api/learning-cards/{id}` | none | none | 200 `LearningCardDetail` | 404 |
| POST | `/api/learning-cards` | none | `CreateLearningCardRequest` | 201 `LearningCardDetail` + `Location: /api/learning-cards/{id}` | 400 |
| PUT | `/api/learning-cards/{id}` | none | `UpdateLearningCardRequest` | 200 `LearningCardDetail` | 400, 404 |
| DELETE | `/api/learning-cards/{id}` | none | none | 204 (no body) | 404 |
| POST | `/api/learning-cards/{id}/milestones` | none | `CreateLearningMilestoneRequest` | 201 `LearningMilestoneResponse` + `Location: /api/learning-cards/{id}` | 400, 404 |
| PUT | `/api/learning-cards/{id}/milestones/{milestoneId}` | none | `UpdateLearningMilestoneRequest` | 200 `LearningMilestoneResponse` | 400, 404 |
| DELETE | `/api/learning-cards/{id}/milestones/{milestoneId}` | none | none | 204 (no body) | 404 |
| POST | `/api/learning-cards/{id}/notes` | none | `CreateLearningNoteRequest` | 201 `LearningNoteResponse` + `Location: /api/learning-cards/{id}` | 400, 404 |
| DELETE | `/api/learning-cards/{id}/notes/{noteId}` | none | none | 204 (no body) | 404 |

- `{id}`, `{milestoneId}` and `{noteId}` are integers. A non-integer value gives 404.
- `status` on the list: omitted or empty returns **all** cards. Otherwise one of `NotStarted | InProgress | Completed` (case-insensitive).
- The list is ordered by `createdAt` ascending (oldest first, tie-break `id`). There is no pagination.
- Milestone and note mutations return only the milestone or note. To update `milestonesTotal`/`milestonesDone` on the card, refetch `GET /api/learning-cards/{id}` (or the list).
- The `Location` header of milestone and note POSTs points to the parent card. There is no single-milestone or single-note GET.
- There is no endpoint to edit a note (spec: add/remove only).

## 2. Models

### LearningCardSummary (list item)

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `title` | string | 1–200 chars, trimmed |
| `description` | string \| null | ≤ 2000 chars. Description or source (link, book, course name) |
| `status` | `"NotStarted"` \| `"InProgress"` \| `"Completed"` | `NotStarted` on create. User-set, never derived from milestones |
| `createdAt` | ISO UTC string | |
| `updatedAt` | ISO UTC string | Changes on card PUT only, not on milestone or note changes |
| `milestonesTotal` | int | Number of milestones on the card |
| `milestonesDone` | int | Number with `isDone=true` |

### LearningCardDetail (GET by id, POST, PUT)

All `LearningCardSummary` fields, plus:

| Field | Type | Notes |
|---|---|---|
| `milestones` | `LearningMilestoneResponse[]` | Creation order (`id` ascending). `[]` when none |
| `notes` | `LearningNoteResponse[]` | Oldest first (`createdAt` ascending, tie-break `id`). `[]` when none |

### LearningMilestoneResponse

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `learningCardId` | int | |
| `title` | string | 1–200 chars, trimmed |
| `isDone` | boolean | `false` on create |
| `targetDate` | `"YYYY-MM-DD"` \| null | |
| `completedAt` | ISO UTC string \| null | Set when `isDone` becomes true, null while not done |

### LearningNoteResponse

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `learningCardId` | int | |
| `text` | string | 1–4000 chars, trimmed (inner newlines are kept) |
| `createdAt` | ISO UTC string | Note timestamp to display |

### Requests

| Request | Fields |
|---|---|
| `CreateLearningCardRequest` | `title` (string, required), `description` (string, optional) |
| `UpdateLearningCardRequest` | `title` (required), `description` (optional; omitted or null **clears** it, a full replacement), `status` (required, enum name) |
| `CreateLearningMilestoneRequest` | `title` (required), `targetDate` (`YYYY-MM-DD`, optional) |
| `UpdateLearningMilestoneRequest` | `title` (required), `targetDate` (optional; omitted or null **clears** it), `isDone` (boolean, **required**) |
| `CreateLearningNoteRequest` | `text` (required) |

Example create response (201):
```json
{"id":1,"title":"M04V Clean Code","description":"Book by Robert C. Martin","status":"NotStarted","createdAt":"2026-10-10T15:53:05.4693389Z","updatedAt":"2026-10-10T15:53:05.4693389Z","milestonesTotal":0,"milestonesDone":0,"milestones":[],"notes":[]}
```

Example milestone toggle (PUT `{"title":"Chapters 1-5","targetDate":"2026-10-20","isDone":true}` → 200):
```json
{"id":1,"learningCardId":1,"title":"Chapters 1-5","isDone":true,"targetDate":"2026-10-20","completedAt":"2026-10-10T15:53:14.364812Z"}
```

## 3. Validation and error responses (exact)

Validation errors are 400 `application/problem+json`, with all field errors collected into `errors` (camelCase keys):

| Field | Rule | Message |
|---|---|---|
| `title` (card, milestone) | required, not whitespace-only | `Title is required.` |
| `title` (card) | ≤ 200 after trim | `Title must be at most 200 characters.` |
| `title` (milestone) | ≤ 200 after trim | `Title must be at most 200 characters.` |
| `description` | ≤ 2000 | `Description must be at most 2000 characters.` |
| `status` (card PUT) | required | `Status is required.` |
| `status` (card PUT, list query) | valid name | `Status must be one of: NotStarted, InProgress, Completed.` |
| `isDone` (milestone PUT) | required | `IsDone is required.` |
| `text` (note) | required, not whitespace-only | `Text is required.` |
| `text` (note) | ≤ 4000 after trim | `Text must be at most 4000 characters.` |

Examples (observed):
```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"title":["Title is required."]},"traceId":"00-..."}
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"status":["Status must be one of: NotStarted, InProgress, Completed."]},"traceId":"00-..."}
```

JSON type errors come from model binding and use `$.`-paths. For example, `"status":1` gives `errors["$.status"]` and `"targetDate":"20-10-2026"` gives `errors["$.targetDate"]`. An empty body on a POST/PUT is treated as `{}` (e.g. `errors.title`).

Not-found errors are 404 ProblemDetails with a `detail`:

| Case | `detail` |
|---|---|
| Card missing or deleted (any route under `/{id}`) | `Learning card with id '1' was not found.` |
| Milestone missing or on another card (BR-09) | `Milestone with id '1' was not found on learning card '2'.` |
| Note missing or on another card (BR-09) | `Note with id '1' was not found on learning card '2'.` |

```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.5","title":"Not Found","status":404,"detail":"Milestone with id '1' was not found on learning card '2'.","traceId":"00-..."}
```

On a PUT, the card or milestone lookup runs before validation, so a missing resource gives 404 even with an invalid body. Frontend: show `errors` per field, otherwise `detail ?? title`.

## 4. Business rules relevant to the UI

- **BR-08:** card title is required. The UI should mirror this client-side.
- **A-12:** status changes only through `PUT /api/learning-cards/{id}`, which needs `title` and `status` (send `description` too, or it is cleared). Completing every milestone does **not** change the status.
- **A-13:** to toggle a milestone, PUT it with its current `title` and `targetDate` and the new `isDone`. Setting `true` stamps `completedAt` (re-sending `true` keeps the original time). Setting `false` clears it.
- **A-14:** milestone title is required (≤ 200). Note text is required (≤ 4000).
- **BR-09:** milestones and notes are always addressed through their own card. A wrong card gives 404.
- **BR-14:** deleting a card is a soft delete. Afterwards the card gives 404, it is absent from all lists, and all its milestone and note routes give 404. Use a confirmation dialog (spec F3).
- Removing a milestone or note is permanent (hard delete). There is no undo.
- Counter display: `milestonesDone/milestonesTotal` (e.g. `0/2`). A card with `milestonesTotal=0` should show the inline empty hint.
- The current dev DB has **no** learning cards. Test cards were soft-deleted, so lists are empty for the empty-state check.

## 5. Reusable pieces for other modules

`ILearningService` (namespace `QuickFlow.Application.Features.Learning`, scoped, registered in `AddApplication()`):

```csharp
Task<bool> ExistsAsync(int id, CancellationToken ct = default);
// true if the card exists and is not soft-deleted (any status)

Task<IReadOnlyDictionary<int, string>> GetTitlesAsync(IEnumerable<int> ids, bool includeDeleted = false, CancellationToken ct = default);
// id -> title. Default: missing/deleted ids absent. includeDeleted=true also returns soft-deleted cards' titles
// (for M06 A-24 "source removed" display). Missing ids are always absent.
```

**M06 (plan items, source type `LearningResource`):** use `ExistsAsync` for BR-10 (only non-deleted cards are valid sources), and `GetTitlesAsync(ids, includeDeleted: true)` to resolve `sourceTitle`. Combine it with `ExistsAsync` or a default call to get `sourceAvailable`. Marking a learning plan item done must not change the card (no service call is needed).

**M08 (learning snapshot, A-27):** no dedicated service method was added. Query through `IApplicationDbContext`:
- `db.Set<LearningCard>()`: the soft-delete filter applies. Count by `Status` (`LearningCardStatus.NotStarted | InProgress | Completed`, namespace `QuickFlow.Application.Domain.Learning`).
- `db.Set<LearningMilestone>()`: a query filter hides milestones of deleted cards. Use `IsDone` for done/total. `CompletedAt` (`DateTime?`, UTC, column `datetime(6)`) is non-null exactly when `IsDone` is true, so "completed in the last 7 days" is `m.IsDone && m.CompletedAt >= nowUtc.AddDays(-7)`, using `TimeProvider` (define the window in the M08 spec, e.g. rolling 7×24 h or 7 local calendar days).
- Un-completing a milestone clears `CompletedAt`, so it drops out of the 7-day count.

Entities (Application/Domain/Learning): `LearningCard` (SoftDeletableEntity: `Title`, `Description`, `Status`), `LearningMilestone` (`LearningCardId`, `Title`, `IsDone`, `TargetDate` DateOnly?, `CompletedAt` DateTime?), `LearningNote` (`LearningCardId`, `Text`, `CreatedAt`).

## 6. Verification state

Build 0 errors / 0 warnings · tests 165/165 (46 new) · migration applied to `quickflow` · Swagger lists all 10 operations (tag `LearningCards`) · curl checks 1–9 passed on 5081 · CORS preflight from `http://localhost:4200` OK · M02/M03 endpoints still 200. Details: `loops/backend-dev/outputs/modules/M04-learning-resources.md`.
