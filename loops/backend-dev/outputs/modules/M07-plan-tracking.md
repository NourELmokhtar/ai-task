# M07 Plan Tracking: Backend Module Output

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Attempts | 1 (no failed build, test, runtime or curl step) |
| Start / end | 2026-10-10 16:13 UTC / 16:22 UTC |
| Dependencies | M06-BE `COMPLETED` |
| Handoff | `../../../orchestrator/outputs/handoffs/M07-plan-tracking-handoff.md` (READY) |
| Migration | **None**. `Plans.Status` (varchar(50)) already exists and no entity or mapping changed. The app started with "No migrations were applied", and EF raised no pending-model-changes error |
| Tests | 248/248 pass (212 existing + 36 new). No M06 assertion changed. Only the `PlanService` constructor call in `PlanServiceTests` gained `_clock` |

## Tasks

| # | Task | Status | Implementation |
|---|---|---|---|
| B1 | Status calculator (A-20) | Done | `PlanStatusCalculator.Calculate(start, end, totalItems, doneItems, now)` and the `(start, end, PlanProgress, now)` overload. Pure. Rules are evaluated in order: all done → Completed; now < start → NotStarted; now < end → InProgress; else Completed. Compares in UTC (Unspecified is treated as UTC) |
| B2 | Rest-time calculator (A-21) | Done | `PlanRestTimeCalculator.CalculateSeconds(status, end, now)` → `long?`: whole seconds, truncated, while InProgress. Otherwise null |
| B3 | Apply on every path + persist | Done | `PlanService` takes `TimeProvider`. List, get, create, update and item PATCH evaluate `PlanTracking` at one `now` and set `Plan.Status` when it differs. Saves: list/get only when something changed; create/update/PATCH in the same SaveChanges as the write (PATCH stays atomic with the BR-13 task completion). PATCH now loads the plan's items tracked, so the status reflects the toggled item |
| B4 | `PlanResponse` | Done | `status` (computed), `restTimeSeconds` (`long?`), `serverNow` (UTC `Z`). `PlanResponse.From(plan, items, sources, now)` computes them |
| B5 | Grouping | Done | `GET /api/plans?group=active\|upcoming\|completed` (case-insensitive). Empty or omitted = all. Invalid → 400 `errors.group`. Parsed by `PlanInputValidator.ParseGroupFilter`. `IPlanService.ListAsync(PlanGroup? group = null, ct)` |
| B6 | M08 summary | Done | `IPlanService.GetTrackingSummaryAsync(ct)` → `PlanTrackingSummary(ServerNow, InProgressCount, UpcomingCount, CompletedCount, Active: ActivePlanSummary[])`. It shares the same load/evaluate/persist code as the list |
| B7 | OpenAPI + TR-2 tests | Done | Controller `group` param with description, 400 response type, property descriptions on the new fields. Tests below |

## Files

Added:
- `backend/src/QuickFlow.Application/Features/Plans/PlanTracking.cs` (`PlanStatusCalculator`, `PlanRestTimeCalculator`, `PlanTracking` record + `Evaluate`)
- `backend/tests/QuickFlow.Tests/Plans/PlanTrackingCalculatorTests.cs` (15 pure tests)
- `backend/tests/QuickFlow.Tests/Plans/PlanTrackingServiceTests.cs` (21 service/validator tests, in-memory DB, `FixedTimeProvider`)

Changed:
- `backend/src/QuickFlow.Application/Features/Plans/PlanDtos.cs`: `PlanResponse` fields + `From(..., now)`, `PlanGroup`, `ActivePlanSummary`, `PlanTrackingSummary`
- `backend/src/QuickFlow.Application/Features/Plans/PlanService.cs`, `IPlanService.cs`: lifecycle on every path, `ListAsync(group)`, `GetTrackingSummaryAsync`
- `backend/src/QuickFlow.Application/Features/Plans/PlanInputValidator.cs`: `ParseGroupFilter`, `GroupInvalid`
- `backend/src/QuickFlow.Api/Controllers/PlansController.cs`: `group` query param, docs
- `backend/src/QuickFlow.Application/Domain/Plans/Plan.cs`, `PlanStatus.cs`: doc comments only
- `backend/tests/QuickFlow.Tests/Plans/PlanServiceTests.cs`: constructor call only (`, _clock`)

## TR-2 coverage (all pass)

