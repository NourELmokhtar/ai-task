import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { formatDate } from '../../../shared/utils/date-utils';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TaskDto } from '../tasks.models';

/**
 * One task row: complete checkbox, title, status/priority badges, due date, overdue highlight,
 * and (optionally) edit / archive|restore / delete buttons. Presentational only: the parent
 * performs the API calls (e.g. `TasksApi.setCompleted(task, done)`).
 *
 * Reusable (M08 dashboard): `<app-task-item [task]="t" [actions]="false" (completeChange)="toggle(t, $event)" />`.
 */
@Component({
  selector: 'app-task-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = task();
    <div
      class="task"
      [class.task--done]="done()"
      [class.task--overdue]="t.isOverdue"
      [class.task--archived]="t.isArchived"
      data-testid="task-item"
      [attr.data-task-id]="t.id"
    >
      <input
        type="checkbox"
        class="task__check"
        [checked]="checked()"
        [disabled]="busy()"
        [attr.aria-label]="'Mark ' + t.title + ' as done'"
        (change)="onToggle($event)"
      />
      <div class="task__main">
        <span class="task__title">{{ t.title }}</span>
        @if (t.description) {
          <p class="task__desc">{{ t.description }}</p>
        }
        <div class="task__meta">
          <span class="badge" [attr.data-status]="t.status" data-testid="task-status">{{ statusLabel() }}</span>
          <span class="badge" [attr.data-priority]="t.priority" data-testid="task-priority">{{ priorityLabel() }} priority</span>
          @if (t.dueDate) {
            <span class="task__due" data-testid="task-due">Due {{ dueLabel() }}</span>
          }
          @if (t.isOverdue) {
            <span class="badge badge--overdue" data-testid="task-overdue">Overdue</span>
          }
          @if (t.isArchived) {
            <span class="badge">Archived</span>
          }
        </div>
      </div>
      @if (actions()) {
        <div class="task__actions">
          <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Edit ' + t.title" (click)="edit.emit()">Edit</button>
          @if (t.isArchived) {
            <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Restore ' + t.title" (click)="restore.emit()">Restore</button>
          } @else {
            <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Archive ' + t.title" (click)="archive.emit()">Archive</button>
          }
          <button type="button" class="btn btn--small btn--ghost-danger" [disabled]="busy()" [attr.aria-label]="'Delete ' + t.title" (click)="delete.emit()">Delete</button>
        </div>
      }
    </div>
  `,
  styles: `
    .task {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--border);
      border-radius: var(--radius);
    }
    .task--overdue {
      border-left-color: var(--danger);
      background: var(--danger-soft);
    }
    .task--archived { opacity: 0.75; }
    .task__check { width: 1.1rem; height: 1.1rem; margin-top: 0.2rem; flex-shrink: 0; cursor: pointer; }
    .task__main { flex: 1; min-width: 0; }
    .task__title { font-weight: 600; overflow-wrap: anywhere; }
    .task--done .task__title { text-decoration: line-through; color: var(--text-muted); }
    .task__desc {
      margin: 0.15rem 0 0;
      color: var(--text-muted);
      font-size: 0.9rem;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .task__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-top: 0.35rem; font-size: 0.8rem; }
    .task__due { color: var(--text-muted); }
    .task--overdue .task__due { color: var(--danger); font-weight: 600; }
    .badge { padding: 0.05rem 0.5rem; border-radius: 999px; background: var(--hover); color: var(--text-muted); font-weight: 600; }
    [data-status='InProgress'] { background: var(--primary-soft); color: var(--primary); }
    [data-status='Done'] { background: #e3f4ea; color: var(--success); }
    [data-priority='Medium'] { background: var(--warning-bg); color: var(--warning-fg); }
    [data-priority='High'] { background: var(--danger-soft); color: var(--danger); }
    .badge--overdue { background: var(--danger); color: #fff; }
    .task__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.35rem; }
    .btn--ghost-danger { color: var(--danger); }
    @media (max-width: 640px) {
      .task { flex-wrap: wrap; }
      .task__actions { width: 100%; justify-content: flex-start; padding-left: 1.85rem; }
    }
  `,
})
export class TaskItem {
  readonly task = input.required<TaskDto>();
  /** Disables the controls while a request for this task is running. */
  readonly busy = input(false);
  /** Show the edit / archive / restore / delete buttons. */
  readonly actions = input(true);

  /** `true` = mark done, `false` = back to To do. */
  readonly completeChange = output<boolean>();
  readonly edit = output<void>();
  readonly archive = output<void>();
  readonly restore = output<void>();
  readonly delete = output<void>();

  protected readonly done = computed(() => this.task().status === 'Done');
  /**
   * Checkbox state: optimistic while `busy`, otherwise follows the task. When a request fails the
   * parent clears `busy` without changing the task, so the box reverts.
   */
  protected readonly checked = linkedSignal<{ task: TaskDto; busy: boolean }, boolean>({
    source: () => ({ task: this.task(), busy: this.busy() }),
    computation: (src, prev) => (src.busy && prev ? prev.value : src.task.status === 'Done'),
  });
  protected readonly statusLabel = computed(() => TASK_STATUS_LABELS[this.task().status]);
  protected readonly priorityLabel = computed(() => TASK_PRIORITY_LABELS[this.task().priority]);
  protected readonly dueLabel = computed(() => formatDate(this.task().dueDate));

  protected onToggle(event: Event): void {
    const wanted = (event.target as HTMLInputElement).checked;
    this.checked.set(wanted);
    this.completeChange.emit(wanted);
  }
}
