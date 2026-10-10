# Frontend Development Task

## Module Source

The current frontend module task will be provided by the orchestrator.

### Current Assignment (set by orchestrator)

| Field | Value |
|---|---|
| Module | **M09: MVP Acceptance & E2E Verification**, frontend part (final module) |
| Module specification | `../orchestrator/outputs/modules/M09-mvp-acceptance.md` (frontend tasks F1–F8) |
| Backend handoff | `../orchestrator/outputs/handoffs/M09-mvp-acceptance-handoff.md` (`READY`: E2E DB switch, reset script, start command) |
| DoD reference | `../orchestrator/outputs/requirements-analysis.md` §2.3 (AC-*) and §2.5 (TR-4, DOD-1..6) |
| Required dependencies | M09-BE and all M01–M08 frontend: `COMPLETED` |
| Backend to run | **`backend/` itself** (no more backend edits are in progress) against the **`quickflow_e2e`** DB on port **5080**, per the M09 handoff. Never point E2E at the dev DB `quickflow` |
| Verification tool | **Playwright test runner (npm)** |
| Module output to write | `outputs/modules/M09-mvp-acceptance.md` |
| Assigned | 2026-10-10 22:49 |

History: frontend M01 18:43 · M02 18:55 · M03 19:08 · M04 19:21 · M06 22:02 · M05 22:11 · M07 22:33 · M08 22:48, all `COMPLETED`.

## Goal

Implement and verify one frontend module at a time using the frontend development loop instructions.

## Responsibilities

For the assigned module:

- Read the module-specific frontend requirements.
- Read the backend handoff for the same module.
- Confirm that the backend module is completed and verified.
- Confirm that required frontend dependencies are completed.
- Split the module into frontend implementation tasks.
- Implement the required UI.
- Integrate the relevant backend APIs.
- Run the frontend application.
- Verify the implemented functionality using Playwright MCP.
- Update frontend progress and state.
- Create or update the frontend module output.

## Frontend Project Location

../../frontend/

## Backend Handoff Source

Read the relevant backend handoff generated for the current module.

## Expected Result

The assigned frontend module must finish with one of these statuses:

- `COMPLETED`
- `WAITING`
- `BLOCKED`

### COMPLETED

Use when:

- Frontend implementation is complete.
- The application runs successfully.
- Required API integrations work.
- Required UI behavior works.
- Playwright MCP verification passes.
- Progress and state are updated.
- Module output is created or updated.

### WAITING

Use when required backend or frontend dependencies are not completed.

### BLOCKED

Use when the module fails after the maximum allowed attempts.

## Maximum Attempts

`3`