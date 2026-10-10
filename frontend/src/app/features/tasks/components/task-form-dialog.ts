import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { toApiError } from '../../../core/api/api-error';
import { Dialog } from '../../../shared/components/dialog';
import { FieldErrors } from '../../../shared/forms/field-errors';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { ToastService } from '../../../shared/toast/toast.service';
import { createTaskForm, taskFormValue, toTaskRequest } from '../task-form';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, TaskDto } from '../tasks.models';
import { TasksApi } from '../tasks-api.service';

let nextFormId = 0;

/**
 * Add/Edit Task dialog. Saves through `TasksApi`, shows a toast and emits `saved`.
 * Client validation mirrors BR-01..03; server field errors (400) are shown on the fields.
 *
 * Reusable (M08 quick-add): `<app-task-form-dialog [(open)]="addOpen" (saved)="reload()" />`.
 * Pass `[task]="t"` to edit an existing task, `defaultDueDate` to prefill a new one.
 */
@Component({
  selector: 'app-task-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog, ReactiveFormsModule, FieldErrors],
  template: `
    <app-dialog [(open)]="open" [title]="task() ? 'Edit Task' : 'Add Task'" [closeOnBackdrop]="false">
      <form [id]="id" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (formError()) {
          <p class="form-error" role="alert" data-testid="form-error">{{ formError() }}</p>
        }
        <div class="form-field">
          <label [for]="id + '-title'">Title</label>
          <input
            [id]="id + '-title'"
            type="text"
            formControlName="title"
            autocomplete="off"
            autofocus
            [attr.aria-describedby]="id + '-title-errors'"
          />
          <app-field-errors [control]="form.controls.title" label="Title" [errorId]="id + '-title-errors'" />
        </div>
        <div class="form-field">
          <label [for]="id + '-description'">Description</label>
          <textarea
            [id]="id + '-description'"
            rows="3"
            formControlName="description"
            [attr.aria-describedby]="id + '-description-errors'"
          ></textarea>
          <app-field-errors
            [control]="form.controls.description"
            label="Description"
            [errorId]="id + '-description-errors'"
          />
        </div>
        <div class="row">
          <div class="form-field">
            <label [for]="id + '-status'">Status</label>
            <select [id]="id + '-status'" formControlName="status">
              @for (s of statuses; track s) {
                <option [value]="s">{{ statusLabels[s] }}</option>
              }
            </select>
            <app-field-errors [control]="form.controls.status" label="Status" />
          </div>
          <div class="form-field">
            <label [for]="id + '-priority'">Priority</label>
            <select [id]="id + '-priority'" formControlName="priority">
              @for (p of priorities; track p) {
                <option [value]="p">{{ priorityLabels[p] }}</option>
              }
            </select>
            <app-field-errors [control]="form.controls.priority" label="Priority" />
          </div>
          <div class="form-field">
            <label [for]="id + '-due'">Due date</label>
            <input [id]="id + '-due'" type="date" formControlName="dueDate" />
            <app-field-errors [control]="form.controls.dueDate" label="Due date" />
          </div>
        </div>
      </form>
      <ng-container dialog-actions>
        <button type="button" class="btn" (click)="open.set(false)">Cancel</button>
        <button type="submit" class="btn btn--primary" [attr.form]="id" [disabled]="saving()">
          {{ saving() ? 'Saving…' : task() ? 'Save changes' : 'Add Task' }}
        </button>
      </ng-container>
    </app-dialog>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: 0 0.75rem;
    }
    .form-error {
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius);
      background: var(--danger-soft);
      color: var(--danger);
    }
  `,
})
export class TaskFormDialog {
  private readonly api = inject(TasksApi);
  private readonly toast = inject(ToastService);

  readonly open = model(false);
  /** Task to edit; `null` creates a new one. */
  readonly task = input<TaskDto | null>(null);
  /** Prefilled due date (`YYYY-MM-DD`) for new tasks. */
  readonly defaultDueDate = input<string>('');
  /** Emits the created/updated task after a successful save. */
  readonly saved = output<TaskDto>();

  protected readonly id = `task-form-${nextFormId++}`;
  protected readonly form = createTaskForm();
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statusLabels = TASK_STATUS_LABELS;
  protected readonly priorityLabels = TASK_PRIORITY_LABELS;

  constructor() {
    // Reset the form each time the dialog opens (or the edited task changes while open).
    effect(() => {
      if (!this.open()) return;
      const task = this.task();
      const dueDate = this.defaultDueDate();
      untracked(() => {
        this.form.reset(taskFormValue(task, { dueDate }));
        this.formError.set(null);
        this.saving.set(false);
      });
    });
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const task = this.task();
    const body = toTaskRequest(this.form);
    this.saving.set(true);
    this.formError.set(null);
    const request = task ? this.api.update(task.id, body) : this.api.create(body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(task ? 'Task updated' : 'Task created');
        this.saved.emit(saved);
        this.open.set(false);
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        this.saving.set(false);
        if (err.isValidationError && err.hasFieldErrors) {
          const rest = applyServerErrors(this.form, err);
          this.formError.set(rest.length ? rest.join(' ') : null);
        } else {
          this.formError.set(err.message);
          this.toast.error(task ? `Couldn't update the task: ${err.message}` : `Couldn't create the task: ${err.message}`);
        }
      },
    });
  }
}
