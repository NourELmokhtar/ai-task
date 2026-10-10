# M03 Habits: Backend Handoff

Handoff Status: READY

This handoff is for the M03 frontend loop and for M06, M08 and M09. There is no auth. The dev base URL is `http://localhost:5080`, the same API as M01/M02 (the backend loop verified it on 5081). All M01 conventions apply: camelCase JSON, string enums, UTC `DateTime` ending in `Z`, `DateOnly` as `YYYY-MM-DD`, and ProblemDetails errors. Migration: `20261010153933_AddHabits`, which creates the tables `Habits` and `HabitCompletions`.

## 1. Endpoints

| Method | Path | Query | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/habits` | `active`, `today` | none | 200 `HabitResponse[]` | 400 (bad `today`/`active`) |
| GET | `/api/habits/{id}` | `today` | none | 200 `HabitResponse` | 404 |
| POST | `/api/habits` | `today` | `CreateHabitRequest` | 201 `HabitResponse` + `Location: /api/habits/{id}` | 400 |
| PUT | `/api/habits/{id}` | `today` | `UpdateHabitRequest` | 200 `HabitResponse` | 400, 404 |
| POST | `/api/habits/{id}/deactivate` | `today` | none | 200 `HabitResponse` (`isActive=false`) | 404 |
| POST | `/api/habits/{id}/activate` | `today` | none | 200 `HabitResponse` (`isActive=true`) | 404 |
| DELETE | `/api/habits/{id}` | none | none | 204 (no body) | 404 |
| POST | `/api/habits/{id}/completions` | `today` | `CompletionRequest` (optional) | 201 `CompletionResponse` | 400 (inactive / future / bad date), 404, **409 duplicate** |
| DELETE | `/api/habits/{id}/completions/{date}` | none | none | 204 (no body) | 400 (bad date format), 404 (habit or completion missing) |
| GET | `/api/habits/{id}/completions` | `from`, `to` | none | 200 `CompletionResponse[]` (date ascending) | 400 (`to < from`, bad date), 404 |

- `{id}` is an integer. A non-integer id gives 404. `{date}` must be exactly `YYYY-MM-DD`.
- `today=YYYY-MM-DD` is optional on every endpoint that returns a habit, and on POST completions. It sets the progress fields, the default completion date and the future-date limit. Without it the server's local date is used. An invalid format gives 400 with `errors.today`.
- `active` on the list: omitted returns **all** habits (active and inactive), `true` returns active only, `false` returns inactive only.
- The list is ordered by `createdAt` ascending (oldest first, tie-break `id`). There is no pagination.
- activate and deactivate are idempotent.
- `Location` for POST completions is `/api/habits/{id}/completions?from=D&to=D`. There is no single-completion GET.

## 2. Models

### HabitResponse

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `name` | string | 1–150 chars, trimmed |
| `description` | string \| null | ≤ 2000 chars |
| `frequency` | `"Daily"` \| `"Weekly"` | |
| `isActive` | boolean | `true` on create |
| `createdAt` | ISO UTC string | |
| `updatedAt` | ISO UTC string | Changes on update/activate/deactivate. Completions don't change it |
| `completedToday` | boolean | A completion exists dated exactly `today` |
| `completedForCurrentPeriod` | boolean | Daily: same as `completedToday`. Weekly: any completion in the ISO week (Mon–Sun) containing `today` ("Done this week") |
| `currentStreak` | int ≥ 0 | See §4 |
| `lastCompletionDate` | `"YYYY-MM-DD"` \| null | Latest completion on or before `today` |

Example (daily habit completed 10-07..10-10, `today=2026-10-10`):
```json
{"id":1,"name":"Drink water","description":"8 glasses","frequency":"Daily","isActive":true,
 "createdAt":"2026-10-10T15:41:48.728383Z","updatedAt":"2026-10-10T15:41:48.728383Z",
 "completedToday":true,"completedForCurrentPeriod":true,"currentStreak":4,"lastCompletionDate":"2026-10-10"}
