import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../api/api-config';
import { ApiError } from '../api/api-error';
import { apiErrorInterceptor } from '../api/api-error.interceptor';
import { SettingsApi } from './settings-api.service';
import { makeSettings } from './testing/settings-fixtures';

const URL = 'http://api.test/api/settings';

describe('SettingsApi', () => {
  let api: SettingsApi;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    api = TestBed.inject(SettingsApi);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('get calls GET /api/settings', () => {
    let result: unknown;
    api.get().subscribe((r) => (result = r));
    const req = ctrl.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush(makeSettings({ defaultView: 'Habits' }));
    expect(result).toEqual(makeSettings({ defaultView: 'Habits' }));
  });

  it('update PUTs all three fields', () => {
    api.update({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'Tasks' }).subscribe();
    const req = ctrl.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ displayName: 'Nour', planStartNotificationsEnabled: false, defaultView: 'Tasks' });
    req.flush(makeSettings());
  });

  it('update sends a null displayName explicitly (clears the name)', () => {
    api.update({ displayName: null, planStartNotificationsEnabled: true, defaultView: 'Dashboard' }).subscribe();
    const req = ctrl.expectOne(URL);
    expect('displayName' in req.request.body).toBeTrue();
    expect(req.request.body.displayName).toBeNull();
    req.flush(makeSettings());
  });

  it('maps a 400 to an ApiError with field errors', () => {
    let error: ApiError | undefined;
    api.update({ displayName: 'x'.repeat(101), planStartNotificationsEnabled: true, defaultView: 'Dashboard' })
      .subscribe({ error: (e) => (error = e) });
    ctrl.expectOne(URL).flush(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { displayName: ['Display name must be at most 100 characters.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error!.errorsFor('displayName')).toEqual(['Display name must be at most 100 characters.']);
  });
});
