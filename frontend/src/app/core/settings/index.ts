/**
 * App-wide settings (M05). Stable import point for other modules:
 * `import { SettingsService } from '../../core/settings';`
 * - M07: `SettingsService.planStartNotificationsEnabled()`
 * - M08: `SettingsService.displayName()`
 */
export * from './settings.models';
export { SettingsApi } from './settings-api.service';
export { SettingsService, SETTINGS_LOAD_TIMEOUT_MS } from './settings.service';
export { defaultViewRedirect, provideSettingsInitializer } from './default-view';