```

### CreateHabitRequest / UpdateHabitRequest (same shape)

| Field | Type | Rules |
|---|---|---|
| `name` | string | **Required**. Trimmed, then 1–150 chars |
| `description` | string \| null | Optional. ≤ 2000 chars. Empty or whitespace-only is stored as `null` |
| `frequency` | string | **Required**. `Daily` \| `Weekly` (case-insensitive). Numbers are rejected |

PUT is a full replacement of `name`/`description`/`frequency`, so an omitted `description` is cleared. PUT does **not** change `isActive`; use activate/deactivate for that. Changing the frequency recomputes progress over the existing completions with the new period rule.

### CompletionRequest

`{ "date": "YYYY-MM-DD" }`. Both the body and `date` are optional, and `date` defaults to `today`. Sending no body (without a Content-Type) also works, and so does `{}`.

### CompletionResponse

`{ "id": 2, "habitId": 1, "date": "2026-10-10", "createdAt": "2026-10-10T15:41:57.3555259Z" }`

## 3. Validation and error responses (exact)

All errors are `application/problem+json`. 400 responses have an `errors` map (field → messages), and the other errors have a `detail`.

| Case | Status | `errors` key → message / `detail` |
|---|---|---|
| Name missing, empty or blank | 400 | `name` → `Name is required.` |
| Name > 150 after trim | 400 | `name` → `Name must be at most 150 characters.` |
| Description > 2000 | 400 | `description` → `Description must be at most 2000 characters.` |
| Frequency missing | 400 | `frequency` → `Frequency is required.` |
| Frequency invalid (e.g. `Monthly`) | 400 | `frequency` → `Frequency must be one of: Daily, Weekly.` |
| Frequency as a JSON number | 400 | `$.frequency` → JSON conversion message |
| Complete an inactive habit | 400 | `habit` → `Inactive habits cannot be completed. Activate the habit first.` |
| Completion date after `today` | 400 | `date` → `Completion date cannot be in the future.` |
| Completion `date` not `YYYY-MM-DD` (body) | 400 | `$.date` → JSON conversion message |
| `{date}` in the route, or `today`/`from`/`to`, malformed | 400 | `date`/`today`/`from`/`to` → `The value '…' is not a valid date. Use the format YYYY-MM-DD.` |
| Completions `to < from` | 400 | `to` → `to must be on or after from.` |
| Habit missing or deleted | 404 | `Habit with id '2' was not found.` |
| DELETE completion for a date without one | 404 | `Habit with id '1' has no completion on 2026-10-10.` |
| Duplicate completion (same habit and date) | 409 | `Habit with id '1' is already completed on 2026-10-10.` |

Multiple field errors are returned together (an empty body gives both `name` and `frequency`). Check order for POST completions: 404, then 400 (inactive and/or future), then 409.

Examples:
```json
400 {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"name":["Name is required."],"frequency":["Frequency is required."]},"traceId":"00-…"}
404 {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.5","title":"Not Found","status":404,"detail":"Habit with id '2' was not found.","traceId":"00-…"}
409 {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.10","title":"Conflict","status":409,"detail":"Habit with id '1' is already completed on 2026-10-10.","traceId":"00-…"}
```

## 4. Business rules relevant to the UI

- **Toggle for today:** on is `POST /api/habits/{id}/completions` (no body). Off is `DELETE /api/habits/{id}/completions/{today}`. Then refresh the habit (`GET /api/habits/{id}` or the list). The completion response doesn't include progress. If the toggle is out of sync, a 409 on "on" means it is already done, so treat it as done and refresh.
- **No duplicates (BR-07):** at most one completion per habit per date. The service checks this, and a DB unique index `(HabitId, CompletionDate)` enforces it. Concurrent duplicates also return 409, never 500 (verified with 40 parallel requests).
- **Weekly period (A-09):** ISO week, Monday to Sunday. Use `completedForCurrentPeriod` to show "Done this week". `completedToday` is still per-day, so for a weekly habit the toggle reflects today's completion only.
- **Streak (A-10):** consecutive periods (days for Daily, ISO weeks for Weekly) with at least one completion. If the current period is complete, it counts back from the current period. If not, it counts from the previous period, so the streak isn't lost until the current period ends. Several completions in one week count as one week. Completions dated after `today` are ignored.
- **Inactive (A-11):** completing an inactive habit gives 400, so disable the toggle. Inactive habits keep their completions and progress fields. Removing a completion of an inactive habit **is allowed**. Inactive habits appear in the default list (`active` omitted) with `isActive=false`.
- **Future dates (A-11):** a completion date after `today` gives 400. Past dates are allowed, with no lower bound (not before creation, etc.).
- **Delete (BR-14):** soft delete. Afterwards the habit returns 404 on every endpoint (including its completions), and it is absent from all lists. Its completions are hidden, not returned.

## 5. Reusable pieces for other modules

### M08 Dashboard: pure progress calculator (`QuickFlow.Application.Features.Habits`)

```csharp
public sealed record HabitProgress(bool CompletedToday, bool CompletedForCurrentPeriod, int CurrentStreak, DateOnly? LastCompletionDate)
{ public static readonly HabitProgress None; }

public static class HabitProgressCalculator
{
    // Pure, clock-independent. Dates after `today` are ignored; duplicates and order don't matter.
    public static HabitProgress Calculate(HabitFrequency frequency, IEnumerable<DateOnly> completionDates, DateOnly today);
    public static DateOnly GetPeriodStart(HabitFrequency frequency, DateOnly date); // Daily: date; Weekly: Monday of ISO week
    public static DateOnly GetPeriodEnd(HabitFrequency frequency, DateOnly date);   // Daily: date; Weekly: Sunday
}
```
`HabitResponse.From(Habit, IEnumerable<DateOnly> completionDates, DateOnly today)` builds the API model with it. "Today's habits" for the dashboard is `IHabitService.ListAsync(active: true, today)`, which already returns progress per habit (one query for habits and one for completions).

### M06: habit existence and name (`IHabitService`, scoped, injectable)

```csharp
Task<bool> ExistsAsync(int id, CancellationToken ct = default);                                   // not deleted (active or inactive)
Task<IReadOnlyDictionary<int, string>> GetNamesAsync(IEnumerable<int> ids, CancellationToken ct = default); // missing/deleted ids absent
Task<HabitResponse> GetAsync(int id, DateOnly today, CancellationToken ct = default);           // throws NotFoundException (404)
Task<CompletionResponse> AddCompletionAsync(int id, DateOnly? date, DateOnly today, CancellationToken ct = default); // reusable completion op
```
The other service methods are `ListAsync(bool? active, today)`, `CreateAsync`, `UpdateAsync`, `ActivateAsync`, `DeactivateAsync`, `DeleteAsync`, `RemoveCompletionAsync(id, date)` and `ListCompletionsAsync(id, from, to)`. All of them throw `NotFoundException`/`ValidationException`/`ConflictException`, which map to 404/400/409. `AddCompletionAsync` saves through the shared scoped DbContext.

Entities: `QuickFlow.Application.Domain.Habits.Habit` (soft-deletable; `Name`, `Description`, `Frequency`, `IsActive`) and `HabitCompletion` (`HabitId`, `Habit`, `CompletionDate`, `CreatedAt`; hard-deleted on removal). Enum: `HabitFrequency { Daily, Weekly }`. `AppDbContext.Habits` and `AppDbContext.HabitCompletions` are available.

## 6. Verification state

Test data was soft-deleted, so `GET /api/habits` returns `[]` in the `quickflow` DB. The habit tables hold only soft-deleted rows (ids 1–3), and habit ids continue from 4.
