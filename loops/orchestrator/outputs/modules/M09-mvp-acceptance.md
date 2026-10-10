# M09 — MVP Acceptance & End-to-End Verification

| Field | Value |
|---|---|
| ID | M09 |
| Type | Verification (no new product features) |
| Backend status | `WAITING` (needs all backend layers M01–M08) |
| Frontend status | `WAITING` (needs M09-BE and all frontend layers M01–M08) |
| Module dependencies | M08 (and transitively M01–M07) |
| Backend dependencies | M01-BE … M08-BE |
| Frontend dependencies | M09-BE, M01-FE … M08-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M09-mvp-acceptance-handoff.md` (backend regression summary + test-DB instructions) |

## Goal

Prove the PRD's Definition of Done with **committed, repeatable automated tests**:
- the full cross-module end-to-end journey (TR-4)
- six-page navigation
- add/remove on every list page
- a green backend test suite

Then sign off the MVP.

## Requirements Covered

TR-4 · DOD-1..DOD-6 · all AC-* (regression) · NFR-P1 (spot check) · NFR-U1 · TR-1..TR-3 (suite run)

## Scope

**In:** running all backend tests, a full curl regression, the OpenAPI completeness check, an automated E2E suite (Playwright test runner), a DoD checklist with evidence, root README, and fixes for **regressions only**.

**Out:** new features or behavior changes. Any defect is fixed inside the owning module's scope and recorded against that module.

## Backend Tasks (backend-dev loop, verification mode)

| # | Task |
|---|---|
| B1 | Run the full backend unit/integration test suite → all green |
| B2 | Full curl regression across every endpoint, using the M01–M08 handoffs |
| B3 | Verify the OpenAPI document lists every module endpoint |
| B4 | NFR-P1 spot check: typical create/update/delete/filter calls < 500 ms |
| B5 | Make sure the E2E run can use an isolated, fresh MySQL database `quickflow_e2e`. Its connection string is already in user-secrets `quickflow-api-dev` as `ConnectionStrings:QuickFlowE2E`. Select it with a non-secret switch so no password lands in the Playwright config. Drop/recreate or reset before each run. Document it |
| B6 | Fix regressions (scoped to the owning module, recorded) |
| B7 | Root `README.md`: how to run backend, frontend, unit tests and E2E tests |

## Frontend Tasks (frontend-dev loop)

| # | Task |
|---|---|
| F1 | Add an automated E2E test project (Playwright test runner, e.g. `frontend/e2e/`) with config that starts or targets the backend on the fresh `quickflow_e2e` MySQL database and the Angular dev server (`ng serve`, port 4200) |
| F2 | **Journey spec (TR-4):** create task → complete task → create habit → complete habit → add learning card with milestones → build plan from those existing items → mark plan items done → verify plan reaches 100% / Completed → verify Dashboard metrics updated |
| F3 | **Navigation spec (DOD-1):** all six pages reachable from persistent nav |
| F4 | **Add/remove spec (DOD-2, NFR-U1):** add and remove a task, habit, learning card and plan from their own pages |
| F5 | **Learning spec (DOD-3):** milestones and notes add/complete/remove |
| F6 | **Live plan spec (DOD-5, AC-P5/P6):** plan starting shortly → notification + decreasing rest time + dashboard reflection |
| F7 | Run the E2E suite → all pass |
| F7a | Run the Angular unit tests (`ng test`, CLI default runner, headless) → all pass |
| F8 | Playwright MCP exploratory confirmation of the journey |

## Testing Tasks / Verification

| Check | Evidence required |
|---|---|
| Backend tests | Test-run summary (count passed, 0 failed) |
| Curl regression | Per-endpoint pass list |
| OpenAPI completeness | List of documented paths vs. module handoffs |
| NFR-P1 | Measured timings |
| E2E suite | Test-run summary (all specs passed) |
| DoD checklist | Each DOD-1..6 item marked with the spec/test that proves it |

## Completion Criteria

**Backend part:** all backend tests pass · curl regression passes · OpenAPI complete · NFR-P1 timings recorded · README written · progress/state updated.

**Frontend part:** E2E suite committed and passing (journey, navigation, add/remove, learning, live plan) · Playwright MCP confirmation done · DoD checklist complete with evidence · progress/state/output updated.

**Project:** when M09 is `COMPLETED`, the orchestrator sets the project status to `COMPLETED`.
