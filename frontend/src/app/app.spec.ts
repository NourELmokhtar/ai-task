import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { apiErrorInterceptor } from './core/api/api-error.interceptor';
import { API_BASE_URL } from './core/api/api-config';
import { PlanStartWatcherService } from './features/plans/plan-start-watcher.service';

describe('App shell', () => {
  let http: HttpTestingController;
  let watcher: jasmine.SpyObj<PlanStartWatcherService>;

  beforeEach(async () => {
    watcher = jasmine.createSpyObj<PlanStartWatcherService>('PlanStartWatcherService', ['start', 'stop']);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
        { provide: PlanStartWatcherService, useValue: watcher },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts the global plan start watcher once (M07)', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/health').flush({ status: 'Healthy', serverTime: '' });
    fixture.detectChanges();
    expect(watcher.start).toHaveBeenCalledTimes(1);
  });

  it('renders the six main navigation entries in PRD order', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/health').flush({ status: 'Healthy', serverTime: '' });

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('nav a'),
    );
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Dashboard',
      'Tasks',
      'Habits',
      'Learning Resources',
      'Todo Plans',
      'Settings',
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard',
      '/tasks',
      '/habits',
      '/learning',
      '/plans',
      '/settings',
    ]);
  });

  it('shows the connectivity banner when the health check fails', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http
      .expectOne('http://api.test/api/health')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    fixture.detectChanges();

    const banner = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="connectivity-banner"]',
    );
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Can't reach the QuickFlow server");
  });

  it('shows no banner when the API is healthy', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('http://api.test/api/health').flush({ status: 'Healthy', serverTime: '' });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="connectivity-banner"]'),
    ).toBeNull();
  });
});
