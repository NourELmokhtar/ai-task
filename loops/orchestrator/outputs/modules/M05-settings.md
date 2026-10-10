# M05 — Settings

| Field | Value |
|---|---|
| ID | M05 |
| Type | Feature |
| Backend status | `WAITING` (needs M01-BE) |
| Frontend status | `WAITING` (needs M05-BE, M01-FE) |
| Module dependencies | M01 |
| Backend dependencies | M01-BE |
| Frontend dependencies | M05-BE, M01-FE |
| Handoff | `loops/orchestrator/outputs/handoffs/M05-settings-handoff.md` |
| Consumed by | M07 (notification preference), M08 (greeting name), M09 |

## Goal

Persist the single user's profile information and application preferences, show them on the Settings page, and apply them app-wide: the default landing view and the plan-start notification preference.

## Requirements Covered

§4 page 6 · UX-SETTINGS · UX-NAV (default view) · US-D1 (default view = Dashboard) · NFR-R1, NFR-M1 · DOD-1 (Settings page) · A-02, A-03, A-30 · D-02

## Data Model

**UserSettings** (single row; not in the PRD data model, A-03):
`Id` (fixed singleton), `DisplayName` (optional, ≤ 100), `PlanStartNotificationsEnabled` (bool, default `true`), `DefaultView` (`Dashboard` | `Tasks` | `Habits` | `LearningResources` | `TodoPlans` | `Settings`, default `Dashboard`), `UpdatedAt`.

## Business Rules

| Rule | Behavior |
|---|---|
| A-02 | No authentication. "Profile" = display name only |
| A-03 | Settings row auto-created with defaults on first read |
| Validation | `DisplayName` ≤ 100 · `DefaultView` must be one of the six pages → else 400 |

## Backend Tasks

| # | Task |
|---|---|
| B1 | `UserSettings` entity, mapping, migration (seed or lazy-create defaults) |
| B2 | DTOs: `SettingsResponse`, `UpdateSettingsRequest` |
| B3 | Validation |
| B4 | Settings service: get-or-create, update |
| B5 | Endpoints + OpenAPI |
| B6 | Unit tests |

## Proposed API Contract

*The backend may refine this. The handoff is authoritative.*

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/settings` | — | 200 `{ displayName, planStartNotificationsEnabled, defaultView, updatedAt }` | — |
| PUT | `/api/settings` | `{ displayName?, planStartNotificationsEnabled, defaultView }` | 200 | 400 |

## Frontend Tasks

| # | Task |
|---|---|
| F1 | Settings API service + types |
| F2 | App-wide `SettingsService` (`providedIn: 'root'`, signal-based state), loaded at app start (`provideAppInitializer`) and refreshed after save. Consumed by M07 (notifications) and M08 (greeting) |
| F3 | Settings page, **Profile** section: display name |
| F4 | Settings page, **Preferences** section: plan-start notifications toggle, default view selector (six pages) |
| F5 | Save button → success toast. Validation errors shown. Loading/error states |
| F6 | Apply default view: `/` redirects to the route for `DefaultView` (route guard or redirect function reading `SettingsService`; replaces the M01 fixed redirect) |

## Testing Tasks

**Unit:** defaults on first read · display name 101 chars → invalid · invalid default view → invalid · update persists all fields.

**Curl verification:**
1. GET → 200 with defaults (`planStartNotificationsEnabled=true`, `defaultView=Dashboard`).
2. PUT valid values → 200. GET again → persisted.
3. PUT `defaultView=Unknown` → 400. 101-char display name → 400.
4. Restart backend → GET still returns saved values (NFR-R1).

**Playwright MCP verification:**
1. Settings page loads showing current values.
2. Change display name → Save → success toast. Reload → value persists.
3. Toggle notifications → Save → persists after reload.
4. Set default view to Tasks → open `/` → lands on Tasks. Reset to Dashboard → `/` lands on Dashboard.
5. Invalid input (over-length name) → validation error shown.

## Completion Criteria

**Backend:** build ✓ · app starts ✓ · Swagger lists settings endpoints ✓ · curl 1–4 pass ✓ · unit tests pass ✓ · handoff created ✓ · progress/state updated ✓.

**Frontend:** Settings page functional ✓ · settings store available app-wide ✓ · default view applied on `/` ✓ · Playwright 1–5 pass ✓ · progress/state/output updated ✓.
