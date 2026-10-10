import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../core/api/api-config';
import { apiErrorInterceptor } from '../../core/api/api-error.interceptor';
import { ToastService } from '../../shared/toast/toast.service';
import { TasksPage } from './tasks-page';
import { makeTask } from './testing/task-fixtures';

describe('TasksPage', () => {
  let fixture: ComponentFixture<TasksPage>;
  let ctrl: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const listUrl = 'http://api.test/api/tasks';
  const expectList = (): TestRequest => ctrl.expectOne((r) => r.url === listUrl && r.method === 'GET');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://api.test' },
      ],
    });
    ctrl = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TasksPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    ctrl.verify();
    TestBed.inject(ToastService).clear();
  });

  it('shows loading, then the "Add Task" empty state when there are no tasks', () => {
    expect(el().querySelector('[data-testid="loading-state"]')).not.toBeNull();
    const req = expectList();
    expect(req.request.params.get('sortBy')).toBe('createdAt');
    expect(req.request.params.get('today')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    req.flush([]);
    fixture.detectChanges();
    const empty = el().querySelector('[data-testid="empty-state"]')!;
    expect(empty.textContent).toContain('No tasks yet');
    expect(empty.querySelector('button')!.textContent).toContain('Add Task');
  });

  it('shows "Clear filters" when filters return nothing, and clearing reloads', () => {
    expectList().flush([makeTask()]);
    fixture.componentInstance.filters.update((f) => ({ ...f, status: 'Done' }));
    fixture.detectChanges();
    const filtered = expectList();
    expect(filtered.request.params.get('status')).toBe('Done');
    filtered.flush([]);
    fixture.detectChanges();

    const empty = el().querySelector('[data-testid="empty-state"]')!;
    expect(empty.textContent).toContain('No matching tasks');
    empty.querySelector('button')!.click();
    fixture.detectChanges();
    expect(expectList().request.params.has('status')).toBeFalse();
  });

  it('renders the list and an error state with retry', () => {
    expectList().flush([makeTask({ id: 1, title: 'A' }), makeTask({ id: 2, title: 'B' })]);
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="task-item"]').length).toBe(2);

    fixture.componentInstance.load();
    expectList().flush({ title: 'Server error', status: 500 }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const error = el().querySelector('[data-testid="error-state"]')!;
    expect(error).not.toBeNull();
    error.querySelector('button')!.click();
    expectList().flush([]);
  });

  it('completes a task via its checkbox and toasts', () => {
    expectList().flush([makeTask({ id: 3, title: 'C' })]);
    fixture.detectChanges();
    el().querySelector<HTMLInputElement>('input[type="checkbox"][aria-label="Mark C as done"]')!.click();
    const req = ctrl.expectOne('http://api.test/api/tasks/3/complete?today=' + expectToday());
    req.flush(makeTask({ id: 3, title: 'C', status: 'Done' }));
    expectList().flush([makeTask({ id: 3, title: 'C', status: 'Done' })]);
    fixture.detectChanges();
    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toEqual(['Task completed']);
    expect(el().querySelector<HTMLInputElement>('.task__check')!.checked).toBeTrue();
  });
});

function expectToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
