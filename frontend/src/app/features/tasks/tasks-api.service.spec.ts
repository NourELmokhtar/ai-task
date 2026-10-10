import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { todayLocal } from '../../shared/utils/date-utils';
import { makeTask } from './testing/task-fixtures';
import { TasksApi } from './tasks-api.service';

const BASE = 'http://api.test';

describe('TasksApi', () => {
  let api: TasksApi;
  let ctrl: HttpTestingController;
  const today = todayLocal();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: `${BASE}/` },
      ],
    });
    api = TestBed.inject(TasksApi);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('list sends the query params and defaults today to the local date', () => {
    api.list({ search: 'abc', status: 'Done', overdue: true, sortBy: 'dueDate', sortDir: 'asc' }).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/tasks`);
    expect(req.request.method).toBe('GET');
    const p = req.request.params;
    expect(p.get('search')).toBe('abc');
    expect(p.get('status')).toBe('Done');
    expect(p.get('overdue')).toBe('true');
    expect(p.get('sortBy')).toBe('dueDate');
    expect(p.get('sortDir')).toBe('asc');
    expect(p.get('today')).toBe(today);
    expect(p.has('priority')).toBeFalse();
    req.flush([]);
  });

  it('list keeps an explicit today', () => {
    api.list({ today: '2026-01-02' }).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/tasks`);
    expect(req.request.params.get('today')).toBe('2026-01-02');
    req.flush([]);
  });

  const cases: { name: string; call: (a: TasksApi) => unknown; method: string; url: string; today: boolean }[] = [
    { name: 'get', call: (a) => a.get(5).subscribe(), method: 'GET', url: '/api/tasks/5', today: true },
    { name: 'create', call: (a) => a.create({ title: 'x' }).subscribe(), method: 'POST', url: '/api/tasks', today: true },
    {
      name: 'update',
      call: (a) =>
        a.update(5, { title: 'x', description: null, status: 'Todo', priority: 'Low', dueDate: null }).subscribe(),
      method: 'PUT',
      url: '/api/tasks/5',
      today: true,
    },
    { name: 'complete', call: (a) => a.complete(5).subscribe(), method: 'POST', url: '/api/tasks/5/complete', today: true },
    { name: 'archive', call: (a) => a.archive(5).subscribe(), method: 'POST', url: '/api/tasks/5/archive', today: true },
    { name: 'restore', call: (a) => a.restore(5).subscribe(), method: 'POST', url: '/api/tasks/5/restore', today: true },
    { name: 'delete', call: (a) => a.delete(5).subscribe(), method: 'DELETE', url: '/api/tasks/5', today: false },
  ];

  for (const c of cases) {
    it(`${c.name} calls ${c.method} ${c.url}`, () => {
      c.call(api);
      const req = ctrl.expectOne((r) => r.url === `${BASE}${c.url}`);
      expect(req.request.method).toBe(c.method);
      expect(req.request.params.get('today')).toBe(c.today ? today : null);
      req.flush(c.method === 'DELETE' ? null : makeTask({ id: 5 }));
    });
  }

  it('setCompleted(true) posts /complete', () => {
    api.setCompleted(makeTask({ id: 3 }), true).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/tasks/3/complete`);
    expect(req.request.method).toBe('POST');
    req.flush(makeTask({ id: 3, status: 'Done' }));
  });

  it('setCompleted(false) PUTs the full task with status Todo', () => {
    const task = makeTask({ id: 3, title: 'Done one', status: 'Done', priority: 'High', dueDate: '2026-10-01', description: 'd' });
    api.setCompleted(task, false).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/tasks/3`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      title: 'Done one',
      description: 'd',
      status: 'Todo',
      priority: 'High',
      dueDate: '2026-10-01',
    });
    req.flush(makeTask({ id: 3 }));
  });
});