| Spec case | Test(s) |
|---|---|
| now < start → NotStarted, rest null | `Before_start_is_NotStarted_without_rest_time`, `Create_before_start_is_NotStarted_...` |
| now == start → InProgress, rest = end − start | `At_start_is_InProgress_with_rest_time_end_minus_start`, service `..._after_the_clock_advances_...` |
| mid-window → InProgress, rest = end − now | `Mid_window_is_InProgress_...`, `Create_inside_the_window_is_InProgress_and_stored` |
| now == end → Completed, rest null | `At_end_is_Completed_without_rest_time`, service restart step |
| all done mid-window → Completed | `All_items_done_mid_window_is_Completed`, service `All_items_done_mid_window_completes_...` |
| all done before start → Completed | `All_items_done_before_start_is_Completed`, service `..._unmarking_returns_to_NotStarted` |
| un-mark mid-window → InProgress | `Unmarking_one_item_mid_window_returns_to_InProgress`, service PATCH test (stored status checked) |
| past end, 1/3 done → Completed, 33 | `Past_end_with_one_of_three_done_...` (calculator + service in `group=completed`) |
| recompute after clock advances, no writes (restart) | `Status_follows_the_clock_with_unchanged_data`, `Status_and_rest_time_are_recomputed_after_the_clock_advances_without_writes` (new DbContext + service on the same store) |

Also covered: truncation to whole seconds, Unspecified kind, zero-item plans, PUT recompute, group parsing (valid, empty, invalid), group membership and order, summary counts/active list, deleted plans excluded.

## Verification (executed and observed, API on http://localhost:5081, Development, DB `quickflow`)

| # | Check | Result |
|---|---|---|
| Build | `dotnet build QuickFlow.sln` | 0 errors, 0 warnings |
| Tests | `dotnet test` | 248/248 |
| Run | startup | Listening on 5081, "No migrations were applied" |
| 1 | POST start = now−10 min, end = now+60 min | 201 `status=InProgress`, `restTimeSeconds=3599`, `serverNow` UTC Z |
| 2 | POST start = now+30 min | 201 `NotStarted`, `restTimeSeconds=null` |
| 3 | POST past window | 201 `Completed`, listed by `group=completed` |
| 4 | PATCH all items done / un-mark one | 200 `Completed` (100%, rest null), then 200 `InProgress` (67%, rest 3577). BR-13 task completion still applied |
| 5 | `group=active` / `upcoming` / `completed` | {4} / {5} / {6}. No group = all 3 in A-16 order. `ACTIVE` works. `bogus` → 400 `errors.group`. `group=` → 200 (all) |
| 6 | Two GETs 62.13 s apart | `restTimeSeconds` 3576 → 3514 (−62) |
| 7 | Restart API | Same statuses (6 Completed, 4 InProgress, 5 NotStarted) and group sets |
| Extra | PUT window into the present / back to the future | `InProgress` (rest 1499) / `NotStarted` |
| Extra | 404 plan, 400 PATCH without isDone, `/api/tasks`, `/api/habits`, `/api/learning-cards` | 404 / 400 / 200 ×3 |
| Swagger | `/swagger` 200. `/openapi/v1.json` | `GET /api/plans` has the `group` query param (+400). `PlanResponse` has `status`, `restTimeSeconds` (int64, nullable), `serverNow` (date-time) with descriptions |
| Secrets | grep `backend/` excl. bin/obj | Docs mentions only, no credentials |
| Cleanup | soft-deleted plans 4–6, task 43, habit 17, card 5 | `GET /api/plans` → `[]`. My API PIDs (30516/2952, then 29988/2756) stopped |

## Decisions, assumptions and ambiguities

1. **No migration.** Status is persisted in the existing column. `PlanItem.CompletedAt` was not added because the spec doesn't require it (history is ordered by `EndDateTime`).
2. **`updatedAt` also changes when a status transition is persisted.** This happens when the first read after a start or end time passes saves the new status, and when a PUT or PATCH changes the status. The audit convention stamps every modified row. This is the smallest option: the alternative was special-casing the shared audit. Before M07, `updatedAt` changed on PUT only.
3. **Rest time is truncated** to whole seconds (`floor`, never negative). `restTimeSeconds` is `long` because an `int` overflows for windows longer than about 68 years.
4. **History tie-break:** `EndDateTime` desc, then `id` desc. Active/upcoming keep the M06 order (priority, start, id).
5. **`group`** is case-insensitive and trimmed. Empty or whitespace means no filter, the same as the M04 `status` filter.
6. **Spec arithmetic in curl check 1:** with end = now + 60 min, the rule `end − now` gives ≈ 3600 s, not the ≈ 3000 written in the spec. The implementation follows the rule (observed 3599).
7. **Concurrency:** two simultaneous reads may both persist the same derived status. This is harmless and idempotent. Responses always use the freshly computed status, never the stored one.
8. A plan with 0 items cannot exist (BR-10). If one did, it would never count as "all done" and would follow the time rules only.

## Notes

- The frontend snapshot API on port 5080 (PID 26524 at 16:13 UTC) was no longer running at 16:20 UTC. I didn't touch it: I stopped only my own 5081 processes, by PID, after checking their command lines. The frontend/orchestrator needs to rebuild or restart its 5080 instance from the current `backend/` to get M07.
