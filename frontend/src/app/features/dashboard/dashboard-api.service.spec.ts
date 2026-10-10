import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { ApiError } from '../../core/api/api-error';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { todayLocal } from '../../shared/utils/date-utils';
import { DashboardApi } from './dashboard-api.service';
import { makeDashboard } from './testing/dashboard-fixtures';

describe('DashboardApi', () => {
  let api: DashboardApi;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    api = TestBed.inject(DashboardApi);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('GETs /api/dashboard with today = the local date by default', () => {
    let result: unknown;
    api.get().subscribe((d) => (result = d));
    const req = ctrl.expectOne((r) => r.url === 'http://api.test/api/dashboard');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('today')).toBe(todayLocal());
    const body = makeDashboard();
    req.flush(body);
    expect(result).toEqual(body);
  });

  it('sends an explicit today and maps errors to ApiError', () => {
    let error: ApiError | undefined;
    api.get('2026-01-02').subscribe({ error: (e: ApiError) => (error = e) });
    const req = ctrl.expectOne('http://api.test/api/dashboard?today=2026-01-02');
    req.flush(
      { title: 'One or more validation errors occurred.', status: 400, errors: { today: ['Bad date'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(error).toEqual(jasmine.any(ApiError));
    expect(error!.status).toBe(400);
  });
});
