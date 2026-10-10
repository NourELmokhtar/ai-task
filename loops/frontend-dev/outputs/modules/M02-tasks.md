# M02 Tasks: Frontend Module Output

| Field | Value |
|---|---|
| Module | M02 Tasks, frontend layer (`/tasks`) |
| Final status | **COMPLETED** |
| Attempts | 1 (every check passed on the first run) |
| Started / finished | 2026-10-10 18:45 / 18:57 (local) |
| Backend used | Snapshot `backend-snapshot-m03` (M01+M02+M03) on `http://localhost:5080`, started after `SNAPSHOT_READY` existed. `backend/` was never run or modified, and port 5081 was never touched |
| Contract | `loops/orchestrator/outputs/handoffs/M02-tasks-handoff.md` (`READY`) |

## Requirements covered

FR-01, FR-02 · BR-01..05, BR-14 (UI side) · US-T1..T7 · AC-T1..T4 · UX-TASKS · NFR-U1, NFR-U2 (shared empty/loading/error states), NFR-M1 (feature folder, API service separate from presentation) · A-05 (overdue uses `today=todayLocal()`).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | `TasksApi` (list/get/create/update/complete/archive/restore/delete + `setCompleted`), DTO types in `tasks.models.ts`. Every task-returning call sends `?today=<local date>` | Done |
| F2 | `TasksToolbar`: search (300 ms debounce), Status, Priority, Due (Any / Overdue / Due today / Date range with From/To and an inverted-range message), Sort by (Newest/Oldest first, Due date soonest/latest), "Show archived", plus a toolbar "Clear filters" button when filters are active | Done |
| F3 | `TaskItem` rows: complete checkbox (both ways, optimistic, reverts on failure), title, description, status badge, priority badge, due date, overdue highlight (red left border/background + "Overdue" badge), "Archived" badge; Edit, Archive/Restore and Delete (with confirm) | Done |
| F4 | `TaskFormDialog` (Add/Edit) with Reactive Forms: title required/not whitespace/≤ 200 after trim, description ≤ 2000, status/priority must be valid names, due date empty or `YYYY-MM-DD`. Server 400 field errors are applied with `applyServerErrors`, and unmatched messages show as a form-level error. Edit sends the full PUT body | Done |
| F5 | Empty states: "No tasks yet" + **Add Task**; "No matching tasks" + **Clear filters** (resets filters, keeps the sort) | Done |
| F6 | Loading state on first load, "Updating…" while reloading, error state with **Try again**; success and failure toasts for every mutation | Done |
| F7 | Reusable exports via `features/tasks/index.ts` (below) | Done |

Mutation flow on the page: busy flag on the row → API call → in-place update with the returned task → toast → list reload (so the active filters stay correct). A 404 (task deleted elsewhere) shows an error toast and reloads.

## Important files

```
frontend/src/app/features/tasks/
  index.ts                         public exports for other features (F7)
  tasks.models.ts                  DTOs, enums + labels, filters, toTaskListQuery, hasActiveFilters, clearTaskFilters, toUpdateRequest
  tasks-api.service.ts             TasksApi
  task-form.ts                     createTaskForm, validators (requiredTrimmed, maxTrimmedLength, oneOf, optionalDateOnly), toTaskRequest, taskFormValue
  tasks-page.ts                    route page (replaces the placeholder; tasks.routes.ts unchanged)
  components/tasks-toolbar.ts
  components/task-item.ts
  components/task-form-dialog.ts
  testing/task-fixtures.ts         makeTask() for specs
  *.spec.ts, components/*.spec.ts  unit tests
frontend/e2e/m02-tasks.spec.ts
```
No shared or core files were changed. The M01 shared pieces (ApiClient, ApiError/toApiError, Dialog, ConfirmDialog, EmptyState, LoadingState, ErrorState, FieldErrors, applyServerErrors, ToastService, date utils) are reused.

## API integrations

