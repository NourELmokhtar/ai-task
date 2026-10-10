# M09 MVP Acceptance & E2E Verification: Frontend Output

| Field | Value |
|---|---|
| Module | M09 MVP Acceptance & E2E Verification (frontend part, final module) |
| Status | `COMPLETED` |
| Attempts | 2 (attempt 1: one bug in my new DOD-1 test, fixed; see "Attempts") |
| Started / finished | 2026-10-10 22:50 / 23:06 |
| Spec | `loops/orchestrator/outputs/modules/M09-mvp-acceptance.md` (F1–F8) |
| Backend handoff | `loops/orchestrator/outputs/handoffs/M09-mvp-acceptance-handoff.md` (`READY`) |
| Product code changed | None. Only test infrastructure, specs and docs |

## Requirements covered

TR-4 · DOD-1..DOD-6 · all AC-* (regression through m01–m09) · NFR-U1 · NFR-P2 (rest time ticks) · TR-1..TR-3 (unit suite run).

## Commands

From `frontend/`:

```bash
npm run e2e:full                 # full E2E suite (m01–m09) on a freshly reset quickflow_e2e
npm run e2e:full -- e2e/m09-journey.spec.ts    # extra args go to `playwright test`
npm run e2e:screenshots          # F8 walkthrough (set QF_SCREENSHOT_DIR to choose the output folder)
npm run test:ci                  # Angular unit tests (Karma, ChromeHeadless)
npm run build                    # production build
npm run e2e                      # unchanged dev loop: your own API on :5080, ng serve reused
QF_E2E_BACKEND_DOWN=1 npx playwright test e2e/m01-foundation.spec.ts   # with the API stopped
```

`npm run e2e:full` runs `scripts/e2e-full.mjs`:
1. It fails with exit 1 if anything listens on :5080 or :4200 (IPv4 or IPv6). It kills nothing.
2. It runs `powershell -NoProfile -ExecutionPolicy Bypass -File ../backend/scripts/reset-e2e-db.ps1`, which does DROP + CREATE of `quickflow_e2e`. If the reset fails, the run stops.
3. It runs `playwright test -c playwright.e2e-full.config.ts`. That config extends `playwright.config.ts` with two `webServer`s, both with `reuseExistingServer: false`:
   - `dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5080`, in `../backend`, with env `ASPNETCORE_ENVIRONMENT=Development` and `Database__ConnectionStringName=QuickFlowE2E`. It waits for `http://localhost:5080/api/health`. There is no secret in the config.
   - `npx ng serve --port 4200`.

   Playwright stops both servers at the end, and the script then re-checks the ports.

`npm run e2e` and `playwright.config.ts` are unchanged.

## Implemented tasks

| # | Task | Result |
|---|---|---|
| F1 | `scripts/e2e-full.mjs`, `playwright.e2e-full.config.ts`, npm scripts `e2e:full` / `e2e:screenshots` | Done: verified 4 times (reset → backend migrates the empty DB → suite → servers stopped, ports free) |
| F2 | TR-4 journey `e2e/m09-journey.spec.ts` › "TR-4 journey", UI only | Pass |
| F3 | DOD-1 › "the six-entry nav persists on every page and sub-route (1280 px and 375 px)". Extends m01 (order, highlight, direct URLs, `/`, 404) | Pass |
| F4 | DOD-2 / NFR-U1 › add + remove a task, habit, learning card and plan on their own pages, gone after reload and in the API | Pass |
| F5 | DOD-3: covered by **m04** tests 3 (add 2 milestones), 4 (complete + remove milestone), 5 (add + remove note), 2/7 (add/remove card). Not duplicated | Pass (in the suite run) |
| F6 | DOD-5 › "a plan starting shortly, watched from the Dashboard": start toast on the Dashboard → the dashboard lists it as In progress, in-progress +1 / upcoming −1, rest time ≈30 min and decreasing → item done on Todo Plans → 100% / Completed → gone from the dashboard's active plans. Plans-page side in m07 (1–3, 5–7), dashboard side in m08 (6, 7) | Pass |
| F7 | Whole suite on fresh `quickflow_e2e` | 69 passed, 1 skipped by design, 0 failed |
| F7a | `npm run test:ci` / `npm run build` | 347/347 SUCCESS / clean build, no warnings (initial 321.01 kB) |
| F8 | Screenshot walkthrough `e2e/m09-pages.walkthrough.ts`. This replaces Playwright MCP, which is not available | 12 screenshots, reviewed |

### Journey (F2) detail

The baseline is read from the Dashboard cards first, and every assertion is a delta. On a fresh DB the baseline is all zeros, so the spec also asserts the absolute values: `100%`, `1 / 1 done today` and `0 / 2 milestones done`.

