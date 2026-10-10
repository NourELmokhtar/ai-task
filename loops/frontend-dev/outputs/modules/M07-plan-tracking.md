# M07 Plan Tracking: Frontend Module Output

| Field | Value |
|---|---|
| Module | M07 Plan Tracking, frontend layer (status badges, grouping, live rest time, start notifications) |
| Final status | **COMPLETED** |
| Attempts | 1. Build, unit tests, every e2e scenario and the regression suite passed on the first run |
| Started / finished | 2026-10-10 22:16 / 22:33 (local) |
| Backend used | Snapshot `backend-snapshot-m08` on `http://localhost:5080` (`dotnet run`, PID 31116 plus children 11108 and 17732, stopped with `taskkill /T`). `backend/` was never run or modified, and port 5081 was never touched |
| Contract | `loops/orchestrator/outputs/handoffs/M07-plan-tracking-handoff.md` (`READY`) |

## Requirements covered

FR-08 (status lifecycle display, rest time, start notification, immediate reflection) · BR-12 · US-P7, US-P8, US-P10 · AC-P5, AC-P6, AC-P8 (plan view) · UX-PLANS (grouping, live rest time, start toast and highlight) · NFR-P2 (ticks every second) · A-20 (server status shown as-is), A-21 (rest time only while InProgress, `serverNow` clock correction), A-22 (toast + highlight, once per plan, also on app open, settings respected), A-23 (history: completion %, end date desc).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | Types | `PlanDto` gained `restTimeSeconds: number \| null` and `serverNow: string`; `status` is documented as server-computed. New `PlanGroup`. `PlansApi.list({ group? })` (optional, unused by the page) |
| F2 | Grouped page | **Active & Upcoming**: an "In progress" sub-list (`plans-active`), then an "Upcoming" sub-list (`plans-upcoming`), each by priority, start and id. **Completed / History** (`plans-completed`): end desc, then id desc, each card showing "Ended <date> · NN% complete" plus the progress bar. Each group has its own empty state. With no plans at all, the M06 "No plans yet" CTA is kept. The summary line reads `N plans · a in progress · u upcoming · c completed` |
| F3 | `RestTime` | `hh:mm:ss` from `endDateTime` with `offsetMs = Date.parse(serverNow) − Date.now()` (recomputed only when `serverNow` changes). Ticks every 1 s. Emits `elapsed` once at zero, re-armed by a new `serverNow`/`endDateTime`. Renders nothing and runs no timer when `restTimeSeconds` is null. `role="timer"` |
| F4 | `PlanStatusBadge` | Projected through `planCardStatus`: "Not started", "In progress", "Completed". `PlanTiming` (through `planCardExtra`) shows `RestTime` for InProgress, "Starts <local date/time>" for NotStarted and "Ended …" for Completed |
| F5 | `PlanStartWatcherService` | Root-provided, `start()` is called once in `App.ngOnInit`. Polls `GET /api/plans` every 60 s and arms one precise timer per upcoming plan (start corrected by the offset, + 500 ms, within 6 h). It never overlaps requests and ignores errors. A plan that is `InProgress` and not yet notified triggers an info toast `Plan '<title>' has started` (8 s) when notifications are on. Either way the plan is marked handled, highlighted and emitted on `started$`. Notified ids are kept in localStorage `quickflow.plans.startNotified` (try/catch, merged across tabs, ids of deleted plans pruned). `stop()`/`ngOnDestroy` clear all timers |
| F6 | Toggles | Unchanged M06 flow: the PATCH response replaces the plan, and the grouping is a `computed` over the list, so status, progress, rest time and group change at once |
| F7 | Refresh | Silent refresh every 60 s and on window `focus` (skipped if the last load started < 15 s ago), plus when a countdown reaches zero. A failed background refresh keeps the list. The watcher's `started$` list is applied directly, so a start moves the card with no extra request |

**Grouping choice:** client-side from one `GET /api/plans` (no `group` param). It's one request per refresh, all cards share one `serverNow`, and a PATCH response can move a card between groups without refetching. The order matches the handoff (§3).

## Important files

New, under `frontend/src/app/features/plans/`:
- `plan-tracking.ts`: `PLAN_STATUS_LABELS`, `serverOffsetMs`, `msUntil`, `formatCountdown`, `compareByPriority`, `compareByEndDesc`, `groupPlans`, `GroupedPlans`
- `components/rest-time.ts`, `components/plan-status-badge.ts`, `components/plan-timing.ts`
- `plan-start-watcher.service.ts`
- Tests: `plan-tracking.spec.ts`, `components/rest-time.spec.ts` (RestTime, PlanStatusBadge, PlanTiming), `plan-start-watcher.service.spec.ts`

