# M01 Foundation: Frontend Module Output

| Field | Value |
|---|---|
| Module | M01 Foundation (Platform & App Shell), frontend layer |
| Final status | **COMPLETED** |
| Attempts | 2 (attempt 1: e2e couldn't launch because the Playwright Chromium download hadn't finished; attempt 2: all checks pass) |
| Started / finished | 2026-10-10 18:20 / 18:42 (local) |
| Backend used | Snapshot `backend-snapshot-m01` on `http://localhost:5080` (not `backend/`) |
| Versions | Angular 20.3 (CLI 20.3.8), TypeScript 5.9, Node 24.11.0, npm 11.6.1, @playwright/test 1.64.0, Karma 6.4 + Jasmine 5.9 |

## Requirements covered

§4 Application Structure, UX-NAV, DOD-1 (navigation), NFR-U2 (shared empty state), NFR-M1 (core/shared/features layering), A-30 (`/` → Dashboard).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | Angular CLI app in `frontend/` (standalone, routing, strict TS, SCSS, no SSR); `core/`, `shared/`, `features/<module>/` | Done |
| F2 | Lazy routes `/dashboard` `/tasks` `/habits` `/learning` `/plans` `/settings` (`loadChildren` → `features/<x>/<x>.routes.ts`), `/` → `/dashboard`, `**` → NotFound. Route titles `"<Page> · QuickFlow"` | Done |
| F3 | Persistent shell: sidebar nav in PRD order, `routerLinkActive` + `aria-current="page"`. At ≤768px it becomes a top bar with a horizontally scrollable nav strip | Done |
| F4 | Placeholder page per route (h1 title + "coming soon") | Done |
| F5 | `API_BASE_URL` from `environment*.ts` (`http://localhost:5080`), `ApiClient`, `apiErrorInterceptor` → typed `ApiError` (status, title, detail, fieldErrors, traceId) | Done |
| F6 | `EmptyState`, `LoadingState`, `ErrorState`, `Dialog` (native `<dialog>`), `ConfirmDialog`, `FieldErrors` + `applyServerErrors()`, `ToastService` + `ToastHost` (mounted in shell) | Done |
| F7 | `date-utils.ts`: `todayLocal`, `toDateOnly`, `parseDateOnly`, `isDateOnly`, `addDays`, `formatDate`, `formatDateTime`, `toUtcIso`, `localDateTimeToUtcIso`, `utcIsoToLocalDateTime`, `formatDuration` (`1h 5m 3s`), `formatMinutes` | Done |
| F8 | `ConnectivityService` calls `GET /api/health` on app init (5s timeout). Non-blocking `role="alert"` banner with Retry when it's unreachable | Done |
| F9 | `frontend/README.md` (run, build, unit tests, e2e) | Done |

## Important files

```
frontend/
  angular.json                         (+ development fileReplacements for environment)
  package.json                         scripts: start, build, test, test:ci, e2e
  playwright.config.ts                 baseURL :4200, webServer `ng serve` (reuseExistingServer)
  e2e/m01-foundation.spec.ts
  README.md
  src/environments/environment.ts, environment.development.ts
  src/styles.scss                      design tokens (CSS vars) + global classes (.btn, .form-field, .state, .dialog, .page-header, .card)
  src/app/app.ts|html|scss|spec.ts     shell
  src/app/app.routes.ts, app.config.ts
  src/app/core/api/{api-config,api-client,api-error,api-error.interceptor}.ts (+ interceptor spec)
  src/app/core/connectivity/{connectivity.service,connectivity-banner}.ts
  src/app/core/layout/nav-items.ts
  src/app/core/pages/not-found.ts
  src/app/shared/components/{empty-state,loading-state,error-state,dialog,confirm-dialog}.ts (+ confirm-dialog spec)
  src/app/shared/forms/{field-errors,server-errors}.ts (+ spec)
  src/app/shared/toast/{toast.service,toast-host}.ts (+ spec)
  src/app/shared/utils/date-utils.ts (+ spec)
  src/app/features/{dashboard,tasks,habits,learning,plans,settings}/{<x>-page.ts,<x>.routes.ts}
```

## API integrations

