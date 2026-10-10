import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';
import { filterOptions } from './components/plan-item-picker';
import { PlanBuilderPage } from './plan-builder-page';
import { makePlan, threeItems } from './testing/plan-fixtures';

const API = 'http://api.test';

describe('filterOptions', () => {
  const options = [
    { id: 1, title: 'Write Report', hint: '' },
    { id: 2, title: 'Read book', hint: '' },
  ];
  it('filters case-insensitively by title; blank keeps all', () => {
    expect(filterOptions(options, 'report').map((o) => o.id)).toEqual([1]);
    expect(filterOptions(options, '  ').map((o) => o.id)).toEqual([1, 2]);
    expect(filterOptions(options, 'xyz')).toEqual([]);
  });
});

describe('PlanBuilderPage', () => {
  let fixture: ComponentFixture<PlanBuilderPage>;
  let ctrl: HttpTestingController;
  let toast: ToastService;
  let navigate: jasmine.Spy;
  const el = () => fixture.nativeElement as HTMLElement;
  const input = (sel: string) => el().querySelector<HTMLInputElement>(sel)!;
  const typeInto = (i: HTMLInputElement, value: string) => {
    i.value = value;
    i.dispatchEvent(new Event('input'));
  };
  const section = (type: string) => el().querySelector<HTMLElement>(`[data-testid="picker-section"][data-type="${type}"]`)!;
  const submit = () => {
    el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  function setup(id?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(PlanBuilderPage);
    if (id !== undefined) fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
  }

  /** Answers the picker's three list requests. */
  function flushPicker() {
    const tasks = ctrl.expectOne((r) => r.url === `${API}/api/tasks`);
    expect(tasks.request.params.has('archived')).toBeFalse();
    tasks.flush([
      { id: 42, title: 'Write report', status: 'Todo' },
      { id: 43, title: 'Plan sprint', status: 'Done' },
    ]);
    const habits = ctrl.expectOne((r) => r.url === `${API}/api/habits`);
    expect(habits.request.params.get('active')).toBe('true');
    habits.flush([{ id: 16, name: 'Stretch', frequency: 'Daily' }]);
    ctrl.expectOne(`${API}/api/learning-cards`).flush([{ id: 3, title: 'Clean Code', status: 'InProgress' }]);
    fixture.detectChanges();
  }

  const check = (type: string, title: string) => {
    const label = Array.from(section(type).querySelectorAll<HTMLLabelElement>('label.option')).find((l) =>
      l.textContent!.includes(title),
    )!;
    label.querySelector<HTMLInputElement>('input')!.click();
    fixture.detectChanges();
  };

  afterEach(() => {
    ctrl.verify();
    toast.clear();
  });

  describe('create mode', () => {
    beforeEach(() => {
      setup();
      flushPicker();
    });

    it('lists the three sections and filters by search', () => {
      expect(el().querySelector('h1')!.textContent).toContain('Create Plan');
      expect(section('Task').querySelectorAll('label.option').length).toBe(2);
      expect(section('Habit').textContent).toContain('Stretch');
      expect(section('LearningResource').textContent).toContain('Clean Code');
      typeInto(section('Task').querySelector<HTMLInputElement>('input[type="search"]')!, 'SPRINT');
      fixture.detectChanges();
      const titles = Array.from(section('Task').querySelectorAll('.option__title')).map((e) => e.textContent);
      expect(titles).toEqual(['Plan sprint']);
    });

    it('selecting items updates the summary; chips remove them', () => {
      check('Task', 'Write report');
      check('Habit', 'Stretch');
      const summary = el().querySelector<HTMLElement>('[data-testid="selected-items"]')!;
      expect(summary.getAttribute('data-count')).toBe('2');
      expect(summary.textContent).toContain('2 items selected');
      summary.querySelector<HTMLButtonElement>('button[aria-label="Remove Stretch from plan"]')!.click();
      fixture.detectChanges();
      expect(summary.getAttribute('data-count')).toBe('1');
      expect(section('Habit').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBeFalse();
    });

    it('blocks submit without items and with end before start', () => {
      typeInto(input('#plan-title'), 'Plan');
      typeInto(input('#plan-start'), '2026-10-11T10:00');
      typeInto(input('#plan-end'), '2026-10-11T09:00');
      submit();
      expect(el().textContent).toContain('At least one item is required.');
      expect(el().textContent).toContain('End date/time must be after the start date/time.');
      expect(el().querySelector('[data-testid="form-error"]')!.textContent).toContain('Please fix the highlighted fields.');
      ctrl.expectNone(`${API}/api/plans`);
    });

    it('creates the plan with UTC times and items in selection order, then returns to /plans', () => {
      typeInto(input('#plan-title'), ' Morning ');
      typeInto(input('input[aria-label="Hours"]'), '2');
      typeInto(input('input[aria-label="Minutes"]'), '15');
      typeInto(input('#plan-start'), '2026-10-11T09:00');
      typeInto(input('#plan-end'), '2026-10-11T12:00');
      typeInto(input('#plan-priority'), '3');
      check('LearningResource', 'Clean Code');
      check('Task', 'Write report');
      submit();
      const req = ctrl.expectOne(`${API}/api/plans`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        title: 'Morning',
        estimatedDurationMinutes: 135,
        startDateTime: new Date(2026, 9, 11, 9, 0).toISOString(),
        endDateTime: new Date(2026, 9, 11, 12, 0).toISOString(),
        priorityOrder: 3,
        items: [
          { sourceType: 'LearningResource', sourceId: 3 },
          { sourceType: 'Task', sourceId: 42 },
        ],
      });
      req.flush(makePlan(), { status: 201, statusText: 'Created' });
      expect(toast.toasts().map((t) => t.message)).toContain('Plan created');
      expect(navigate).toHaveBeenCalledWith(['/plans']);
    });

    it('maps a server items[i] error to the selected item in the summary', () => {
      typeInto(input('#plan-title'), 'Morning');
      check('Task', 'Write report');
      check('Habit', 'Stretch');
      submit();
      ctrl.expectOne(`${API}/api/plans`).flush(
        {
          title: 'One or more validation errors occurred.',
          status: 400,
          errors: { 'items[1].sourceId': ["Habit with id '16' does not exist or has been deleted."] },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="form-error"]')!.textContent).toContain(
        `Item 2 (Habit "Stretch"): Habit with id '16' does not exist or has been deleted.`,
      );
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    beforeEach(() => setup('7'));

    it('loads the plan, shows items read-only and PUTs metadata only', () => {
      expect(el().querySelector('[data-testid="loading-state"]')).not.toBeNull();
      const start = new Date(2026, 9, 11, 9, 0);
      const end = new Date(2026, 9, 11, 10, 30);
      ctrl.expectOne(`${API}/api/plans/7`).flush(
        makePlan({
          id: 7,
          title: 'Morning',
          estimatedDurationMinutes: 75,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          priorityOrder: 2,
          items: threeItems(),
        }),
      );
      fixture.detectChanges();
      expect(el().querySelector('h1')!.textContent).toContain('Edit Plan');
      expect(input('#plan-title').value).toBe('Morning');
      expect(input('#plan-start').value).toBe('2026-10-11T09:00');
      expect(input('input[aria-label="Hours"]').value).toBe('1');
      expect(input('input[aria-label="Minutes"]').value).toBe('15');
      expect(el().querySelector('app-plan-item-picker')).toBeNull();
      expect(el().querySelectorAll('[data-testid="readonly-items"] li').length).toBe(3);

      typeInto(input('#plan-priority'), '5');
      submit();
      const req = ctrl.expectOne(`${API}/api/plans/7`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        title: 'Morning',
        estimatedDurationMinutes: 75,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        priorityOrder: 5,
      });
      req.flush(makePlan({ id: 7, priorityOrder: 5 }));
      expect(toast.toasts().map((t) => t.message)).toContain('Plan updated');
      expect(navigate).toHaveBeenCalledWith(['/plans']);
    });

    it('shows an error state when the plan is missing', () => {
      ctrl.expectOne(`${API}/api/plans/7`).flush(
        { title: 'Not Found', status: 404, detail: "Plan with id '7' was not found." },
        { status: 404, statusText: 'Not Found' },
      );
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="error-state"]')!.textContent).toContain("Plan with id '7' was not found.");
    });
  });
});
