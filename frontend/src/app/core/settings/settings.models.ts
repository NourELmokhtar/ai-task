/** Settings DTOs (M05 handoff). One shared settings object, no id. */

/** The six pages that can be the landing page for `/`. Exact names as sent/returned by the API. */
export type DefaultView = 'Dashboard' | 'Tasks' | 'Habits' | 'LearningResources' | 'TodoPlans' | 'Settings';

/** `GET /api/settings` and `PUT /api/settings` response. */
export interface SettingsResponse {
  /** Trimmed; null when not set. */
  displayName: string | null;
  planStartNotificationsEnabled: boolean;
  defaultView: DefaultView;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** `PUT /api/settings` body. Full replacement: always send all three fields (null name clears it). */
export interface UpdateSettingsRequest {
  displayName: string | null;
  planStartNotificationsEnabled: boolean;
  defaultView: DefaultView;
}

/** Effective app settings. `updatedAt` is null while the defaults are in use (not loaded yet / load failed). */
export type AppSettings = Omit<SettingsResponse, 'updatedAt'> & { updatedAt: string | null };

/** Max display name length after trimming (server rule). */
export const DISPLAY_NAME_MAX = 100;

/** In nav order. */
export const DEFAULT_VIEWS: readonly DefaultView[] = [
  'Dashboard',
  'Tasks',
  'Habits',
  'LearningResources',
  'TodoPlans',
  'Settings',
];

/** Readable labels (same wording as the main navigation). */
export const DEFAULT_VIEW_LABELS: Readonly<Record<DefaultView, string>> = {
  Dashboard: 'Dashboard',
  Tasks: 'Tasks',
  Habits: 'Habits',
  LearningResources: 'Learning Resources',
  TodoPlans: 'Todo Plans',
  Settings: 'Settings',
};

/** DefaultView → app route (handoff §3). */
export const DEFAULT_VIEW_ROUTES: Readonly<Record<DefaultView, string>> = {
  Dashboard: '/dashboard',
  Tasks: '/tasks',
  Habits: '/habits',
  LearningResources: '/learning',
  TodoPlans: '/plans',
  Settings: '/settings',
};

/** Route used when the settings are unavailable or the value is unknown (US-D1). */
export const FALLBACK_ROUTE = '/dashboard';

/** Defaults used until the settings load, and when loading fails (A-03 defaults). */
export const DEFAULT_SETTINGS: AppSettings = {
  displayName: null,
  planStartNotificationsEnabled: true,
  defaultView: 'Dashboard',
  updatedAt: null,
};

export function isDefaultView(value: unknown): value is DefaultView {
  return typeof value === 'string' && (DEFAULT_VIEWS as readonly string[]).includes(value);
}

/** Route for a default view; unknown/missing values fall back to `/dashboard`. */
export function defaultViewRoute(view: unknown): string {
  return isDefaultView(view) ? DEFAULT_VIEW_ROUTES[view] : FALLBACK_ROUTE;
}