| Endpoint | Used for | Verified (e2e against the snapshot) |
|---|---|---|
| `GET /api/tasks` (`search`, `status`, `priority`, `dueFrom`/`dueTo`, `overdue`, `archived`, `sortBy`, `sortDir`, `today`) | list, toolbar filters | yes |
| `POST /api/tasks` | Add Task | yes (201) |
| `PUT /api/tasks/{id}` | Edit; un-complete (status `Todo` + current fields) | yes |
| `POST /api/tasks/{id}/complete` | checkbox on | yes (`completedAt` set) |
| `POST /api/tasks/{id}/archive`, `/restore` | row actions | yes |
| `DELETE /api/tasks/{id}` | delete after confirm | yes (then GET → 404) |
| `GET /api/tasks/{id}` | in the service; e2e uses it to assert state | yes |

## Verification (all executed and observed)

| Check | Command | Result |
|---|---|---|
| Production build | `npm run build` | PASS, no warnings (initial 311 kB raw / 89 kB transfer; `tasks-routes` lazy chunk 67 kB / 16 kB) |
| Unit tests | `npm run test:ci` | PASS, **69/69** (25 from M01 + 44 new) |
| E2E M02 | `npx playwright test e2e/m02-tasks.spec.ts` (snapshot API :5080 + ng serve :4200) | PASS, **9/9** (scenarios 1–8 + error-state extra) |
| E2E M01 regression | `npx playwright test e2e/m01-foundation.spec.ts` | PASS, **9/9** (1 skipped by design: backend-down check) |
| Full e2e | `npx playwright test` | PASS, 18 passed, 1 skipped |
| Visual check | screenshots at 1280 px and 375 px, plus the edit dialog with a validation error | layout OK, no horizontal overflow |

Playwright scenarios:
1. Page loads (list GET 200 with `today=<local date>`, no console errors). Empty list (stubbed with `page.route`, because the DB is shared) shows "No tasks yet" with **Add Task**, which opens the Add Task dialog: PASS
2. Empty and whitespace-only titles show "Title is required." and the dialog stays open. A valid task (title, description, High priority, due date) is created: toast, row with "To do", "High priority" and the due date: PASS
3. Edit: the dialog is prefilled. New title, In progress, Low → the row shows the changes and the old title is gone: PASS
4. Checkbox on → "Done", checked, toast. API confirms `status=Done` and `completedAt` is set. Checkbox off → "To do", and the API confirms `Todo` with `completedAt=null`: PASS
5. Archive → the row disappears. "Show archived" → the row appears with an "Archived" badge. Restore → it leaves the archived view, and unchecking shows it back in the default list: PASS
6. Delete → confirm dialog shows the title. Cancel keeps the row. Delete removes it, shows a toast, and the API returns 404: PASS
7. Search (case-insensitive substring) narrows 3 → 1. Status Done/InProgress → 1 each. Priority High → 2, Low → 1. Search with no matches → "No matching tasks" → **Clear filters** resets search and priority: PASS
8. A task due yesterday has the overdue class and "Overdue" badge, and a future task has neither. The Overdue filter sends `overdue=true&today=<local>` and shows it while hiding the future task; every visible row is overdue. "Due today" excludes it: PASS
- Extra (F6): list 500 → error state with the message → **Try again** recovers: PASS

Unit coverage (44 new): filter → query mapping (defaults, trim, status/priority/sort/archived, Overdue, Due today, range incl. open-ended and inverted), `hasActiveFilters`, `clearTaskFilters`, `toUpdateRequest`. TasksApi methods, URLs, `today` param and `setCompleted` both ways. Form validation (BR-01..03 incl. 200/201 and 2000/2001 boundaries, whitespace, invalid enum, date format) and request building. Dialog: empty submit sends nothing; create POSTs a trimmed body, toasts and closes; edit PUTs; server field errors are applied. TaskItem: badges, overdue, optimistic checkbox and its revert, archive/restore buttons. Toolbar: debounce, immediate selects, range inputs and error, show archived, clear. Page: loading → "Add Task" empty state, filtered empty → Clear filters, list, error + retry, checkbox completion.

Test data: e2e tasks use a unique `E2E-M02-<run>` prefix and are soft-deleted in `afterAll`; screenshot tasks (`SHOT-M02`) were deleted too. Afterwards there were no leftovers in either the default or the archived list. Both processes I started (snapshot API PID 17628, ng serve PID 29344) were stopped.

## Reusable exports (for M06 / M08)

Import from `src/app/features/tasks` (the `index.ts` barrel). All are standalone or `providedIn: 'root'`.

