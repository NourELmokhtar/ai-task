# M03 Habits: Frontend Module Output

| Field | Value |
|---|---|
| Module | M03 Habits, frontend layer (`/habits`) |
| Final status | **COMPLETED** |
| Attempts | 1 (one unit test needed a `detectChanges()` after a simulated click, a test-only fix; every e2e scenario passed on the first run) |
| Started / finished | 2026-10-10 18:58 / 19:07 (local) |
| Backend used | Snapshot `backend-snapshot-m04` on `http://localhost:5080` (dotnet run PID 13328, stopped). `backend/` was never run or modified, and port 5081 was never touched |
| Contract | `loops/orchestrator/outputs/handoffs/M03-habits-handoff.md` (`READY`) |

## Requirements covered

FR-03, FR-04 · BR-06 (client + server errors), BR-07 (409 handled as "already done"), BR-14 (removed habit disappears; 404 → reload) · A-09 ("Done this week" from `completedForCurrentPeriod`), A-10 (streak from `currentStreak`), A-11 (inactive → toggle disabled) · US-H1..H5 · AC-H1..H3 · UX-HABITS · NFR-U1, NFR-U2 (shared empty/loading/error states), NFR-M1 (feature folder, API service separate from presentation).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | `HabitsApi` (list/get/create/update/activate/deactivate/delete, `complete`, `removeCompletion`, `listCompletions`, **`setCompletedToday`**) and DTO types in `habits.models.ts`. Every habit-returning call sends `?today=<local date>` | Done |
| F2 | `HabitsPage` with a header "Add Habit" button and a summary (`N active · M done today · K inactive`) | Done |
| F3 | `HabitCard`: today's toggle (checkbox labelled "Today", optimistic and reverts on failure), name, description, frequency badge (Daily/Weekly), weekly "Done this week" / "Not done this week", `Streak: N day(s)/week(s)`, and a green left border when done today | Done |
| F4 | Edit, Deactivate/Activate and Remove (confirm dialog "Remove habit?"). Inactive habits are listed under an **"Inactive"** heading below the active ones, dimmed, with an "Inactive" badge and the toggle disabled | Done |
| F5 | `HabitFormDialog` (Add/Edit) with Reactive Forms: name required, not whitespace, ≤ 150 after trim; description ≤ 2000; frequency required and `Daily`/`Weekly` (default Daily). Server 400 `errors` are applied to the fields with `applyServerErrors`, unmatched ones show as a form-level error. Other errors (`detail`, e.g. 404) show as a form error plus a toast | Done |
| F6 | Empty state "No habits yet" with **Add Habit**; loading state; error state with **Try again**; success and failure toasts for every mutation | Done |
| F7 | Reusable exports via `features/habits/index.ts` (below) | Done |

**Toggle flow** (`HabitsApi.setCompletedToday(habit, done)`): `today = todayLocal()` is captured once.
- On: `POST /api/habits/{id}/completions?today=…` with no body. A **409** is swallowed (already done).
- Off: `DELETE /api/habits/{id}/completions/{today}`. A **404** for the completion is swallowed (already undone).
- Either way it then calls `GET /api/habits/{id}?today=…` and emits the fresh habit (progress and streak).
- Other errors (e.g. 400 for an inactive habit, or a refetch 404 when the habit was deleted) are rethrown. The page then shows an error toast and reloads the list on 400/404.

Activate, deactivate and edit replace the card in place with the returned habit (edit also reloads). Remove drops the card after the 204.

## Important files

```
frontend/src/app/features/habits/
  index.ts                         public exports (F7)
  habits.models.ts                 DTOs, HABIT_FREQUENCIES/LABELS, limits, formatStreak, partitionHabits, toHabitRequest
  habits-api.service.ts            HabitsApi
  habit-form.ts                    createHabitForm, habitFrequency validator, habitFormValue, toHabitFormRequest
  habits-page.ts                   route page (replaces the placeholder; habits.routes.ts unchanged)
  components/habit-card.ts
  components/habit-form-dialog.ts
  testing/habit-fixtures.ts        makeHabit() for specs
  *.spec.ts, components/*.spec.ts  unit tests
frontend/src/app/shared/forms/validators.ts   NEW: requiredTrimmed, maxTrimmedLength, oneOf, optionalDateOnly (moved from tasks)
frontend/src/app/features/tasks/task-form.ts  now imports those validators from shared and re-exports them (no API change)
frontend/e2e/m03-habits.spec.ts
```

## API integrations

| Endpoint | Used for | Verified (e2e against the snapshot) |
|---|---|---|
| `GET /api/habits?today=` (no `active`, so all habits) | page list | yes (200, `today` = local date) |
| `GET /api/habits/{id}?today=` | refetch after a toggle | yes |
| `POST /api/habits` | Add Habit | yes (201) |
| `PUT /api/habits/{id}` | Edit (full replacement) | yes |
| `POST /api/habits/{id}/deactivate`, `/activate` | card actions | yes |
| `DELETE /api/habits/{id}` | Remove after confirm | yes (then GET → 404) |
| `POST /api/habits/{id}/completions?today=` (no body) | toggle on (409 → treated as done) | yes (201 and 409 paths) |
| `DELETE /api/habits/{id}/completions/{today}` | toggle off | yes (204) |
| `GET /api/habits/{id}/completions?from=&to=` | in the service; e2e uses it to count today's completions | yes |

