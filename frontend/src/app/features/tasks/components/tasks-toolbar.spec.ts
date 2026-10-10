import { Component, signal } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { DEFAULT_TASK_FILTERS, TaskFilters } from '../tasks.models';
import { TasksToolbar } from './tasks-toolbar';

@Component({
  imports: [TasksToolbar],
  template: `<app-tasks-toolbar [(filters)]="filters" />`,
})
class HostComponent {
  readonly filters = signal<TaskFilters>({ ...DEFAULT_TASK_FILTERS });
}

describe('TasksToolbar', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const control = <T extends HTMLElement>(label: string): T => {
    const l = Array.from(el().querySelectorAll('label')).find((x) => x.textContent?.trim() === label)!;
    return el().querySelector<T>(`#${l.htmlFor}`)!;
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debounces search input', fakeAsync(() => {
    const search = control<HTMLInputElement>('Search');
    for (const v of ['r', 're', 'rep']) {
      search.value = v;
      search.dispatchEvent(new Event('input'));
      tick(100);
    }
    expect(host.filters().search).toBe('');
    tick(300);
    expect(host.filters().search).toBe('rep');
  }));

  it('updates status, priority and due filters immediately and shows the range inputs', () => {
    const select = (label: string, value: string) => {
      const s = control<HTMLSelectElement>(label);
      s.value = value;
      s.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    select('Status', 'Done');
    select('Priority', 'High');
    select('Sort by', 'dueDate:asc');
    expect(host.filters()).toEqual(
      jasmine.objectContaining({ status: 'Done', priority: 'High', sort: 'dueDate:asc' }),
    );

    expect(el().querySelector('input[type="date"]')).toBeNull();
    select('Due', 'range');
    expect(el().querySelectorAll('input[type="date"]').length).toBe(2);

    host.filters.update((f) => ({ ...f, dueFrom: '2026-10-20', dueTo: '2026-10-01' }));
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('on or after');
  });

  it('toggles "Show archived" and clears filters (keeping sort)', () => {
    const archived = el().querySelector<HTMLInputElement>('.toggle input')!;
    archived.click();
    fixture.detectChanges();
    expect(host.filters().showArchived).toBeTrue();
    host.filters.update((f) => ({ ...f, sort: 'createdAt:asc', status: 'Todo' }));
    fixture.detectChanges();

    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Clear filters')!.click();
    expect(host.filters()).toEqual({ ...DEFAULT_TASK_FILTERS, sort: 'createdAt:asc' });
  });
});