| Export | Kind | Use |
|---|---|---|
| `TasksApi` | service | `list(query?)` (`today` defaults to the local date), `get`, `create`, `update`, `complete`, `archive`, `restore`, `delete`, **`setCompleted(task, done)`** (true → `/complete`, false → PUT with `Todo`). **M06 item picker:** `tasksApi.list({ search: text })` returns non-archived tasks, newest first |
| `TaskDto`, `TaskStatus`, `TaskPriority`, `CreateTaskRequest`, `UpdateTaskRequest`, `TaskListQuery`, `TASK_STATUSES`, `TASK_PRIORITIES`, `TASK_STATUS_LABELS`, `TASK_PRIORITY_LABELS`, `toUpdateRequest`, `toTaskListQuery`, `TaskFilters`, `DEFAULT_TASK_FILTERS` | types/helpers | Shared DTOs and labels ("To do", "In progress", "Done") |
| `TaskItem` (`app-task-item`) | component | Inputs: `task` (required), `busy` (disables controls; checkbox is optimistic while busy and reverts if busy clears without a task change), `actions` (default `true`; set `false` for a compact dashboard row). Outputs: `completeChange(boolean)`, `edit`, `archive`, `restore`, `delete`. Presentational, so the parent calls `TasksApi.setCompleted` and then sets the returned task. Test ids: `task-item` (with `data-task-id`), `task-status`, `task-priority`, `task-due`, `task-overdue` |
| `TaskFormDialog` (`app-task-form-dialog`) | component | **M08 quick-add:** `<app-task-form-dialog [(open)]="addOpen" (saved)="reload()" />`. Optional `[task]` (edit mode) and `defaultDueDate` (`YYYY-MM-DD` prefill). It saves through `TasksApi`, toasts "Task created"/"Task updated", emits `saved(TaskDto)` and closes |
| `TasksToolbar` (`app-tasks-toolbar`) | component | `[(filters)]="filtersSignal"`, `debounceMs` (300) |
| `createTaskForm`, `toTaskRequest`, `taskFormValue`, `TaskForm` | form helpers | Reuse the same BR-01..03 client validation |

M08 dashboard example:
```ts
toggle(t: TaskDto, done: boolean) {
  this.busyId.set(t.id);
  this.tasksApi.setCompleted(t, done).subscribe({
    next: (saved) => { this.replace(saved); this.busyId.set(null); this.toast.success(done ? 'Task completed' : 'Task marked as to do'); },
    error: (e) => { this.busyId.set(null); this.toast.error(toApiError(e).message); },
  });
}
```

## Assumptions and deviations

- **Playwright test runner** (per task.md), not Playwright MCP. The spec is `frontend/e2e/m02-tasks.spec.ts`.
- **Scenario 1 "fresh DB"**: the DB is shared with the backend agent, so the empty state is checked with `page.route` stubbing an empty `GET /api/tasks`. The real page load and list GET (200) are checked against the live API in the same test.
- "Show archived" shows archived tasks **only** (handoff: `archived=true` returns archived only). That's why a restored task leaves the archived view.
- The Overdue filter combined with "Show archived" always returns nothing, because archived tasks are never overdue (A-05).
- An inverted date range (To < From) isn't sent to the API (which would return 400). The toolbar shows an inline message and the range is ignored until it's fixed.
- "Clear filters" resets search, status, priority, due and archived but keeps the chosen sort (sort isn't a filter).
- Sort is a single selector with four options (createdAt/dueDate × asc/desc) rather than separate field and direction controls.
- Un-complete sets status `Todo` (per handoff), even if the task was `InProgress` before it was completed.
- The dialog doesn't close on backdrop click (`closeOnBackdrop=false`), so typed input isn't lost. Escape, × and Cancel close it.
- No HTML `maxlength` on the title, so the 200-character validation message can actually appear.

## Notes for later modules

- Import from `features/tasks` (the barrel), not deep paths. `TasksPage` isn't exported.
- `TasksApi.list()` always sends `today`, so `isOverdue` is based on the browser's date.
- M08 can show overdue counts with `tasksApi.list({ overdue: true })` and due today with `list({ dueFrom: today, dueTo: today })`.
- M06 should list only non-archived tasks in the picker (the default `list()`), per BR-04.
