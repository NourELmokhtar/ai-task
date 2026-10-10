# M07 Plan Tracking: Backend Handoff

Handoff Status: READY

For the M07 frontend loop and for M08 and M09. This handoff extends the M06 handoff (`M06-plan-composition-handoff.md`), and everything there still applies: endpoints, request bodies, validation messages, BR-13 task completion, soft delete and source titles. There is no auth. The dev base URL is `http://localhost:5080` (verified by the backend loop on 5081). **There is no migration in M07**, but the 5080 API must be rebuilt and restarted from the current `backend/` to serve the new fields. That API was not running at 16:20 UTC.

## 1. What changed

| Method | Path | Change |
|---|---|---|
| GET | `/api/plans?group=` | New optional `group` filter (see §3). Invalid → 400 |
| GET / POST / PUT / PATCH | `/api/plans`, `/api/plans/{id}`, `/api/plans/{id}/items/{itemId}` | Every `PlanResponse` now has the **computed** `status`, `restTimeSeconds` and `serverNow` |
| DELETE | `/api/plans/{id}` | Unchanged (204, soft delete) |

## 2. Status rule (A-20) and rest time (A-21)

The server evaluates the status **on every request** from the stored window, the items and the server clock, in this order:
1. all items done → `Completed`
2. `now < startDateTime` → `NotStarted`
3. `startDateTime ≤ now < endDateTime` → `InProgress`
4. `now ≥ endDateTime` → `Completed`

- The status is derived, not a user field, so it stays correct after a restart (NFR-R2). The server also saves the computed value to the DB when it changes. Clients never send `status`.
- **Un-marking** an item inside the window returns the plan to `InProgress`. Before the start it returns to `NotStarted`, and after the end it stays `Completed`.
- Marking all items done before the start or inside the window gives `Completed` immediately (it then appears in history).
- `PUT` with a new start/end recomputes the status, for example moving a running plan to tomorrow makes it `NotStarted`.
- **`restTimeSeconds`** = `endDateTime − serverNow` in whole seconds (truncated, ≥ 0) **only while `status = InProgress`**. In every other case it is `null`.
- **`serverNow`** is the server's UTC time (`…Z`, fractional seconds) at which `status` and `restTimeSeconds` were computed. All plans in one list response share the same `serverNow`.

## 3. `group` filter

| `group` | Returns | Order |
|---|---|---|
| omitted, empty or whitespace | all plans (M06 behavior + new fields) | `priorityOrder` asc, `startDateTime` asc, `id` asc |
| `active` | `status = InProgress` | same as above |
| `upcoming` | `status = NotStarted` | same as above |
| `completed` | `status = Completed` (history, A-23) | `endDateTime` **desc**, then `id` desc |

Values are case-insensitive and trimmed. Anything else (including `InProgress`, `history`, `all` or numbers) returns:
```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"group":["Group must be one of: active, upcoming, completed."]},"traceId":"00-..."}
```
The UI's "Active & Upcoming" section can call `group=active` and `group=upcoming`, or call once without `group` and split by `status` client-side (InProgress first, then NotStarted, keeping the server order).

## 4. Updated `PlanResponse`

The M06 fields are unchanged. The three new or changed fields:

| Field | Type | Notes |
|---|---|---|
| `status` | `"NotStarted"` \| `"InProgress"` \| `"Completed"` | **Computed** (§2) |
| `restTimeSeconds` | integer \| `null` | int64. Non-null only when `InProgress` |
| `serverNow` | ISO UTC string | e.g. `"2026-10-10T16:18:41.8335117Z"` |

Observed (201 from POST, start = now − 10 min, end = now + 60 min):
```json
{"id":4,"title":"M07V active","estimatedDurationMinutes":70,"startDateTime":"2026-10-10T16:08:41Z","endDateTime":"2026-10-10T17:18:41Z","priorityOrder":1,"status":"InProgress","restTimeSeconds":3599,"serverNow":"2026-10-10T16:18:41.8335117Z","createdAt":"2026-10-10T16:18:41.864137Z","updatedAt":"2026-10-10T16:18:41.864137Z","totalItems":3,"doneItems":0,"progressPercent":0,"items":[{"id":6,"sourceType":"Task","sourceId":43,"sourceTitle":"M07V task","sourceAvailable":true,"isDone":false}, "..."]}
```
- **`updatedAt` behavior change:** it now also changes when the server saves a status transition, both on a PUT/PATCH that changes the status and on the first read after a start or end time passes. Don't use it as "last edited by the user".

## 5. Errors

They are the same as M06 (§3 of that handoff), plus the `group` 400 above. 404 `detail`: `Plan with id '1' was not found.` / `Plan item with id '1' was not found on plan '2'.`

## 6. Frontend notes

