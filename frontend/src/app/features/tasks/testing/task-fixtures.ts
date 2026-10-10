import { TaskDto } from '../tasks.models';

/** Test helper: a `TaskDto` with sensible defaults. Not used by app code. */
export function makeTask(changes: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 1,
    title: 'Task',
    description: null,
    status: 'Todo',
    priority: 'Medium',
    dueDate: null,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
    isArchived: false,
    completedAt: null,
    isOverdue: false,
    ...changes,
  };
}
