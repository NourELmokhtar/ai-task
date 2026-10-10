# M06 — Plan Composition (Todo Plans: builder, items, progress)

| Field | Value |
|---|---|
| ID | M06 |
| Type | Feature |
| Backend status | `WAITING` (needs M02-BE, M03-BE, M04-BE) |
| Frontend status | `WAITING` (needs M06-BE, M02-FE, M03-FE, M04-FE) |
| Module dependencies | M02, M03, M04 |
| Backend dependencies | M02-BE, M03-BE, M04-BE |
| Frontend dependencies | M06-BE, M02-FE, M03-FE, M04-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M06-plan-composition-handoff.md` |
| Consumed by | M07 (lifecycle/rest time), M08 (via M07), M09 |

## Goal

Let the user build time-boxed plans from existing tasks, habits and learning cards. A plan has a title, estimated duration, start/end date-time and priority order. The user can mark individual plan items done and see the plan's completion percentage, edit plan details and remove plans. Time-driven status, rest time, notifications and history belong to **M07**.

## Requirements Covered

FR-07, FR-08 (completion % only) · BR-10, BR-11, BR-13, BR-14 · US-P1..P6, US-P9 · AC-P1..P4, AC-P7, AC-P8 (plan view) · UX-PLANS (builder, fields, list, item toggles, remove, empty state) · NFR-M1, NFR-M2, NFR-U1, NFR-U2 · TR-1 (plan validation, completion roll-up) · DOD-4 · A-14..A-19, A-24

## Data Model

**Plan:** `Id`, `Title` (required, ≤ 200), `EstimatedDurationMinutes` (int > 0, A-15), `StartDateTime` (UTC), `EndDateTime` (UTC, > start), `PriorityOrder` (int ≥ 1, lower = higher, A-16), `Status` (`NotStarted` | `InProgress` | `Completed`; stored as `NotStarted` here, **computed by M07**), `CreatedAt` + soft-delete fields.

**PlanItem:** `Id`, `PlanId` (FK), `SourceType` (`Task` | `Habit` | `LearningResource`), `SourceId` (no FK, polymorphic), `IsDone` (default false).

**Computed on `PlanResponse`:** `items[] { id, sourceType, sourceId, sourceTitle, sourceAvailable, isDone }`, `totalItems`, `doneItems`, `progressPercent` = round(done ÷ total × 100).

## Business Rules

| Rule | Behavior |
|---|---|
| BR-10 | ≥ 1 item required. Every `(sourceType, sourceId)` must reference an existing, non-deleted entity → else 400 naming the offending item |
| BR-11 | `EndDateTime` must be after `StartDateTime` → else 400 (on create and update) |
| A-17 | No duplicate `(sourceType, sourceId)` within one plan → 400. Items fixed after creation. Metadata editable |
| BR-13 / A-19 | Marking a **Task** item done also completes the task **by calling the M02 task completion service method** (no duplicated logic, NFR-M2). Un-marking does not revert the task. **Habit/LearningResource** items change only the item flag. No reverse sync from source to item |
| A-24 | If a source is later deleted, the item is kept with `sourceAvailable=false` (title resolved ignoring the soft-delete filter) and still counts toward progress |
| A-16 | List order: `PriorityOrder` asc, then `StartDateTime` asc |
| BR-14 | Deleted plan → 404. Its items are no longer returned |

## Backend Tasks

| # | Task |
|---|---|
| B1 | `Plan` and `PlanItem` entities, mapping, migration |
| B2 | DTOs: `PlanResponse`, `PlanItemResponse`, `CreatePlanRequest { title, estimatedDurationMinutes, startDateTime, endDateTime, priorityOrder, items: [{ sourceType, sourceId }] }`, `UpdatePlanRequest` (metadata only), `UpdatePlanItemRequest { isDone }` |
| B3 | Validation: BR-10, BR-11, A-14..A-17 |
| B4 | **Source resolver**: checks existence and resolves titles for Task / Habit / LearningCard through the existing module services or repositories (including soft-deleted ones for display) |
| B5 | **Plan progress calculator** (pure): `totalItems`, `doneItems`, `progressPercent`. Reused by M07 and M08 |
| B6 | Plan service: create, update metadata, delete, set item done/undone (+ BR-13 propagation via M02 service) |
| B7 | Endpoints + OpenAPI |
| B8 | Unit tests |

## Proposed API Contract

*The backend may refine this. The handoff is authoritative.*

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/plans` | — | 200 `PlanResponse[]` (priority order) | — |
| GET | `/api/plans/{id}` | — | 200 | 404 |
| POST | `/api/plans` | `CreatePlanRequest` | 201 | 400 |
| PUT | `/api/plans/{id}` | `UpdatePlanRequest` | 200 | 400, 404 |
| DELETE | `/api/plans/{id}` | — | 204 | 404 |
| PATCH | `/api/plans/{id}/items/{itemId}` | `{ isDone }` | 200 full `PlanResponse` (so progress refreshes immediately) | 404 |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Plans API service + types |
| F2 | Todo Plans page with "Create Plan" action |
| F3 | **Plan builder** (dialog or `/plans/new`): title, item picker with three sections (Tasks: non-archived · Habits: active · Learning Resources: all) using the M02/M03/M04 API services, search within the picker, multi-select, selected-items summary |
| F4 | Builder fields: estimated duration (hours + minutes → minutes), start date/time, end date/time (local input → UTC ISO), priority order. Client validation: title, ≥ 1 item, end > start, duration > 0, priority ≥ 1. Server errors shown |
| F5 | Plan list (priority order): title, priority, start–end, estimated duration, **progress bar + %**, items with source-type icon, title, "source removed" label, **done toggle** (updates from PATCH response) |
| F6 | Edit plan metadata (builder in edit mode, items read-only). Remove plan (confirm) |
| F7 | Empty state → "Create Plan" CTA. Loading/error states |
| F8 | Export reusable pieces for M07/M08: plans API service/types, progress bar component, plan card |