- **Countdown (F3):** compute `offsetMs = Date.parse(serverNow) − Date.now()` when the response arrives, then show `endDateTime − (Date.now() + offsetMs)` every second, formatted `hh:mm:ss`. Don't simply decrement `restTimeSeconds`. Hide the countdown when `restTimeSeconds === null`. For upcoming plans, show `startDateTime` instead.
- **When to refetch:**
  - when a countdown reaches 0 (the end time), because the plan becomes `Completed`
  - when an upcoming plan's `startDateTime` is reached (corrected by the offset), because it becomes `InProgress`
  - periodically every ≤ 60 s and on window focus (F7)
  - after every PATCH, use the returned plan directly, since it already has the new `status`, `progressPercent` and `restTimeSeconds` (F6)
- **Notifications (A-22) are client-side only.** The backend has no notification endpoint or "notified" flag. The watcher detects `NotStarted → InProgress` (or `status = InProgress` for a not-yet-notified id on app open), stores notified ids client-side and respects M05 `PlanStartNotificationsEnabled`.
- A plan marked fully done before its start is `Completed` and won't pass through `InProgress`. There is no start toast unless your watcher fires on start time regardless of status. The smallest reading of A-22 is "fires when the plan becomes InProgress".
- After toggling a Task item, refresh cached task lists (BR-13, unchanged from M06).

## 7. Reusable backend pieces (namespace `QuickFlow.Application.Features.Plans`)

```csharp
// Pure, clock-injected calculators (B1/B2). Times compared in UTC (Unspecified = UTC).
public static class PlanStatusCalculator
{
    public static PlanStatus Calculate(DateTime start, DateTime end, int totalItems, int doneItems, DateTime now);
    public static PlanStatus Calculate(DateTime start, DateTime end, PlanProgress progress, DateTime now);
}
public static class PlanRestTimeCalculator
{
    public static long? CalculateSeconds(PlanStatus status, DateTime end, DateTime now); // null unless InProgress
}
// Combined evaluation: the single place that composes progress + status + rest time (NFR-M2)
public sealed record PlanTracking(PlanStatus Status, PlanProgress Progress, long? RestTimeSeconds)
{
    public static PlanTracking Evaluate(DateTime start, DateTime end, PlanProgress progress, DateTime now);
    public static PlanTracking Evaluate(Plan plan, IEnumerable<PlanItem> items, DateTime now);
}

// IPlanService (scoped) additions/changes
Task<IReadOnlyList<PlanResponse>> ListAsync(PlanGroup? group = null, CancellationToken ct = default); // PlanGroup: Active | Upcoming | Completed
Task<PlanTrackingSummary> GetTrackingSummaryAsync(CancellationToken ct = default);                 // M08 (B6)
// PlanInputValidator.ParseGroupFilter(string?) -> PlanGroup? (throws ValidationException "group")

// M08 summary DTOs (match the M08 "plans" contract)
public sealed record PlanTrackingSummary(DateTime ServerNow, int InProgressCount, int UpcomingCount, int CompletedCount,
                                         IReadOnlyList<ActivePlanSummary> Active);       // Active = InProgress plans, A-16 order
public sealed record ActivePlanSummary(int Id, string Title, DateTime StartDateTime, DateTime EndDateTime, int PriorityOrder,
                                       PlanStatus Status, int ProgressPercent, int DoneItems, int TotalItems, long? RestTimeSeconds);
```
**For M08:** inject `IPlanService` and call `GetTrackingSummaryAsync()`. It evaluates every non-deleted plan at one `TimeProvider` instant, persists changed statuses (the same code path as `GET /api/plans`), and returns counts and active plans. It doesn't resolve source titles, so it's cheaper than `ListAsync`. Map it to `plans: { inProgressCount, upcomingCount, completedCount, active[] }`, and use the top-level `serverNow` from the same clock. Don't re-implement the status rule.

`PlanService` now takes `TimeProvider` as its 4th constructor parameter (DI handles this. Tests: `new PlanService(db, resolver, tasks, clock)`).

## 8. Verification state

Build 0 errors / 0 warnings · tests 248/248 (212 existing unchanged + 36 new TR-2) · no migration (DB up to date) · Swagger shows the `group` param and the new fields · curl checks 1–7 passed on 5081:
1. InProgress with rest 3599 (end − now = 60 min)
2. NotStarted with rest null
3. past window → Completed, in `group=completed`
4. all done → Completed, then un-mark → InProgress
5. each group returns the right set; invalid → 400
6. rest time went from 3576 to 3514 over 62.13 s
7. same statuses after a restart

Test data was soft-deleted, so `GET /api/plans` returns `[]`. Details: `loops/backend-dev/outputs/modules/M07-plan-tracking.md`.
