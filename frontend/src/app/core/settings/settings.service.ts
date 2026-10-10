import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, tap, timeout } from 'rxjs';
import { ApiError, toApiError } from '../api/api-error';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  defaultViewRoute,
  SettingsResponse,
  UpdateSettingsRequest,
} from './settings.models';
import { SettingsApi } from './settings-api.service';

/** How long the startup load may take before the app continues with the defaults. */
export const SETTINGS_LOAD_TIMEOUT_MS = 4000;

/**
 * App-wide settings store (M05 F2). Loaded once at startup by `provideSettingsInitializer()`;
 * the Settings page refreshes it on open and after every save.
 *
 * Never blocks or crashes the app: if the API is down, `load()` resolves anyway and the defaults
 * stay in place (notifications on, Dashboard); the M01 connectivity banner reports the outage.
 *
 * Consumers read signals only:
 * - M07: `planStartNotificationsEnabled()`
 * - M08: `displayName()` (null when not set)
 * - routing: `defaultView()` / `defaultRoute()` (see `defaultViewRedirect`)
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(SettingsApi);

  private readonly state = signal<AppSettings>(DEFAULT_SETTINGS);
  private pending: Promise<void> | null = null;

  /** Effective settings: the server values once loaded, otherwise the defaults. */
  readonly settings = this.state.asReadonly();
  /** True once a GET or PUT succeeded (false while the defaults are a fallback). */
  readonly loaded = signal(false);
  /** Error of the last failed `load()`, cleared by any later success. */
  readonly loadError = signal<ApiError | null>(null);

  readonly displayName = computed(() => this.state().displayName);
  readonly planStartNotificationsEnabled = computed(() => this.state().planStartNotificationsEnabled);
  readonly defaultView = computed(() => this.state().defaultView);
  /** App route for `defaultView()` (`/dashboard` when unknown). */
  readonly defaultRoute = computed(() => defaultViewRoute(this.state().defaultView));

  /**
   * Loads the settings into the store. Never rejects: on failure (or after `timeoutMs`) the current
   * values (initially the defaults) are kept and `loadError` is set. Concurrent calls share one request.
   */
  load(timeoutMs = SETTINGS_LOAD_TIMEOUT_MS): Promise<void> {
    this.pending ??= firstValueFrom(this.refresh().pipe(timeout(timeoutMs)))
      .then(
        () => undefined,
        (e: unknown) => this.loadError.set(toApiError(e)),
      )
      .finally(() => (this.pending = null));
    return this.pending;
  }

  /** Resolves when no load is in flight (used by the `/` redirect). Never rejects. */
  ready(): Promise<void> {
    return this.pending ?? Promise.resolve();
  }

  /** `GET /api/settings` and update the store. Errors propagate (the store keeps its values). */
  refresh(): Observable<SettingsResponse> {
    return this.api.get().pipe(tap((s) => this.apply(s)));
  }

  /** `PUT /api/settings` (full replacement) and update the store with the saved values. */
  save(request: UpdateSettingsRequest): Observable<SettingsResponse> {
    return this.api.update(request).pipe(tap((s) => this.apply(s)));
  }

  private apply(s: SettingsResponse): void {
    this.state.set({
      displayName: s.displayName ?? null,
      planStartNotificationsEnabled: s.planStartNotificationsEnabled ?? true,
      defaultView: s.defaultView ?? DEFAULT_SETTINGS.defaultView,
      updatedAt: s.updatedAt ?? null,
    });
    this.loaded.set(true);
    this.loadError.set(null);
  }
}
