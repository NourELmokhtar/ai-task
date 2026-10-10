import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounce, Subject, timer } from 'rxjs';
import {
  clearTaskFilters,
  DUE_FILTER_OPTIONS,
  hasActiveFilters,
  isInvalidDueRange,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_SORT_OPTIONS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TaskFilters,
} from '../tasks.models';

let nextToolbarId = 0;

/**
 * Tasks toolbar: debounced search, status, priority, due-date filter (Any / Overdue / Due today /
 * Date range), sort and "Show archived". Two-way bound: `<app-tasks-toolbar [(filters)]="filters" />`.
 */
@Component({
  selector: 'app-tasks-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = filters();
    <div class="toolbar" role="search" aria-label="Filter tasks">
      <div class="field field--search">
        <label [for]="id + '-search'">Search</label>
        <input
          [id]="id + '-search'"
          class="input"
          type="search"
          placeholder="Search by title"
          autocomplete="off"
          [value]="f.search"
          (input)="searchInput.next($any($event.target).value)"
        />
      </div>
      <div class="field">
        <label [for]="id + '-status'">Status</label>
        <select [id]="id + '-status'" class="input" (change)="patch({ status: $any($event.target).value })">
          <option value="" [selected]="f.status === ''">All statuses</option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="f.status === s">{{ statusLabels[s] }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label [for]="id + '-priority'">Priority</label>
        <select [id]="id + '-priority'" class="input" (change)="patch({ priority: $any($event.target).value })">
          <option value="" [selected]="f.priority === ''">All priorities</option>
          @for (p of priorities; track p) {
            <option [value]="p" [selected]="f.priority === p">{{ priorityLabels[p] }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label [for]="id + '-due'">Due</label>
        <select [id]="id + '-due'" class="input" (change)="patch({ due: $any($event.target).value })">
          @for (o of dueOptions; track o.value) {
            <option [value]="o.value" [selected]="f.due === o.value">{{ o.label }}</option>
          }
        </select>
      </div>
      @if (f.due === 'range') {
        <div class="field">
          <label [for]="id + '-from'">From</label>
          <input [id]="id + '-from'" class="input" type="date" [value]="f.dueFrom" (change)="patch({ dueFrom: $any($event.target).value })" />
        </div>
        <div class="field">
          <label [for]="id + '-to'">To</label>
          <input [id]="id + '-to'" class="input" type="date" [value]="f.dueTo" (change)="patch({ dueTo: $any($event.target).value })" />
        </div>
      }
      <div class="field">
        <label [for]="id + '-sort'">Sort by</label>
        <select [id]="id + '-sort'" class="input" (change)="patch({ sort: $any($event.target).value })">
          @for (o of sortOptions; track o.value) {
            <option [value]="o.value" [selected]="f.sort === o.value">{{ o.label }}</option>
          }
        </select>
      </div>
      <label class="toggle">
        <input type="checkbox" [checked]="f.showArchived" (change)="patch({ showArchived: $any($event.target).checked })" />
        Show archived
      </label>
      @if (active()) {
        <button type="button" class="btn btn--small" (click)="clear()">Clear filters</button>
      }
    </div>
    @if (rangeInvalid()) {
      <p class="range-error" role="alert">The "To" date must be on or after the "From" date.</p>
    }
  `,
  styles: `
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 8.5rem;
      font-size: 0.85rem;
      label { font-weight: 500; color: var(--text-muted); }
    }
    .field--search { flex: 1 1 14rem; }
    .toggle { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.4rem; cursor: pointer; }
    .range-error { margin: -0.5rem 0 1rem; color: var(--danger); font-size: 0.85rem; }
    @media (max-width: 640px) {
      .field { flex: 1 1 45%; min-width: 0; }
    }
  `,
})
export class TasksToolbar {
  readonly filters = model.required<TaskFilters>();
  /** Search debounce in ms. */
  readonly debounceMs = input(300);

  protected readonly id = `tasks-toolbar-${nextToolbarId++}`;
  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statusLabels = TASK_STATUS_LABELS;
  protected readonly priorityLabels = TASK_PRIORITY_LABELS;
  protected readonly dueOptions = DUE_FILTER_OPTIONS;
  protected readonly sortOptions = TASK_SORT_OPTIONS;
  protected readonly active = computed(() => hasActiveFilters(this.filters()));
  protected readonly rangeInvalid = computed(() => isInvalidDueRange(this.filters()));
  protected readonly searchInput = new Subject<string>();

  constructor() {
    this.searchInput
      .pipe(
        debounce(() => timer(this.debounceMs())),
        takeUntilDestroyed(),
      )
      .subscribe((search) => {
        if (search !== this.filters().search) this.patch({ search });
      });
  }

  protected patch(changes: Partial<TaskFilters>): void {
    this.filters.update((f) => ({ ...f, ...changes }));
  }

  protected clear(): void {
    this.filters.update(clearTaskFilters);
  }
}
