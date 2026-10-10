import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { SettingsService } from '../../core/settings';
import { ToastService } from '../../shared/toast/toast.service';
import { todayLocal } from '../../shared/utils/date-utils';
import { makeHabit } from '../habits/testing/habit-fixtures';
import { PlanStartedEvent, PlanStartWatcherService } from '../plans';
import { makeTask } from '../tasks/testing/task-fixtures';
import { DASHBOARD_FOCUS_REFRESH_GAP_MS, DASHBOARD_REFRESH_MS, DashboardPage } from './dashboard-page';
import { DashboardResponse } from './dashboard.models';
import { makeActivePlan, makeDashboard, makeHabitItem } from './testing/dashboard-fixtures';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  let started: Subject<PlanStartedEvent>;
  let displayName: WritableSignal<string | null>;
  const URL = 'http://api.test/api/dashboard';
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el().querySelector<T>(sel);
  const expectDashboard = (): TestRequest => ctrl.expectOne((r) => r.url === URL && r.method === 'GET');
  /** Takes (and removes) every pending dashboard request. */
  const takeAll = () => ctrl.match((r) => r.url === URL);
  const expectNoDashboard = () => ctrl.expectNone((r) => r.url === URL);
  const section = (name: string) => q(`[data-testid="dashboard-${name}"]`)!;
  const iso = (ms: number) => new Date(ms).toISOString();

  function create(): void {
    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  }

  function load(d: DashboardResponse): void {
    expectDashboard().flush(d);
    fixture.detectChanges();
  }

  function finish(): void {
    toast.clear();
    fixture.destroy();
    discardPeriodicTasks();
    flush();
  }

  beforeEach(() => {
    started = new Subject<PlanStartedEvent>();
    displayName = signal<string | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
        { provide: PlanStartWatcherService, useValue: { highlighted: signal(new Set()), started$: started.asObservable() } },
        { provide: SettingsService, useValue: { displayName } },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => ctrl.verify());

  it('shows loading, requests today=<local date>, then renders the h1, metrics and sections', fakeAsync(() => {
    create();
    expect(q('[data-testid="loading-state"]')).not.toBeNull();
    expect(q('h1')!.textContent!.trim()).toBe('Dashboard');
    const req = expectDashboard();
    expect(req.request.params.get('today')).toBe(todayLocal());
    req.flush(
      makeDashboard({
        tasks: { dueToday: [makeTask({ id: 1, title: 'Today task' })], totalActive: 4, doneCount: 1, completionPercent: 25 },
        habits: { activeCount: 2, completedTodayCount: 1, items: [makeHabitItem({ id: 1, completedToday: true }), makeHabitItem({ id: 2, name: 'Read' })] },
        plans: { inProgressCount: 1, upcomingCount: 2 },
        learning: { inProgressCount: 2, milestonesDone: 3, milestonesTotal: 4, milestonesCompletedLast7Days: 1 },
      }),
    );
    fixture.detectChanges();

    const tasks = q('[data-testid="metric-tasks"]')!;
    expect(tasks.textContent).toContain('25%');
    expect(tasks.textContent).toContain('1 of 4 done');
    expect(tasks.textContent).toContain('1 due today');
    expect(tasks.textContent).toContain('0 overdue');
    expect(q('[data-testid="metric-habits"]')!.textContent).toContain('1 / 2 done today');
    expect(q('[data-testid="metric-plans"]')!.textContent).toContain('1 in progress');
    expect(q('[data-testid="metric-plans"]')!.textContent).toContain('2 upcoming');
    const learning = q('[data-testid="metric-learning"]')!;
    expect(learning.textContent).toContain('2 in progress');
    expect(learning.textContent).toContain('3 / 4 milestones done');
    expect(learning.textContent).toContain('1 completed in the last 7 days');

    expect(section('tasks').querySelectorAll('[data-testid="task-item"]').length).toBe(1);
    expect(section('habits').querySelectorAll('[data-testid="habit-card"]').length).toBe(2);
    expect(section('learning').querySelector('[data-testid="learning-recent"]')!.textContent).toContain('1 milestone completed');
    expect(q('[data-testid="loading-state"]')).toBeNull();
    finish();
  }));

  it('labels weekly habits: the main metric is today, the secondary line counts this period', fakeAsync(() => {
    create();
    load(
      makeDashboard({
        habits: {
          activeCount: 2,
          completedTodayCount: 0,
          items: [makeHabitItem({ id: 1, frequency: 'Weekly', completedForCurrentPeriod: true }), makeHabitItem({ id: 2 })],
        },
      }),
    );
    const habits = q('[data-testid="metric-habits"]')!;
    expect(habits.textContent).toContain('0 / 2 done today');
    expect(habits.textContent).toContain('1 / 2 on track this period (weekly: this week)');
    expect(section('habits').querySelector('[data-testid="habit-week"]')!.textContent).toContain('Done this week');
    finish();
  }));

  describe('greeting', () => {
    it('uses the Settings display name and follows changes', fakeAsync(() => {
      displayName.set('Sam');
      create();
      load(makeDashboard());
      const text = () => q('[data-testid="dashboard-greeting"]')!.textContent!.trim();
      expect(text()).toMatch(/^Good (morning|afternoon|evening), Sam$/);
      displayName.set(null);
      fixture.detectChanges();
      expect(text()).toMatch(/^Good (morning|afternoon|evening)$/);
      expect(q('[data-testid="dashboard-date"]')!.textContent!.trim()).toContain(String(new Date().getFullYear()));
      finish();
    }));
  });

  describe('empty states (F10)', () => {
    it('shows one per section, each with its add action', fakeAsync(() => {
      create();
      load(makeDashboard());
      const empty = (name: string) => section(name).querySelector<HTMLElement>('[data-testid="empty-state"]')!;
      expect(empty('tasks').textContent).toContain('Nothing due today');
      expect(empty('habits').textContent).toContain('No habits yet');
      expect(empty('plans').textContent).toContain('No active plans');
      expect(empty('learning').textContent).toContain('No learning cards yet');

      empty('tasks').querySelector('button')!.click();
      fixture.detectChanges();
      let dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
      expect(dialog.textContent).toContain('Add Task');
      expect(dialog.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe(todayLocal());
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')!.click();
      fixture.detectChanges();

      empty('habits').querySelector('button')!.click();
      fixture.detectChanges();
      dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
      expect(dialog.textContent).toContain('Add Habit');
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')!.click();
      fixture.detectChanges();

      empty('learning').querySelector('button')!.click();
      fixture.detectChanges();
      dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
      expect(dialog.textContent).toContain('Add Learning Card');
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Close dialog"]')!.click();
      fixture.detectChanges();
      expect(document.querySelector('dialog[open]')).toBeNull();

      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      empty('plans').querySelector('button')!.click();
      expect(navigate).toHaveBeenCalledWith(['/plans/new']);
      finish();
    }));

    it('partial empties: overdue without due today, upcoming plans without active ones', fakeAsync(() => {
      create();
      load(
        makeDashboard({
          tasks: { overdue: [makeTask({ id: 9, title: 'Late', isOverdue: true })] },
          plans: { upcomingCount: 2 },
          learning: { notStartedCount: 1 },
        }),
      );
      expect(section('tasks').querySelector('[data-testid="empty-state"]')).toBeNull();
      expect(section('tasks').textContent).toContain('Nothing due today.');
      expect(section('tasks').querySelectorAll('[data-testid="dashboard-overdue"] [data-testid="task-item"]').length).toBe(1);
      expect(section('plans').querySelector('[data-testid="empty-state"]')!.textContent).toContain('2 upcoming');
      expect(section('learning').querySelector('[data-testid="empty-state"]')).toBeNull();
      expect(section('learning').querySelector('[data-testid="learning-not-started"]')!.textContent).toContain('1');
      finish();
    }));
  });

  it('quick-add: the header buttons open the dialogs; a save refetches', fakeAsync(() => {
    create();
    load(makeDashboard());
    const quick = q('[data-testid="quick-add"]')!;
    const button = (label: string) => Array.from(quick.querySelectorAll('button')).find((b) => b.textContent!.trim() === label)!;
    expect(quick.querySelector('a')!.getAttribute('href')).toBe('/plans/new');

    button('Add Task').click();
    fixture.detectChanges();
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')!;
    const title = dialog.querySelector<HTMLInputElement>('input[type="text"]')!;
    title.value = 'Quick one';
    title.dispatchEvent(new Event('input'));
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    const post = ctrl.expectOne((r) => r.url === 'http://api.test/api/tasks' && r.method === 'POST');
    expect(post.request.body.dueDate).toBe(todayLocal());
    post.flush(makeTask({ id: 77, title: 'Quick one', dueDate: todayLocal() }));
    fixture.detectChanges();
    expectDashboard().flush(makeDashboard({ tasks: { dueToday: [makeTask({ id: 77, title: 'Quick one' })] } }));
    fixture.detectChanges();
    expect(section('tasks').textContent).toContain('Quick one');
    finish();
  }));

  it('shows an error state with retry', fakeAsync(() => {
    create();
    expectDashboard().flush({ title: 'Boom', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const error = q('[data-testid="error-state"]')!;
    expect(error.textContent).toContain("Couldn't load the dashboard");
    error.querySelector('button')!.click();
    fixture.detectChanges();
    expect(q('[data-testid="loading-state"]')).not.toBeNull();
    load(makeDashboard());
    expect(q('[data-testid="error-state"]')).toBeNull();
    expect(q('[data-testid="metric-tasks"]')).not.toBeNull();
    finish();
  }));

  it('a failed background refresh keeps the data and shows a notice', fakeAsync(() => {
    create();
    load(makeDashboard({ tasks: { completionPercent: 40 } }));
    tick(DASHBOARD_REFRESH_MS);
    expectDashboard().flush({ title: 'Down', status: 503 }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(q('[data-testid="error-state"]')).toBeNull();
    expect(q('[data-testid="metric-tasks"]')!.textContent).toContain('40%');
    expect(q('[data-testid="dashboard-stale"]')!.textContent).toContain("Couldn't refresh");
    q<HTMLButtonElement>('[data-testid="dashboard-stale"] button')!.click();
    load(makeDashboard({ tasks: { completionPercent: 50 } }));
    expect(q('[data-testid="dashboard-stale"]')).toBeNull();
    expect(q('[data-testid="metric-tasks"]')!.textContent).toContain('50%');
    finish();
  }));

  describe('actions', () => {
    it('task toggle completes via TasksApi, toasts, then refetches the dashboard', fakeAsync(() => {
      create();
      const task = makeTask({ id: 5, title: 'Pay bills', dueDate: todayLocal() });
      load(makeDashboard({ tasks: { dueToday: [task], totalActive: 1, completionPercent: 0 } }));
      section('tasks').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      fixture.detectChanges();
      const req = ctrl.expectOne((r) => r.url === 'http://api.test/api/tasks/5/complete');
      expect(req.request.method).toBe('POST');
      req.flush({ ...task, status: 'Done' });
      fixture.detectChanges();
      expect(toast.toasts().map((t) => t.message)).toContain('Task completed');
      expect(section('tasks').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBeTrue();
      load(makeDashboard({ tasks: { dueToday: [{ ...task, status: 'Done' }], totalActive: 1, doneCount: 1, completionPercent: 100 } }));
      expect(q('[data-testid="metric-tasks"]')!.textContent).toContain('100%');
      finish();
    }));

    it('a failed task toggle reverts, toasts and still refetches', fakeAsync(() => {
      create();
      load(makeDashboard({ tasks: { dueToday: [makeTask({ id: 5, title: 'Pay bills' })] } }));
      const box = () => section('tasks').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      box().click();
      fixture.detectChanges();
      ctrl.expectOne('http://api.test/api/tasks/5/complete?today=' + todayLocal()).flush(
        { title: 'Nope', status: 500 },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();
      expect(box().checked).toBeFalse();
      expect(toast.toasts().some((t) => t.message.startsWith("Couldn't update the task"))).toBeTrue();
      expectDashboard().flush(makeDashboard());
      finish();
    }));

    it('habit toggle uses HabitsApi.setCompletedToday, then refetches the dashboard', fakeAsync(() => {
      create();
      load(makeDashboard({ habits: { activeCount: 1, completedTodayCount: 0, items: [makeHabitItem({ id: 7, name: 'Run' })] } }));
      expect(q('[data-testid="metric-habits"]')!.textContent).toContain('0 / 1 done today');
      section('habits').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      fixture.detectChanges();
      const post = ctrl.expectOne((r) => r.url === 'http://api.test/api/habits/7/completions');
      expect(post.request.method).toBe('POST');
      post.flush({ id: 1, habitId: 7, date: todayLocal(), createdAt: '' }, { status: 201, statusText: 'Created' });
      ctrl.expectOne((r) => r.url === 'http://api.test/api/habits/7').flush(makeHabit({ id: 7, name: 'Run', completedToday: true, completedForCurrentPeriod: true, currentStreak: 1 }));
      fixture.detectChanges();
      expect(toast.toasts().map((t) => t.message)).toContain('Marked as done today');
      load(makeDashboard({ habits: { activeCount: 1, completedTodayCount: 1, items: [makeHabitItem({ id: 7, name: 'Run', completedToday: true })] } }));
      expect(q('[data-testid="metric-habits"]')!.textContent).toContain('1 / 1 done today');
      finish();
    }));
  });

  describe('active plans', () => {
    it('render status badge, progress and rest time; countdown zero refetches', fakeAsync(() => {
      create();
      const now = Date.now();
      load(
        makeDashboard({
          serverNow: iso(now),
          plans: { inProgressCount: 1, active: [makeActivePlan({ id: 3, title: 'Sprint', endDateTime: iso(now + 2_500), restTimeSeconds: 2 })] },
        }),
      );
      const plan = section('plans').querySelector<HTMLElement>('[data-testid="dashboard-plan"][data-plan-id="3"]')!;
      expect(plan.querySelector('[data-testid="plan-status"]')!.textContent!.trim()).toBe('In progress');
      expect(plan.querySelector('[data-testid="plan-progress-text"]')!.textContent!.trim()).toBe('33% · 1/3');
      expect(plan.querySelector('[data-testid="plan-rest-time"]')).not.toBeNull();
      expect(section('plans').querySelector('a[href="/plans"]')).not.toBeNull();

      tick(1000);
      expectNoDashboard();
      tick(2000);
      expectDashboard().flush(makeDashboard({ plans: { completedCount: 1 } }));
      fixture.detectChanges();
      expect(section('plans').querySelector('[data-testid="empty-state"]')).not.toBeNull();
      finish();
    }));
  });

  describe('refresh triggers (F9)', () => {
    it(`refreshes every ${DASHBOARD_REFRESH_MS / 1000} s`, fakeAsync(() => {
      create();
      load(makeDashboard());
      tick(DASHBOARD_REFRESH_MS - 1);
      expectNoDashboard();
      tick(1);
      load(makeDashboard());
      tick(DASHBOARD_REFRESH_MS);
      load(makeDashboard());
      finish();
    }));

    it('refreshes on window focus, throttled', fakeAsync(() => {
      create();
      load(makeDashboard());
      window.dispatchEvent(new Event('focus'));
      expectNoDashboard();
      tick(DASHBOARD_FOCUS_REFRESH_GAP_MS);
      window.dispatchEvent(new Event('focus'));
      load(makeDashboard());
      finish();
    }));

    it('refreshes when the plan start watcher reports a start', fakeAsync(() => {
      create();
      load(makeDashboard());
      started.next({ started: [], plans: [] });
      load(makeDashboard({ plans: { inProgressCount: 1 } }));
      expect(q('[data-testid="metric-plans"]')!.textContent).toContain('1 in progress');
      finish();
    }));

    it('in-flight guard: background triggers are skipped, action triggers queue one follow-up', fakeAsync(() => {
      create();
      const page = fixture.componentInstance;
      expect(page.inFlight()).toBeTrue();
      page.refresh();
      page.refresh();
      let reqs = takeAll();
      expect(reqs.length).toBe(1);
      reqs[0].flush(makeDashboard());
      expect(page.inFlight()).toBeFalse();
      expectNoDashboard();

      page.refresh();
      expect(page.inFlight()).toBeTrue();
      page.refreshNow();
      page.refreshNow();
      started.next({ started: [], plans: [] });
      reqs = takeAll();
      expect(reqs.length).toBe(1);
      reqs[0].flush(makeDashboard());
      // exactly one queued follow-up
      reqs = takeAll();
      expect(reqs.length).toBe(1);
      reqs[0].flush(makeDashboard());
      expectNoDashboard();
      expect(page.inFlight()).toBeFalse();
      finish();
    }));
  });
});
