import { SettingsResponse } from '../settings.models';

/** Test helper: a settings response with overrides. */
export function makeSettings(overrides: Partial<SettingsResponse> = {}): SettingsResponse {
  return {
    displayName: null,
    planStartNotificationsEnabled: true,
    defaultView: 'Dashboard',
    updatedAt: '2026-10-10T18:55:35.889683Z',
    ...overrides,
  };
}
