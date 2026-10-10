# M06 Plan Composition: Frontend Module Output

| Field | Value |
|---|---|
| Module | M06 Plan Composition, frontend layer (`/plans`, `/plans/new`, `/plans/:id/edit`) |
| Final status | **COMPLETED** |
| Attempts | 1. Build, unit tests and every e2e scenario passed on the first run. A first session was cut off by an API usage limit before any code was written, so it doesn't count as a failed attempt |
| Started / finished | 2026-10-10 19:23, resumed later and finished about 22:02 (local) |
| Backend used | Snapshot `backend-snapshot-m06` on `http://localhost:5080` (dotnet run PID 5712, stopped with its child processes). `backend/` was never run or modified, and port 5081 was never touched |
| Contract | `loops/orchestrator/outputs/handoffs/M06-plan-composition-handoff.md` (`READY`) |

## Requirements covered

FR-07, FR-08 (completion % only) · BR-10, BR-11 (client + server errors), BR-13 (the task is completed server-side, verified on the Tasks page), BR-14, A-15..A-17, A-24 ("Source removed") · US-P1..P6, US-P9 · AC-P1..P4, AC-P7, AC-P8 (plan view) · UX-PLANS (builder, fields, list, item toggles, remove, empty state) · NFR-U1/U2 (responsive down to 375 px, accessible names, `role="progressbar"`).

Not built here (M07 scope): status badges, active/upcoming/completed grouping, rest-time countdown and start notifications. `status` is never displayed (the M06 API always returns `NotStarted`).

## Implemented tasks

| # | Task | Status |
|---|---|---|
| F1 | `PlansApi` (`list`, `get`, `create`, `update`, `delete`, `setItemDone`) + `plans.models.ts` types/helpers | Done |
| F2 | Todo Plans page with a "Create Plan" header link | Done |
| F3 | Builder item picker (`app-plan-item-picker`): Tasks `TasksApi.list()` (non-archived), Habits `HabitsApi.list({active:true})`, Learning `LearningApi.list()`. Per-section client-side search by title/name, multi-select checkboxes, per-section loading/error/retry, selected-items summary (count + removable chips, selection order) | Done |
| F4 | Builder fields: title, duration hours + minutes → `estimatedDurationMinutes`, start/end `datetime-local` → UTC ISO via `toISOString()` (default: next full hour, +1 h), priority order. Client validation: title required ≤ 200, ≥ 1 item, end > start (re-checked when start changes), duration > 0 with whole hours and minutes 0–59, priority a whole number ≥ 1. Server 400s: field keys go onto the fields (`estimatedDurationMinutes` → duration), `items[i]…` keys become summary messages naming the i-th selected item, and other errors go to the summary plus a toast | Done |
| F5 | Plan list in API order: `app-plan-card` with title, priority badge, local start–end (end shows only the time when on the same day), estimated duration, progress bar + `NN% · done/total`, items with a type icon + label, title, "Source removed" badge, and a done checkbox. A toggle sends PATCH and replaces the card with the returned plan, with no list reload | Done |
| F6 | Edit: `/plans/:id/edit` loads the plan, prefills local times and hours/minutes, shows items read-only and PUTs metadata only. Remove: confirm dialog → DELETE → card dropped | Done |
| F7 | Empty state with a "Create Plan" CTA, loading/error states (list + builder edit load + per picker section), toasts (`Plan created`, `Plan updated`, `Plan removed`, `Item done and task completed · 33% complete`, `Item updated · …`, errors) | Done |
| F8 | Reusable exports via `features/plans/index.ts` (below) | Done |

**Toggle flow:** the card emits `itemDoneChange({item, isDone})`. The page adds `item.id` to `busyItems`, then calls `PlansApi.setItemDone(planId, itemId, isDone)` (`PATCH /api/plans/{id}/items/{itemId}`) and replaces the plan with the response. While busy, the checkbox shows the requested state (`!item.isDone`) and is disabled. If the request fails, the busy flag clears, the checkbox reverts and an error toast appears. On a 404 the list reloads.

## Important files

All new, under `frontend/src/app/features/plans/` unless noted:
- `plans.models.ts`: DTOs, labels/icons, `durationToMinutes`, `minutesToDuration`, `planItemKey`, `toUpdatePlanRequest`, `formatPlanWindow`, `planItemTitle`, `mapPlanItemErrors`
- `plans-api.service.ts`: `PlansApi`, `planItemPath`
- `plan-form.ts`: `createPlanForm(mode)`, validators, `toCreatePlanRequest`, `toPlanMetadataRequest`, `planFormValue`, `defaultPlanWindow`, `applyPlanServerErrors`, `PLAN_MESSAGES`
- `components/plan-card.ts`, `components/plan-progress-bar.ts`, `components/plan-item-picker.ts`
- `plans-page.ts` (replaced the placeholder; keeps the `Todo Plans` h1), `plan-builder-page.ts`, `plans.routes.ts` (`''`, `new`, `:id/edit`), `index.ts`
- Tests: `plans.models.spec.ts`, `plan-form.spec.ts`, `plans-api.service.spec.ts`, `components/plan-card.spec.ts` (card, progress bar, M07 slots), `plans-page.spec.ts`, `plan-builder-page.spec.ts` (builder + `filterOptions`), `testing/plan-fixtures.ts`
- `frontend/e2e/m06-plan-composition.spec.ts`

