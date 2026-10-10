# M05 Settings (frontend layer): Module Output

| Field | Value |
|---|---|
| Module | M05 Settings (frontend) |
| Status | `COMPLETED` |
| Attempts | 1 |
| Started / finished | 2026-10-10 22:03 / 22:15 |
| Spec / handoff | `loops/orchestrator/outputs/modules/M05-settings.md` (F1–F6, Playwright 1–5) / `loops/orchestrator/outputs/handoffs/M05-settings-handoff.md` (`READY`) |

## Requirements covered

§4 page 6 (Settings) · UX-SETTINGS (Profile + Preferences) · UX-NAV / US-D1 (default view on `/`, fallback Dashboard) · NFR-R1 (values persist across reloads) · DOD-1 · A-02 (profile = display name only) · A-03 (defaults).

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | Settings API service + types | `SettingsApi.get()` / `update()` (PUT always sends all three fields; a null name clears it). The models mirror the handoff, plus `DEFAULT_VIEWS`, `DEFAULT_VIEW_LABELS`, `DEFAULT_VIEW_ROUTES`, `defaultViewRoute()` and `DEFAULT_SETTINGS` |
| F2 | App-wide `SettingsService` | `providedIn: 'root'`, signal-based, loaded at startup by `provideSettingsInitializer()` (`provideAppInitializer`). It never rejects and gives up after 4 s, keeping the defaults when the API is down or slow. Refreshed when the Settings page opens and after every save (from the PUT response) |
| F3 | Profile section | Display name input, optional, ≤ 100 after trimming (`maxTrimmedLength`) |
| F4 | Preferences section | "Plan start notifications" checkbox and a "Default view" select listing the six pages with nav labels (Learning Resources, Todo Plans, ...) |
| F5 | Save / validation / states | "Save settings" is disabled and reads "Saving…" while saving, and a double submit is ignored. Success shows the toast "Settings saved". Client errors show via `<app-field-errors>` plus the form-level message "Please fix the highlighted fields."; server 400s go through `applyServerErrors`; other errors show an error toast. The page has loading and error states (error state with retry) |
| F6 | Default view on `/` | `{ path: '', pathMatch: 'full', redirectTo: defaultViewRedirect }`. It waits for an in-flight settings load, then returns `SettingsService.defaultRoute()`, which falls back to `/dashboard`. Nav and all other routes are unchanged |

## Important files

New, app-wide in `frontend/src/app/core/settings/`:
- `settings.models.ts`: DTOs, the view→route map, labels, defaults.
- `settings-api.service.ts`: `SettingsApi`.
- `settings.service.ts`: `SettingsService`.
- `default-view.ts`: `provideSettingsInitializer()` and `defaultViewRedirect`.
- `index.ts`: barrel.
- `testing/settings-fixtures.ts`: `makeSettings()`.
- Specs: `settings.models.spec.ts`, `settings-api.service.spec.ts`, `settings.service.spec.ts`, `default-view.spec.ts`.

Feature, in `frontend/src/app/features/settings/`:
- `settings-page.ts`: replaces the placeholder.
- `settings-form.ts`: `createSettingsForm`, `settingsFormValue`, `toUpdateSettingsRequest`.
- `index.ts`: re-exports `core/settings` and the form helpers.
- Specs: `settings-form.spec.ts`, `settings-page.spec.ts`.

Modified:
- `app.config.ts`: adds `provideSettingsInitializer()`.
- `app.routes.ts`: the `''` redirect now uses `defaultViewRedirect`.

E2E: `frontend/e2e/m05-settings.spec.ts`.

`backend/` was not touched.

## API integrations

| Call | Used by |
|---|---|
| `GET /api/settings` | startup initializer, Settings page open/retry (`SettingsService.refresh()`) |
| `PUT /api/settings` `{ displayName, planStartNotificationsEnabled, defaultView }` | Settings page Save (`SettingsService.save()`) |

Field errors (`displayName`, `defaultView`, `planStartNotificationsEnabled`) map onto the matching controls.

## SettingsService usage (for M07 / M08 / M09)

