import { DefaultView } from '../../core/settings';
import { errorMessages } from '../../shared/forms/field-errors';
import { createSettingsForm, settingsFormValue, toUpdateSettingsRequest } from './settings-form';

describe('settings form', () => {
  it('defaults to no name, notifications on, Dashboard', () => {
    const form = createSettingsForm();
    expect(form.getRawValue()).toEqual({ displayName: '', planStartNotificationsEnabled: true, defaultView: 'Dashboard' });
    expect(form.valid).toBeTrue();
  });

  it('display name is optional', () => {
    const form = createSettingsForm();
    form.controls.displayName.setValue('');
    expect(form.controls.displayName.valid).toBeTrue();
  });

  it('accepts 100 characters and rejects 101 (after trimming)', () => {
    const form = createSettingsForm();
    const name = form.controls.displayName;
    name.setValue('x'.repeat(100));
    expect(name.valid).toBeTrue();
    name.setValue(`  ${'x'.repeat(100)}  `);
    expect(name.valid).toBeTrue();
    name.setValue('x'.repeat(101));
    expect(name.valid).toBeFalse();
    expect(errorMessages(name.errors!, 'Display name')).toEqual(['Display name must be at most 100 characters.']);
    expect(form.invalid).toBeTrue();
  });

  it('rejects a default view outside the six pages', () => {
    const form = createSettingsForm();
    form.controls.defaultView.setValue('Unknown' as DefaultView);
    expect(form.controls.defaultView.valid).toBeFalse();
    expect(errorMessages(form.controls.defaultView.errors!, 'Default view')).toEqual([
      'Default view must be one of: Dashboard, Tasks, Habits, LearningResources, TodoPlans, Settings.',
    ]);
    form.controls.defaultView.setValue('TodoPlans');
    expect(form.controls.defaultView.valid).toBeTrue();
  });

  it('settingsFormValue maps a null name to an empty input', () => {
    expect(
      settingsFormValue({ displayName: null, planStartNotificationsEnabled: false, defaultView: 'Habits' }),
    ).toEqual({ displayName: '', planStartNotificationsEnabled: false, defaultView: 'Habits' });
  });

  it('request always contains all three fields; the name is trimmed', () => {
    const form = createSettingsForm({ displayName: '  Nour  ', planStartNotificationsEnabled: false, defaultView: 'Tasks' });
    expect(toUpdateSettingsRequest(form)).toEqual({
      displayName: 'Nour',
      planStartNotificationsEnabled: false,
      defaultView: 'Tasks',
    });
  });

  it('a blank name is sent as null (clears it)', () => {
    const form = createSettingsForm({ displayName: '   ', planStartNotificationsEnabled: true, defaultView: 'Dashboard' });
    const req = toUpdateSettingsRequest(form);
    expect('displayName' in req).toBeTrue();
    expect(req.displayName).toBeNull();
    expect(Object.keys(req).sort()).toEqual(['defaultView', 'displayName', 'planStartNotificationsEnabled']);
  });
});
