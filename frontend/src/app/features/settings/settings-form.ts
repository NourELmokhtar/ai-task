import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  DEFAULT_VIEWS,
  DefaultView,
  DISPLAY_NAME_MAX,
  UpdateSettingsRequest,
} from '../../core/settings';
import { maxTrimmedLength, oneOf } from '../../shared/forms/validators';

/* Client rules mirror the server (M05 handoff §4). Error keys match `<app-field-errors>` messages. */

export type SettingsForm = FormGroup<{
  displayName: FormControl<string>;
  planStartNotificationsEnabled: FormControl<boolean>;
  defaultView: FormControl<DefaultView>;
}>;

export interface SettingsFormValue {
  displayName: string;
  planStartNotificationsEnabled: boolean;
  defaultView: DefaultView;
}

/** Display name optional (≤ 100 after trim); default view must be one of the six pages. */
export function createSettingsForm(value: SettingsFormValue = settingsFormValue(DEFAULT_SETTINGS)): SettingsForm {
  return new FormGroup({
    displayName: new FormControl(value.displayName, {
      nonNullable: true,
      validators: [maxTrimmedLength(DISPLAY_NAME_MAX)],
    }),
    planStartNotificationsEnabled: new FormControl(value.planStartNotificationsEnabled, { nonNullable: true }),
    defaultView: new FormControl<DefaultView>(value.defaultView, {
      nonNullable: true,
      validators: [Validators.required, oneOf(DEFAULT_VIEWS, 'Default view')],
    }),
  });
}

/** Form value for saved settings (a null name becomes an empty input). */
export function settingsFormValue(s: Pick<AppSettings, 'displayName' | 'planStartNotificationsEnabled' | 'defaultView'>): SettingsFormValue {
  return {
    displayName: s.displayName ?? '',
    planStartNotificationsEnabled: s.planStartNotificationsEnabled,
    defaultView: s.defaultView,
  };
}

/** Full-replacement PUT body: always all three fields; a blank name is sent as null (clears it). */
export function toUpdateSettingsRequest(form: SettingsForm): UpdateSettingsRequest {
  const v = form.getRawValue();
  return {
    displayName: v.displayName.trim() || null,
    planStartNotificationsEnabled: v.planStartNotificationsEnabled === true,
    defaultView: v.defaultView,
  };
}
