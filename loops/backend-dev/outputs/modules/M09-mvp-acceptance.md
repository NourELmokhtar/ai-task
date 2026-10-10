# M09 MVP Acceptance & E2E Verification (backend part)

| Field | Value |
|---|---|
| Status | `COMPLETED` |
| Mode | Verification only (no features, no contract changes) |
| Attempts | 1 (no backend failures). The regression script itself needed 2 fixes during authoring (see Attempts) |
| Runtime port | 5081 only. My PIDs were stopped by PID after each phase (21880; 32516/31596; 27944/15768; 30924/31780). 5080 (PID 17732, frontend) was never stopped or restarted |
| Date | 2026-10-10 22:10–22:25 local (19:10–19:25 UTC) |

## Evidence (B1–B7)

| Task | Command | Observed result |
|---|---|---|
| B1 build | `dotnet build QuickFlow.sln --no-incremental` | `Build succeeded`, 0 warnings, 0 errors |
| B1 tests | `dotnet test QuickFlow.sln` | `Passed! Failed: 0, Passed: 302, Skipped: 0, Total: 302` (738 ms) |
| B2 regression, dev DB | API on 5081 (DB `quickflow`): `bash scripts/regression.sh http://localhost:5081 10` | **156 passed, 0 failed**, exit 0. Per section: M01 7 · M02 35 · M03 27 · M04 28 · M05 8 · M06/M07 19 · cross-module/M08 29 · OpenAPI 2 · NFR-P1 1 |
| B2 regression, fresh E2E DB | API on 5081 with `Database__ConnectionStringName=QuickFlowE2E`, after reset | **156 passed, 0 failed**, exit 0 |
| B2 cross-module | (inside the script) | BR-13 task Done after Task item PATCH (stays Done on un-mark) · dashboard `plans.active[].progressPercent` 0 → 33 · `tasks.doneCount`/`completedTodayCount` +1 · habit completion → `habits.completedTodayCount` +1 and item `completedToday`/streak 1 · milestone done → `milestonesDone` +1, `milestonesCompletedLast7Days` +1 · all items done → Completed/100 %/in `group=completed`, `inProgressCount` −1, `completedCount` +1 · A-24 `sourceAvailable=false` |
| B2 cleanup | API checks after the run | No `REG*` tasks (incl. archived), habits, cards or plans left. Settings restored to the original values (`updatedAt` moved, because the script changes and restores them) |
| B3 OpenAPI | `GET /openapi/v1.json`, compared in the script with the handoff list | 38 documented = 38 expected operations. All handoff query params (tasks ×10, habits `active`/`today`, completions `from`/`to`, learning `status`, plans `group`, dashboard `today`) and key response fields (`PlanResponse.status/restTimeSeconds/serverNow`, `Dashboard*`, …) are present. **Gaps: none.** Informational: the `ProblemDetails` schema doesn't list the `traceId` extension member (it is returned at runtime). Not a contract gap |
| B4 NFR-P1 | script timing section, 10 rounds × 21 operations, warm API, local MySQL | All 210 calls < 500 ms. Dev DB: overall median 4.3 ms, max 28.9 ms. Fresh E2E DB: median 4.3 ms, max 33.4 ms. Table below |
| B5 E2E DB start | `ASPNETCORE_ENVIRONMENT=Development Database__ConnectionStringName=QuickFlowE2E dotnet run --project src/QuickFlow.Api --no-launch-profile --urls http://localhost:5081` | Log: `Applying migration` ×6 (`InitialCreate` … `AddUserSettings`), `Database is up to date`, listening on 5081, ready in about 3 s |
| B5 empty | GET lists and dashboard on the E2E instance; MySQL row counts | All lists `[]`, dashboard all zeros. `quickflow_e2e`: 10 tables, 0 rows, 6 migrations |
| B5 independent | create task `E2EONLY-<epoch>` via the E2E instance, then count in both DBs | `quickflow.Tasks` 0, `quickflow_e2e.Tasks` 1 |
| B5 reset | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reset-e2e-db.ps1` (run twice) | `Tables before: 10` → `Recreated 'quickflow_e2e' (empty, 0 tables)`, exit 0. The next start re-applied all 6 migrations |
| B5 guards | env overrides with dummy strings: E2E→`quickflow`, E2E→`QUICKFLOW`, E2E→`other_db`, dev→`quickflow_e2e` | All 4 refused with exit 1 before touching MySQL |
| B5 dev untouched | exact `COUNT(*)` per table of `quickflow` before and after both resets | Identical (tasks 152, plans 36, planitems 90, habits 66, habitcompletions 72, learningcards 51, learningmilestones 60, learningnotes 2, usersettings 1, 6 migrations) |
| B6 regressions | | **None found.** No backend code changed |
| B7 README | `README.md` (root) written. `backend/README.md` got the E2E DB and regression script sections | Overview, prerequisites, user-secrets key names, run backend 5080 / frontend 4200, backend tests, frontend unit tests, E2E with the DB switch and reset, links to both READMEs |
| Secrets | value scan of `README.md`, `backend/README.md` and both scripts against the user-secrets password (prints true/false only) | Clean. The scan found that the DB password equals the user name, so the reset script no longer prints the user name, and the old `User=<name>` example in `backend/README.md` is now `User=<user>` |

### NFR-P1 timings (dev DB run, ms, n = 10 each)

| Operation | Median | Max |
|---|---:|---:|
| tasks create / update / filter / complete / delete | 4.2 / 4.3 / 2.7 / 4.2 / 3.8 | 4.9 / 4.7 / 6.9 / 4.6 / 4.3 |
| habits create / update / complete / filter / delete | 4.1 / 4.6 / 5.2 / 3.2 / 4.0 | 4.6 / 5.3 / 24.0 / 20.9 / 22.8 |
| learning create / add milestone / toggle milestone / filter / delete | 4.0 / 4.6 / 4.5 / 3.2 / 3.9 | 4.8 / 5.4 / 5.4 / 3.7 / 4.3 |
| plans create (3 items) / PATCH item / `group=active` / delete | 7.7 / 7.7 / 6.0 / 4.0 | 8.8 / 28.9 / 11.2 / 4.3 |
| settings PUT / dashboard GET | 2.4 / 8.2 | 2.6 / 9.1 |
| **All 210 calls** | **4.3** | **28.9** |

## Files

| File | Purpose |
|---|---|
| `backend/scripts/regression.sh` | B2/B3/B4 re-runnable regression: `bash scripts/regression.sh [baseUrl] [timingRounds]`. No credentials. Exits 1 on failure |
| `backend/scripts/reset-e2e-db.ps1` | B5 non-interactive reset of `quickflow_e2e` (`-DryRun`, `-MySqlExe`). Hard-coded target with guards |
| `README.md` (root) | B7 |
| `backend/README.md` | added "E2E database" and "API regression script" sections. Example user replaced by `<user>` |
| `../orchestrator/outputs/handoffs/M09-mvp-acceptance-handoff.md` | handoff (READY) |

## Decisions

- **E2E reset mechanism:** a standalone PowerShell script using the MySQL CLI, rather than a Development-only endpoint or EF `database drop`. It needs no API change (verification mode), it can't be triggered over HTTP, and its target is a constant, so a misconfigured connection string can't redirect it to `quickflow`. The schema comes from the existing startup migration path.
- **Regression helper:** written in bash + curl with `node` for JSON (no `jq` on this machine; Node 24 is already a project prerequisite). Git Bash path conversion is disabled inside the script.
- **Settings in the regression:** a change is made and immediately restored (also on exit or interrupt), because the singleton can't be isolated by prefix.

## Attempts

1. Run 1: 130/156. **Script bug**, not a backend bug: `node -e … -10` treated the negative minutes as a node option, so plan start/end were empty and every plan check failed. Fix: pass `--` before node arguments. Run 2 on the dev DB: 156/156.
2. Run 3 (E2E DB, first start): 155/156. "Identical PUT keeps updatedAt" compared strings: on a fresh DB the first GET returns the newly created row's `updatedAt` with 7 fractional digits, while the PUT returns the DB value with 6 (same instant). This is documented in M05 handoff §2. Fix: compare instants (`Date.parse`). Run 4 (fresh E2E DB after reset): 156/156. Run 5 (dev DB, final script): 156/156.

## Notes

- I sent one read-only `GET /api/tasks?search=E2EONLY-…` to the frontend's 5080 API during the isolation check. It returned `[]`. Nothing on 5080 was modified, stopped or restarted.
- `quickflow_e2e` was left reset (0 tables). The first E2E API start migrates it.

## Final status

`COMPLETED`: B1–B7 done. Backend tests 302/302, regression 156/156 (dev and fresh E2E), OpenAPI with no gaps, NFR-P1 max 33.4 ms, E2E DB verified with a guarded reset, no regressions.
