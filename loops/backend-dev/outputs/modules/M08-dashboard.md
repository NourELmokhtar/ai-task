# M08 Dashboard: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 1 (no failed build, test, runtime or curl step) |
| Start / end | 2026-10-10 19:00 UTC / 19:08 UTC |
| Dependencies | M02-BE, M03-BE, M04-BE, M07-BE (M06 transitively) all `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M08-dashboard-handoff.md` (READY) |
| Migration | None (no entity or model change) |
| Tests | 302/302 pass (282 existing + 20 new) |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Dashboard query service | Done | `IDashboardService`/`DashboardService`. Composes `ITaskService.ListAsync` (due-today recipe `dueFrom=dueTo=today`; `overdue=true` sorted dueDate asc), `IHabitService.ListAsync(active: true, today)`, `IPlanService.GetTrackingSummaryAsync()` (M07) and set-based count queries on `LearningCard`/`LearningMilestone`. Task counts use `IApplicationDbContext` (non-archived count, Done count, `CompletedAt` projection in a coarse UTC window, then converted to the local date with `TimeProvider.LocalTimeZone`). `serverNow` = the M07 summary's clock instant, which is reused for the 7×24 h window |
| B2 | DTOs | Done | `DashboardResponse`, `DashboardTasks` (lists reuse M02 `TaskResponse`), `DashboardHabits`/`DashboardHabitItem`, `DashboardPlans` (reuses M07 `ActivePlanSummary`), `DashboardLearning` |
| B3 | Endpoint + OpenAPI | Done | `DashboardController`: `GET /api/dashboard?today=` (tag `Dashboard`, 200/400 response types, `today` description), `ITodayProvider` for today |
| B4 | TR-3 tests | Done | `tests/QuickFlow.Tests/Dashboard/DashboardServiceTests.cs` (13 facts + 7 theory cases), real services on the in-memory DB with `FixedTimeProvider` |
| B5 | Timing spot-check | Done | Median 8.8 ms, p95 10.1 ms, max 31.3 ms over 20 requests on a seeded dataset (limit 500 ms) |

## Files

Added (all under `backend/`):
- `src/QuickFlow.Application/Features/Dashboard/DashboardDtos.cs`, `DashboardService.cs` (interface + implementation)
- `src/QuickFlow.Api/Controllers/DashboardController.cs`
- `tests/QuickFlow.Tests/Dashboard/DashboardServiceTests.cs`

Modified: `src/QuickFlow.Application/DependencyInjection.cs` (registers `IDashboardService`), `README.md` (feature line). No dependency module's code was changed. `frontend/` was not touched.

## Unit test coverage (TR-3)

| Spec item | Tests |
|---|---|
| metrics equal the underlying data | `Task_metrics_equal_direct_queries_over_seeded_data`, `Habits_show_active_habits_with_M03_progress` (equal to `IHabitService.ListAsync`), `Active_plans_are_InProgress_only_with_progress_and_rest_time` (equal to `PlanGroup.Active`), `Learning_counts_cards_by_status_and_milestones_of_non_deleted_cards` (equal to direct queries), `Empty_database_returns_zero_metrics_empty_lists_and_the_clock` |
| overdue excludes done and archived tasks | `Overdue_excludes_done_archived_due_today_and_undated_tasks` (also: completing removes the task from overdue) |
| completed today uses `CompletedAt` | `Completed_today_uses_completedAt_not_the_due_date_and_excludes_archived`, `Completed_today_converts_completedAt_to_the_server_local_date` (+04:00 zone, local-midnight boundaries) |
| 0 % with no tasks, mixed statuses | `Completion_percent_rounds_and_is_zero_without_tasks` (7 cases incl. 0/0, 1/3 = 33, 2/3 = 67, 1/8 = 13), `Completion_percent_with_mixed_statuses_ignores_archived_tasks`, `Archiving_a_task_removes_it_from_every_task_metric` |
| weekly habit done earlier this week | `Habits_show_active_habits_with_M03_progress`: `completedForCurrentPeriod=true`, `completedToday=false`. Inactive and deleted habits are excluded. Plus `Completing_a_habit_increments_completed_today` |
| active plans = InProgress only, with progress and rest time | `Active_plans_are_InProgress_only_with_progress_and_rest_time` (running / upcoming / past / all-done / deleted), `Patching_a_plan_item_updates_the_dashboard_progress_and_rest_time_follows_the_clock` |
| learning counts and 7-day window | `Learning_counts_cards_by_status_and_milestones_of_non_deleted_cards`, `Last_7_days_is_a_rolling_7x24h_window_including_its_boundary` (exactly 7×24 h → in, +1 tick → out, un-complete/re-complete) |