Modified:
- `plans.models.ts` (F1), `plans-api.service.ts` (`group`), `plans-page.ts` (grouping, refresh, highlight), `index.ts` (exports), `testing/plan-fixtures.ts` (new fields)
- `plans-page.spec.ts` (+6 M07 tests), `plans-api.service.spec.ts` (+1)
- `src/app/app.ts` (starts the watcher; imported directly, not through the barrel, so the plan UI stays in the lazy chunk) and `app.spec.ts` (stub watcher, +1 test)

E2E: `frontend/e2e/m07-plan-tracking.spec.ts`.

## API integrations

| Call | Used by |
|---|---|
| `GET /api/plans` | Todo Plans page (load, 60 s, focus, countdown zero) and the watcher (60 s poll + start timers) |
| `PATCH /api/plans/{id}/items/{itemId}` | Toggles (the response carries the new `status`, `restTimeSeconds`, `serverNow`) |
| `GET/PUT /api/settings` | Unchanged (M05). The watcher reads `SettingsService.planStartNotificationsEnabled()` |

## Verification (all executed and observed)

| Check | Result |
|---|---|
| `npm run build` | OK, no warnings (main 8.06 kB, plans lazy chunk 37.96 kB) |
| `npm run test:ci` | **322/322**: 42 new, the existing 280 still pass |
| `npx playwright test e2e/m07-plan-tracking.spec.ts` | **7/7** in 2.7 min (real server starts, no clock mocking) |
| Full `npx playwright test` | **57 passed, 1 skipped** (the M01 backend-down test, skipped by design). M01 9, M02 9, M03 9, M04 8, M05 7, M06 8, M07 7 |
| M01 backend-down (`QF_E2E_BACKEND_DOWN=1`, API stopped) | 1/1. The watcher's failed startup request is harmless |

Unit coverage: offset math (server ahead, behind, missing), countdown with skew and every-second ticks, `hh:mm:ss` formatting, the zero-crossing event (once, then re-armed by a new response), hidden means no timer, grouping and order (status, priority, start, id; history end desc), badge labels, timing per status, watcher notify-once (poll and reload via localStorage), settings disabled (no toast, still highlighted and handled, no late toast after re-enabling), a precise timer for a future start with a 30 s skew (no request at 20.499 s, request at 20.5 s), re-arm when the server still says NotStarted, no overlapping requests, the 60 s poll, `stop()` clearing timers, errors, completed-before-start (no toast), highlight cleanup and pruning, localStorage throwing, page grouping and per-group empty states, the F6 moves in both directions, the 60 s refresh and throttled focus refresh (a failure keeps the list), refetch at countdown zero, the watcher event applied without a request, highlight, and App starting the watcher.

E2E scenarios:
1. A plan starting 75 s ahead is under "Upcoming", badge "Not started", `Starts <browser-local date/time>`, no rest time, no page errors. **Pass**
2. At the start: toast `Plan '…' has started` (about 1 s after the start), the API says `InProgress`, the card moves to "In progress" with `data-highlighted="true"`, the badge reads "In progress" and the rest time shows `00:2x:xx`. **Pass** (1.3 min)
3. The rest time is `hh:mm:ss`, within 5 s of the API's `restTimeSeconds`, and dropped by 2–5 s over a 3 s gap. **Pass**
4. Past-window plans are in Completed / History. A: `33% · 1/3` and "Ended … · 33% complete", no rest time. Order is B (later end) then A. **Pass**
5. Active plan with two items: check 1 → 50%, still active. Check 2 → Completed group, "Completed", no rest time (API agrees). Uncheck → back to "In progress" with a rest time (API `InProgress`), same document. **Pass**
6. Notifications switched off through the Settings page UI (PUT confirmed), then Todo Plans opened through the nav. At the start the card moves to "In progress", is highlighted and shows a rest time, and no toast appears, checked at once and again after 3 s. **Pass** (44 s)
7. On `/tasks` the toast appears at the start, the URL stays `/tasks` and the API says `InProgress`. After a reload there is no second toast (notify-once through localStorage). **Pass** (34 s)

Data: plans and cards prefixed `E2E-M07-<run>` were deleted in `afterAll` (a check afterwards found none left). Settings were restored after every test and verified as `{null, true, Dashboard}`. Processes: the API (PID 31116 tree) was stopped, and `ng serve` was started and stopped by Playwright. Ports 4200 and 5080 are free.

