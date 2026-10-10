import { FormControl, FormGroup, Validators } from '@angular/forms';
import { maxTrimmedLength, oneOf, optionalDateOnly, requiredTrimmed } from '../../shared/forms/validators';
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  TaskDto,
  TaskPriority,
  TaskStatus,
  UpdateTaskRequest,
} from './tasks.models';

// Generic validators now live in `shared/forms/validators.ts`; re-exported for existing imports.
export { maxTrimmedLength, oneOf, optionalDateOnly, requiredTrimmed };

export type TaskForm = FormGroup<{
  title: FormControl<string>;
  description: FormControl<string>;
  status: FormControl<TaskStatus>;
  priority: FormControl<TaskPriority>;
  dueDate: FormControl<string>;
}>;

/** Reactive form for creating/editing a task. Client rules mirror BR-01..03. */
export function createTaskForm(): TaskForm {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [requiredTrimmed, maxTrimmedLength(TASK_TITLE_MAX)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(TASK_DESCRIPTION_MAX)],
    }),
    status: new FormControl<TaskStatus>('Todo', {
      nonNullable: true,
      validators: [oneOf(TASK_STATUSES, 'Status')],
    }),
    priority: new FormControl<TaskPriority>('Medium', {
      nonNullable: true,
      validators: [oneOf(TASK_PRIORITIES, 'Priority')],
    }),
    dueDate: new FormControl('', { nonNullable: true, validators: [optionalDateOnly] }),
  });
}

/** Form values for a task (or the create defaults). */
export function taskFormValue(task?: TaskDto | null, defaults: { dueDate?: string } = {}) {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? ('Todo' as TaskStatus),
    priority: task?.priority ?? ('Medium' as TaskPriority),
    dueDate: task?.dueDate ?? defaults.dueDate ?? '',
  };
}

/** Request body from the form: trimmed text, empty description/dueDate sent as null. */
export function toTaskRequest(form: TaskForm): UpdateTaskRequest {
  const v = form.getRawValue();
  return {
    title: v.title.trim(),
    description: v.description.trim() || null,
    status: v.status,
    priority: v.priority,
    dueDate: v.dueDate || null,
  };
}
