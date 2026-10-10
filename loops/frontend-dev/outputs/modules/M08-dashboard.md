# M08 Dashboard: Frontend Module Output

| Field | Value |
|---|---|
| Module | M08 Dashboard, frontend layer (`/dashboard`, the `/` default view) |
| Final status | **COMPLETED** |
| Attempts | 1 (build, unit tests, all 8 e2e scenarios and the full regression passed on the first run; one test-helper fix before the first unit run: `HttpTestingController.match` consumes requests) |
| Started / finished | 2026-10-10 22:35 / 22:48 (local) |
| Backend used | Snapshot `backend-snapshot-m08` on `http://localhost:5080` (dotnet run PID 31220 + children, stopped). `backend/` was never run or modified; port 5081 never touched |
| Contract | `loops/orchestrator/outputs/handoffs/M08-dashboard-handoff.md` (`READY`) |

## Requirements covered

FR-09, FR-08 (dashboard reflects item-level plan changes) · US-D1..D6 · AC-D1..D4, AC-P8 (dashboard part) · UX-DASH (greeting, metric cards, today's tasks, habit checklist, active plans, quick-add) · NFR-P2 (rest time ticks every second, refetch ≤ 30 s) · NFR-M1, NFR-M2 (no business rule re-implemented; every count is the server's) · A-25..A-28, A-31 · DOD-5 (dashboard part).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | `DashboardApi.get(today = todayLocal())` → `GET /api/dashboard?today=`; DTOs mirror handoff §2 (`DashboardResponse`, `DashboardTasks`, `DashboardHabits`/`DashboardHabitItem`, `DashboardPlans`/`DashboardActivePlan`, `DashboardLearning`); tasks reuse M02 `TaskDto` | Done |
| F2 | Header: h1 **Dashboard** (unchanged for m01), greeting `Good morning/afternoon/evening, <displayName>` from `SettingsService.displayName()` (generic `Good …` when null/blank; 05–11 morning, 12–17 afternoon, else evening), long local date | Done |
| F3 | `DashboardMetricCards`: **Tasks** `completionPercent`% + `done of total` + due today · overdue; **Habits** `completedTodayCount / activeCount done today` (agreed metric), plus, when weekly habits exist, `N / M on track this period (weekly: this week)` from `items.filter(completedForCurrentPeriod)`; **Plans** in progress + upcoming · completed; **Learning** in-progress cards, milestones done/total, completed in the last 7 days | Done |
| F4 | Today's tasks: "Due today" list + "Overdue" list, each row the M02 `TaskItem` (`actions=false`). Toggle → `TasksApi.setCompleted` → row replaced with the saved task → toast → dashboard refetch | Done |
| F5 | Habit checklist: M03 `HabitCard` (`actions=false`, `showDescription=false`). Toggle → `HabitsApi.setCompletedToday` → item replaced → toast → refetch | Done |
| F6 | Active plans: title (link to `/plans`), `PlanStatusBadge`, `PlanProgressBar` (`NN% · d/t`), `RestTime` with the top-level `serverNow`; `(elapsed)` refetches. Header link **View all plans** → `/plans` | Done |
| F7 | Learning snapshot: Not started / In progress / Completed counts, milestone `PlanProgressBar` (done/total), "N milestones completed in the last 7 days", link to `/learning` | Done |
| F8 | Quick-add group (header): **Add Task** (`TaskFormDialog`, due date prefilled with today), **Add Habit** (`HabitFormDialog`), **Add Learning Card** (`LearningCardFormDialog`) → refetch on `saved`; **Create Plan** link → `/plans/new` | Done |
| F9 | Refresh on mount, after every action, on window focus (throttled: ≥ 15 s since the last request, as M07), every 30 s, on countdown zero and on `PlanStartWatcherService.started$`. **Single in-flight guard**: background triggers (timer, focus) are skipped while a request runs; action triggers (toggles, saves, countdown zero, watcher, retry) are queued and coalesced into exactly one follow-up request | Done |
| F10 | Empty state per section with its add action (Nothing due today → Add Task; No habits yet → Add Habit; No active plans → Create Plan, mentions upcoming count; No learning cards yet → Add Learning Card). Partial empties ("Nothing due today." when only overdue exist). Loading state; error state with **Try again**; a failed background refresh keeps the data and shows an inline "Couldn't refresh … Retry" notice | Done |

## Important files