```ts
import { SettingsService } from '../../core/settings';   // or from '../settings' (features/settings/index.ts)

private readonly settings = inject(SettingsService);

this.settings.planStartNotificationsEnabled();  // M07: boolean signal, true by default
this.settings.displayName();                    // M08: string | null signal (null → generic greeting)
this.settings.defaultView();                    // 'Dashboard' | 'Tasks' | ... signal
this.settings.defaultRoute();                   // '/dashboard' | '/tasks' | ... signal
this.settings.settings();                       // AppSettings { displayName, planStartNotificationsEnabled, defaultView, updatedAt|null }
this.settings.loaded();                         // true once the server values were loaded or saved
this.settings.loadError();                      // ApiError | null of the last failed load()
```

- All accessors are **signals**, so read them in templates, `computed` or `effect`. They update after every save.
- They always hold usable values. Before the load finishes, or when it failed, they hold `DEFAULT_SETTINGS`: no name, notifications on, Dashboard.
- `load(timeoutMs?)`: `Promise<void>` that never rejects (the startup path). `ready()` resolves when no load is in flight.
- `refresh()`: `Observable<SettingsResponse>`. It updates the store and passes errors through.
- `save(UpdateSettingsRequest)`: `Observable<SettingsResponse>`. It is a full replacement, so pass all three fields and use the current `settings()` for the ones you don't change. It updates the store on success.
- Don't call `SettingsApi` directly, or the app-wide state goes stale.
- Unit tests: provide `provideHttpClientTesting()` with the real service, flush `GET /api/settings` with `makeSettings({...})` from `core/settings/testing/settings-fixtures.ts`, or set values by flushing a `save()`. In TestBed the initializer only runs if a test adds `provideSettingsInitializer()`.

## Verification (executed and observed)

| Check | Result |
|---|---|
| `npm run build` | OK, no warnings (settings chunk 6.7 kB) |
| `npm run test:ci` | **280/280** (53 new: models 10, API 4, service 11, redirect + initializer 13, form 7, page 8) |
| `npx playwright test e2e/m05-settings.spec.ts` | **7/7** (see below) |
| Full `npx playwright test` | **50 passed, 1 skipped** (skip = M01 backend-down test, by design). M01 9, M02 9, M03 9, M04 8, M05 7, M06 8 |
| M01 backend-down (`QF_E2E_BACKEND_DOWN=1`, API stopped) | 1/1: app starts, banner shown, Dashboard renders. The startup settings load does not block |

E2E scenarios:
1. The page shows the current values. Seeded through the API (name, notifications off, Habits); Profile and Preferences sections and the six option labels shown; no console errors. **Pass**
2. Change the display name (padded with spaces), Save, toast. The PUT body has the trimmed name and all three fields, and the value persists after reload and in the API. Clearing the name saves null. **Pass**
3. Turn the notifications toggle off, Save, reload: still off. Turn it on, Save, reload: still on (API confirms both). **Pass**
4. Default view Tasks: `/` lands on `/tasks`. `/dashboard` is still reachable. Reset to Dashboard: `/` lands on `/dashboard`. **Pass**
   - 4b (extra): after saving Learning Resources, an in-app navigation to `/` lands on `/learning` without a reload. **Pass**
5. A 101-char name shows "Display name must be at most 100 characters." plus the form-level message, no PUT is sent and the API is unchanged. With 100 chars the error clears and saving works. **Pass**
6. Extra: `/api/settings` aborted: `/` falls back to `/dashboard`, the Settings page shows an error state, and Retry recovers. **Pass**

Shared row: `beforeAll`/`afterEach`/`afterAll` restore `{displayName:null, notifications:true, Dashboard}`. After the full run the API returned these defaults.

Runtime: snapshot `backend-snapshot-m05` on :5080 (PID 31832, stopped with `taskkill /T`) plus a Playwright-managed `ng serve` on :4200 (stopped). Ports 5080 and 4200 are free; 5081 was never touched.

## Assumptions / deviations

- The store lives in `core/settings/` and not in `features/settings/`, because `app.config.ts` and `app.routes.ts` depend on it. `features/settings/index.ts` re-exports it.
- The startup load is capped at 4 s (`SETTINGS_LOAD_TIMEOUT_MS`), so a hung API delays the first render by at most that. A refused connection falls back immediately.
- Opening the Settings page always re-fetches the values (loading state shown briefly), so the page shows the server's current values even if the startup load failed.
- No "unsaved changes" guard and no `updatedAt` display: neither was required.
