# Orchestrator Task

## Requirement Source

../../requirements/PRD.md

## Goal

Analyze the supplied project requirements and coordinate the implementation of the backend and frontend using reusable module-based development loops.

## Execution Requirements

- Identify the application modules from the supplied requirements.
- Identify dependencies between modules.
- Build a dependency-aware execution plan.
- Prepare backend module tasks.
- Start a backend module only when its dependencies are satisfied.
- Start the corresponding frontend module only after the backend module is completed and verified.
- Continue processing other ready backend modules while frontend modules are being implemented.
- Track the overall project progress and execution state.
- Stop when all required modules are completed and verified, or when a required module becomes blocked after the allowed retries.

## Backend Loop

Use:

../backend-dev/

## Frontend Loop

Use:

../frontend-dev/

## Backend Project Location

../../backend/

## Frontend Project Location

../../frontend/

## Expected Result

A completed and verified project implemented through dependency-aware backend and frontend module execution.