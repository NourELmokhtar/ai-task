import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import { API_BASE_URL } from './api-config';
import { ApiError } from './api-error';
import { apiErrorInterceptor } from './api-error.interceptor';

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let api: ApiClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test/' },
      ],
    });
    http = TestBed.inject(HttpClient);
    api = TestBed.inject(ApiClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  function capture(obs: Observable<unknown>): { error?: unknown } {
    const box: { error?: unknown } = {};
    obs.subscribe({ error: (e: unknown) => (box.error = e) });
    return box;
  }

  it('maps a 400 validation ProblemDetails to ApiError with normalized field errors', () => {
    const box = capture(http.post('/api/tasks', {}));
    ctrl.expectOne('/api/tasks').flush(
      {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { title: ['Title is required.'], Priority: ['Bad value.'], '$.status': ['Invalid.'] },
        traceId: 'trace-1',
      },
      { status: 400, statusText: 'Bad Request' },
    );

    const err = box.error as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.isValidationError).toBeTrue();
    expect(err.title).toBe('One or more validation errors occurred.');
    expect(err.message).toBe('One or more validation errors occurred.');
    expect(err.traceId).toBe('trace-1');
    expect(err.fieldErrors).toEqual({
      title: ['Title is required.'],
      priority: ['Bad value.'],
      status: ['Invalid.'],
    });
    expect(err.errorsFor('title')).toEqual(['Title is required.']);
    expect(err.errorsFor('missing')).toEqual([]);
  });

  it('uses detail as the message for 404 and 409 problems', () => {
    const notFound = capture(http.get('/api/tasks/42'));
    ctrl.expectOne('/api/tasks/42').flush(
      { title: 'Not Found', status: 404, detail: "Task with id '42' was not found." },
      { status: 404, statusText: 'Not Found' },
    );
    const conflict = capture(http.get('/api/x'));
    ctrl.expectOne('/api/x').flush(
      { title: 'Conflict', status: 409, detail: 'Already exists.' },
      { status: 409, statusText: 'Conflict' },
    );

    const nf = notFound.error as ApiError;
    expect(nf.isNotFound).toBeTrue();
    expect(nf.message).toBe("Task with id '42' was not found.");
    expect(nf.hasFieldErrors).toBeFalse();
    expect((conflict.error as ApiError).isConflict).toBeTrue();
  });

  it('maps a network failure to status 0', () => {
    const box = capture(http.get('/api/health'));
    ctrl.expectOne('/api/health').error(new ProgressEvent('error'), { status: 0 });

    const err = box.error as ApiError;
    expect(err.isNetworkError).toBeTrue();
    expect(err.message).toContain("Can't reach the server");
  });

  it('handles non-ProblemDetails error bodies', () => {
    const box = capture(http.get('/api/boom'));
    ctrl
      .expectOne('/api/boom')
      .flush('gateway exploded', { status: 502, statusText: 'Bad Gateway' });

    const err = box.error as ApiError;
    expect(err.status).toBe(502);
    expect(err.title).toBe('Bad Gateway');
    expect(err.detail).toBe('gateway exploded');
  });

  it('ApiClient prefixes the base URL and drops empty query params', () => {
    api.get('/api/tasks', { status: 'Open', q: null, tag: ['a', 'b'] }).subscribe();
    const req = ctrl.expectOne((r) => r.url === 'http://api.test/api/tasks');
    expect(req.request.params.get('status')).toBe('Open');
    expect(req.request.params.has('q')).toBeFalse();
    expect(req.request.params.getAll('tag')).toEqual(['a', 'b']);
    req.flush([]);
  });
});
