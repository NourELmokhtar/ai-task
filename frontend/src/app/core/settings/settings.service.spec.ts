import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { API_BASE_URL } from '../api/api-config';
import { ApiError } from '../api/api-error';
import { apiErrorInterceptor } from '../api/api-error.interceptor';
import { DEFAULT_SETTINGS } from './settings.models';
import { SettingsService } from './settings.service';
import { makeSettings } from './testing/settings-fixtures';

const URL = 'http://api.test/api/settings';

describe('SettingsService', () => {
  let service: SettingsService;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    service = TestBed.inject(SettingsService);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('starts with the defaults (notifications on, Dashboard)', () => {
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
    expect(service.loaded()).toBeFalse();
    expect(service.displayName()).toBeNull();
    expect(service.planStartNotificationsEnabled()).toBeTrue();
    expect(service.defaultView()).toBe('Dashboard');
    expect(service.defaultRoute()).toBe('/dashboard');
  });

  it('load() fills the store from GET /api/settings', async () => {
    const done = service.load();
    ctrl
      .expectOne(URL)
      .flush(makeSettings({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'TodoPlans' }));
    await done;
    expect(service.loaded()).toBeTrue();
    expect(service.loadError()).toBeNull();
    expect(service.displayName()).toBe('Nour');
    expect(service.planStartNotificationsEnabled()).toBeFalse();
    expect(service.defaultView()).toBe('TodoPlans');
    expect(service.defaultRoute()).toBe('/plans');
    expect(service.settings().updatedAt).toBe('2026-10-10T18:55:35.889683Z');
  });

  it('load() resolves with the defaults when the API is unreachable', async () => {
    const done = service.load();
    ctrl.expectOne(URL).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await expectAsync(done).toBeResolved();
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
    expect(service.loaded()).toBeFalse();
    expect(service.loadError()).toBeInstanceOf(ApiError);
    expect(service.loadError()!.isNetworkError).toBeTrue();
    expect(service.defaultRoute()).toBe('/dashboard');
  });

  it('load() resolves with the defaults on a server error', async () => {
    const done = service.load();
    ctrl.expectOne(URL).flush({ title: 'Server error', status: 500 }, { status: 500, statusText: 'Server Error' });
    await done;
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
    expect(service.loadError()!.status).toBe(500);
  });

  it('load() gives up after the timeout and keeps the defaults', fakeAsync(() => {
    let resolved = false;
    void service.load(1000).then(() => (resolved = true));
    const req = ctrl.expectOne(URL);
    tick(999);
    flushMicrotasks();
    expect(resolved).toBeFalse();
    tick(1);
    flushMicrotasks();
    expect(resolved).toBeTrue();
    expect(req.cancelled).toBeTrue();
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
    expect(service.loadError()).not.toBeNull();
  }));

  it('a failed reload keeps the last loaded values', async () => {
    const first = service.load();
    ctrl.expectOne(URL).flush(makeSettings({ defaultView: 'Habits' }));
    await first;
    const second = service.load();
    ctrl.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    await second;
    expect(service.defaultView()).toBe('Habits');
    expect(service.loaded()).toBeTrue();
  });

  it('concurrent load() calls share one request; ready() waits for it', async () => {
    const a = service.load();
    const b = service.load();
    expect(a).toBe(b);
    let ready = false;
    const r = service.ready().then(() => (ready = true));
    await Promise.resolve();
    expect(ready).toBeFalse();
    ctrl.expectOne(URL).flush(makeSettings({ defaultView: 'Tasks' }));
    await r;
    expect(ready).toBeTrue();
    expect(service.defaultRoute()).toBe('/tasks');
  });

  it('ready() resolves immediately when nothing is loading', async () => {
    await expectAsync(service.ready()).toBeResolved();
  });

  it('save() PUTs all three fields and updates the store with the saved values', () => {
    let saved: unknown;
    service
      .save({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'LearningResources' })
      .subscribe((s) => (saved = s));
    const req = ctrl.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      displayName: 'Nour',
      planStartNotificationsEnabled: false,
      defaultView: 'LearningResources',
    });
    const response = makeSettings({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'LearningResources' });
    req.flush(response);
    expect(saved).toEqual(response);
    expect(service.displayName()).toBe('Nour');
    expect(service.planStartNotificationsEnabled()).toBeFalse();
    expect(service.defaultRoute()).toBe('/learning');
    expect(service.loaded()).toBeTrue();
  });

  it('a rejected save leaves the store unchanged', () => {
    let error: ApiError | undefined;
    service
      .save({ displayName: 'x'.repeat(101), planStartNotificationsEnabled: true, defaultView: 'Tasks' })
      .subscribe({ error: (e) => (error = e) });
    ctrl.expectOne(URL).flush(
      { status: 400, title: 'Validation', errors: { displayName: ['Display name must be at most 100 characters.'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(error!.isValidationError).toBeTrue();
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('refresh() updates the store and propagates errors', () => {
    let failed = false;
    service.refresh().subscribe({ error: () => (failed = true) });
    ctrl.expectOne(URL).flush({ status: 500, title: 'x' }, { status: 500, statusText: 'x' });
    expect(failed).toBeTrue();

    service.refresh().subscribe();
    ctrl.expectOne(URL).flush(makeSettings({ displayName: 'A' }));
    expect(service.displayName()).toBe('A');
  });
});
