import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { apiErrorInterceptor } from '../../../core/api/api-error.interceptor';
import { ToastService } from '../../../shared/toast/toast.service';
import { TaskDto } from '../tasks.models';
import { makeTask } from '../testing/task-fixtures';
import { TaskFormDialog } from './task-form-dialog';

@Component({
  imports: [TaskFormDialog],
  template: `<app-task-form-dialog [(open)]="open" [task]="task()" (saved)="saved.push($event)" />`,
})
class HostComponent {
  readonly open = signal(false);
  readonly task = signal<TaskDto | null>(null);
  saved: TaskDto[] = [];
}

describe('TaskFormDialog', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let ctrl: HttpTestingController;
  let toast: ToastService;

  const el = () => fixture.nativeElement as HTMLElement;
  const input = (label: string) =>
    el().querySelector<HTMLInputElement>(`#${Array.from(el().querySelectorAll('label')).find((l) => l.textContent?.trim() === label)!.htmlFor}`)!;
  const submitButton = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const type = (label: string, value: string) => {
    const i = input(label);
    i.value = value;
    i.dispatchEvent(new Event('input'));
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

  function openWith(task: TaskDto | null) {
    host.task.set(task);
    host.open.set(true);
    fixture.detectChanges();
  }

  it('shows "Title is required." and sends nothing when submitted empty', () => {
    openWith(null);
    expect(el().querySelector('dialog')!.open).toBeTrue();
    submitButton().click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Title is required.');
    ctrl.expectNone(() => true);
  });

  it('creates a task with a trimmed body, toasts and closes', () => {
    openWith(null);
    type('Title', '  New task  ');
    submitButton().click();
    fixture.detectChanges();

    const req = ctrl.expectOne((r) => r.url === 'http://api.test/api/tasks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      title: 'New task',
      description: null,
      status: 'Todo',
      priority: 'Medium',
      dueDate: null,
    });
    req.flush(makeTask({ id: 9, title: 'New task' }), { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(host.saved.map((t) => t.id)).toEqual([9]);
    expect(host.open()).toBeFalse();
    expect(toast.toasts().map((t) => t.message)).toEqual(['Task created']);
  });

  it('edits with PUT and prefilled values', () => {
    openWith(makeTask({ id: 4, title: 'Old', priority: 'High', dueDate: '2026-10-20' }));
    expect(input('Title').value).toBe('Old');
    expect(input('Due date').value).toBe('2026-10-20');
    type('Title', 'Renamed');
    submitButton().click();

    const req = ctrl.expectOne((r) => r.url === 'http://api.test/api/tasks/4');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(
      jasmine.objectContaining({ title: 'Renamed', priority: 'High', dueDate: '2026-10-20' }),
    );
    req.flush(makeTask({ id: 4, title: 'Renamed' }));
    fixture.detectChanges();
    expect(toast.toasts().map((t) => t.message)).toEqual(['Task updated']);
  });

  it('shows server field errors on the matching fields and stays open', () => {
    openWith(null);
    type('Title', 'x');
    submitButton().click();
    ctrl.expectOne((r) => r.url === 'http://api.test/api/tasks').flush(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { title: ['Title is required.'], other: ['Something else.'] },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(host.open()).toBeTrue();
    expect(host.saved).toEqual([]);
    expect(el().textContent).toContain('Title is required.');
    expect(el().querySelector('[data-testid="form-error"]')?.textContent).toContain('Something else.');
  });
});
