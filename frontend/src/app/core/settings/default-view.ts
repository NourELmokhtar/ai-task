import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { RedirectFunction } from '@angular/router';
import { SettingsService } from './settings.service';

/**
 * Loads the settings at startup (M05 F2). The returned promise never rejects and is capped by
 * `SETTINGS_LOAD_TIMEOUT_MS`, so a down or slow API can't keep the app from starting.
 */
export function provideSettingsInitializer(): EnvironmentProviders {
  return provideAppInitializer(() => inject(SettingsService).load());
}

/**
 * `redirectTo` for the `''` route (M05 F6): sends `/` to the page chosen as the default view.
 * Waits for an in-flight settings load; falls back to `/dashboard` when settings are unavailable.
 */
export const defaultViewRedirect: RedirectFunction = () => {
  const settings = inject(SettingsService);
  return settings.ready().then(() => settings.defaultRoute());
};
