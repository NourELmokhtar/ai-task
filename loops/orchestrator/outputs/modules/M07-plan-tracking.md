# M07 — Plan Tracking (Todo Plans: lifecycle, rest time, notifications, history)

| Field | Value |
|---|---|
| ID | M07 |
| Type | Feature |
| Backend status | `WAITING` (needs M06-BE) |
| Frontend status | `WAITING` (needs M07-BE, M06-FE, M05-FE) |
| Module dependencies | M06, M05 |
| Backend dependencies | M06-BE |
| Frontend dependencies | M07-BE, M06-FE, M05-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M07-plan-tracking-handoff.md` |
| Consumed by | M08 (active plans), M09 |

## Goal

Make plans "live":
- Status moves automatically NotStarted → InProgress → Completed, derived from stored times and item completion.
- A rest-time countdown shows between start and end.
- An in-app notification fires when a plan's start time arrives.
- Plans are grouped into Active/Upcoming and Completed (history), each with its completion %.

## Requirements Covered

FR-08 (status lifecycle, rest time, notification, immediate reflection) · BR-12 · US-P7, US-P8, US-P10 · AC-P5, AC-P6, AC-P8 (plan view) · UX-PLANS (grouping, live rest time, start notification/highlight) · NFR-P2, NFR-R2, NFR-M1, NFR-M2 · TR-2 · DOD-5 (plan part) · A-20, A-21, A-22, A-23, A-31

## Business Rules

| Rule | Behavior |
|---|---|
| A-20 status | Evaluated in order: (1) all items done → `Completed`; (2) now < start → `NotStarted`; (3) start ≤ now < end → `InProgress`; (4) now ≥ end → `Completed`. Recomputed on **every read** from stored data + clock, so it stays correct after restart (NFR-R2). Persist the computed value when it differs. Un-marking an item inside the window returns the plan to `InProgress` |
| BR-12 / A-21 rest time | `restTimeSeconds = EndDateTime − now` only while status = `InProgress`, otherwise `null`. Responses include `serverNow` for client clock-skew correction |
| NFR-P2 | Client display updates at least once per minute (target: every second) |
| A-22 notification | In-app toast + card highlight. Fires once per plan when start is reached, including on app open for plans already `InProgress` that weren't notified yet. Notified ids stored client-side. Suppressed when `PlanStartNotificationsEnabled=false` (M05) |
| A-23 history | `Completed` plans, with completion %, ordered by `EndDateTime` desc |

## Backend Tasks

| # | Task |
|---|---|
| B1 | **Plan status calculator** (pure, clock-injected) implementing A-20 |
| B2 | **Rest-time calculator** (pure, clock-injected) implementing A-21 |
| B3 | Apply both on every plan read (list, detail, after item PATCH, after update). Persist status when changed |
| B4 | Extend `PlanResponse`: computed `status`, `restTimeSeconds`, `serverNow` |
| B5 | Grouping: `GET /api/plans?group=active|upcoming|completed` (`active` = InProgress, `upcoming` = NotStarted, `completed` = history, ordered by EndDateTime desc) |
| B6 | Expose one **active-plans summary query** (status, progress, rest time) for reuse by M08. No duplicated lifecycle logic (NFR-M2) |
| B7 | Update OpenAPI. Unit tests (TR-2) |

## Proposed API Contract (extends M06)

*The backend may refine this. The handoff is authoritative.*

| Method | Path | Change |
|---|---|---|
| GET | `/api/plans?group=` | New optional `group` filter |
| GET/POST/PUT/PATCH | `/api/plans…` | `PlanResponse` adds `status` (computed), `restTimeSeconds` (nullable), `serverNow` |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Extend plan types with `status`, `restTimeSeconds`, `serverNow` |
| F2 | Group the Todo Plans page: **Active & Upcoming** (InProgress first, then NotStarted, by priority) and **Completed / History** (completion %, end date). Empty state per group |
| F3 | **RestTime component** (reusable by M08): countdown `hh:mm:ss` from `endDateTime`, corrected by `serverNow` offset, ticks every second. At zero → refetch plan for its new status. Hidden when `restTimeSeconds` is null |
| F4 | **Status badge** component. Upcoming plans show the scheduled start instead of rest time |
| F5 | **Plan start watcher**: a root-provided `PlanStartWatcherService` started once from the root `App` component. It polls plans every ≤ 60 s and sets timers for upcoming starts. On start → toast "Plan '<title>' has started" (via M01 toast host) and highlight on the Todo Plans page. Once per plan (notified ids kept client-side). Respects M05 `PlanStartNotificationsEnabled` |
| F6 | Item toggles (M06) update status/progress/group from the PATCH response immediately |
| F7 | Periodic refresh (≤ 60 s) and refresh on window focus for the plans list |

## Testing Tasks

**Unit (TR-2), clock-controlled:**
- now < start → `NotStarted`, rest time null
- now == start → `InProgress`, rest = end − start
- mid-window → `InProgress`, rest = end − now
- now == end → `Completed`, rest null
- all items done mid-window → `Completed`
- all items done before start → `Completed`
- un-mark one item mid-window → back to `InProgress`
- past end with 1/3 done → `Completed`, progress 33 (history)
- status recomputed correctly after the clock advances with no writes (restart scenario)

**Curl verification:**
1. Create plan with start = now − 10 min, end = now + 60 min → `status=InProgress`, `restTimeSeconds` ≈ 3000.
2. Create plan with start = now + 30 min → `NotStarted`, `restTimeSeconds=null`.
3. Create plan with start/end in the past → `Completed`, appears in `group=completed`.
4. On the active plan, PATCH all items done → `Completed`. Un-mark one → `InProgress`.
5. `group=active`, `group=upcoming`, `group=completed` return the right sets.
6. Two GETs ~1 min apart → `restTimeSeconds` decreased by ≈ 60.
7. Restart backend → GET returns the same derived statuses.

**Playwright MCP verification:**
1. Create plan starting ~1–2 min ahead → shown under Upcoming with scheduled start and no rest time.
2. When start arrives → toast appears, card highlighted, plan moves to Active, rest time visible.
3. Rest time decreases between two observations (≥ once per minute).
4. Plan with past window → in Completed/History with its completion %.
5. Toggle all items of an active plan → moves to Completed. Un-toggle → back to Active.
6. Disable notifications in Settings → the next plan start shows no toast (highlight/status still update).
7. Navigate to another page when a start time arrives → toast still appears (global watcher).

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · Swagger updated ✓ · curl 1–7 pass ✓ · TR-2 unit tests pass ✓ · calculators pure and reusable ✓ · handoff created (status rule, rest-time semantics, `serverNow`, grouping) ✓ · progress/state updated ✓.

**Frontend:** grouping, live rest time, status badges, start notifications functional ✓ · settings preference honored ✓ · Playwright 1–7 pass ✓ · RestTime/StatusBadge exported for M08 ✓ · progress/state/output updated ✓.
