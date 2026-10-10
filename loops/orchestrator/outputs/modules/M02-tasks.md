# M02 — Tasks

| Field | Value |
|---|---|
| ID | M02 |
| Type | Feature |
| Backend status | `WAITING` (needs M01-BE) |
| Frontend status | `WAITING` (needs M02-BE, M01-FE) |
| Module dependencies | M01 |
| Backend dependencies | M01-BE |
| Frontend dependencies | M02-BE, M01-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M02-tasks-handoff.md` |
| Consumed by | M06 (item source, BR-13 task completion), M08 (dashboard), M09 |

## Goal

Full task management: create, read, update, complete, archive/restore and delete tasks, plus free-text search, filters, sorting and overdue detection.

## Requirements Covered

FR-01, FR-02 · BR-01, BR-02, BR-03, BR-04, BR-05, BR-14 · US-T1..T7 · AC-T1..T4 · UX-TASKS · NFR-U1, NFR-U2, NFR-P1, NFR-M1 · TR-1 (task validation) · DOD-2 (tasks part) · A-05, A-06, A-07, A-08

## Data Model

**Task:** `Id`, `Title` (required, ≤ 200), `Description` (optional, ≤ 2,000), `Status` (`Todo` | `InProgress` | `Done`, default `Todo`), `Priority` (`Low` | `Medium` | `High`, default `Medium`), `DueDate` (date-only, optional), `CreatedAt`, `UpdatedAt`, `IsArchived` (default false), `CompletedAt` (nullable, derived, A-06) + soft-delete fields.

## Business Rules

| Rule | Behavior |
|---|---|
| BR-01 | Title required (trimmed, not whitespace-only), ≤ 200 → else 400 |
| BR-02 | Description ≤ 2,000 → else 400 |
| BR-03 | Invalid status/priority → 400 |
| BR-04 | Archived tasks excluded from the default list |
| BR-05 | Completing sets `Status=Done` and `CompletedAt=now`. Moving away from `Done` clears `CompletedAt` |
| BR-14 | Deleted tasks → 404 on get, absent from all lists |
| Overdue (A-05) | `DueDate < today` ∧ `Status ≠ Done` ∧ ¬`IsArchived`. Exposed as computed `isOverdue` |

## Backend Tasks

| # | Task |
|---|---|
| B1 | `Task` entity, persistence mapping, migration |
| B2 | DTOs: `TaskResponse` (all fields + `isOverdue`), `CreateTaskRequest`, `UpdateTaskRequest` |
| B3 | Validation for BR-01..03 |
| B4 | Task service (domain layer): create, update, complete, archive, restore, soft delete, `CompletedAt` maintenance. **Expose the completion operation as a reusable service method.** M06 calls it for BR-13 (NFR-M2: no duplicated completion logic) |
| B5 | Query: `search` (title, case-insensitive contains), `status`, `priority`, `dueFrom`/`dueTo`, `overdue=true`, `archived` (default `false`; `true` = archived only), `sortBy` (`dueDate` \| `createdAt`, default `createdAt`), `sortDir` (`asc` \| `desc`, default `desc`; null due dates last), `today` |
| B6 | Endpoints (below) with OpenAPI metadata |
| B7 | Unit tests (below) |

## Proposed API Contract

*The backend may refine this. The handoff is authoritative.*

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/tasks` | — (query params from B5) | 200 `TaskResponse[]` | 400 invalid filter value |
| GET | `/api/tasks/{id}` | — | 200 | 404 |
| POST | `/api/tasks` | `{ title, description?, status?, priority?, dueDate? }` | 201 + Location | 400 |
| PUT | `/api/tasks/{id}` | `{ title, description?, status, priority, dueDate? }` | 200 | 400, 404 |
| POST | `/api/tasks/{id}/complete` | — | 200 | 404 |
| POST | `/api/tasks/{id}/archive` | — | 200 | 404 |
| POST | `/api/tasks/{id}/restore` | — | 200 | 404 |
| DELETE | `/api/tasks/{id}` | — | 204 | 404 |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Tasks API service + types, using the M01 API client |
| F2 | Tasks page toolbar: search box (debounced), status filter, priority filter, due-date filter (Any / Overdue / Due today / Date range), sort selector, "Show archived" toggle |
| F3 | Task list: title, status badge, priority badge, due date, overdue highlight. Row actions: complete (checkbox), edit, archive/restore, delete (confirm) |
| F4 | Add/Edit Task dialog: title, description, status, priority, due date. Client validation mirrors BR-01..03. Server field errors displayed |
| F5 | Empty states: no tasks → "Add Task" CTA. No results for filters → "Clear filters" |
| F6 | Loading and error states |
| F7 | Export reusable pieces for later modules: tasks API service (M06 item picker), task row with complete toggle and create-task dialog (M08) |

## Testing Tasks

**Unit (TR-1):** title missing/blank/201 chars → invalid · description 2,001 chars → invalid · invalid status/priority → invalid · complete → `Done` + `CompletedAt` · status leaves Done → `CompletedAt` cleared · archived excluded by default and returned with `archived=true` · restore · deleted → not found · overdue: past + not done → true, done → false, archived → false, due today → false, no due date → false · search, filters and sorting.

**Curl verification:**
1. POST valid task → 201, defaults `Todo`/`Medium`.
2. POST missing title → 400. 201-char title → 400. Invalid priority → 400.
3. GET by id → 200. PUT update → 200 with new values, `updatedAt` changed.
4. POST complete → `status=Done`, `completedAt` set.
5. POST archive → absent from default list, present with `archived=true`. POST restore → back in default list.
6. `search=` matches title substring. `status=`, `priority=`, `dueFrom/dueTo` filter correctly. `sortBy=dueDate&sortDir=asc` ordered.
7. Task due yesterday + `today=` param → `isOverdue=true` and included by `overdue=true`.
8. DELETE → 204. GET → 404. Absent from lists.

**Playwright MCP verification:**
1. Tasks page loads. Empty state with "Add Task" shows on a fresh DB.
2. Create a task → appears in list. Submitting empty title shows validation error.
3. Edit task → changes visible.
4. Complete via checkbox → shown as Done.
5. Archive → disappears. "Show archived" → visible. Restore → back in list.
6. Delete with confirmation → removed.
7. Search narrows the list. Status and priority filters work.
8. Task due yesterday shows overdue highlight. Overdue filter shows it.

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · endpoints in Swagger ✓ · curl 1–8 pass ✓ · unit tests pass ✓ · reusable completion method available ✓ · handoff created (endpoints, models, validation, overdue rule, error responses) ✓ · progress/state updated ✓.

**Frontend:** Tasks page fully functional against the API ✓ · empty/loading/error states ✓ · Playwright 1–8 pass ✓ · reusable exports in place ✓ · progress/state/output updated ✓.