1. **Tasks page:** Add Task (due today) → To do → checkbox → toast "Task completed", status Done.
2. **Habits page:** Add Habit → streak 0 → toggle → "Marked as done today", checked, streak 1.
3. **Learning page:** Add Learning Card → expand → two milestones (`0/1`, `0/2`).
4. **Todo Plans:** Create Plan with title, 1 h duration, start now−5 min, end now+60 min, priority 1, and the task, habit and card picked in the builder → the plan is in **In progress** at `0% · 0/3`, with rest time visible and item types Task/Habit/Learning.
5. The three items are checked one by one (each PATCH returns 200): `33% · 1/3` → `67% · 2/3` → `100% · 3/3`. Then the progress bar shows 100, the plan moves to **Completed / History**, its status is Completed, it has no rest time, and it is still there after a reload.
6. **Dashboard** (SPA nav, refetch):
   - tasks: total +1, done +1, completion % recomputed, due today +1, and the row in "Due today" shows Done
   - habits: active +1, completed today +1, and the checklist box is checked
   - plans: in progress and upcoming unchanged, completed +1, and the plan is not under "Active plans"
   - learning: milestones total +2, done +0
   - no page errors

## Test-run summary (F7, `npm run e2e:full`, fresh `quickflow_e2e`, 2026-10-10 ~22:58)

| Spec | Passed | Skipped | Failed |
|---|---:|---:|---:|
| m01-foundation | 9 | 1 (backend-down check, needs the API stopped) | 0 |
| m02-tasks | 9 | 0 | 0 |
| m03-habits | 9 | 0 | 0 |
| m04-learning-resources | 8 | 0 | 0 |
| m05-settings | 7 | 0 | 0 |
| m06-plan-composition | 8 | 0 | 0 |
| m07-plan-tracking | 7 | 0 | 0 |
| m08-dashboard | 8 | 0 | 0 |
| m09-journey | 4 | 0 | 0 |
| **Total** | **69** | **1** | **0** |

The suite took 4.3 min, exit 0. The reset log showed "Tables before: 10 → Recreated (empty, 0 tables)", and the API applied the migrations at startup.

- **Backend-down check:** `QF_E2E_BACKEND_DOWN=1 npx playwright test e2e/m01-foundation.spec.ts` with the API stopped: 1 passed, 9 skipped (by design). So all 70 E2E tests have passed.
- **M09 spec alone** (`npm run e2e:full -- e2e/m09-journey.spec.ts`): 4/4 in 1.0 min.
- **Unit tests** (`npm run test:ci`): 347 of 347 SUCCESS.
- **Build** (`npm run build`): success, no warnings.
- **Existing specs:** none needed a change for the fresh-DB or full-run setup.

## DoD checklist

| DoD | Proven by | Evidence |
|---|---|---|
| DOD-1 All six pages implemented and reachable from persistent navigation | m09 "DOD-1 …" (nav persists with 6 visible entries on every page, plan builder sub-route, 1280 + 375 px); m01 "navigation shows all six entries in PRD order", "clicking each entry navigates and highlights only that entry", "direct URL load works for each route", "layout is usable on a narrow screen"; screenshots of all six pages at both widths | PASS (F7 run) |
| DOD-2 Tasks, habits, learning resources added/removed from their pages | m09 "DOD-2 / NFR-U1 …" (task, habit, card **and plan**); m02 2/6, m03 2/7, m04 2/7, m06 3/7 | PASS |
| DOD-3 Learning cards support milestones and notes | m04 3 (add milestones), 4 (complete + remove milestone), 5 (add + remove note); m09 journey step 3; m08 8 (milestone → snapshot) | PASS |
| DOD-4 Plans built from existing items with duration, start/end, priority | m09 journey step 4 (UI builder with task + habit + card, duration, active window, priority); m06 2 (validation), 3 (exact POST body), 6 (priority edit → order) | PASS |
| DOD-5 Plan/item completion drives plan progress, rest time, dashboard | m09 journey steps 5–6 (33/67/100% → Completed → dashboard metrics) and m09 "DOD-5 …" (start toast on Dashboard, dashboard picks the plan up as active, rest time decreasing, completion clears it); m06 4/5; m07 2/3/5; m08 6/7 | PASS |
| DOD-6 Automated tests pass | E2E 69 + 1 (backend-down) = 70/70 executed tests pass; unit 347/347; build clean. Backend 302/302 per the M09 backend handoff | PASS |

TR-4 → m09 "TR-4 journey" (PASS).

## AC coverage

