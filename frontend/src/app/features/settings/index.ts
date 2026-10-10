/**
 * Public pieces of the Settings feature (M05). The app-wide store lives in `core/settings` and is
 * re-exported here for convenience: `SettingsService` (signals `settings()`, `displayName()`,
 * `planStartNotificationsEnabled()`, `defaultView()`, `defaultRoute()`), `SettingsApi`, models.
 * The route page (`SettingsPage`) is intentionally not exported.
 */
export * from '../../core/settings';
export {
  createSettingsForm,
  settingsFormValue,
  toUpdateSettingsRequest,
  type SettingsForm,
  type SettingsFormValue,
} from './settings-form';