## Reusable exports for M08

Import from `src/app/features/plans` (the barrel). Everything is standalone or `providedIn: 'root'`.

| Export | Kind | Use |
|---|---|---|
| `RestTime` (`app-rest-time`) | component | Inputs: `endDateTime` (required ISO), `serverNow` (ISO of the **same fresh** response; null means no correction), `restTimeSeconds` (null hides it and stops its timer), `label` (default `Rest time`). Output: `elapsed` (zero reached, so refetch). Test id `plan-rest-time` with `data-seconds`; value in `.rest__value`. Works directly with `ActivePlanSummary` + the top-level `serverNow`: `<app-rest-time [endDateTime]="a.endDateTime" [serverNow]="summary.serverNow" [restTimeSeconds]="a.restTimeSeconds" (elapsed)="reload()" />` |
| `PlanStatusBadge` (`app-plan-status-badge`) | component | `[status]` (required). Test id `plan-status`, `data-status`. In a card: `<app-plan-status-badge planCardStatus [status]="p.status" />` |
| `PlanTiming` (`app-plan-timing`) | component | `[plan]: PlanDto`, `(elapsed)`. Rest time, "Starts …" or "Ended … · NN% complete" by status. In a card: `<app-plan-timing planCardExtra [plan]="p" (elapsed)="reload()" />` |
| `PlanStartWatcherService` | root service | Already started by `App`, so **don't call `start()` again** (it's idempotent anyway). `highlighted()`: `ReadonlySet<number>` of plans that started this session and are still InProgress. `started$`: `{ started: PlanDto[]; plans: PlanDto[] }` after a fetch that detected starts; `plans` is the fresh full list, so a dashboard can refresh on it (subscribe with `takeUntilDestroyed`). `isNotified(id)`, `check()` (fetch now; skipped while in flight). Constants `PLAN_WATCH_POLL_MS` (60 s), `PLAN_START_TIMER_BUFFER_MS`, `PLAN_START_TIMER_HORIZON_MS`, `PLAN_START_TOAST_MS`, `PLAN_NOTIFIED_STORAGE_KEY` |
| `groupPlans(plans)` → `{ active, upcoming, completed }`, `compareByPriority`, `compareByEndDesc` | helpers | Same grouping and order as the Todo Plans page |
| `serverOffsetMs(serverNow, clientNow?)`, `msUntil(iso, offsetMs, clientNow?)`, `formatCountdown(ms)`, `PLAN_STATUS_LABELS` | helpers | Clock-skew math and `hh:mm:ss` formatting |
| `PlanGroup`, `PlanDto.restTimeSeconds`, `PlanDto.serverNow`, `PlansApi.list({ group })` | types/API | `group` gives a server-filtered list |

M08 dashboard sketch:
```ts
private readonly watcher = inject(PlanStartWatcherService);
constructor() { this.watcher.started$.pipe(takeUntilDestroyed()).subscribe(() => this.reload()); }
```
```html
<app-plan-card [plan]="p" [actions]="false" [busyItemIds]="busy()" (itemDoneChange)="toggle(p, $event)">
  <app-plan-status-badge planCardStatus [status]="p.status" />
  <app-plan-timing planCardExtra [plan]="p" (elapsed)="reload()" />
</app-plan-card>
```

## Assumptions and deviations

- **Grouping:** done client-side from one list (see above). Inside "Active & Upcoming" there are two labelled sub-lists ("In progress", "Upcoming"), so "shown under Upcoming" and "moves to Active" can be observed.
- **Notify-once key:** the plan id, as specified. A plan rescheduled after its start was notified is not notified again.
- **Notifications disabled:** the start is still marked as handled, so turning notifications back on later does not produce a late toast for a plan that has already started. Status, highlight and the `started$` event are unaffected.
- **Highlight:** shown while the plan stays InProgress, for plans whose start was detected in this browser session (toast shown or suppressed). It is not persisted across reloads.
- **A plan completed before its start** never becomes InProgress, so it gets no toast (the smallest reading of A-22, as in the handoff).
- **Detection latency:** a plan the watcher already knows about is detected about 0.5 s after its start. A plan created elsewhere after the last poll is detected at the next poll (≤ 60 s), and also immediately when the app is opened.
- **Toast:** kind `info`, 8 s, one per plan.
- **Focus refresh** is throttled to once per 15 s, which avoids request bursts and keeps the M06 "no list refetch" e2e assertion valid.
- **E2E timing:** the e2e waits for real server starts (25–80 s ahead, timeouts of 3 min) instead of using `page.clock`, because the status is computed on the server.