No existing files outside `features/plans/` changed. Tasks, Habits and Learning are only imported through their barrels.

## API integrations

| Call | Used by |
|---|---|
| `GET /api/plans` | list page |
| `GET /api/plans/{id}` | builder (edit) |
| `POST /api/plans` | builder (create). Items in selection order, so `items[i]` errors map back |
| `PUT /api/plans/{id}` | builder (edit). Metadata only |
| `DELETE /api/plans/{id}` | remove (confirm) |
| `PATCH /api/plans/{id}/items/{itemId}` `{isDone}` | done toggle. The card is replaced with the full response |
| `GET /api/tasks` (`TasksApi.list()`), `GET /api/habits?active=true` (`HabitsApi.list`), `GET /api/learning-cards` (`LearningApi.list()`) | picker (reused services, no new API code) |

## Verification (all executed and observed)

- `npm run build`: OK, no warnings (plans lazy chunk 30.4 kB raw).
- `npm run test:ci`: **227/227** (59 new, 168 existing). New tests cover local→UTC conversion and the UTC→local round trip, hours/minutes ↔ minutes, builder validation (title, ≥ 1 item, end > start including equal times and re-checking on start change, duration > 0 and its parts, priority ≥ 1 and whole numbers, edit mode disabling items), the PATCH URL and body, `items[i]` error mapping (unit + builder page), card busy/revert, the M07 slots, list toggle/remove/error/empty, and builder create/edit/404.
- `npx playwright test e2e/m06-plan-composition.spec.ts`: **8/8**
  1. Stubbed empty list → "No plans yet" + "Create Plan" → `/plans/new` ✓
  2. Submit with no items → "At least one item is required." + summary. End before start → "End date/time must be after the start date/time.", no POST sent ✓
  3. Create with task + habit + card (2 h 30 min, priority 2) → POST body checked (UTC ISO times, 150 min, items in order) → card shows priority, `Est. 2h 30m`, `0% · 0/3`, 3 typed items ✓
  4. Toggle task → 33%, toggle habit → 67% (`aria-valuenow`), same document and no list refetch ✓
  5. Tasks page shows the task with status `Done`. API: `status=Done`, `completedAt` set (BR-13) ✓
  6. Plan B (priority 3) created via the API. Order A, B → edit A (prefilled, items read-only) to priority 9 → order B, A, progress unchanged ✓
  7. Remove → Cancel keeps the plan → Remove → confirm → gone, `GET` 404, still gone after reload ✓
  - Extra: delete the source learning card → the item shows "Source removed" and still counts (`0% · 0/1`) ✓
- **Regression**, full `npx playwright test`: **43 passed, 1 skipped** (the M01 "backend actually stopped" test is skipped by design). M01 9, M02 9, M03 9, M04 8, M06 8.
- A temporary visual check (deleted afterwards) at 1280 px and 375 px confirmed no horizontal overflow on the list or the builder.
- Test data: the task, habit, card and plans use the `E2E-M06-<run>` prefix and are deleted in `afterAll`. A check afterwards found none left. Other agents' data was not touched.
- Processes: the API (PID 5712 plus children) was stopped. `ng serve` was started and stopped by Playwright. Ports 5080 and 4200 are free, and 5081 was never touched.

## Reusable exports (for M07 / M08)

Import from `src/app/features/plans` (the `index.ts` barrel). Everything is standalone or `providedIn: 'root'`.

