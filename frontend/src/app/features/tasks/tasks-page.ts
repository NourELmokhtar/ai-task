import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { ToastService } from '../../shared/toast/toast.service';
import { todayLocal } from '../../shared/utils/date-utils';
import { TaskFormDialog } from './components/task-form-dialog';
import { TaskItem } from './components/task-item';
import { TasksToolbar } from './components/tasks-toolbar';
import {
  clearTaskFilters,
  DEFAULT_TASK_FILTERS,
  hasActiveFilters,
  TaskDto,
  TaskFilters,
  toTaskListQuery,
} from './tasks.models';
import { TasksApi } from './tasks-api.service';

/** /tasks: list, filter, create, edit, complete, archive/restore and delete tasks (M02). */
@Component({
  selector: 'app-tasks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TasksToolbar,
    TaskItem,
    TaskFormDialog,
    ConfirmDialog,
    EmptyState,
    LoadingState,
    ErrorState,
  ],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Tasks</h1>
        <button type="button" class="btn btn--primary" (click)="openCreate()">Add Task</button>
      </header>

      <app-tasks-toolbar [(filters)]="filters" />

      @if (error(); as err) {
        <app-error-state title="Couldn't load tasks" [message]="err.message" (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading-state message="Loading tasks…" />
      } @else if (tasks().length === 0) {
        @if (filtered()) {
          <app-empty-state
            title="No matching tasks"
            message="No tasks match the current filters."
            actionLabel="Clear filters"
            (action)="clearFilters()"
          />
        } @else {
          <app-empty-state
            title="No tasks yet"
            message="Create your first task to get started."
            actionLabel="Add Task"
            (action)="openCreate()"
          />
        }
      } @else {
        <p class="summary muted" aria-live="polite" data-testid="tasks-summary">
          {{ tasks().length }} {{ tasks().length === 1 ? 'task' : 'tasks' }}
          @if (loading()) {
            <span>· Updating…</span>
          }
        </p>
        <ul class="task-list" aria-label="Tasks">
          @for (t of tasks(); track t.id) {
            <li>
              <app-task-item
                [task]="t"
                [busy]="busy().has(t.id)"
                (completeChange)="toggleComplete(t, $event)"
                (edit)="openEdit(t)"
                (archive)="archive(t)"
                (restore)="restore(t)"
                (delete)="askDelete(t)"
              />
            </li>
          }
        </ul>
      }
    </section>

    <app-task-form-dialog [(open)]="formOpen" [task]="editing()" (saved)="onSaved($event)" />
    <app-confirm-dialog
      [(open)]="confirmOpen"
      title="Delete task?"
      [message]="deleteMessage()"
      confirmLabel="Delete"
      [danger]="true"
      (confirmed)="confirmDelete()"
    />
  `,
  styles: `
    .summary {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
    }
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class TasksPage {
  private readonly api = inject(TasksApi);
  private readonly toast = inject(ToastService);

  readonly filters = signal<TaskFilters>({ ...DEFAULT_TASK_FILTERS });
  protected readonly tasks = signal<TaskDto[]>([]);
  protected readonly loading = signal(false);
  /** True after the first successful load (until then the loading state is shown). */
  protected readonly loaded = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<ReadonlySet<number>>(new Set());
  protected readonly filtered = computed(() => hasActiveFilters(this.filters()));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<TaskDto | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly deleting = signal<TaskDto | null>(null);
  protected readonly deleteMessage = computed(
    () => `"${this.deleting()?.title ?? ''}" will be deleted. This can't be undone.`,
  );

  private loadSub?: Subscription;

  constructor() {
    // Reload whenever the filters change (search is already debounced by the toolbar).
    effect(() => {
      this.filters();
      untracked(() => this.load());
    });
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  load(): void {
    const query = toTaskListQuery(this.filters(), todayLocal());
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.loadSub = this.api.list(query).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e));
        this.loaded.set(false);
        this.loading.set(false);
      },
    });
  }

  protected clearFilters(): void {
    this.filters.update(clearTaskFilters);
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(task: TaskDto): void {
    this.editing.set(task);
    this.formOpen.set(true);
  }

  protected onSaved(saved: TaskDto): void {
    this.replace(saved);
    this.load();
  }

  protected toggleComplete(task: TaskDto, done: boolean): void {
    this.mutate(
      task,
      this.api.setCompleted(task, done),
      done ? 'Task completed' : 'Task marked as to do',
      "Couldn't update the task",
    );
  }

  protected archive(task: TaskDto): void {
    this.mutate(task, this.api.archive(task.id), 'Task archived', "Couldn't archive the task");
  }

  protected restore(task: TaskDto): void {
    this.mutate(task, this.api.restore(task.id), 'Task restored', "Couldn't restore the task");
  }

  protected askDelete(task: TaskDto): void {
    this.deleting.set(task);
    this.confirmOpen.set(true);
  }

  protected confirmDelete(): void {
    const task = this.deleting();
    if (!task) return;
    this.setBusy(task.id, true);
    this.api.delete(task.id).subscribe({
      next: () => {
        this.setBusy(task.id, false);
        this.tasks.update((list) => list.filter((t) => t.id !== task.id));
        this.toast.success('Task deleted');
        this.load();
      },
      error: (e: unknown) => this.onMutationError(task, e, "Couldn't delete the task"),
    });
  }

  /** Runs a row mutation: busy flag, in-place update, toast, then a reload so filters stay correct. */
  private mutate(task: TaskDto, request: Observable<TaskDto>, success: string, failure: string): void {
    this.setBusy(task.id, true);
    request.subscribe({
      next: (saved) => {
        this.replace(saved);
        this.setBusy(task.id, false);
        this.toast.success(success);
        this.load();
      },
      error: (e: unknown) => this.onMutationError(task, e, failure),
    });
  }

  private onMutationError(task: TaskDto, e: unknown, failure: string): void {
    const err = toApiError(e);
    this.setBusy(task.id, false);
    this.toast.error(`${failure}: ${err.message}`);
    if (err.isNotFound) this.load();
  }

  private replace(saved: TaskDto): void {
    this.tasks.update((list) => list.map((t) => (t.id === saved.id ? saved : t)));
  }

  private setBusy(id: number, busy: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
