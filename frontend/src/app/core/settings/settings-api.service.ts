import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import { SettingsResponse, UpdateSettingsRequest } from './settings.models';

const BASE = '/api/settings';

/**
 * Settings API (M05 handoff). GET never 404s (defaults are created on first read).
 * Prefer `SettingsService`, which keeps the app-wide state in sync; use this only for raw calls.
 */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly api = inject(ApiClient);

  get(): Observable<SettingsResponse> {
    return this.api.get<SettingsResponse>(BASE);
  }

  /** Full replacement: sends all three fields; a null `displayName` clears the name. 400 on validation errors. */
  update(body: UpdateSettingsRequest): Observable<SettingsResponse> {
    return this.api.put<SettingsResponse>(BASE, {
      displayName: body.displayName,
      planStartNotificationsEnabled: body.planStartNotificationsEnabled,
      defaultView: body.defaultView,
    });
  }
}
