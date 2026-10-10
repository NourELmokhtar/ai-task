import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { ApiError } from '../../core/api/api-error';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { todayLocal } from '../../shared/utils/date-utils';
import { HabitDto } from './habits.models';
import { HabitsApi } from './habits-api.service';
import { makeHabit } from './testing/habit-fixtures';

const BASE = 'http://api.test';

describe('HabitsApi', () => {
  let api: HabitsApi;
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
    api = TestBed.inject(HabitsApi);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('list sends today (local date) and omits active by default', () => {
    api.list().subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/habits`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('today')).toBe(today);
    expect(req.request.params.has('active')).toBeFalse();
    req.flush([]);
  });

  it('list passes active and an explicit today', () => {
    api.list({ active: true, today: '2026-01-02' }).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/habits`);
    expect(req.request.params.get('active')).toBe('true');
    expect(req.request.params.get('today')).toBe('2026-01-02');
    req.flush([]);
  });

  const body = { name: 'x', description: null, frequency: 'Daily' as const };
  const cases: { name: string; call: (a: HabitsApi) => unknown; method: string; url: string; today: boolean }[] = [
    { name: 'get', call: (a) => a.get(5).subscribe(), method: 'GET', url: '/api/habits/5', today: true },
    { name: 'create', call: (a) => a.create(body).subscribe(), method: 'POST', url: '/api/habits', today: true },
    { name: 'update', call: (a) => a.update(5, body).subscribe(), method: 'PUT', url: '/api/habits/5', today: true },
    { name: 'activate', call: (a) => a.activate(5).subscribe(), method: 'POST', url: '/api/habits/5/activate', today: true },
    { name: 'deactivate', call: (a) => a.deactivate(5).subscribe(), method: 'POST', url: '/api/habits/5/deactivate', today: true },
    { name: 'delete', call: (a) => a.delete(5).subscribe(), method: 'DELETE', url: '/api/habits/5', today: false },
  ];

  for (const c of cases) {
    it(`${c.name} calls ${c.method} ${c.url}`, () => {
      c.call(api);
      const req = ctrl.expectOne((r) => r.url === `${BASE}${c.url}`);
      expect(req.request.method).toBe(c.method);
      expect(req.request.params.get('today')).toBe(c.today ? today : null);
      req.flush(c.method === 'DELETE' ? null : makeHabit({ id: 5 }));
    });
  }

  it('complete posts to /completions with no body and today', () => {
    api.complete(5).subscribe();
    const req = ctrl.expectOne(`${BASE}/api/habits/5/completions?today=${today}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush({ id: 1, habitId: 5, date: today, createdAt: '2026-10-10T10:00:00Z' }, { status: 201, statusText: 'Created' });
  });

  it('complete with a date sends { date }', () => {
    api.complete(5, '2026-10-01').subscribe();
    const req = ctrl.expectOne((r) => r.url === `${BASE}/api/habits/5/completions`);
    expect(req.request.body).toEqual({ date: '2026-10-01' });
    req.flush({ id: 1, habitId: 5, date: '2026-10-01', createdAt: '2026-10-10T10:00:00Z' });
  });

  it('removeCompletion deletes /completions/{today} by default', () => {
    api.removeCompletion(5).subscribe();
    const req = ctrl.expectOne(`${BASE}/api/habits/5/completions/${today}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('listCompletions sends from/to', () => {
    api.listCompletions(5, { from: '2026-10-01', to: '2026-10-07' }).subscribe();
    const req = ctrl.expectOne(`${BASE}/api/habits/5/completions?from=2026-10-01&to=2026-10-07`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  describe('setCompletedToday', () => {
    const getUrl = `${BASE}/api/habits/7?today=${today}`;

    it('on: POSTs the completion, then refetches the habit', () => {
      let result: HabitDto | undefined;
      api.setCompletedToday(makeHabit({ id: 7 }), true).subscribe((h) => (result = h));
      ctrl.expectOne(`${BASE}/api/habits/7/completions?today=${today}`).flush(
        { id: 1, habitId: 7, date: today, createdAt: 'x' },
        { status: 201, statusText: 'Created' },
      );
      const get = ctrl.expectOne(getUrl);
      expect(get.request.method).toBe('GET');
      get.flush(makeHabit({ id: 7, completedToday: true, currentStreak: 1 }));
      expect(result?.completedToday).toBeTrue();
      expect(result?.currentStreak).toBe(1);
    });

    it('on: a 409 (already done today) is treated as done and refetches', () => {
      let result: HabitDto | undefined;
      let error: unknown;
      api.setCompletedToday(makeHabit({ id: 7 }), true).subscribe({ next: (h) => (result = h), error: (e) => (error = e) });
      ctrl.expectOne(`${BASE}/api/habits/7/completions?today=${today}`).flush(
        { title: 'Conflict', status: 409, detail: `Habit with id '7' is already completed on ${today}.` },
        { status: 409, statusText: 'Conflict' },
      );
      ctrl.expectOne(getUrl).flush(makeHabit({ id: 7, completedToday: true, currentStreak: 1 }));
      expect(error).toBeUndefined();
      expect(result?.completedToday).toBeTrue();
    });

    it('on: a 400 (inactive habit) is rethrown without a refetch', () => {
      let error: ApiError | undefined;
      api.setCompletedToday(makeHabit({ id: 7 }), true).subscribe({ error: (e) => (error = e) });
      ctrl.expectOne(`${BASE}/api/habits/7/completions?today=${today}`).flush(
        { title: 'Validation', status: 400, errors: { habit: ['Inactive habits cannot be completed. Activate the habit first.'] } },
        { status: 400, statusText: 'Bad Request' },
      );
      ctrl.expectNone(getUrl);
      expect(error?.status).toBe(400);
      expect(error?.errorsFor('habit')).toEqual(['Inactive habits cannot be completed. Activate the habit first.']);
    });

    it("off: DELETEs today's completion, then refetches", () => {
      let result: HabitDto | undefined;
      api.setCompletedToday(makeHabit({ id: 7, completedToday: true }), false).subscribe((h) => (result = h));
      const del = ctrl.expectOne(`${BASE}/api/habits/7/completions/${today}`);
      expect(del.request.method).toBe('DELETE');
      del.flush(null, { status: 204, statusText: 'No Content' });
      ctrl.expectOne(getUrl).flush(makeHabit({ id: 7, completedToday: false }));
      expect(result?.completedToday).toBeFalse();
    });

    it('off: a 404 for the completion still refetches (already undone)', () => {
      let result: HabitDto | undefined;
      api.setCompletedToday(makeHabit({ id: 7 }), false).subscribe((h) => (result = h));
      ctrl.expectOne(`${BASE}/api/habits/7/completions/${today}`).flush(
        { title: 'Not Found', status: 404, detail: 'no completion' },
        { status: 404, statusText: 'Not Found' },
      );
      ctrl.expectOne(getUrl).flush(makeHabit({ id: 7 }));
      expect(result?.id).toBe(7);
    });

    it('off: when the habit itself is gone the refetch 404 is reported', () => {
      let error: ApiError | undefined;
      api.setCompletedToday(makeHabit({ id: 7 }), false).subscribe({ error: (e) => (error = e) });
      ctrl.expectOne(`${BASE}/api/habits/7/completions/${today}`).flush(
        { title: 'Not Found', status: 404, detail: "Habit with id '7' was not found." },
        { status: 404, statusText: 'Not Found' },
      );
      ctrl.expectOne(getUrl).flush(
        { title: 'Not Found', status: 404, detail: "Habit with id '7' was not found." },
        { status: 404, statusText: 'Not Found' },
      );
      expect(error?.isNotFound).toBeTrue();
      expect(error?.message).toBe("Habit with id '7' was not found.");
    });
  });
});
