# M08 Dashboard: Backend Handoff

Handoff Status: READY

For the M08 frontend loop and M09. There is no auth. The dev base URL is `http://localhost:5080`, the same API as M01–M07 (the backend loop verified it on 5081). All M01 conventions apply: camelCase JSON, string enums, UTC `DateTime` ending in `Z`, `DateOnly` as `YYYY-MM-DD` and ProblemDetails errors. **There is no migration in M08**, but the 5080 API must be rebuilt and restarted from the current `backend/` to serve the new endpoint.

## 1. Endpoint

| Method | Path | Query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/dashboard` | `today` (optional, `YYYY-MM-DD`) | 200 `DashboardResponse` | 400 (invalid `today`) |

- `today` defaults to the server's local date, as on every M02/M03 endpoint. It drives due today, overdue, completed today and habit progress. Send the same value you send to `/api/tasks` and `/api/habits` (or omit it everywhere).
- One request returns every section. There is no pagination. Swagger tag: `Dashboard`.
- Reading the dashboard can persist plan status transitions. This is the same M07 code path as `GET /api/plans`, so `updatedAt` may change. Nothing else is written.

## 2. Response model

```ts
interface DashboardResponse {
  serverNow: string;          // ISO UTC, e.g. "2026-10-10T19:04:52.4235022Z". The single instant used for plan status/rest time and the 7-day window
  today: string;              // "YYYY-MM-DD": the effective today (echo of ?today= or server local date)
  tasks: {
    dueToday: TaskResponse[];         // same model as /api/tasks (M02 §2), incl. isOverdue
    overdue: TaskResponse[];
    completedTodayCount: number;      // int
    totalActive: number;              // int
    doneCount: number;                // int
    completionPercent: number;        // int 0–100
  };
  habits: {
    activeCount: number;              // int
    completedTodayCount: number;      // int
    items: { id: number; name: string; frequency: 'Daily' | 'Weekly';
             completedToday: boolean; completedForCurrentPeriod: boolean; currentStreak: number }[];
  };
  plans: {
    inProgressCount: number; upcomingCount: number; completedCount: number;   // ints
    active: { id: number; title: string; startDateTime: string; endDateTime: string; // ISO UTC
              priorityOrder: number; status: 'InProgress'; progressPercent: number;  // int 0–100
              doneItems: number; totalItems: number; restTimeSeconds: number }[];     // int64, ≥ 0
  };
  learning: {
    notStartedCount: number; inProgressCount: number; completedCount: number;
    milestonesDone: number; milestonesTotal: number; milestonesCompletedLast7Days: number;   // ints
  };
}
```
`TaskResponse` = `{ id, title, description, status, priority, dueDate, createdAt, updatedAt, isArchived, completedAt, isOverdue }` (unchanged from M02), so the M02 task row and its complete toggle can be reused as is. The spec's `TaskSummary` is this model. In `plans.active`, `restTimeSeconds` is never null (active = InProgress) and `priorityOrder` is an extra field compared with the spec.

Observed (seeded, lists trimmed to one or two entries):
```json
{"serverNow":"2026-10-10T19:04:52.4235022Z","today":"2026-10-10",
 "tasks":{"dueToday":[{"id":111,"title":"M08T task 45","description":null,"status":"Todo","priority":"Medium","dueDate":"2026-10-10","createdAt":"2026-10-10T19:04:48.784367Z","updatedAt":"2026-10-10T19:04:48.784367Z","isArchived":false,"completedAt":null,"isOverdue":false}],
          "overdue":[{"id":66,"title":"M08T task 0","description":null,"status":"Todo","priority":"Medium","dueDate":"2026-10-07","createdAt":"2026-10-10T19:04:47.617959Z","updatedAt":"2026-10-10T19:04:47.617959Z","isArchived":false,"completedAt":null,"isOverdue":true}],
          "completedTodayCount":16,"totalActive":50,"doneCount":16,"completionPercent":32},
 "habits":{"activeCount":10,"completedTodayCount":5,"items":[{"id":27,"name":"M08T habit 0","frequency":"Daily","completedToday":true,"completedForCurrentPeriod":true,"currentStreak":1},{"id":28,"name":"M08T habit 1","frequency":"Weekly","completedToday":false,"completedForCurrentPeriod":true,"currentStreak":1}]},
 "plans":{"inProgressCount":4,"upcomingCount":3,"completedCount":3,"active":[{"id":12,"title":"M08T plan 0","startDateTime":"2026-10-10T18:34:51.398Z","endDateTime":"2026-10-10T20:34:51.398Z","priorityOrder":1,"status":"InProgress","progressPercent":0,"doneItems":0,"totalItems":3,"restTimeSeconds":5398}]},
 "learning":{"notStartedCount":4,"inProgressCount":3,"completedCount":3,"milestonesDone":13,"milestonesTotal":30,"milestonesCompletedLast7Days":13}}