| Endpoint | Use | Verified |
|---|---|---|
| `GET /api/health` | Connectivity check on load and on Retry | 200 `{"status":"Healthy",...}` from the snapshot. CORS preflight from `http://localhost:4200` is allowed |

## Verification (all executed and observed)

| Check | Command | Result |
|---|---|---|
| Production build | `npm run build` | PASS (initial 294 kB raw / 84 kB transfer; six lazy route chunks) |
| Unit tests | `npm run test:ci` (`ng test --watch=false --browsers=ChromeHeadless`, local Chrome 154) | PASS, **25/25** |
| E2E (API up) | `npx playwright test` (ng serve :4200 + snapshot API :5080) | PASS, **9/9** (1 skipped by design) |
| E2E (API stopped) | `QF_E2E_BACKEND_DOWN=1 npx playwright test` after stopping the snapshot | PASS, **1/1** |

Playwright scenarios (spec → result):
1. App loads with no console errors (all six pages visited, health 200): PASS
2. Nav shows all six entries in PRD order: PASS
3. Clicking each entry navigates, shows the page h1, and only that entry has `aria-current="page"` and the active class: PASS
4. Direct URL load of each route (h1, active entry, document title): PASS. `/` lands on `/dashboard`: PASS
5. Backend running → no banner (health 200 "Healthy"): PASS. Health aborted via `page.route` → banner visible, navigation still works, Retry clears it: PASS. **API process actually stopped** → banner visible: PASS
6. Extra: unknown URL → "Page not found" with a link back to Dashboard: PASS. 375px viewport → nav usable, no horizontal page overflow: PASS

Unit test coverage: ProblemDetails mapping (400 with field-key normalization, 404/409 detail, network error, non-JSON body), ApiClient URL/params, date utils (today, parse/validate, addDays, UTC round-trip, formatting, durations), ToastService auto/manual dismiss, FieldErrors messages + `applyServerErrors`, ConfirmDialog confirm/cancel, shell nav order + banner on/off.

## Assumptions and deviations

- **Playwright test runner instead of Playwright MCP** (per task.md override). Specs are kept in `frontend/e2e/`.
- The unit-test runner is the Angular 20 CLI default (Karma + Jasmine) using the locally installed Chrome in headless mode (`--browsers=ChromeHeadless`). No custom karma.conf was needed.
- Validation keys from the server are normalized (`Title` → `title`, `$.status` → `status`) so they match Reactive Forms control names.
- At narrow widths the nav is a horizontally scrollable strip rather than a hamburger menu, so all entries stay one tap away.
- Placeholder pages don't use `EmptyState`. They show only the title and "coming soon".
- `apiErrorInterceptor` doesn't show toasts on its own. Feature code decides how to surface errors.
- The banner is checked on load and on Retry only. There's no background polling.

## Frontend conventions (for later frontend modules)

**Feature folder**: `src/app/features/<feature>/`
- `<feature>.routes.ts` exports `<FEATURE>_ROUTES` (already lazy-loaded from `app.routes.ts`). Replace the placeholder component and add child routes (e.g. `:id`) here.
- `<feature>-page.ts` (route component), `components/` for feature-only components, `<feature>.models.ts` for DTO types that mirror the API (camelCase; enums as string unions such as `'InProgress'`; dates as `string` `YYYY-MM-DD`; timestamps as ISO UTC `string`).
- `<feature>-api.service.ts`: `@Injectable({ providedIn: 'root' })` that injects `ApiClient`:
  ```ts
  private readonly api = inject(ApiClient);
  list(q: { status?: TaskStatus; today?: string }) { return this.api.get<TaskDto[]>('/api/tasks', q); }
  create(body: CreateTaskRequest) { return this.api.post<TaskDto>('/api/tasks', body); }
  ```
  `ApiClient` has `get/post/put/patch/delete<T>(path, [body], params?)`, and `url(path)`. `null`/`undefined` params are dropped and arrays become repeated keys. Never hard-code `http://localhost:5080`.
- Components and services use signals for state (`signal`, `computed`), `ChangeDetectionStrategy.OnPush`, standalone `imports`, and the new control flow (`@if`/`@for`). File naming follows the Angular 20 style: `thing.ts` with class `Thing`, no `.component` suffix.

