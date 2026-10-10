# M04 — Learning Resources

| Field | Value |
|---|---|
| ID | M04 |
| Type | Feature |
| Backend status | `WAITING` (needs M01-BE) |
| Frontend status | `WAITING` (needs M04-BE, M01-FE) |
| Module dependencies | M01 |
| Backend dependencies | M01-BE |
| Frontend dependencies | M04-BE, M01-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M04-learning-resources-handoff.md` |
| Consumed by | M06 (item source), M08 (learning snapshot), M09 |

## Goal

Learning cards (course, book, topic…). Each card holds milestones that can be completed and free-form timestamped notes. Everything can be added and removed directly from the Learning Resources page.

## Requirements Covered

FR-05, FR-06 · BR-08, BR-09, BR-14 · US-L1..L5 · AC-L1..L3 · UX-LEARN · NFR-U1, NFR-U2, NFR-M1 · TR-1 · DOD-2 (learning part), DOD-3 · A-12, A-13, A-14

## Data Model

**LearningCard:** `Id`, `Title` (required, ≤ 200), `Description` (optional, ≤ 2,000; holds the description/source such as a link, book or course name), `Status` (`NotStarted` | `InProgress` | `Completed`, default `NotStarted`), `CreatedAt` + soft-delete fields.

**LearningMilestone:** `Id`, `LearningCardId` (FK, required), `Title` (required, ≤ 200), `IsDone` (default false), `TargetDate` (date-only, optional), `CompletedAt` (nullable, derived, A-13).

**LearningNote:** `Id`, `LearningCardId` (FK, required), `Text` (required, ≤ 4,000), `CreatedAt`.

**Computed on card responses:** `milestonesTotal`, `milestonesDone`.

## Business Rules

| Rule | Behavior |
|---|---|
| BR-08 | Card title required → else 400 |
| BR-09 | A milestone belongs to exactly one card. Milestone/note routes for a different card or a deleted card → 404 |
| A-12 | Card status is user-set through card update. It is not derived from milestones |
| A-13 | Setting `IsDone=true` sets `CompletedAt=now`. Setting it false clears it |
| A-14 | Milestone title required ≤ 200. Note text required ≤ 4,000 |
| BR-14 | Deleted card → 404. Its milestones and notes are no longer returned |

## Backend Tasks

| # | Task |
|---|---|
| B1 | Entities `LearningCard`, `LearningMilestone`, `LearningNote`. Mappings (FKs, cascade soft-delete visibility). Migration |
| B2 | DTOs: `LearningCardSummary` (list, with counts), `LearningCardDetail` (with milestones + notes), create/update requests for card, milestone, note |
| B3 | Validation (BR-08, A-14, status enum) |
| B4 | Learning service: card create/update/delete, milestone add/update/complete/remove, note add/remove, ownership checks (BR-09) |
| B5 | Endpoints + OpenAPI |
| B6 | Unit tests |

## Proposed API Contract

*The backend may refine this. The handoff is authoritative.*

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/learning-cards?status=` | — | 200 `LearningCardSummary[]` | — |
| GET | `/api/learning-cards/{id}` | — | 200 `LearningCardDetail` | 404 |
| POST | `/api/learning-cards` | `{ title, description? }` | 201 | 400 |
| PUT | `/api/learning-cards/{id}` | `{ title, description?, status }` | 200 | 400, 404 |
| DELETE | `/api/learning-cards/{id}` | — | 204 | 404 |
| POST | `/api/learning-cards/{id}/milestones` | `{ title, targetDate? }` | 201 | 400, 404 |
| PUT | `/api/learning-cards/{id}/milestones/{milestoneId}` | `{ title, targetDate?, isDone }` | 200 | 400, 404 |
| DELETE | `/api/learning-cards/{id}/milestones/{milestoneId}` | — | 204 | 404 |
| POST | `/api/learning-cards/{id}/notes` | `{ text }` | 201 | 400, 404 |
| DELETE | `/api/learning-cards/{id}/notes/{noteId}` | — | 204 | 404 |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Learning API service + types |
| F2 | Learning Resources page with "Add Learning Card" action and a card grid |
| F3 | Card (collapsed): title, description/source, status badge, milestone progress `done/total`. Actions: change status, remove (confirm) |
| F4 | Card (expanded): milestone list (complete checkbox, title, target date, remove) + inline "add milestone" form. Notes list (text, timestamp, remove) + inline "add note" form |
| F5 | Add Learning Card dialog. Client validation (title required). Server errors shown |
| F6 | Empty states: no cards → "Add Learning Card" CTA. Card without milestones/notes → inline hint. Loading/error states |
| F7 | Export reusable pieces: learning API service (M06 picker), create-card dialog (M08) |

## Testing Tasks

**Unit (TR-1):** card title required · milestone title required · note text required/≤ 4,000 · milestone accessed through another card → not found · completing milestone sets `CompletedAt`, un-completing clears it · deleting card hides milestones and notes · counts `milestonesDone/Total` correct.

**Curl verification:**
1. Create card → 201 (`status=NotStarted`). Missing title → 400.
2. List → card with `milestonesTotal=0`. GET detail → empty milestones/notes.
3. PUT status `InProgress` → 200. Invalid status → 400.
4. Add 2 milestones → 201. Missing title → 400.
5. PUT milestone `isDone=true` → `completedAt` set, card `milestonesDone=1`. Set false → cleared.
6. Milestone via wrong card id → 404.
7. DELETE milestone → 204.
8. Add note → 201 with `createdAt`. Empty text → 400. DELETE note → 204.
9. DELETE card → 204 → GET 404. Milestone route for deleted card → 404.

**Playwright MCP verification:**
1. Empty state with "Add Learning Card" on fresh DB.
2. Add card → appears in grid. Empty title → validation error.
3. Expand card → add two milestones → counter shows `0/2`.
4. Complete one milestone → `1/2`. Remove a milestone → removed.
5. Add note → shows text + timestamp. Remove note → removed.
6. Change status → badge updates.
7. Remove card with confirmation → gone.

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · Swagger lists learning endpoints ✓ · curl 1–9 pass ✓ · unit tests pass ✓ · handoff created ✓ · progress/state updated ✓.

**Frontend:** card grid + expand + milestones + notes functional ✓ · empty/loading/error states ✓ · Playwright 1–7 pass ✓ · reusable exports ✓ · progress/state/output updated ✓.