```
frontend/src/app/features/dashboard/
  dashboard.models.ts              DTOs + toDashboardMetrics, toHabitDto/fromHabitDto, timeOfDay, greeting, formatLongDate, emptyDashboard
  dashboard-api.service.ts         DashboardApi
  dashboard-page.ts                route page (replaced the placeholder; dashboard.routes.ts unchanged)
  components/dashboard-metrics.ts  DashboardMetricCards (app-dashboard-metrics)
  index.ts                         barrel (DashboardApi, types, helpers, DashboardMetricCards)
  testing/dashboard-fixtures.ts    makeDashboard / makeHabitItem / makeActivePlan
  dashboard.models.spec.ts, dashboard-api.service.spec.ts, dashboard-page.spec.ts
frontend/e2e/m08-dashboard.spec.ts
```
No file outside `features/dashboard/` and `e2e/` changed. Other features are imported only through their barrels.

## API integrations

| Call | Used by |
|---|---|
| `GET /api/dashboard?today=<local>` | every dashboard load/refresh |
| `POST /api/tasks/{id}/complete`, `PUT /api/tasks/{id}` (via `TasksApi.setCompleted`) | task toggle |
| `POST /api/habits/{id}/completions?today=`, `DELETE …/completions/{today}`, `GET /api/habits/{id}` (via `HabitsApi.setCompletedToday`) | habit toggle |
| `POST /api/tasks`, `POST /api/habits`, `POST /api/learning-cards` (via the reused dialogs) | quick-add |

## Verification (all executed and observed)

| Check | Command | Result |
|---|---|---|
| Production build | `npm run build` | PASS, no warnings (`dashboard-routes` lazy chunk 20.5 kB / 5.5 kB) |
| Unit tests | `npm run test:ci` | PASS, **347/347** (322 existing + 25 new) |
| E2E M08 | `npx playwright test e2e/m08-dashboard.spec.ts` | PASS, **8/8** |
| E2E regression | `npx playwright test` | PASS, **65 passed, 1 skipped** by design (M01 9, M02 9, M03 9, M04 8, M05 7, M06 8, M07 7, M08 8) |
| M01 backend-down | `QF_E2E_BACKEND_DOWN=1 … -g "actually stopped"` with the API stopped | PASS 1/1 |
| Visual | temporary screenshot spec (deleted) at 1280 px and 375 px with an overdue task, weekly habit, active plan, card | layout OK, `scrollWidth − clientWidth = 0` at both widths |

Playwright scenarios (all metric checks are deltas against values read before the action):
1. `/` → `/dashboard`, request carries `today=<local date>`, h1 "Dashboard", generic greeting `Good …` and the date with defaults; after `PUT /api/settings displayName="Dash Tester"` → `Good …, Dash Tester`; no console errors: PASS
2. Stubbed all-zero `/api/dashboard` (`page.route`): Tasks 0%, Habits `0 / 0 done today`; empty states "Nothing due today" → Add Task dialog (due date = today), "No habits yet" → Add Habit dialog, "No learning cards yet" → Add Learning Card dialog, "No active plans" → Create Plan → `/plans/new`: PASS
3. Quick-add **Add Task** (due date prefilled today) → saved → refetch → row in "Due today"; `data-due-today` +1, `data-total` +1, text `N+1 due today`: PASS
4. Check the row → toast "Task completed"; `data-done` +1, completion = round((done+1)/total×100) shown as `NN%` and `done+1 of total done`; due-today unchanged (any status); row shows Done/checked; API `status=Done`, `completedAt` set: PASS
5. Habit checkbox on → toast; `data-completed-today` +1 and `N+1 / M done today`; off → back to N: PASS
6. Plan (2 learning items, window −5 min … +45 min) → row "In progress", `0% · 0/2`, rest time `hh:mm:ss` between 40 and 45 min, and `data-seconds` decreases by > 1 s between observations; View all plans → `/plans`: PASS
7. Dashboard `0% · 0/2` → View all plans → check `Mark <card B> as done` (PATCH 200, `50% · 1/2`) → nav back to Dashboard → `50% · 1/2`, `aria-valuenow=50`: PASS
8. Read learning snapshot → Learning page → expand card → check milestone (`1/1`) → nav back → `data-milestones-done` +1, total unchanged, `data-recent` +1, metric card `done+1 / total milestones done`: PASS