**Errors**: every HttpClient error arrives as `ApiError` (`core/api/api-error.ts`):
`status`, `title`, `detail`, `message` (= `detail ?? title`), `fieldErrors: Record<string, string[]>`, `traceId`, plus `isNetworkError` (status 0), `isValidationError` (400), `isNotFound`, `isConflict`, `hasFieldErrors`, and `errorsFor(field)`.
- Forms: on a 400, `const rest = applyServerErrors(form, err)`. This sets a `server` error on matching controls, which clears when the user edits. Show `rest` (unmatched messages) as a form-level message or toast.
- Lists: `<app-error-state [message]="error()?.message" (retry)="load()" />`.
- Mutations: `toast.error(err.message)` or `toast.success('Task created')`.

**Shared components** (import the class into the component's `imports`):

| Selector | Inputs | Outputs |
|---|---|---|
| `app-empty-state` (`EmptyState`) | `message` (required), `title`, `actionLabel` (button shown only when set); `<ng-content>` | `action` |
| `app-loading-state` (`LoadingState`) | `message` (default `Loading…`) | none |
| `app-error-state` (`ErrorState`) | `title` (default `Something went wrong`), `message`, `retryLabel` (default `Try again`; empty hides the button) | `retry` |
| `app-dialog` (`Dialog`) | `[(open)]` model, `title` (required), `closeOnBackdrop` (default true); body via `<ng-content>`, buttons via an element with the `dialog-actions` attribute | `closed` |
| `app-confirm-dialog` (`ConfirmDialog`) | `[(open)]`, `title`, `message`, `confirmLabel`, `cancelLabel`, `danger` | `confirmed`, `cancelled` |
| `app-field-errors` (`FieldErrors`, `shared/forms`) | `control`, `label` (used in messages), `errorId` (for aria-describedby), `customMessages` (`{ validatorKey: message }`) | none |

Global CSS classes in `styles.scss`: `.page`, `.page-header`, `.card`, `.btn`, `.btn--primary`, `.btn--danger`, `.btn--small`, `.icon-btn`, `.form-field` (wraps label, input and `app-field-errors`), `.input`, `.muted`. Colours are CSS variables (`--primary`, `--danger`, `--border`, ...). Keep component styles small; the production budget warns at 4 kB per component.

**Toasts**: `inject(ToastService)`: `success(msg, ms=4000)`, `error(msg, ms=6000)`, `info(msg, ms=4000)`, `show(msg, kind, ms)` (`ms <= 0` keeps it until dismissed), `dismiss(id)`, `clear()`. The host is already mounted in the shell (`data-testid="toast-host"`).

**Dates** (`shared/utils/date-utils.ts`): send `todayLocal()` as the `?today=` param; send `YYYY-MM-DD` strings for date-only fields. Display with `formatDate(value)` and `formatDateTime(isoUtc)`. Use `localDateTimeToUtcIso()` for `datetime-local` inputs going to the API and `utcIsoToLocalDateTime()` for the way back. Durations: `formatDuration(seconds)` → `1h 5m 3s`, `formatMinutes(min)` → `1h 30m`. Never shift a `YYYY-MM-DD` value through `new Date('YYYY-MM-DD')`, which parses as UTC; use `parseDateOnly`.

**Navigation**: entries live in `core/layout/nav-items.ts`, and the shell renders them. Don't add entries without a requirement.

**E2E**: add `frontend/e2e/<module>.spec.ts` (e.g. `m02-tasks.spec.ts`) using `@playwright/test`, relative URLs (baseURL `:4200`), and role/label locators. The main nav is `getByRole('navigation', { name: 'Main navigation' })`. Test ids already in use are `connectivity-banner`, `toast-host`, `empty-state`, `loading-state`, `error-state`, `field-errors`, and `main-nav`. Start the API on :5080 first; `ng serve` is reused if it's already running, otherwise Playwright starts it. Run with `npx playwright test e2e/<module>.spec.ts`. Tests run serially (`workers: 1`) because they share one database. Seed or clean data through the API in `beforeEach` or `beforeAll`.
