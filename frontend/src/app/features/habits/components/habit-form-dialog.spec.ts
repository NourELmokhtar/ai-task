import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { apiErrorInterceptor } from '../../../core/api/api-error.interceptor';
import { ToastService } from '../../../shared/toast/toast.service';
import { HabitDto } from '../habits.models';
import { makeHabit } from '../testing/habit-fixtures';
import { HabitFormDialog } from './habit-form-dialog';

@Component({
  imports: [HabitFormDialog],
  template: `<app-habit-form-dialog [(open)]="open" [habit]="habit()" (saved)="saved.push($event)" />`,
})
class HostComponent {
  readonly open = signal(false);
  readonly habit = signal<HabitDto | null>(null);
  saved: HabitDto[] = [];
}

describe('HabitFormDialog', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  const URL = 'http://api.test/api/habits';

  const el = () => fixture.nativeElement as HTMLElement;
  const field = <T extends HTMLElement>(label: string) =>
    el().querySelector<T>(`#${Array.from(el().querySelectorAll('label')).find((l) => l.textContent?.trim() === label)!.htmlFor}`)!;
  const submitButton = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const type = (label: string, value: string) => {
    const i = field<HTMLInputElement>(label);
    i.value = value;
    i.dispatchEvent(new Event('input'));
  };
  const choose = (label: string, value: string) => {
    const s = field<HTMLSelectElement>(label);
    s.value = value;
    s.dispatchEvent(new Event('change'));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  afterEach(() => {
    ctrl.verify();
    toast.clear();
  });

  function openWith(habit: HabitDto | null) {
    host.habit.set(habit);
    host.open.set(true);
    fixture.detectChanges();
  }

  it('shows "Name is required." and sends nothing when submitted empty', () => {
    openWith(null);
    expect(el().querySelector('dialog')!.open).toBeTrue();
    expect(el().querySelector('.dialog__title')!.textContent).toContain('Add Habit');
    submitButton().click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Name is required.');
    ctrl.expectNone(() => true);
  });

  it('creates a weekly habit with a trimmed body, toasts and closes', () => {
    openWith(null);
    type('Name', '  Read  ');
    choose('Frequency', 'Weekly');
    submitButton().click();
    fixture.detectChanges();

    const req = ctrl.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Read', description: null, frequency: 'Weekly' });
    req.flush(makeHabit({ id: 9, name: 'Read', frequency: 'Weekly' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(host.saved.map((h) => h.id)).toEqual([9]);
    expect(host.open()).toBeFalse();
    expect(toast.toasts().map((t) => t.message)).toEqual(['Habit created']);
  });

  it('edits with PUT and prefilled values', () => {
    openWith(makeHabit({ id: 4, name: 'Old', description: 'desc', frequency: 'Weekly' }));
    expect(field<HTMLInputElement>('Name').value).toBe('Old');
    expect(field<HTMLSelectElement>('Frequency').value).toBe('Weekly');
    type('Name', 'Renamed');
    submitButton().click();

    const req = ctrl.expectOne((r) => r.url === `${URL}/4`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Renamed', description: 'desc', frequency: 'Weekly' });
    req.flush(makeHabit({ id: 4, name: 'Renamed' }));
    fixture.detectChanges();
    expect(toast.toasts().map((t) => t.message)).toEqual(['Habit updated']);
  });

  it('shows server field errors on the fields and stays open', () => {
    openWith(null);
    type('Name', 'x');
    submitButton().click();
    ctrl.expectOne((r) => r.url === URL).flush(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { name: ['Name must be at most 150 characters.'], frequency: ['Frequency must be one of: Daily, Weekly.'], other: ['Something else.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(host.open()).toBeTrue();
    expect(host.saved).toEqual([]);
    expect(el().textContent).toContain('Name must be at most 150 characters.');
    expect(el().textContent).toContain('Frequency must be one of: Daily, Weekly.');
    expect(el().querySelector('[data-testid="form-error"]')?.textContent).toContain('Something else.');
  });

  it('shows the problem detail for non-validation errors', () => {
    openWith(makeHabit({ id: 2, name: 'Gone' }));
    submitButton().click();
    ctrl.expectOne((r) => r.url === `${URL}/2`).flush(
      { title: 'Not Found', status: 404, detail: "Habit with id '2' was not found." },
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="form-error"]')?.textContent).toContain("Habit with id '2' was not found.");
    expect(toast.toasts()[0].message).toContain("Habit with id '2' was not found.");
  });
});
