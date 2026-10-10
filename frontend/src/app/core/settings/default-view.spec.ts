import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { routes as appRoutes } from '../../app.routes';
import { API_BASE_URL } from '../api/api-config';
import { apiErrorInterceptor } from '../api/api-error.interceptor';
import { defaultViewRedirect, provideSettingsInitializer } from './default-view';
import { DEFAULT_VIEW_ROUTES, DEFAULT_VIEWS } from './settings.models';
import { SettingsService } from './settings.service';
import { makeSettings } from './testing/settings-fixtures';

const URL = 'http://api.test/api/settings';

@Component({ template: '' })
class Stub {}

/** Same `''` redirect as the app, with stub pages instead of the lazy features. */
const testRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: defaultViewRedirect },
  ...['dashboard', 'tasks', 'habits', 'learning', 'plans', 'settings'].map((path) => ({ path, component: Stub })),
];

describe('default view redirect (/)', () => {
  let router: Router;
  let settings: SettingsService;
  let ctrl: HttpTestingController;

  function setup(extraProviders: unknown[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
        ...(extraProviders as never[]),
      ],
    });
    router = TestBed.inject(Router);
    settings = TestBed.inject(SettingsService);
    ctrl = TestBed.inject(HttpTestingController);
  }

  afterEach(() => ctrl.verify());

  it('the app uses defaultViewRedirect for the empty path', () => {
    const root = appRoutes.find((r) => r.path === '');
    expect(root?.redirectTo).toBe(defaultViewRedirect);
    expect(root?.pathMatch).toBe('full');
  });

  for (const view of DEFAULT_VIEWS) {
    it(`/ lands on ${DEFAULT_VIEW_ROUTES[view]} when the default view is ${view}`, async () => {
      setup();
      const loading = settings.load();
      ctrl.expectOne(URL).flush(makeSettings({ defaultView: view }));
      await loading;
      await router.navigateByUrl('/');
      expect(router.url).toBe(DEFAULT_VIEW_ROUTES[view]);
    });
  }

  it('/ falls back to /dashboard when the settings could not be loaded', async () => {
    setup();
    const loading = settings.load();
    ctrl.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    await loading;
    await router.navigateByUrl('/');
    expect(router.url).toBe('/dashboard');
  });

  it('/ falls back to /dashboard before any load', async () => {
    setup();
    await router.navigateByUrl('/');
    expect(router.url).toBe('/dashboard');
  });

  it('/ waits for an in-flight load', async () => {
    setup();
    void settings.load();
    const nav = router.navigateByUrl('/');
    await new Promise((r) => setTimeout(r));
    ctrl.expectOne(URL).flush(makeSettings({ defaultView: 'Habits' }));
    await nav;
    expect(router.url).toBe('/habits');
  });

  it('follows the latest saved value', async () => {
    setup();
    settings.save({ displayName: null, planStartNotificationsEnabled: true, defaultView: 'Settings' }).subscribe();
    ctrl.expectOne(URL).flush(makeSettings({ defaultView: 'Settings' }));
    await router.navigateByUrl('/');
    expect(router.url).toBe('/settings');
  });

  it('provideSettingsInitializer loads settings at startup and never fails the app', async () => {
    setup([provideSettingsInitializer()]);
    const init = TestBed.inject(ApplicationInitStatus);
    ctrl.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    await expectAsync(init.donePromise).toBeResolved();
    expect(settings.defaultRoute()).toBe('/dashboard');
  });

  it('provideSettingsInitializer applies loaded values', async () => {
    setup([provideSettingsInitializer()]);
    const init = TestBed.inject(ApplicationInitStatus);
    ctrl.expectOne(URL).flush(makeSettings({ defaultView: 'Tasks', displayName: 'Nour' }));
    await init.donePromise;
    expect(settings.defaultRoute()).toBe('/tasks');
    expect(settings.displayName()).toBe('Nour');
  });
});
