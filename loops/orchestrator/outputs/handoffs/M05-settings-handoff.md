# M05 Settings: Backend Handoff

Handoff Status: READY

This handoff is for the M05 frontend loop and for M07 (notification preference), M08 (greeting name) and M09. There is no auth (A-02). The dev base URL is `http://localhost:5080`, the same API as M01–M07 (the backend loop verified it on 5081). All M01 conventions apply: camelCase JSON, string enums, UTC `DateTime` ending in `Z`, and ProblemDetails errors. Migration: `20261010185230_AddUserSettings` creates the table `UserSettings` and is **already applied** to MySQL `quickflow`.

**Restart needed:** an API process that was started before this module (e.g. the one on 5080) doesn't have `/api/settings` and returns 404 for it. Restart it once from `backend/` to load the new code. The settings currently hold the defaults (`displayName` null, notifications on, `Dashboard`).

## 1. Endpoints

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/settings` | none | 200 `SettingsResponse` | none expected |
| PUT | `/api/settings` | `UpdateSettingsRequest` | 200 `SettingsResponse` (the saved values) | 400 |

- There is a single settings object, with no id in the URL. There are no POST or DELETE operations.
- **GET never returns 404.** The first read creates the settings with defaults (A-03): `displayName: null`, `planStartNotificationsEnabled: true`, `defaultView: "Dashboard"`. Concurrent first reads are safe and return the same values (verified with 10 parallel requests).
- **PUT is a full replacement.** Always send all three fields. An omitted, null, empty or whitespace-only `displayName` **clears** the name.
- PUT works even before any GET: it creates the row with the values you send.

## 2. Models

```ts
type DefaultView = 'Dashboard' | 'Tasks' | 'Habits' | 'LearningResources' | 'TodoPlans' | 'Settings';

interface SettingsResponse {
  displayName: string | null;            // trimmed; null when not set
  planStartNotificationsEnabled: boolean;
  defaultView: DefaultView;
  updatedAt: string;                     // ISO-8601 UTC, e.g. "2026-10-10T18:55:35.889683Z"
}

interface UpdateSettingsRequest {
  displayName?: string | null;           // optional; trimmed; <= 100 chars after trimming; ''/whitespace/null -> null
  planStartNotificationsEnabled: boolean; // required
  defaultView: DefaultView;               // required
}
```

Example: `PUT /api/settings` `{"displayName":"  Nour  ","planStartNotificationsEnabled":false,"defaultView":"Tasks"}` → 200 `{"displayName":"Nour","planStartNotificationsEnabled":false,"defaultView":"Tasks","updatedAt":"2026-10-10T18:54:57.5512795Z"}`.

- `updatedAt` changes only when a value actually changes. A PUT with identical values keeps the previous `updatedAt`.
- `updatedAt` in a PUT response may have 7 fractional digits. Values read back from the DB have 6 (same as earlier modules).

## 3. `DefaultView` → frontend route (F6)

| `defaultView` | Route | Page |
|---|---|---|
| `Dashboard` (default) | `/dashboard` | Dashboard |
| `Tasks` | `/tasks` | Tasks |
| `Habits` | `/habits` | Habits |
| `LearningResources` | `/learning` | Learning Resources |
| `TodoPlans` | `/plans` | To-Do Plans |
| `Settings` | `/settings` | Settings |

The response always uses these exact names. On input the backend also accepts any letter case (`"tasks"`), but the UI should send the exact names. If settings can't be loaded, fall back to `/dashboard` (US-D1). This fallback is a suggestion; the backend doesn't enforce it.

## 4. Validation and error responses

All PUT validation errors are collected into one 400 `application/problem+json`. Read `errors[field][0]`.

| Case | `errors` key | Message |
|---|---|---|
| `displayName` longer than 100 characters after trimming | `displayName` | `Display name must be at most 100 characters.` |
| `defaultView` missing, null, empty or whitespace | `defaultView` | `Default view is required.` |
| `defaultView` not one of the six names (e.g. `"Unknown"`, `"1"`) | `defaultView` | `Default view must be one of: Dashboard, Tasks, Habits, LearningResources, TodoPlans, Settings.` |
| `planStartNotificationsEnabled` missing or null | `planStartNotificationsEnabled` | `PlanStartNotificationsEnabled is required.` |
| Empty body or `{}` | `planStartNotificationsEnabled`, `defaultView` | both messages above |
| Wrong JSON type (e.g. `"defaultView": 1`, `"planStartNotificationsEnabled": "yes"`) | `$.defaultView` / `$.planStartNotificationsEnabled` | framework JSON conversion message |

Exact observed body (101-character name):

```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"displayName":["Display name must be at most 100 characters."]},"traceId":"00-..."}
```

A rejected PUT changes nothing.

## 5. For other modules

- Backend (M07, M08): inject `ISettingsService` (`QuickFlow.Application.Features.Settings`). `GetAsync()` returns `SettingsResponse` and creates the settings with defaults if needed. The notification preference is a UI concern: the backend doesn't send notifications.
- Frontend: the backend sends CORS for `http://localhost:4200` on PUT (preflight verified).
