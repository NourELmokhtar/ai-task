# M03 — Habits

| Field | Value |
|---|---|
| ID | M03 |
| Type | Feature |
| Backend status | `WAITING` (needs M01-BE) |
| Frontend status | `WAITING` (needs M03-BE, M01-FE) |
| Module dependencies | M01 |
| Backend dependencies | M01-BE |
| Frontend dependencies | M03-BE, M01-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M03-habits-handoff.md` |
| Consumed by | M06 (item source), M08 (today's habits), M09 |

## Goal

Recurring habits (daily or weekly) that can be created, updated, deactivated/reactivated and deleted, with per-date completion records (no duplicates) and a visible progress/streak indicator.

## Requirements Covered

FR-03, FR-04 · BR-06, BR-07, BR-14 · US-H1..H5 · AC-H1..H3 · UX-HABITS · NFR-U1, NFR-U2, NFR-M1 · TR-1 (habit validation) · DOD-2 (habits part) · A-09, A-10, A-11, A-14

## Data Model

**Habit:** `Id`, `Name` (required, ≤ 150), `Description` (optional, ≤ 2,000), `Frequency` (`Daily` | `Weekly`, required), `CreatedAt`, `IsActive` (default true) + soft-delete fields.

**HabitCompletion:** `Id`, `HabitId` (FK), `CompletionDate` (date-only), `CreatedAt`. **Unique (`HabitId`, `CompletionDate`)**.

**Computed on `HabitResponse`** (relative to `today`): `completedToday`, `completedForCurrentPeriod` (daily = today; weekly = any completion in current ISO week), `currentStreak`, `lastCompletionDate`.

## Business Rules

| Rule | Behavior |
|---|---|
| BR-06 | Name required (trimmed), ≤ 150 → else 400 |
| BR-07 | Second completion for the same habit + date → **409**, enforced in the service **and** by the DB unique index |
| A-11 | Completing an inactive habit → 400. Completion date in the future → 400 |
| A-09 | Weekly period = ISO week (Mon–Sun) |
| A-10 | Streak = consecutive periods with ≥ 1 completion, counted back from the current period (from the previous period if the current one isn't complete yet) |
| BR-14 | Deleted habit → 404. Its completions are no longer returned |

## Backend Tasks

| # | Task |
|---|---|
| B1 | `Habit` and `HabitCompletion` entities, mapping, unique index, migration |
| B2 | DTOs: `HabitResponse` (+ computed fields), `CreateHabitRequest`, `UpdateHabitRequest`, `CompletionRequest { date }`, `CompletionResponse` |
| B3 | Validation for BR-06, frequency enum, A-11 |
| B4 | Habit service: create, update, activate/deactivate, soft delete, complete for date, remove completion for date |
| B5 | Pure, clock-independent **habit progress calculator** (`completedToday`, `completedForCurrentPeriod`, `currentStreak`) taking completions + `today` + frequency. Reused by M08 |
| B6 | Endpoints (below) + OpenAPI |
| B7 | Unit tests |

## Proposed API Contract

*The backend may refine this. The handoff is authoritative.*

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/habits?active=&today=` | — | 200 `HabitResponse[]` | — |
| GET | `/api/habits/{id}?today=` | — | 200 | 404 |
| POST | `/api/habits` | `{ name, description?, frequency }` | 201 | 400 |
| PUT | `/api/habits/{id}` | `{ name, description?, frequency }` | 200 | 400, 404 |
| POST | `/api/habits/{id}/deactivate` | — | 200 | 404 |
| POST | `/api/habits/{id}/activate` | — | 200 | 404 |
| DELETE | `/api/habits/{id}` | — | 204 | 404 |
| POST | `/api/habits/{id}/completions` | `{ date }` (defaults to today) | 201 | 400 (inactive/future), 404, **409 duplicate** |
| DELETE | `/api/habits/{id}/completions/{date}` | — | 204 | 404 |
| GET | `/api/habits/{id}/completions?from=&to=` | — | 200 `CompletionResponse[]` | 404 |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Habits API service + types |
| F2 | Habits page with "Add Habit" action |
| F3 | Habit cards: name, description, frequency label (Daily/Weekly), **completion toggle for today** (on → POST completion, off → DELETE today's completion), weekly cards also show "Done this week", streak indicator |
| F4 | Card actions: edit, deactivate/activate, remove (confirm). Inactive habits shown dimmed (or in an "Inactive" section) with toggle disabled |
| F5 | Add/Edit Habit dialog: name, description, frequency. Client validation mirrors BR-06. Server errors shown (incl. 409) |
| F6 | Empty state → "Add Habit" CTA. Loading/error states |
| F7 | Export reusable pieces: habits API service (M06 picker), habit row/toggle and create-habit dialog (M08) |

## Testing Tasks

**Unit (TR-1):** name missing / 151 chars → invalid · invalid frequency → invalid · duplicate completion → conflict · future date → invalid · inactive habit completion → invalid · daily streak: consecutive days, gap resets, today not done counts from yesterday · weekly streak across ISO week boundary (Sun → Mon) · `completedForCurrentPeriod` for weekly habit completed earlier in week.

**Curl verification:**
1. Create daily habit → 201. Create weekly habit → 201.
2. Missing name → 400. 151-char name → 400. Invalid frequency → 400.
3. Complete today → 201. Habit shows `completedToday=true`, `currentStreak=1`.
4. Complete same date again → **409**.
5. DELETE today's completion → 204 → `completedToday=false`. Re-complete → 201.
6. Future date → 400.
7. Deactivate → `isActive=false`. Complete → 400. Activate → `isActive=true`.
8. PUT update → 200.
9. DELETE habit → 204 → GET 404, absent from list.

**Playwright MCP verification:**
1. Empty state with "Add Habit" on fresh DB.
2. Create daily and weekly habits → frequency labels shown. Empty name → validation error.
3. Toggle completion on → done state, streak shows 1. Toggle off → undone.
4. Toggle on, reload page → still done exactly once (no duplicate).
5. Edit habit → changes visible.
6. Deactivate → habit dimmed, toggle disabled. Activate → restored.
7. Remove with confirmation → gone.

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · Swagger lists habit endpoints ✓ · curl 1–9 pass ✓ · unit tests pass ✓ · progress calculator reusable ✓ · handoff created ✓ · progress/state updated ✓.

**Frontend:** Habits page functional ✓ · toggle/streak/frequency/deactivate/remove ✓ · empty/loading/error states ✓ · Playwright 1–7 pass ✓ · reusable exports ✓ · progress/state/output updated ✓.