| AC | Spec(s) |
|---|---|
| AC-T1 create, edit, complete, archive, delete a task | m02 2, 3, 4, 5, 6; m09 journey 1, DOD-2 |
| AC-T2 required fields validated | m02 2 (task title); also m03 2, m04 2, m06 2, m05 5 |
| AC-T3 search and filters | m02 7, 8 |
| AC-T4 overdue identified | m02 8; m08 (overdue list / metric) |
| AC-H1 daily or weekly habit | m03 2; m09 journey 2 |
| AC-H2 complete today; duplicate prevented | m03 3, 4 (409 on a second completion), extra 409; m09 journey 2 |
| AC-H3 deactivate or remove | m03 6, 7; m09 DOD-2 |
| AC-L1 add and remove a learning card | m04 2, 7; m09 DOD-2 |
| AC-L2 add, complete, remove milestones | m04 3, 4; m09 journey 3 (add) |
| AC-L3 add and remove notes | m04 5 |
| AC-P1 plan from existing tasks/habits/learning | m06 3; m09 journey 4 |
| AC-P2 duration, start/end, priority | m06 2, 3, 6; m09 journey 4 |
| AC-P3 mark items done → progress | m06 4; m07 5; m09 journey 5 |
| AC-P4 remove a plan | m06 7; m09 DOD-2 |
| AC-P5 notified at plan start | m07 2, 6 (respects the setting), 7 (other page, once only); m09 DOD-5 (on Dashboard) |
| AC-P6 rest time counts down | m07 2, 3; m08 6; m09 DOD-5 |
| AC-P7 progress % = done / total | m06 4 (33/67); m07 4, 5; m09 journey 5 (33/67/100) |
| AC-P8 item changes in plan view **and** dashboard | m08 7; m09 journey 5–6, DOD-5 |
| AC-D1 today's tasks, overdue, today's habits | m08 3, 4, 5; m09 journey 6 |
| AC-D2 completion metrics match data | m08 3, 4, 5; m09 journey 6 (all four cards) |
| AC-D3 active plans with live progress + rest time | m08 6, 7; m09 DOD-5 |
| AC-D4 learning snapshot | m08 8; m09 journey 6 (milestone totals) |

Every AC is covered. No gaps.

## Screenshots (F8)

`loops/frontend-dev/outputs/screenshots/m09/`. These are full-page captures with seeded demo data (4 tasks, 3 habits, 2 cards with milestones and a note, 1 active and 1 upcoming plan, display name "Alex"). The demo data was deleted afterwards and the settings were restored.

| Page | 1280 px | 375 px |
|---|---|---|
| Dashboard | `1-dashboard-1280.png` | `1-dashboard-375.png` |
| Tasks | `2-tasks-1280.png` | `2-tasks-375.png` |
| Habits | `3-habits-1280.png` | `3-habits-375.png` |
| Learning Resources (card expanded) | `4-learning-1280.png` | `4-learning-375.png` |
| Todo Plans | `5-plans-1280.png` | `5-plans-375.png` |
| Settings | `6-settings-1280.png` | `6-settings-375.png` |

I reviewed the dashboard (1280), plans (375) and learning (375) shots. Greeting, metrics, today's lists, the active plan with rest time, the expanded milestones/notes and the horizontal mobile nav all render correctly. In the 1280 full-page shots the sidebar background ends at the viewport height. That comes from the 100vh sticky sidebar in a full-page capture, not from a layout defect.

## Important files

| File | Change |
|---|---|
| `frontend/scripts/e2e-full.mjs` | New: port guard → reset → Playwright (`--walkthrough` mode) |
| `frontend/playwright.e2e-full.config.ts` | New: backend (E2E switch) + ng serve, `reuseExistingServer: false` |
| `frontend/package.json` | Scripts `e2e:full`, `e2e:screenshots` |
| `frontend/e2e/m09-journey.spec.ts` | New: TR-4 journey, DOD-1, DOD-2, DOD-5 (4 tests) |
| `frontend/e2e/m09-pages.walkthrough.ts` | New: F8 screenshots (only matched in walkthrough mode) |
| `frontend/README.md` | Full-E2E section (table e2e vs e2e:full, steps, prerequisites, screenshots) |

## Attempts

1. **Attempt 1:** first `e2e:full -- e2e/m09-journey.spec.ts`. The pipeline worked and the journey passed, but DOD-1 timed out looking for "Create Plan". My test bug: the nav loop ends on Settings, not on Todo Plans. I fixed it by navigating to Todo Plans first. In the same pass I replaced `npx` + `shell: true` (Node DEP0190 warning) with `node <@playwright/test/cli>`.
2. **Attempt 2:**
   - M09 4/4
   - full suite 69 passed, 1 skipped
   - backend-down 1/1
   - unit 347/347
   - build clean
   - walkthrough 1/1

## Final state

- Ports 4200, 5080 and 5081 are free, and no `QuickFlow.Api` process is left. Every server was started and stopped by Playwright. :5081 and the dev DB `quickflow` were never used.
- `quickflow_e2e` was reset at the end and is empty (0 tables), as the reset script documents. The next API start migrates it.
- No product code, backend code or orchestrator file changed. No credentials are in any frontend file.

## Assumptions / deviations

- **F8:** Playwright MCP is unavailable, so I used a committed Playwright walkthrough (`npm run e2e:screenshots`) instead. It isn't part of the spec suite because its `testMatch` is used only in walkthrough mode.
- **F5:** not re-implemented. m04 already covers it end to end and runs in the suite.
- **F3:** extends m01 rather than duplicating it.
- **F6:** setup (card + plan starting in 35 s) is done through the API, as in m07/m08. Only the TR-4 journey is required to be UI-only.
- Dashboard assertions are deltas so `m09` also works with `npm run e2e` on the shared dev DB. On a fresh DB the absolute values are asserted too.
- The `e2e:full` runner needs Windows PowerShell for the reset script, as the backend handoff specifies.