| Export | Kind | Use |
|---|---|---|
| `PlansApi` | service | `list()` (A-16 order), `get(id)`, `create(CreatePlanRequest)`, `update(id, UpdatePlanRequest)`, `delete(id)`, **`setItemDone(planId, itemId, isDone): Observable<PlanDto>`** (the full plan). `planItemPath(planId, itemId)` gives the PATCH path |
| `PlanDto`, `PlanItemDto`, `PlanStatus`, `PlanItemSourceType`, `PlanItemRef`, `SelectedPlanItem`, `CreatePlanRequest`, `UpdatePlanRequest`, `UpdatePlanItemRequest` | types | Mirror the handoff. Times are ISO UTC strings |
| `PLAN_SOURCE_TYPES`, `PLAN_SOURCE_TYPE_LABELS` (`Task`/`Habit`/`Learning`), `PLAN_SOURCE_TYPE_ICONS`, `PLAN_TITLE_MAX`, `durationToMinutes`, `minutesToDuration`, `toUpdatePlanRequest(plan, changes)`, `formatPlanWindow(start, end)`, `planItemTitle`, `planItemKey`, `mapPlanItemErrors` | helpers | Labels, conversions, a PUT body that keeps the other metadata, local window text |
| `PlanCard` (`app-plan-card`) | component | Inputs: `plan` (required), `busyItemIds: ReadonlySet<number>` (item ids with a PATCH in flight; their checkbox shows `!isDone`, is disabled and reverts when the id leaves the set without a plan change), `busy` (disables everything), `actions` (default `true`; `false` hides Edit/Remove for the dashboard). Outputs: `itemDoneChange({ item, isDone })`, `edit`, `remove`. Presentational: the parent calls `setItemDone` and replaces the plan. Test ids: `plan-card` (`data-plan-id`, `data-priority`), `plan-priority`, `plan-window`, `plan-duration`, `plan-item` (`data-item-id`, `data-source-type`, `data-done`), `plan-item-type`, `plan-item-removed`. Checkbox name `Mark <title> as done`. Buttons `Edit <plan>` / `Remove <plan>` |
| `PlanProgressBar` (`app-plan-progress-bar`) | component | Inputs: `percent` (required, clamped 0–100 and rounded), `done`, `total` (optional; the text reads `33% · 1/3`), `label` (accessible name, default `Plan progress`). `role="progressbar"` with `aria-valuenow`. Test ids `plan-progress` (`data-percent`), `plan-progress-text` |
| `PlanItemPicker` (`app-plan-item-picker`), `filterOptions`, `PickerOption` | component/helper | `[(selected)]: SelectedPlanItem[]`, `describedBy`. Loads the three source lists itself |
| `createPlanForm(mode)`, `toCreatePlanRequest`, `toPlanMetadataRequest`, `planFormValue`, `defaultPlanWindow`, `applyPlanServerErrors`, `PLAN_MESSAGES`, `PlanForm` | form helpers | Same client validation and error mapping as the builder |

Dashboard example (M08):
```ts
toggle(plan: PlanDto, { item, isDone }: PlanItemDoneChange) {
  this.busy.update((s) => new Set(s).add(item.id));
  this.plansApi.setItemDone(plan.id, item.id, isDone).subscribe({
    next: (saved) => { this.replace(saved); this.clearBusy(item.id); },
    error: (e) => { this.clearBusy(item.id); this.toast.error(toApiError(e).message); },
  });
}
```
```html
<app-plan-card [plan]="p" [actions]="false" [busyItemIds]="busy()" (itemDoneChange)="toggle(p, $event)" />
```

## Extension points for M07

- **Status badge:** project into the card header next to the priority badge with the `planCardStatus` attribute. For example:
  `<app-plan-card [plan]="p"><span planCardStatus class="badge" data-testid="plan-status">{{ label(p) }}</span></app-plan-card>`. This is covered by a unit test.
- **Rest-time countdown / extra info:** project with `planCardExtra`. It renders between the meta line (window · duration) and the progress bar, and is covered by a unit test.
- **Grouping (active / upcoming / completed):** `PlansPage` renders one `<ul class="list">` from `plans()` in API order. M07 can replace that loop with grouped `computed()` lists and reuse `<app-plan-card>` unchanged. The page's toggle, remove and edit handlers work per plan, so they need no changes.
- **Status type:** `PlanStatus` already includes `NotStarted | InProgress | Completed`. Nothing in M06 reads `status`, so M07 can start using it without conflicts.
- After an item toggle, `PlanDto.progressPercent` comes from the PATCH response. M07's "completed" state can use `doneItems === totalItems && totalItems > 0` (the backend's `PlanProgress.IsComplete`) or the server-computed `status`.

## Assumptions and deviations

- The builder is a routed page (`/plans/new`, `/plans/:id/edit`) instead of a dialog, because the three-section picker needs more space than the shared 32 rem dialog. The spec allows either. After saving it returns to `/plans`, which reloads the list in API order (this is how scenario 6 shows the new order).
- The picker lists all non-archived tasks, including Done ones (`TasksApi.list()` default, as specified). Each option shows a muted hint (task status, habit frequency, card status).
- The builder defaults the start to the next full local hour and the end to one hour later, with a duration of 1 h 0 min and priority 1. These are UX defaults only and are validated like any other input.
- After a client validation failure the summary shows "Please fix the highlighted fields.", and the field-level messages use the server's wording.
- Un-marking a task item doesn't revert the task (BR-13), so the toast only says "task completed" when an item is marked done.
- The source-type "icons" are text glyphs (`✓`, `↻`, `◆`, `aria-hidden`), always shown next to a text label. No icon library was added.
- The handoff says to refresh cached task lists after a Task item toggle. No task list is cached across routes in this app (each page fetches on load), so nothing else needed to change.
