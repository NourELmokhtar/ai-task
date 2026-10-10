import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { SettingsService } from '../../core/settings';
import { makeSettings } from '../../core/settings/testing/settings-fixtures';
import { ToastService } from '../../shared/toast/toast.service';
import { SettingsPage } from './settings-page';

const URL = 'http://api.test/api/settings';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(sel: string) => el().querySelector<T>(sel);
  const nameInput = () => q<HTMLInputElement>('#settings-display-name')!;
  const notifications = () => q<HTMLInputElement>('input[type="checkbox"]')!;
  const viewSelect = () => q<HTMLSelectElement>('#settings-default-view')!;
  const saveButton = () => q<HTMLButtonElement>('button[type="submit"]')!;

  function render() {
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  }

  function loadWith(overrides = {}) {
    render();
    ctrl.expectOne(URL).flush(makeSettings(overrides));
    fixture.detectChanges();
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit() {
    q<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => ctrl.verify());

  it('shows the loading state, then the current values', () => {
    render();
    expect(q('[data-testid="loading-state"]')).not.toBeNull();
    ctrl.expectOne(URL).flush(makeSettings({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'TodoPlans' }));
    fixture.detectChanges();

    expect(q('[data-testid="loading-state"]')).toBeNull();
    expect(Array.from(el().querySelectorAll('h2')).map((h) => h.textContent?.trim())).toEqual(['Profile', 'Preferences']);
    expect(nameInput().value).toBe('Nour');
    expect(notifications().checked).toBeFalse();
    expect(viewSelect().value).toBe('TodoPlans');
  });

  it('offers the six pages with readable labels', () => {
    loadWith();
    const options = Array.from(viewSelect().options);
    expect(options.map((o) => o.value)).toEqual(['Dashboard', 'Tasks', 'Habits', 'LearningResources', 'TodoPlans', 'Settings']);
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'Dashboard',
      'Tasks',
      'Habits',
      'Learning Resources',
      'Todo Plans',
      'Settings',
    ]);
  });

  it('shows an error state with retry when loading fails', () => {
    render();
    ctrl.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();
    expect(q('[data-testid="error-state"]')?.textContent).toContain("Couldn't load settings");
    q<HTMLButtonElement>('[data-testid="error-state"] button')!.click();
    fixture.detectChanges();
    ctrl.expectOne(URL).flush(makeSettings({ displayName: 'Back' }));
    fixture.detectChanges();
    expect(nameInput().value).toBe('Back');
  });

  it('saves all three fields, toasts, updates the app-wide store and disables Save while saving', () => {
    loadWith();
    const success = spyOn(toast, 'success').and.callThrough();
    type(nameInput(), '  Nour  ');
    notifications().click();
    viewSelect().value = 'Tasks';
    viewSelect().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    submit();
    const req = ctrl.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'Tasks' });
    expect(saveButton().disabled).toBeTrue();
    expect(saveButton().textContent).toContain('Saving');

    // A second submit while saving sends nothing.
    submit();
    ctrl.expectNone(URL);

    req.flush(makeSettings({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'Tasks' }));
    fixture.detectChanges();
    expect(saveButton().disabled).toBeFalse();
    expect(success).toHaveBeenCalledWith('Settings saved');
    expect(nameInput().value).toBe('Nour');

    const store = TestBed.inject(SettingsService);
    expect(store.displayName()).toBe('Nour');
    expect(store.planStartNotificationsEnabled()).toBeFalse();
    expect(store.defaultRoute()).toBe('/tasks');
  });

  it('sends a cleared name as null', () => {
    loadWith({ displayName: 'Nour' });
    type(nameInput(), '');
    submit();
    const req = ctrl.expectOne(URL);
    expect(req.request.body).toEqual({ displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' });
    req.flush(makeSettings());
  });

  it('blocks a 101-character name on the client and shows the message', () => {
    loadWith();
    type(nameInput(), 'x'.repeat(101));
    expect(q('#settings-display-name-errors')?.textContent).toContain('Display name must be at most 100 characters.');
    submit();
    ctrl.expectNone(URL);
    expect(q('[data-testid="form-error"]')?.textContent).toContain('Please fix the highlighted fields.');
  });

  it('shows server validation errors on the matching field', () => {
    loadWith();
    type(nameInput(), 'Nour');
    submit();
    ctrl.expectOne(URL).flush(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { DefaultView: ['Default view must be one of: Dashboard, Tasks, Habits, LearningResources, TodoPlans, Settings.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(q('#settings-default-view-errors')?.textContent).toContain('Default view must be one of');
    expect(q('[data-testid="form-error"]')?.textContent).toContain('Please fix the highlighted fields.');
    expect(saveButton().disabled).toBeFalse();
  });

  it('toasts a non-validation save error and keeps the input', () => {
    loadWith();
    const error = spyOn(toast, 'error').and.callThrough();
    type(nameInput(), 'Nour');
    submit();
    ctrl.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();
    expect(error).toHaveBeenCalled();
    expect(error.calls.mostRecent().args[0]).toContain("Couldn't save settings");
    expect(nameInput().value).toBe('Nour');
    expect(TestBed.inject(SettingsService).displayName()).toBeNull();
  });
});
