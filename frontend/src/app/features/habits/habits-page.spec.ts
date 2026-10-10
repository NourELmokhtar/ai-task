import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';
import { todayLocal } from '../../shared/utils/date-utils';
import { HabitsPage } from './habits-page';
import { makeHabit } from './testing/habit-fixtures';

describe('HabitsPage', () => {
  let fixture: ComponentFixture<HabitsPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  const today = todayLocal();
  const el = () => fixture.nativeElement as HTMLElement;
  const BASE = 'http://api.test/api/habits';
  const expectList = (): TestRequest => ctrl.expectOne((r) => r.url === BASE && r.method === 'GET');
  const cards = () => Array.from(el().querySelectorAll<HTMLElement>('[data-testid="habit-card"]'));
  const toggleOf = (name: string) =>
    el().querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="Mark ${name} as done today"]`)!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(HabitsPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    ctrl.verify();
    toast.clear();
  });

  it('shows loading, then the "Add Habit" empty state when there are no habits', () => {
    expect(el().querySelector('[data-testid="loading-state"]')).not.toBeNull();
    const req = expectList();
    expect(req.request.params.get('today')).toBe(today);
    expect(req.request.params.has('active')).toBeFalse();
    req.flush([]);
    fixture.detectChanges();
    const empty = el().querySelector('[data-testid="empty-state"]')!;
    expect(empty.textContent).toContain('No habits yet');
    const cta = empty.querySelector('button')!;
    expect(cta.textContent).toContain('Add Habit');
    cta.click();
    fixture.detectChanges();
    expect(el().querySelector('dialog')!.open).toBeTrue();
  });

  it('renders active habits, then inactive ones in an "Inactive" section', () => {
    expectList().flush([
      makeHabit({ id: 1, name: 'A', completedToday: true }),
      makeHabit({ id: 2, name: 'B', isActive: false }),
      makeHabit({ id: 3, name: 'C' }),
    ]);
    fixture.detectChanges();
    expect(cards().map((c) => c.dataset['habitId'])).toEqual(['1', '3', '2']);
    const inactive = el().querySelector('[data-testid="inactive-habits"]')!;
    expect(inactive.textContent).toContain('B');
    expect(toggleOf('B').disabled).toBeTrue();
    expect(el().querySelector('[data-testid="habits-summary"]')!.textContent).toContain('2 active · 1 done today');
  });

  it('shows an error state with retry', () => {
    expectList().flush({ title: 'Server error', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const error = el().querySelector('[data-testid="error-state"]')!;
    expect(error.textContent).toContain("Couldn't load habits");
    error.querySelector('button')!.click();
    expectList().flush([]);
  });

  it('toggle on posts the completion, refetches and shows done + streak', () => {
    expectList().flush([makeHabit({ id: 3, name: 'C' })]);
    fixture.detectChanges();
    toggleOf('C').click();
    ctrl.expectOne(`${BASE}/3/completions?today=${today}`).flush(
      { id: 1, habitId: 3, date: today, createdAt: 'x' },
      { status: 201, statusText: 'Created' },
    );
    ctrl.expectOne(`${BASE}/3?today=${today}`).flush(makeHabit({ id: 3, name: 'C', completedToday: true, currentStreak: 1 }));
    fixture.detectChanges();
    expect(toggleOf('C').checked).toBeTrue();
    expect(el().querySelector('[data-testid="habit-streak"]')!.textContent).toContain('1 day');
    expect(toast.toasts().map((t) => t.message)).toEqual(['Marked as done today']);
  });

  it('toggle on with a 409 shows done without an error toast', () => {
    expectList().flush([makeHabit({ id: 3, name: 'C' })]);
    fixture.detectChanges();
    toggleOf('C').click();
    ctrl.expectOne(`${BASE}/3/completions?today=${today}`).flush(
      { title: 'Conflict', status: 409, detail: 'already completed' },
      { status: 409, statusText: 'Conflict' },
    );
    ctrl.expectOne(`${BASE}/3?today=${today}`).flush(makeHabit({ id: 3, name: 'C', completedToday: true, currentStreak: 1 }));
    fixture.detectChanges();
    expect(toggleOf('C').checked).toBeTrue();
    expect(toast.toasts().some((t) => t.kind === 'error')).toBeFalse();
  });

  it('toggle off deletes today\'s completion; a failure reverts the box and toasts', () => {
    expectList().flush([makeHabit({ id: 3, name: 'C', completedToday: true })]);
    fixture.detectChanges();
    toggleOf('C').click();
    fixture.detectChanges(); // as after a real click event: optimistic unchecked + busy
    expect(toggleOf('C').checked).toBeFalse();
    expect(toggleOf('C').disabled).toBeTrue();
    ctrl.expectOne(`${BASE}/3/completions/${today}`).flush(
      { title: 'Server error', status: 500, detail: 'boom' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();
    expect(toggleOf('C').checked).toBeTrue();
    expect(toast.toasts()[0].message).toContain('boom');
  });

  it('deactivate replaces the habit in place and moves it to the Inactive section', () => {
    expectList().flush([makeHabit({ id: 3, name: 'C' })]);
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('button[aria-label="Deactivate C"]')!.click();
    const req = ctrl.expectOne(`${BASE}/3/deactivate?today=${today}`);
    expect(req.request.method).toBe('POST');
    req.flush(makeHabit({ id: 3, name: 'C', isActive: false }));
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="inactive-habits"]')!.textContent).toContain('C');
    expect(toast.toasts().map((t) => t.message)).toEqual(['Habit deactivated']);
  });

  it('remove asks for confirmation, then deletes', () => {
    expectList().flush([makeHabit({ id: 3, name: 'C' })]);
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('button[aria-label="Remove C"]')!.click();
    fixture.detectChanges();
    const confirm = Array.from(el().querySelectorAll('dialog')).find((d) => d.open)!;
    expect(confirm.textContent).toContain('"C"');
    Array.from(confirm.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Remove')!.click();
    const req = ctrl.expectOne(`${BASE}/3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(cards().length).toBe(0);
    expect(toast.toasts().map((t) => t.message)).toEqual(['Habit removed']);
  });
});
