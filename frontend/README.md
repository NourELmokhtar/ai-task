# QuickFlow Frontend

Angular 20 app (standalone components, signals, Angular Router with lazy feature routes, `HttpClient`, Reactive Forms).

## Prerequisites

- Node 24 / npm 11 (Angular CLI 20.3 is a devDependency, so `npx ng` works without a global install)
- The QuickFlow API running on `http://localhost:5080` (see `../backend/README.md`)
- Chrome (for headless unit tests); Playwright Chromium for e2e (`npx playwright install chromium`)

Set `NG_CLI_ANALYTICS=false` to skip the analytics prompt in non-interactive shells.

```bash
npm install
```

## Run

```bash
npm start            # ng serve --port 4200  ->  http://localhost:4200
```

The API base URL comes from `src/environments/environment*.ts` (`apiBaseUrl`, default `http://localhost:5080`).
`ng serve` / development builds use `environment.development.ts`; production builds use `environment.ts`.
On load the app calls `GET /api/health`. If the API is unreachable, a non-blocking banner with a Retry button is shown.

## Build

```bash
npm run build        # ng build (production) -> dist/quickflow/browser
```

## Unit tests (Karma + Jasmine)

```bash
npm test             # ng test (watch mode, opens Chrome)
npm run test:ci      # ng test --watch=false --browsers=ChromeHeadless
```

## E2E tests (Playwright)

Specs live in `e2e/<module>.spec.ts` (m01–m09). There are two ways to run them:

| | `npm run e2e:full` (MVP acceptance, recommended) | `npm run e2e` (dev loop) |
|---|---|---|
| Config | `playwright.e2e-full.config.ts` | `playwright.config.ts` |
| Database | fresh, isolated `quickflow_e2e` (reset before every run) | whatever the API you started uses (normally the dev DB `quickflow`) |
| API on :5080 | started **by Playwright** from `../backend` and stopped afterwards | you start it yourself first |
| ng serve on :4200 | started by Playwright (`reuseExistingServer: false`) | reused if running, else started |
| Ports 5080 / 4200 | must be free, or the run stops before touching anything | — |

### Full run on the isolated E2E database

Prerequisites: .NET 10 SDK, MySQL running, and the user-secrets `quickflow-api-dev` holding
`ConnectionStrings:QuickFlowE2E` (see `../backend/README.md`). No connection string or password is in any frontend file.

```bash
npx playwright install chromium        # once
npm run e2e:full                       # whole suite (m01–m09) on a fresh quickflow_e2e
npm run e2e:full -- e2e/m09-journey.spec.ts   # extra args are passed to `playwright test`
npm run e2e:screenshots                # screenshot walkthrough of the six pages at 1280/375 px (see below)
```

`e2e:full` (`scripts/e2e-full.mjs`) does three things:

1. checks that nothing listens on :5080 or :4200. If something does, it exits 1 and kills nothing (it could be a
   dev API on the dev DB). Stop that process and run again.
2. runs `powershell -NoProfile -ExecutionPolicy Bypass -File ../backend/scripts/reset-e2e-db.ps1`
   (DROP + CREATE `quickflow_e2e`; it refuses to touch any other database).
3. runs `playwright test -c playwright.e2e-full.config.ts`. Playwright starts
   `dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080` in `../backend` with
   `ASPNETCORE_ENVIRONMENT=Development` and `Database__ConnectionStringName=QuickFlowE2E` (the API applies the
   migrations to the empty DB at startup), waits for `GET /api/health`, starts `ng serve` on :4200, runs the specs
   and stops both servers.

The whole suite takes about 8 minutes, mostly because m07/m09 wait for plans to really start on the server.
After the run `quickflow_e2e` keeps the schema plus soft-deleted test rows; the next `e2e:full` resets it.

`npm run e2e:screenshots` runs the same steps but only `e2e/*.walkthrough.ts` (not part of the suite): it seeds demo
data, saves full-page screenshots of the six pages at 1280 px and 375 px, then deletes the data. Output goes to
`$QF_SCREENSHOT_DIR` (default `e2e-screenshots/`).

### Dev loop against your own API

```bash
# start the API on :5080 first; ng serve on :4200 is reused if running, otherwise Playwright starts it
npm run e2e                         # playwright test
npx playwright test e2e/m01-foundation.spec.ts   # one spec
```

All specs also work on a shared, non-empty DB: data carries a per-run prefix and is deleted afterwards, dashboard
numbers are asserted as deltas, and specs that change the single settings row restore the defaults.

The "backend actually stopped" check runs only when the API is down and `QF_E2E_BACKEND_DOWN=1` is set
(the rest of that spec is skipped in that mode):

```bash
QF_E2E_BACKEND_DOWN=1 npx playwright test e2e/m01-foundation.spec.ts
```

## Structure

```
src/app/
  app.ts|html|scss          app shell: sidebar nav, connectivity banner, <router-outlet>, toast host
  app.routes.ts             top-level routes; each feature lazy-loaded via loadChildren
  app.config.ts             router, HttpClient + apiErrorInterceptor
  core/
    api/                    ApiClient, API_BASE_URL, ApiError/ProblemDetails, apiErrorInterceptor
    connectivity/           ConnectivityService (health check) + banner
    layout/nav-items.ts     main navigation (PRD order)
    pages/not-found.ts      wildcard route page
  shared/
    components/             EmptyState, LoadingState, ErrorState, Dialog, ConfirmDialog
    forms/                  FieldErrors component, applyServerErrors()
    toast/                  ToastService + ToastHost
    utils/date-utils.ts     today/date/datetime/UTC/duration helpers
  features/<feature>/       <feature>.routes.ts + pages, components, <feature>-api.service.ts, models
```