## Testing Tasks

**Unit (TR-1):** empty items → invalid · non-existent source → invalid · duplicate item → invalid · end ≤ start → invalid · duration ≤ 0 → invalid · priority < 1 → invalid · progress 0/3 = 0, 1/3 = 33, 2/3 = 67, 3/3 = 100 · task item done → task `Done` + `CompletedAt` (via M02 service) · task item un-done → task unchanged · habit item done → no habit completion created · learning item done → card unchanged · deleted source → `sourceAvailable=false`, still counted.

**Curl verification (prereq: create 1 task, 1 habit, 1 learning card):**
1. POST plan with the 3 items → 201, `progressPercent=0`, `totalItems=3`.
2. POST with `items: []` → 400. Non-existent task id → 400. Duplicate item → 400.
3. POST with end before start → 400.
4. GET list → ordered by priority. GET by id → 200.
5. PATCH task item `isDone=true` → `progressPercent=33`. `GET /api/tasks/{id}` → `status=Done`.
6. PATCH habit item `isDone=true` → `progressPercent=67`. `GET /api/habits/{id}` → `completedToday` unchanged.
7. PATCH task item `isDone=false` → `progressPercent=33`. Task stays `Done`.
8. PUT metadata (new priority, times) → 200. PUT with end before start → 400.
9. DELETE the source learning card → plan item shows `sourceAvailable=false`.
10. DELETE plan → 204 → GET 404.

**Playwright MCP verification:**
1. Empty state with "Create Plan" on a DB without plans.
2. Builder validation: no items → error. End before start → error.
3. Create plan with 1 task + 1 habit + 1 learning card → appears in list at 0%.
4. Toggle items → 33% → 67%. Progress bar updates without reload.
5. After toggling the task item, the Tasks page shows that task as Done.
6. Edit plan priority → list order updates.
7. Remove plan with confirmation → gone.

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · Swagger lists plan endpoints ✓ · curl 1–10 pass ✓ · unit tests pass ✓ · BR-13 implemented by reuse, not duplication ✓ · progress calculator reusable ✓ · handoff created ✓ · progress/state updated ✓.

**Frontend:** builder + list + toggles + edit + remove functional ✓ · empty/loading/error states ✓ · Playwright 1–7 pass ✓ · reusable exports ✓ · progress/state/output updated ✓.