## Verification (all executed and observed)

| Check | Command | Result |
|---|---|---|
| Production build | `npm run build` | PASS, no warnings (initial 313 kB raw / 89.5 kB transfer; `habits-routes` lazy chunk 18.9 kB / 5.5 kB) |
| Unit tests | `npm run test:ci` | PASS, **115/115** (69 existing + 46 new) |
| E2E M03 | `npx playwright test e2e/m03-habits.spec.ts` | PASS, **9/9** (scenarios 1–7 + 2 extras) |
| E2E regression | `npx playwright test` (all specs) | PASS, 27 passed, 1 skipped by design (M01 9/9, M02 9/9, M03 9/9). Run twice, once before and once after the final CSS tweak |
| Visual check | screenshots at 1280 px and 375 px (active, done, weekly, inactive) | layout OK, no horizontal overflow |

Playwright scenarios:
1. Real load: `GET /api/habits` 200 with `today=<local>` and no `active`, no console errors. With a stubbed empty list: "No habits yet" with **Add Habit**, which opens the Add Habit dialog: PASS
2. Empty and whitespace-only names show "Name is required." and the dialog stays open. Daily habit (default frequency, with description) → "Daily" badge, `Streak: 0 days`, no weekly badge. Weekly habit → "Weekly" badge, "Not done this week", `Streak: 0 weeks`: PASS
3. Toggle on → toast, checked, done class, `Streak: 1 day`; the API has `completedToday=true, currentStreak=1`. Toggle off → unchecked, `Streak: 0 days`; the API has `false/0` and 0 completions today. Weekly toggle on → "Done this week", `Streak: 1 week`, and off again: PASS
4. Toggle on, reload → still checked with `Streak: 1 day`; exactly 1 completion for today in the API. A direct duplicate POST → 409, and the count is still 1: PASS
5. Edit is prefilled (name, description, frequency). Rename, new description, Daily → Weekly → visible ("Weekly", "Done this week" because of today's completion), old name gone. Reverted afterwards: PASS
6. Deactivate → toast, the card moves under "Inactive" with the `habit--inactive` class, "Inactive" badge, content opacity < 1, toggle disabled. API `isActive=false`, and it is still listed after a reload. Activate → back in the active list, toggle enabled, Deactivate button back, API `isActive=true`: PASS
7. Remove → the confirm dialog shows the name. Cancel keeps the habit. Remove → toast, card gone, API 404, still gone after a reload: PASS
- Extra (409): habit completed via the API behind the stale page → toggle on → POST returns 409 → the card shows done, "Marked as done today", no error toast, still exactly 1 completion: PASS
- Extra (F6): list 500 → error state "Couldn't load habits" with the message → **Try again** recovers: PASS

Unit coverage (46 new):
- `HabitsApi`: every method's URL, method and `today` param; completion URLs (POST with no body, POST with `{date}`, `DELETE …/completions/{today}`, completions `from/to`).
- `setCompletedToday`: on → POST + GET; 409 → GET, done, no error; 400 → rethrown, no GET; off → DELETE + GET; off with a completion 404 → GET; off when the habit is gone → 404 reported.
- Form: BR-06 (empty, whitespace, 150/151 after trim), description 2000/2001, frequency required/invalid/valid, trimmed request with null description, prefill.
- Helpers: `formatStreak`, `partitionHabits`, `toHabitRequest`.
- `HabitCard`: labels, weekly badge, streak wording, optimistic toggle and revert, inactive disabled + Activate, outputs, `actions=false`.
- `HabitFormDialog`: empty submit sends nothing; weekly create POSTs a trimmed body, toasts and closes; edit PUTs; server field errors and form error; 404 detail.
- `HabitsPage`: loading → empty state with Add Habit opening the dialog; active then Inactive ordering and summary; error + retry; toggle on (streak), toggle on with a 409 (no error toast), toggle off failure reverts and toasts; deactivate moves the card to Inactive; remove with confirm.

Test data: e2e habits use the unique prefix `E2E-M03-<run>` and are deleted in `afterAll`. Screenshot habits (`SHOT-M03`) were deleted too. Afterwards none were left (the one remaining habit, "M06V habit", was created by another agent during the run). Both processes I started (snapshot API PID 13328, ng serve PID 6860) were stopped, and ports 5080 and 4200 are free.

## Reusable exports (for M06 / M08)

Import from `src/app/features/habits` (the `index.ts` barrel). All of them are standalone or `providedIn: 'root'`.

| Export | Kind | Use |
|---|---|---|
| `HabitsApi` | service | `list(query?)` (`{ active?, today? }`; `today` defaults to the local date; `active` omitted returns all), `get(id, today?)`, `create`, `update`, `activate`, `deactivate`, `delete`, `complete(id, date?, today?)`, `removeCompletion(id, date = today)`, `listCompletions(id, { from, to })`, **`setCompletedToday(habit, done): Observable<HabitDto>`** (toggle with 409/404 handling, returns the refetched habit). **M06 item picker:** `habitsApi.list({ active: true })` (no search param on the API, so filter client-side by `name`) |
| `HabitDto`, `HabitFrequency`, `HabitRequest`, `CreateHabitRequest`, `UpdateHabitRequest`, `HabitCompletionDto`, `HabitListQuery`, `HabitCompletionsQuery`, `HABIT_FREQUENCIES`, `HABIT_FREQUENCY_LABELS`, `HABIT_NAME_MAX`, `HABIT_DESCRIPTION_MAX`, `formatStreak`, `partitionHabits`, `toHabitRequest` | types/helpers | Shared DTOs, labels and display helpers |
| `HabitCard` (`app-habit-card`) | component | **M08 checklist row.** Inputs: `habit` (required), `busy` (disables the controls; the toggle is optimistic while busy and reverts if busy clears without a habit change), `actions` (default `true`; `false` hides Edit/Deactivate/Activate/Remove), `showDescription` (default `true`). Outputs: `completedChange(boolean)`, `edit`, `deactivate`, `activate`, `remove`. Presentational: the parent calls `HabitsApi.setCompletedToday` and sets the returned habit. Test ids: `habit-card` (with `data-habit-id`), `habit-frequency`, `habit-week`, `habit-streak` (with `data-streak`), `habit-inactive`. The toggle's accessible name is `Mark <name> as done today` |
| `HabitFormDialog` (`app-habit-form-dialog`) | component | **M08 quick-add:** `<app-habit-form-dialog [(open)]="addOpen" (saved)="reload()" />`. Optional `[habit]` for edit mode. It saves through `HabitsApi`, toasts "Habit created"/"Habit updated", emits `saved(HabitDto)` and closes |
| `createHabitForm`, `habitFormValue`, `habitFrequency`, `toHabitFormRequest`, `HabitForm` | form helpers | Reuse the same BR-06 client validation |

M08 dashboard example:
```ts
toggle(h: HabitDto, done: boolean) {
  this.busyId.set(h.id);
  this.habitsApi.setCompletedToday(h, done).subscribe({
    next: (fresh) => { this.replace(fresh); this.busyId.set(null); },
    error: (e) => { this.busyId.set(null); this.toast.error(toApiError(e).message); },
  });
}
```
```html
@for (h of habits(); track h.id) {
  <app-habit-card [habit]="h" [actions]="false" [showDescription]="false" [busy]="busyId() === h.id" (completedChange)="toggle(h, $event)" />
}
```

## Assumptions and deviations

- **Playwright test runner** (per task.md), not Playwright MCP. The spec is `frontend/e2e/m03-habits.spec.ts`.
- **Scenario 1 "fresh DB"**: the DB is shared, so the empty state is checked with `page.route` stubbing an empty `GET /api/habits`. The real load is checked in the same test.
- **Inactive display**: both options from the spec. Inactive habits get their own "Inactive" section below the active ones, and the card content is dimmed (the action buttons stay at full opacity so Activate doesn't look disabled).
- **Toggle off 404** (no completion today) is treated like the 409 case: already undone, so refetch. A deleted habit still surfaces as a 404 via the refetch.
- For weekly habits the toggle reflects **today's** completion only (handoff §4). "Done this week" is a separate badge, and "Not done this week" is shown when it's false.
- Streak wording is `Streak: N day(s)` / `Streak: N week(s)`, including 0.
- **Shared validators**: `requiredTrimmed`, `maxTrimmedLength`, `oneOf` and `optionalDateOnly` moved from `features/tasks/task-form.ts` to `shared/forms/validators.ts`. `task-form.ts` re-exports them, so nothing changes for M02 (69 existing tests and the M02 e2e still pass).
- No HTML `maxlength` on the name, so the 150-character message can appear. The dialog doesn't close on a backdrop click (same as Tasks).
- No completion history or past-date completion UI (not in F1–F7). `complete(id, date)` and `listCompletions` are available in the service for later modules.

## Notes for later modules

- Import from `features/habits` (the barrel), not deep paths. `HabitsPage` isn't exported.
- Always go through `HabitsApi` so `today` is the browser's local date. Progress fields depend on it.
- M08 "today's habits": `habitsApi.list({ active: true })`, then use `completedToday` / `completedForCurrentPeriod` for counts. For weekly habits, a "done" checklist item probably wants `completedForCurrentPeriod`.
- M06: the API has no habit search, so filter `list({ active: true })` client-side. Inactive habits still exist (`GET /api/habits/{id}` → 200), but deleted ones return 404.
- Generic validators now live in `shared/forms/validators.ts`. Use them for new forms.
