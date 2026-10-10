# M08 — Dashboard

| Field | Value |
|---|---|
| ID | M08 |
| Type | Feature |
| Backend status | `WAITING` (needs M02-BE, M03-BE, M04-BE, M07-BE) |
| Frontend status | `WAITING` (needs M08-BE, M02-FE, M03-FE, M04-FE, M05-FE, M07-FE) |
| Module dependencies | M02, M03, M04, M05, M07 (M06 transitively) |
| Backend dependencies | M02-BE, M03-BE, M04-BE, M07-BE |
| Frontend dependencies | M08-BE, M02-FE, M03-FE, M04-FE, M05-FE, M07-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M08-dashboard-handoff.md` |
| Consumed by | M09 |

## Goal

One landing page that summarizes everything:
- today's and overdue tasks
- today's habits
- a task completion percentage
- active plans with live progress and rest time
- a learning-progress snapshot
- quick-add actions

All metrics must match the underlying data and reflect changes immediately.

## Requirements Covered

FR-09, FR-08 ("reflect item-level changes … in the dashboard summary") · US-D1..D6 · AC-D1..D4, AC-P8 (dashboard part) · UX-DASH (greeting, metric cards, today's tasks, habit checklist, active plans, quick-add) · NFR-P2, NFR-M1, NFR-M2 · TR-3 · DOD-5 (dashboard part) · A-25..A-28, A-31

## Business Rules (all reused, none redefined)

| Metric | Definition | Source of logic |
|---|---|---|
| Tasks due today | `DueDate == today`, not archived, any status | M02 query |
| Overdue tasks | M02 overdue rule (A-05) | M02 |
| Completed tasks today | `CompletedAt` local date == today | M02 (A-06) |
| Task completion % | Done ÷ all non-archived tasks × 100 (0 when none) (A-25) | M08 aggregation |
| Today's habits | Active habits + `completedToday` / `completedForCurrentPeriod` / streak (A-26) | M03 progress calculator |
| Active plans | `InProgress` plans with `progressPercent`, `restTimeSeconds` | M07 active-plans query |
| Plan counts | in progress / upcoming / completed | M07 status calculator |
| Learning snapshot | cards by status · milestones done/total · milestones completed in last 7 days (A-27) | M04 data |

**Orchestrator decision (2026-10-10, raised by M04-BE):** "last 7 days" is a **rolling window**: `IsDone && CompletedAt >= now − 7×24h`, where `now` comes from `TimeProvider`. Apply the same rule to any other "recent" metric.

## Backend Tasks

| # | Task |
|---|---|
| B1 | Dashboard query service that **composes existing module services/calculators** (M02 overdue, M03 habit progress, M06 progress, M07 status/rest time, M04 counts). No re-implemented rules |
| B2 | `DashboardResponse` DTO (below) |
| B3 | `GET /api/dashboard?today=` endpoint + OpenAPI |
| B4 | Unit/integration tests (TR-3): metrics equal the underlying data across seeded scenarios |
| B5 | Response time spot-check < 500 ms on a realistic seeded dataset (NFR-P1) |

## Proposed API Contract

*The backend may refine this. The handoff is authoritative.*

`GET /api/dashboard?today=YYYY-MM-DD` → 200

```json
{
  "serverNow": "ISO-UTC",
  "today": "YYYY-MM-DD",
  "tasks": {
    "dueToday": [TaskSummary], "overdue": [TaskSummary],
    "completedTodayCount": 0, "totalActive": 0, "doneCount": 0, "completionPercent": 0
  },
  "habits": {
    "activeCount": 0, "completedTodayCount": 0,
    "items": [{ "id": 0, "name": "", "frequency": "Daily", "completedToday": false, "completedForCurrentPeriod": false, "currentStreak": 0 }]
  },
  "plans": {
    "inProgressCount": 0, "upcomingCount": 0, "completedCount": 0,
    "active": [{ "id": 0, "title": "", "startDateTime": "", "endDateTime": "", "status": "InProgress", "progressPercent": 0, "doneItems": 0, "totalItems": 0, "restTimeSeconds": 0 }]
  },
  "learning": {
    "notStartedCount": 0, "inProgressCount": 0, "completedCount": 0,
    "milestonesDone": 0, "milestonesTotal": 0, "milestonesCompletedLast7Days": 0
  }
}
```

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Dashboard API service + types |
| F2 | Header: greeting with `DisplayName` from the M05 settings store (generic greeting if empty) + today's date |
| F3 | Summary metric cards: **Tasks** (completion %, due today, overdue), **Habits** (completed today / active), **Plans** (in progress / upcoming), **Learning** (in-progress cards, milestones done/total) |
| F4 | Today's task list: due today + overdue section. Complete toggle reuses the M02 row → refetch dashboard |
| F5 | Today's habit checklist reusing the M03 toggle → refetch dashboard |
| F6 | Active plans section reusing M06 progress bar + M07 RestTime/StatusBadge. Link to Todo Plans page |
| F7 | Learning snapshot section |
| F8 | Quick-add actions: Add Task / Add Habit / Add Learning Card (reuse create dialogs) and Create Plan (navigate to builder) (A-28). Refetch after create |
| F9 | Refresh on mount, after every action, on window focus, and every ≤ 60 s. Rest time ticks client-side |
| F10 | Empty states per section, each guiding to the relevant add action. Loading/error states |

## Testing Tasks

**Unit/integration (TR-3), seeded data:**
- counts and lists equal direct queries
- overdue excludes done and archived tasks
- completed-today uses `CompletedAt`
- completion % with 0 tasks = 0 and with mixed statuses is correct
- weekly habit completed earlier this week → `completedForCurrentPeriod=true`, `completedToday=false`
- active plans list = `InProgress` only, with progress and rest time
- learning counts and "last 7 days" milestone count are correct

**Curl verification:**
1. Fresh DB → all counts 0, lists empty, completion 0.
2. Create task due today → in `dueToday`. Task due yesterday → in `overdue`.
3. Complete a task → `completedTodayCount` +1, `completionPercent` updated, removed from `overdue` if it was there.
4. Archive a task → excluded from all task metrics.
5. Complete a habit → `habits.completedTodayCount` +1.
6. Create plan with an active window → in `plans.active` with `restTimeSeconds`. PATCH an item → dashboard `progressPercent` updated (AC-P8).
7. Complete a milestone → `milestonesDone` and `milestonesCompletedLast7Days` +1.

**Playwright MCP verification:**
1. `/` lands on Dashboard (default view). Greeting shows the Settings display name.
2. Fresh DB → empty states with add actions.
3. Quick-add a task due today → appears in today's list. Metric card updates.
4. Complete the task from the dashboard → completion % and counts update.
5. Toggle a habit on the dashboard → habits metric updates.
6. Active plan shows progress + rest time decreasing between two observations.
7. Mark a plan item done on Todo Plans → return to Dashboard → progress reflects it.
8. Complete a milestone on Learning page → learning snapshot updates.

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · Swagger lists dashboard endpoint ✓ · curl 1–7 pass ✓ · TR-3 tests pass ✓ · no duplicated business rules ✓ · < 500 ms spot-check ✓ · handoff created ✓ · progress/state updated ✓.

**Frontend:** all six dashboard sections functional ✓ · live rest time ✓ · quick-add ✓ · Playwright 1–8 pass ✓ · progress/state/output updated ✓.