```
Empty DB: every count is `0`, every list is `[]` and `completionPercent` is `0`.

## 3. Metric definitions

Soft-deleted entities are excluded everywhere. All rules come from the existing modules (NFR-M2).

| Field | Definition | Source |
|---|---|---|
| `tasks.dueToday` | `dueDate == today`, not archived, **any status** (Done included). Order: `createdAt` desc (M02 default) | M02 list query `dueFrom=dueTo=today` |
| `tasks.overdue` | `dueDate < today && status != Done && !isArchived` (A-05). Due today is not overdue. Order: `dueDate` asc, then `id` asc | M02 `overdue=true` query (`TaskItem.IsOverdue`) |
| `tasks.completedTodayCount` | non-archived `Done` tasks whose `completedAt` converted to the **server-local date** equals `today` (A-06). Independent of `dueDate` | M02 `CompletedAt` |
| `tasks.totalActive` | non-archived tasks (any status) | |
| `tasks.doneCount` | non-archived `Done` tasks | |
| `tasks.completionPercent` | `round(doneCount / totalActive × 100)`, midpoint away from zero, `0` when `totalActive = 0` (A-25) | M08 |
| `habits.activeCount` | active habits (inactive ones are excluded) | M03 `ListAsync(active: true)` |
| `habits.completedTodayCount` | active habits with `completedToday = true` (a completion dated exactly `today`) | M03 |
| `habits.items[]` | the active habits, oldest first. Daily: `completedForCurrentPeriod` = `completedToday`. Weekly: any completion in the ISO week (Mon–Sun) containing `today`. `currentStreak` per A-10 | `HabitProgressCalculator` |
| `plans.inProgressCount` / `upcomingCount` / `completedCount` | plans by **computed** status `InProgress` / `NotStarted` / `Completed` (A-20) at `serverNow` | M07 `GetTrackingSummaryAsync` |
| `plans.active[]` | `InProgress` plans only, A-16 order (`priorityOrder`, `startDateTime`, `id`). `progressPercent = round(done/total × 100)`, `restTimeSeconds = endDateTime − serverNow` (whole seconds, truncated) | M06/M07 calculators |
| `learning.notStartedCount` / `inProgressCount` / `completedCount` | cards by their user-set `status` | M04 data |
| `learning.milestonesDone` / `milestonesTotal` | milestones of non-deleted cards with `isDone` / all | M04 data |
| `learning.milestonesCompletedLast7Days` | `isDone && completedAt ≥ serverNow − 7×24 h` (rolling window, boundary included). Un-completing a milestone removes it | orchestrator decision |

## 4. Errors

| Case | Response |
|---|---|
| `today` not `YYYY-MM-DD` (e.g. `10-10-2026`, `2026-13-01`) | 400 `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"today":["The value '10-10-2026' is not a valid date. Use the format YYYY-MM-DD."]},"traceId":"00-..."}` |
| Unexpected failure | 500 `{"title":"An unexpected error occurred.","status":500,"traceId":"..."}` |

An empty `today=` is treated as omitted. There is no 404 for this endpoint.

## 5. Refresh guidance (frontend)

- **Rest time ticks client-side.** On each response compute `offsetMs = Date.parse(serverNow) − Date.now()`, then every second show `Date.parse(endDateTime) − (Date.now() + offsetMs)` as `hh:mm:ss` (floor at 0). Don't just decrement `restTimeSeconds`. This is the same pattern as M07 §6, so reuse the M07 `RestTime` component.
- **Refetch** `GET /api/dashboard`:
  - on mount
  - after every action (task complete/un-complete, habit toggle, quick-add create, plan item PATCH elsewhere)
  - on window focus
  - every **≤ 60 s**
  - when a countdown reaches 0 (the plan becomes `Completed` and leaves `active`)
- An upcoming plan becoming `InProgress` is not visible until the next refetch (the 60 s poll covers it, since the dashboard doesn't return upcoming start times).
- After completing a task or toggling a habit from the dashboard, call the existing M02/M03 endpoint (with the same `today`), then refetch the dashboard. Don't patch the counts locally.
- `completedTodayCount` for habits counts only completions dated **today**. A weekly habit already done earlier this week shows `completedForCurrentPeriod: true` / `completedToday: false` (show it as "Done this week"), and it isn't in `completedTodayCount`. If the card should show "done this period", count `items.filter(i => i.completedForCurrentPeriod)` client-side.

## 6. Backend pieces (namespace `QuickFlow.Application.Features.Dashboard`)

```csharp
public interface IDashboardService { Task<DashboardResponse> GetAsync(DateOnly today, CancellationToken ct = default); } // scoped
public static int DashboardService.CompletionPercent(int doneCount, int totalCount);   // A-25
public static readonly TimeSpan DashboardService.RecentWindow;                          // 7 days, rolling
```
Records: `DashboardResponse`, `DashboardTasks`, `DashboardHabits`, `DashboardHabitItem`, `DashboardPlans` (reuses M07 `ActivePlanSummary`) and `DashboardLearning`. The query count per request is fixed: 2 task lists, 3 task counts/projections, 2 habit queries, 2 plan queries (plus a save only when a status changes) and 4 learning queries. Nothing runs per habit or per plan.

## 7. Verification state

Build 0 errors / 0 warnings · tests 302/302 (282 existing + 20 new TR-3) · no migration · Swagger lists `GET /api/dashboard` (tag `Dashboard`, `today` param, all `Dashboard*` schemas) · curl checks 1–7 passed on 5081 as deltas (27/27 assertions), plus invalid `today` → 400 · B5: seeded 50 tasks / 10 habits / 10 plans / 10 cards, 20 requests: median 8.8 ms, p95 10.1 ms, max 31.3 ms (limit 500 ms). All test data was soft-deleted afterwards, and the dashboard returned to all zeros. Details: `loops/backend-dev/outputs/modules/M08-dashboard.md`.
