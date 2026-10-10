import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskDto } from '../tasks.models';
import { makeTask } from '../testing/task-fixtures';
import { TaskItem } from './task-item';

@Component({
  imports: [TaskItem],
  template: `
    <app-task-item
      [task]="task()"
      [busy]="busy()"
      (completeChange)="changes.push($event)"
      (archive)="events.push('archive')"
      (restore)="events.push('restore')"
      (delete)="events.push('delete')"
      (edit)="events.push('edit')"
    />
  `,
})
class HostComponent {
  readonly task = signal<TaskDto>(makeTask({ title: 'Pay rent' }));
  readonly busy = signal(false);
  changes: boolean[] = [];
  events: string[] = [];
}

describe('TaskItem', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const box = () => el().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const button = (name: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === name);

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders title, badges and due date', () => {
    host.task.set(makeTask({ title: 'Pay rent', status: 'InProgress', priority: 'High', dueDate: '2026-10-20' }));
    fixture.detectChanges();
    expect(el().textContent).toContain('Pay rent');
    expect(el().querySelector('[data-testid="task-status"]')!.textContent).toContain('In progress');
    expect(el().querySelector('[data-testid="task-priority"]')!.textContent).toContain('High priority');
    expect(el().querySelector('[data-testid="task-due"]')!.textContent).toContain('2026');
    expect(el().querySelector('[data-testid="task-overdue"]')).toBeNull();
    expect(box().getAttribute('aria-label')).toBe('Mark Pay rent as done');
  });

  it('highlights overdue tasks', () => {
    host.task.set(makeTask({ dueDate: '2026-10-09', isOverdue: true }));
    fixture.detectChanges();
    expect(el().querySelector('.task--overdue')).not.toBeNull();
    expect(el().querySelector('[data-testid="task-overdue"]')!.textContent).toContain('Overdue');
  });

  it('emits completeChange both ways and reverts the box if the request fails', () => {
    box().click();
    expect(host.changes).toEqual([true]);
    host.busy.set(true);
    fixture.detectChanges();
    expect(box().checked).toBeTrue(); // optimistic while busy
    host.busy.set(false); // failed: task unchanged
    fixture.detectChanges();
    expect(box().checked).toBeFalse();

    host.task.set(makeTask({ status: 'Done' }));
    fixture.detectChanges();
    expect(box().checked).toBeTrue();
    expect(el().querySelector('.task--done')).not.toBeNull();
    box().click();
    expect(host.changes).toEqual([true, false]);
  });

  it('shows Archive for active tasks and Restore for archived ones', () => {
    button('Edit')!.click();
    button('Archive')!.click();
    button('Delete')!.click();
    expect(button('Restore')).toBeUndefined();
    host.task.set(makeTask({ isArchived: true }));
    fixture.detectChanges();
    button('Restore')!.click();
    expect(button('Archive')).toBeUndefined();
    expect(host.events).toEqual(['edit', 'archive', 'delete', 'restore']);
  });
});
