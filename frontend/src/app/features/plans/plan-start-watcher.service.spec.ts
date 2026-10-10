import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { SettingsService } from '../../core/settings/settings.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  PLAN_NOTIFIED_STORAGE_KEY,
  PLAN_START_TIMER_BUFFER_MS,
  PLAN_START_TOAST_MS,
  PLAN_WATCH_POLL_MS,
  PlanStartedEvent,
  PlanStartWatcherService,
} from './plan-start-watcher.service';
import { PlanDto } from './plans.models';
import { makePlan } from './testing/plan-fixtures';

describe('PlanStartWatcherService', () => {
  const LIST = 'http://api.test/api/plans';
  let ctrl: HttpTestingController;
  let toast: ToastService;
  let enabled: WritableSignal<boolean>;
  let watcher: PlanStartWatcherService;
  let events: PlanStartedEvent[];

  const iso = (ms: number) => new Date(ms).toISOString();
  const expectList = () => ctrl.expectOne((r) => r.url === LIST && r.method === 'GET');
  const expectNoList = () => ctrl.expectNone((r) => r.url === LIST);
  const messages = () => toast.toasts().map((t) => t.message);

  /** A plan as the server would return it at `serverNow`. */
  function plan(id: number, status: PlanDto['status'], serverNow: number, changes: Partial<PlanDto> = {}): PlanDto {
    return makePlan({
      id,
      title: `Plan ${id}`,
      status,
      serverNow: iso(serverNow),
      startDateTime: iso(serverNow - 60_000),
      endDateTime: iso(serverNow + 3_600_000),
      restTimeSeconds: status === 'InProgress' ? 3_600 : null,
      ...changes,
    });
  }

  function create(): void {
    watcher = TestBed.inject(PlanStartWatcherService);
    events = [];
    watcher.started$.subscribe((e) => events.push(e));
  }

  function finish(): void {
    watcher.stop();
    toast.clear();
  }

  beforeEach(() => {
    localStorage.removeItem(PLAN_NOTIFIED_STORAGE_KEY);
    enabled = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
        { provide: SettingsService, useValue: { planStartNotificationsEnabled: enabled } },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    ctrl.verify();
    localStorage.removeItem(PLAN_NOTIFIED_STORAGE_KEY);
  });

  it('on app open, notifies a plan that is already InProgress once: toast, highlight, stored id', fakeAsync(() => {
    create();
    watcher.start();
    watcher.start(); // idempotent: still one request
    const now = Date.now();
    expectList().flush([plan(7, 'InProgress', now, { title: 'Deep work' }), plan(8, 'NotStarted', now, { startDateTime: iso(now + 7_200_000) })]);

    expect(messages()).toEqual(["Plan 'Deep work' has started"]);
    expect(toast.toasts()[0].kind).toBe('info');
    expect([...watcher.highlighted()]).toEqual([7]);
    expect(watcher.isNotified(7)).toBeTrue();
    expect(watcher.isNotified(8)).toBeFalse();
    expect(JSON.parse(localStorage.getItem(PLAN_NOTIFIED_STORAGE_KEY)!)).toEqual([7]);
    expect(events.length).toBe(1);
    expect(events[0].started.map((p) => p.id)).toEqual([7]);
    expect(events[0].plans.length).toBe(2);

    // The next poll sees the same InProgress plan: no second toast.
    tick(PLAN_START_TOAST_MS);
    expect(messages()).toEqual([]); // the toast expired on its own
    tick(PLAN_WATCH_POLL_MS - PLAN_START_TOAST_MS);
    expectList().flush([plan(7, 'InProgress', Date.now(), { title: 'Deep work' })]);
    expect(messages()).toEqual([]);
    expect(events.length).toBe(1);
    expect([...watcher.highlighted()]).toEqual([7]);
    finish();
  }));

  it('does not notify again after a reload (ids kept in localStorage)', fakeAsync(() => {
    localStorage.setItem(PLAN_NOTIFIED_STORAGE_KEY, '[7]');
    create();
    watcher.start();
    expectList().flush([plan(7, 'InProgress', Date.now())]);
    expect(messages()).toEqual([]);
    expect(watcher.highlighted().size).toBe(0);
    expect(events.length).toBe(0);
    finish();
  }));

  it('with notifications disabled: no toast, but highlighted, marked handled and started$ emitted', fakeAsync(() => {
    enabled.set(false);
    create();
    watcher.start();
    expectList().flush([plan(7, 'InProgress', Date.now())]);
    expect(messages()).toEqual([]);
    expect(watcher.highlighted().has(7)).toBeTrue();
    expect(watcher.isNotified(7)).toBeTrue();
    expect(events.length).toBe(1);

    // Turning notifications back on later does not produce a late toast for that start.
    enabled.set(true);
    tick(PLAN_WATCH_POLL_MS);
    expectList().flush([plan(7, 'InProgress', Date.now())]);
    expect(messages()).toEqual([]);
    finish();
  }));

  it('arms a precise timer for a future start, corrected by the server clock offset', fakeAsync(() => {
    create();
    watcher.start();
    const client = Date.now();
    const server = client + 30_000; // server clock 30 s ahead of the client
    const start = server + 20_000; // 20 s from now on the server clock
    expectList().flush([plan(9, 'NotStarted', server, { title: 'Sprint', startDateTime: iso(start), restTimeSeconds: null })]);
    expect(messages()).toEqual([]);

    // Without the correction it would fire after 50 s; with it, 20 s (+ buffer).
    tick(20_000 + PLAN_START_TIMER_BUFFER_MS - 1);
    expectNoList();
    tick(1);
    expectList().flush([plan(9, 'InProgress', start + PLAN_START_TIMER_BUFFER_MS, { title: 'Sprint', startDateTime: iso(start) })]);
    expect(messages()).toEqual(["Plan 'Sprint' has started"]);
    expect(watcher.highlighted().has(9)).toBeTrue();
    expect(events[0].started[0].id).toBe(9);
    finish();
  }));

  it('re-arms when the server still says NotStarted at the timer, and never overlaps requests', fakeAsync(() => {
    create();
    watcher.start();
    const now = Date.now();
    expectList().flush([plan(3, 'NotStarted', now, { startDateTime: iso(now + 5_000) })]);
    tick(5_000 + PLAN_START_TIMER_BUFFER_MS);
    watcher.check(); // a second check while the timer's request is in flight is skipped
    const req = expectList();
    // The server clock lags: still 1 s before the start.
    const lagging = Date.now() - 1_500;
    req.flush([plan(3, 'NotStarted', lagging, { startDateTime: iso(now + 5_000) })]);
    expect(messages()).toEqual([]);
    tick(1_000 + PLAN_START_TIMER_BUFFER_MS);
    expectList().flush([plan(3, 'InProgress', Date.now(), { startDateTime: iso(now + 5_000), title: 'Late' })]);
    expect(messages()).toEqual(["Plan 'Late' has started"]);
    finish();
  }));

  it('polls every 60 s; stop() clears the poll and start timers', fakeAsync(() => {
    create();
    watcher.start();
    expectList().flush([]);
    tick(PLAN_WATCH_POLL_MS - 1);
    expectNoList();
    tick(1);
    const now = Date.now();
    expectList().flush([plan(4, 'NotStarted', now, { startDateTime: iso(now + 30_000) })]);
    watcher.stop();
    expect(watcher.isRunning).toBeFalse();
    tick(2 * 60 * 60 * 1000);
    expectNoList();
    finish();
  }));

  it('keeps polling after an error', fakeAsync(() => {
    create();
    watcher.start();
    expectList().flush({ title: 'Boom' }, { status: 500, statusText: 'Server Error' });
    expect(messages()).toEqual([]);
    tick(PLAN_WATCH_POLL_MS);
    expectList().flush([]);
    finish();
  }));

  it('does not notify plans that never become InProgress (completed before the start)', fakeAsync(() => {
    create();
    watcher.start();
    const now = Date.now();
    expectList().flush([plan(5, 'Completed', now, { startDateTime: iso(now + 600_000), endDateTime: iso(now + 900_000) })]);
    expect(messages()).toEqual([]);
    expect(events.length).toBe(0);
    finish();
  }));

  it('clears the highlight when the plan leaves InProgress and forgets deleted plans', fakeAsync(() => {
    create();
    watcher.start();
    expectList().flush([plan(7, 'InProgress', Date.now())]);
    expect(watcher.highlighted().has(7)).toBeTrue();
    tick(PLAN_WATCH_POLL_MS);
    expectList().flush([plan(7, 'Completed', Date.now(), { restTimeSeconds: null })]);
    expect(watcher.highlighted().size).toBe(0);
    expect(watcher.isNotified(7)).toBeTrue();
    tick(PLAN_WATCH_POLL_MS);
    expectList().flush([]);
    expect(JSON.parse(localStorage.getItem(PLAN_NOTIFIED_STORAGE_KEY)!)).toEqual([]);
    finish();
  }));

  it('works (once per session) when localStorage throws', fakeAsync(() => {
    spyOn(Storage.prototype, 'getItem').and.throwError('denied');
    spyOn(Storage.prototype, 'setItem').and.throwError('quota');
    create();
    watcher.start();
    expectList().flush([plan(7, 'InProgress', Date.now())]);
    expect(messages().length).toBe(1);
    toast.clear();
    tick(PLAN_WATCH_POLL_MS);
    expectList().flush([plan(7, 'InProgress', Date.now())]);
    expect(messages()).toEqual([]);
    finish();
  }));
});