Unit coverage (25 new): metric mapping (zeros, counts as-is, list lengths, learning total/percent, weekly habits today vs period); greeting (time-of-day boundaries 04:59/05:00/11:59/12:00/17:59/18:00/00:00, name trimmed, null/undefined/empty/blank → generic); habit DTO round trip; API `today` param + 400 → `ApiError`; page: loading → metrics/sections, weekly labels, greeting follows the settings signal, four empty states and their actions (dialogs open, task due date = today, Create Plan navigates), partial empties, quick-add POST → refetch, error + retry, background failure keeps data + notice + retry, task toggle (POST, toast, checked, refetch), failed task toggle reverts + toast + refetch, habit toggle (POST + GET, toast, refetch), active plan badge/progress/rest time and countdown-zero refetch (fake timers), 30 s interval, throttled focus, watcher `started$`, in-flight guard (skips vs one coalesced follow-up).

Test data: everything uses the `E2E-M08-<run>` prefix (screenshot data `SHOT-M08`) and is deleted in `afterAll`/`finally`. Afterwards no M08 task/habit/card/plan remained, settings were back to defaults (`null` / `true` / `Dashboard`) and the dashboard returned all zeros. The API (PID 31220 + children) was stopped; Playwright started and stopped `ng serve`. Ports 5080 and 4200 are free.

## Assumptions and deviations

- **Playwright test runner** (per task.md), not Playwright MCP. Scenario 2 "fresh DB" uses a `page.route` stub because the DB is shared.
- **Habits metric**: the headline is the agreed `completedTodayCount / activeCount` labelled "done today". A secondary line "on track this period (weekly: this week)" counts `completedForCurrentPeriod` client-side, shown only when weekly habits exist. The checklist toggle reflects today only (M03 behaviour) and weekly habits show "Done this week".
- **Quick-add task** prefills the due date with today (the dialog's `defaultDueDate`), so a quick-added task lands in "Today's tasks". The user can clear it.
- **Refresh interval** 30 s (≤ 60 s). Focus refresh throttled to 15 s like Todo Plans.
- **Row/item replacement**: after a toggle the row shows the saved task / fresh habit until the refetch lands (avoids checkbox flicker). Counts are never patched locally.
- **Active plans** use a compact row (no item list) because the dashboard summary has no items; item toggling stays on Todo Plans. Plan titles link to `/plans`.
- **Learning snapshot** milestone bar reuses `PlanProgressBar` (generic done/total bar).
- Background refresh failures don't toast (would repeat every 30 s); an inline notice with Retry is shown instead.

## Reusable exports (for M09)

Import from `src/app/features/dashboard` (barrel): `DashboardApi`, all `Dashboard*` types, `toDashboardMetrics`, `greeting`, `timeOfDay`, `formatLongDate`, `emptyDashboard`, `toHabitDto`/`fromHabitDto`, `DashboardMetricCards`. The page is not exported.

E2E hooks: metric cards `metric-tasks` (`data-completion`, `data-done`, `data-total`, `data-due-today`, `data-overdue`), `metric-habits` (`data-completed-today`, `data-active`, `data-period`), `metric-plans` (`data-in-progress`, `data-upcoming`), `metric-learning` (`data-in-progress`, `data-milestones-done`, `data-milestones-total`, `data-recent`); sections `dashboard-tasks` (`dashboard-due-today`, `dashboard-overdue`), `dashboard-habits`, `dashboard-plans` (`dashboard-plan` with `data-plan-id`), `dashboard-learning` (same milestone `data-*` + `learning-recent`); `dashboard-greeting`, `dashboard-date`, `dashboard-stale`; quick-add `getByRole('group', { name: 'Quick add' })`. Reused row ids (`task-item`, `habit-card`, `plan-status`, `plan-progress-text`, `plan-rest-time`) and checkbox names (`Mark <title> as done`, `Mark <name> as done today`) are unchanged.

## Notes for M09 (E2E journey)

- Assert dashboard metrics as **deltas** (shared DB, global counts) and wait for the `/api/dashboard` response after SPA navigation (the page refetches on mount).
- Note the "Add Task" label exists in the quick-add group, the empty state and the dialog submit button. Scope locators (`quick-add` group, section test id, `getByRole('dialog', { name: 'Add Task' })`).
- An InProgress plan in the DB triggers the M07 start toast on app open in a fresh context; don't assert on an empty toast host.
- The dashboard reflects Todo Plans item toggles only after navigating back (refetch on mount) or the next 30 s/focus refresh.
