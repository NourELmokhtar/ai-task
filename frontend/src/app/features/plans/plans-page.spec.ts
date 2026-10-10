import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';
import { PlanStartedEvent, PlanStartWatcherService } from './plan-start-watcher.service';
import { PlansPage, PLANS_FOCUS_REFRESH_GAP_MS, PLANS_REFRESH_MS } from './plans-page';
import { PlanDto } from './plans.models';
import { makeItem, makePlan, threeItems } from './testing/plan-fixtures';

describe('PlansPage', () => {
  let fixture: ComponentFixture<PlansPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  const BASE = 'http://api.test/api/plans';
  const el = () => fixture.nativeElement as HTMLElement;
  const expectList = (): TestRequest => ctrl.expectOne((r) => r.url === BASE && r.method === 'GET');
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>('[data-testid="plan-card"]'));
  const messages = () => toast.toasts().map((t) => t.message);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(PlansPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    ctrl.verify();
    toast.clear();
  });

  it('shows loading, then the "Create Plan" empty state', () => {
    expect(el().querySelector('[data-testid="loading-state"]')).not.toBeNull();
    expectList().flush([]);
    fixture.detectChanges();
    const empty = el().querySelector<HTMLElement>('[data-testid="empty-state"]')!;
    expect(empty.textContent).toContain('No plans yet');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    empty.querySelector<HTMLButtonElement>('button')!.click();
    expect(navigate).toHaveBeenCalledWith(['/plans/new']);
  });

  it('shows an error state with retry', () => {
    expectList().flush({ title: 'Boom', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const error = el().querySelector<HTMLElement>('[data-testid="error-state"]')!;
    expect(error.textContent).toContain("Couldn't load plans");
    error.querySelector<HTMLButtonElement>('button')!.click();
    expectList().flush([]);
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });

  it('renders plans in API order', () => {
    expectList().flush([makePlan({ id: 2, title: 'B', priorityOrder: 1 }), makePlan({ id: 1, title: 'A', priorityOrder: 3 })]);
    fixture.detectChanges();
    expect(cards().map((c) => c.getAttribute('data-plan-id'))).toEqual(['2', '1']);
  });

  it('toggling an item PATCHes it and replaces the card with the response', () => {
    const plan = makePlan({ id: 5, items: threeItems() });
    expectList().flush([plan]);
    fixture.detectChanges();
    cards()[0].querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();
    fixture.detectChanges();

    const req = ctrl.expectOne(`${BASE}/5/items/1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isDone: true });
    const items = threeItems();
    items[0].isDone = true;
    req.flush(makePlan({ id: 5, items }));
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="plan-progress-text"]')!.textContent!.trim()).toBe('33% · 1/3');
    expect(messages()).toContain('Item done and task completed · 33% complete');
  });

  it('a failed toggle toasts and reverts the checkbox', () => {
    expectList().flush([makePlan({ id: 5, items: [makeItem({ id: 8, sourceType: 'Habit' })] })]);
    fixture.detectChanges();
    const box = () => cards()[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box().click();
    fixture.detectChanges();
    expect(box().checked).toBeTrue();
    ctrl.expectOne(`${BASE}/5/items/8`).flush({ title: 'Bad', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(box().checked).toBeFalse();
    expect(messages().some((m) => m.startsWith("Couldn't update the item"))).toBeTrue();
  });

  it('remove asks for confirmation, DELETEs and drops the card', () => {
    expectList().flush([makePlan({ id: 5, title: 'Morning' }), makePlan({ id: 6, title: 'Evening' })]);
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('button[aria-label="Remove Morning"]')!.click();
    fixture.detectChanges();
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('dialog[open] button')).find(
      (b) => b.textContent!.trim() === 'Remove',
    )!;
    expect(document.querySelector('dialog[open]')!.textContent).toContain('"Morning" will be removed');
    confirm.click();
    fixture.detectChanges();
    const req = ctrl.expectOne(`${BASE}/5`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(cards().map((c) => c.getAttribute('data-plan-id'))).toEqual(['6']);
    expect(messages()).toContain('Plan removed');
  });

  it('edit navigates to the builder in edit mode', () => {
    expectList().flush([makePlan({ id: 5, title: 'Morning' })]);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    el().querySelector<HTMLButtonElement>('button[aria-label="Edit Morning"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/plans', 5, 'edit']);
  });
});

describe('PlansPage (M07 tracking)', () => {
  let fixture: ComponentFixture<PlansPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  let started: Subject<PlanStartedEvent>;
  let highlighted: WritableSignal<ReadonlySet<number>>;
  const BASE = 'http://api.test/api/plans';
  const iso = (ms: number) => new Date(ms).toISOString();
  const el = () => fixture.nativeElement as HTMLElement;
  const expectList = (): TestRequest => ctrl.expectOne((r) => r.url === BASE && r.method === 'GET');
  const expectNoList = () => ctrl.expectNone((r) => r.url === BASE && r.method === 'GET');
  const ids = (testId: string) =>
    Array.from(el().querySelectorAll<HTMLElement>(`[data-testid="${testId}"] [data-testid="plan-card"]`)).map((c) =>
      Number(c.getAttribute('data-plan-id')),
    );
  const entry = (id: number) => el().querySelector<HTMLElement>(`[data-testid="plan-entry"][data-plan-id="${id}"]`)!;

  /** A plan as the server returns it at `now`. */
  function plan(id: number, status: PlanDto['status'], changes: Partial<PlanDto> = {}): PlanDto {
    const now = Date.now();
    const window =
      status === 'InProgress'
        ? { startDateTime: iso(now - 600_000), endDateTime: iso(now + 3_600_000), restTimeSeconds: 3_600 }
        : status === 'NotStarted'
          ? { startDateTime: iso(now + 3_600_000), endDateTime: iso(now + 7_200_000), restTimeSeconds: null }
          : { startDateTime: iso(now - 7_200_000), endDateTime: iso(now - 3_600_000), restTimeSeconds: null };
    return makePlan({ id, title: `Plan ${id}`, status, serverNow: iso(now), ...window, ...changes });
  }

  function create(): void {
    fixture = TestBed.createComponent(PlansPage);
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
    highlighted = signal<ReadonlySet<number>>(new Set());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
        { provide: PlanStartWatcherService, useValue: { highlighted, started$: started.asObservable() } },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => ctrl.verify());

  it('groups into Active & Upcoming (in progress first, then upcoming, by priority) and Completed / History (end desc)', fakeAsync(() => {
    create();
    const now = Date.now();
    expectList().flush([
      plan(1, 'Completed', { endDateTime: iso(now - 7_200_000), progressPercent: 33 }),
      plan(2, 'NotStarted', { priorityOrder: 1 }),
      plan(3, 'InProgress', { priorityOrder: 2 }),
      plan(4, 'InProgress', { priorityOrder: 1 }),
      plan(5, 'Completed', { endDateTime: iso(now - 60_000) }),
      plan(6, 'NotStarted', { priorityOrder: 0 }),
    ]);
    fixture.detectChanges();

    const headings = Array.from(el().querySelectorAll('h2.group__title')).map((h) => h.textContent!.trim());
    expect(headings).toEqual(['Active & Upcoming', 'Completed / History']);
    expect(ids('plans-active')).toEqual([4, 3]);
    expect(ids('plans-upcoming')).toEqual([6, 2]);
    expect(ids('plans-completed')).toEqual([5, 1]);
    // "Active & Upcoming" lists in-progress plans before upcoming ones.
    expect(ids('plans-group-current')).toEqual([4, 3, 6, 2]);

    const status = (id: number) => entry(id).querySelector('[data-testid="plan-status"]')!.textContent!.trim();
    expect([status(4), status(2), status(1)]).toEqual(['In progress', 'Not started', 'Completed']);
    expect(entry(4).querySelector('[data-testid="plan-rest-time"]')).not.toBeNull();
    expect(entry(2).querySelector('[data-testid="plan-rest-time"]')).toBeNull();
    expect(entry(2).querySelector('[data-testid="plan-starts"]')!.textContent).toContain('Starts ');
    expect(entry(1).querySelector('[data-testid="plan-ended"]')!.textContent).toContain('33% complete');
    expect(el().querySelector('[data-testid="plans-summary"]')!.textContent).toContain('2 in progress');
    finish();
  }));

  it('shows an empty state per group', fakeAsync(() => {
    create();
    expectList().flush([plan(1, 'Completed')]);
    fixture.detectChanges();
    const current = el().querySelector('[data-testid="plans-group-current"]')!;
    expect(current.querySelector('[data-testid="empty-state"]')!.textContent).toContain('No plans in progress or coming up');
    expect(el().querySelector('[data-testid="plans-group-completed"] [data-testid="empty-state"]')).toBeNull();
    finish();

    create();
    expectList().flush([plan(2, 'NotStarted')]);
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="plans-group-current"] [data-testid="empty-state"]')).toBeNull();
    expect(el().querySelector('[data-testid="plans-group-completed"] [data-testid="empty-state"]')!.textContent).toContain(
      'Completed plans will appear here',
    );
    finish();
  }));

  it('item toggles move the plan between groups from the PATCH response (F6)', fakeAsync(() => {
    create();
    const items = [makeItem({ id: 11, sourceType: 'Habit' })];
    expectList().flush([plan(3, 'InProgress', { items })]);
    fixture.detectChanges();
    expect(ids('plans-active')).toEqual([3]);

    entry(3).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    ctrl.expectOne(`${BASE}/3/items/11`).flush(
      plan(3, 'Completed', { items: [makeItem({ id: 11, sourceType: 'Habit', isDone: true })], endDateTime: iso(Date.now() + 3_600_000) }),
    );
    fixture.detectChanges();
    expect(ids('plans-active')).toEqual([]);
    expect(ids('plans-completed')).toEqual([3]);
    expect(entry(3).querySelector('[data-testid="plan-status"]')!.textContent!.trim()).toBe('Completed');
    expect(entry(3).querySelector('[data-testid="plan-rest-time"]')).toBeNull();

    entry(3).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    ctrl.expectOne(`${BASE}/3/items/11`).flush(plan(3, 'InProgress', { items }));
    fixture.detectChanges();
    expect(ids('plans-active')).toEqual([3]);
    expect(entry(3).querySelector('[data-testid="plan-rest-time"]')).not.toBeNull();
    finish();
  }));

  it('refreshes every 60 s and on window focus (throttled); a failed refresh keeps the list (F7)', fakeAsync(() => {
    create();
    expectList().flush([plan(2, 'NotStarted')]);
    fixture.detectChanges();

    tick(PLANS_REFRESH_MS - 1);
    expectNoList();
    tick(1);
    expectList().flush([plan(2, 'InProgress')]);
    fixture.detectChanges();
    expect(ids('plans-active')).toEqual([2]);

    window.dispatchEvent(new Event('focus'));
    expectNoList(); // just loaded
    tick(PLANS_FOCUS_REFRESH_GAP_MS);
    window.dispatchEvent(new Event('focus'));
    expectList().flush({ title: 'Boom', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="error-state"]')).toBeNull();
    expect(ids('plans-active')).toEqual([2]);
    finish();
  }));

  it('refetches when a rest-time countdown reaches zero', fakeAsync(() => {
    create();
    const now = Date.now();
    expectList().flush([plan(4, 'InProgress', { endDateTime: iso(now + 2_000), restTimeSeconds: 2 })]);
    fixture.detectChanges();
    tick(1_000);
    expectNoList();
    tick(1_000);
    expectList().flush([plan(4, 'Completed', { endDateTime: iso(now + 2_000) })]);
    fixture.detectChanges();
    expect(ids('plans-completed')).toEqual([4]);
    finish();
  }));

  it('applies the fresh list from the watcher on a start and highlights the started plan', fakeAsync(() => {
    create();
    expectList().flush([plan(2, 'NotStarted'), plan(5, 'NotStarted')]);
    fixture.detectChanges();
    expect(entry(2).getAttribute('data-highlighted')).toBe('false');

    const fresh = [plan(2, 'InProgress'), plan(5, 'NotStarted')];
    highlighted.set(new Set([2, 5]));
    started.next({ started: [fresh[0]], plans: fresh });
    fixture.detectChanges();
    expectNoList(); // no extra request
    expect(ids('plans-active')).toEqual([2]);
    expect(entry(2).getAttribute('data-highlighted')).toBe('true');
    expect(entry(2).classList.contains('entry--highlight')).toBeTrue();
    // Only in-progress plans are highlighted.
    expect(entry(5).getAttribute('data-highlighted')).toBe('false');
    finish();
  }));
});