## Verification (executed and observed)

| Check | Result |
|---|---|
| `dotnet build QuickFlow.sln` | 0 errors, 0 warnings |
| `dotnet test QuickFlow.sln` | 302/302 passed |
| App on `http://localhost:5081` (Development, `dotnet run --no-launch-profile --urls`) | `/api/health` 200. My PIDs 31288 (dotnet run) and 31624 (QuickFlow.Api) were stopped afterwards. Port 5080 wasn't used or touched |
| Swagger / OpenAPI | `/swagger/index.html` 200. `/openapi/v1.json` has `/api/dashboard` and the schemas `DashboardResponse`, `DashboardTasks`, `DashboardHabits`, `DashboardHabitItem`, `DashboardPlans`, `DashboardLearning` |
| Curl 1 baseline | 200. DB was empty at the time: all counts 0, lists `[]`, `completionPercent` 0. Later checks are deltas against this baseline |
| Curl 2 | task due today in `dueToday`; task due yesterday in `overdue` with `isOverdue=true`; `totalActive` +2 |
| Curl 3 | complete → `completedTodayCount` +1, `doneCount` +1, `completionPercent` = round(done/total), removed from `overdue` |
| Curl 4 | archive both → absent from lists, every task metric back to baseline |
| Curl 5 | new habit: `activeCount` +1. `POST /completions` 201 → `habits.completedTodayCount` +1, item `completedToday`/`completedForCurrentPeriod` true, streak 1 |
| Curl 6 | plan (now−10 min … now+60 min) → in `plans.active`, `InProgress`, `inProgressCount` +1, `restTimeSeconds` = `endDateTime − serverNow` (3599). PATCH item → `progressPercent` 0 → 50 (AC-P8). BR-13: `doneCount` +1 |
| Curl 7 | card + milestone: `notStartedCount` +1, `milestonesTotal` +1. Milestone done → `milestonesDone` +1 and `milestonesCompletedLast7Days` +1 |
| Errors | `?today=10-10-2026` → 400 `errors.today`. `?today=2026-13-01` → 400. `?today=<yesterday>` → 200 and echoed |
| Curl total | 27/27 assertions passed (script in the session scratchpad, every HTTP call via `curl`) |
| B5 timing | Seeded 50 tasks (mixed statuses/due dates), 10 habits (daily/weekly, 25 completions), 10 cards (30 milestones, 13 done), 10 plans (3 items each: 4 running, 3 upcoming, 3 past). 1 warm-up + 20 timed `curl` requests: min 8.2 / median 8.8 / p95 10.1 / max 31.3 ms |
| Cleanup | All verification and seed data soft-deleted via the API (tasks 63–65, 66–115; habits 26–36; plans 11–21; cards 13–23). Final dashboard: all zeros |
| Secrets scan | No credentials in `backend/` outside bin/obj (only the documented model-only `Server=localhost;Database=model_only` test strings) |

## Assumptions and ambiguities (smallest choices)

1. **`TaskSummary` = M02 `TaskResponse`.** The spec names a `TaskSummary` without defining it. Reusing the M02 model lets the frontend reuse the task row and toggle and adds no new contract.
2. **List order.** `dueToday` uses the M02 default order (`createdAt` desc). `overdue` uses `dueDate` asc (most overdue first). Both come from the M02 query.
3. **Archived tasks are excluded from `completedTodayCount`** too (curl check 4: "excluded from all task metrics").
4. **`completedTodayCount` (tasks) is independent of `dueDate`.** It counts any non-archived task completed today.
5. **Server-local date** = `TimeProvider.LocalTimeZone`, the same source `ITodayProvider` uses for the default today. With an explicit `?today=`, completions are still converted with the server's zone.
6. **`habits.completedTodayCount` counts `completedToday` only**, not `completedForCurrentPeriod`. This follows the spec field name and curl check 5. The frontend can count `completedForCurrentPeriod` from `items` if needed.
7. **Rounding** of `completionPercent`: midpoint away from zero, the same as M06 `progressPercent`.
8. **`plans.active[]` includes `priorityOrder`.** It is an extra field from M07 `ActivePlanSummary`.
9. **Persistence side effect.** The M07 summary persists computed plan status changes, the same as every plan read. This is intentional reuse, not new behavior.

## Attempts

1. Attempt 1: implementation, build, tests, runtime, curl and timing all passed the first time.
