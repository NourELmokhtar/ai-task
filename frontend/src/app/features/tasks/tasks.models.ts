/**
 * Task DTOs mirroring the M02 API contract (see the M02 handoff), plus UI filter types and the
 * mapping from toolbar filters to `GET /api/tasks` query params.
 */

export type TaskStatus = 'Todo' | 'InProgress' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export const TASK_STATUSES: readonly TaskStatus[] = ['Todo', 'InProgress', 'Done'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['Low', 'Medium', 'High'];

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  Todo: 'To do',
  InProgress: 'In progress',
  Done: 'Done',
};

export const TASK_PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
};

/** Validation limits (BR-01, BR-02). */
export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 2000;

/** `TaskResponse` from the API. */
export interface TaskDto {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** `YYYY-MM-DD` */
  dueDate: string | null;
  /** ISO UTC */
  createdAt: string;
  /** ISO UTC */
  updatedAt: string;
  isArchived: boolean;
  /** ISO UTC, set while status is Done */
  completedAt: string | null;
  /** Computed by the server for the `today` param. */
  isOverdue: boolean;
}

/** `POST /api/tasks` body. */
export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}

/** `PUT /api/tasks/{id}` body (full replacement: null/omitted description and dueDate are cleared). */
export interface UpdateTaskRequest {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

/** `GET /api/tasks` query params (a type alias so it is assignable to `QueryParams`). */
export type TaskListQuery = {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueFrom?: string;
  dueTo?: string;
  overdue?: boolean;
  archived?: boolean;
  sortBy?: 'createdAt' | 'dueDate';
  sortDir?: 'asc' | 'desc';
  /** `YYYY-MM-DD`, used for `isOverdue` and `overdue=true`. */
  today?: string;
};

/** Builds a full PUT body from a task, with optional overrides. */
export function toUpdateRequest(task: TaskDto, changes: Partial<UpdateTaskRequest> = {}): UpdateTaskRequest {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    ...changes,
  };
}

// ---------- Toolbar filters ----------

export type DueFilter = 'any' | 'overdue' | 'today' | 'range';
export type TaskSort = 'createdAt:desc' | 'createdAt:asc' | 'dueDate:asc' | 'dueDate:desc';

export const DUE_FILTER_OPTIONS: readonly { value: DueFilter; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'range', label: 'Date range' },
];

export const TASK_SORT_OPTIONS: readonly { value: TaskSort; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'dueDate:asc', label: 'Due date (soonest)' },
  { value: 'dueDate:desc', label: 'Due date (latest)' },
];

export interface TaskFilters {
  search: string;
  status: TaskStatus | '';
  priority: TaskPriority | '';
  due: DueFilter;
  /** `YYYY-MM-DD` or '' (only used when `due === 'range'`) */
  dueFrom: string;
  dueTo: string;
  sort: TaskSort;
  showArchived: boolean;
}

export const DEFAULT_TASK_FILTERS: Readonly<TaskFilters> = {
  search: '',
  status: '',
  priority: '',
  due: 'any',
  dueFrom: '',
  dueTo: '',
  sort: 'createdAt:desc',
  showArchived: false,
};

/** True when any filter narrows the list (sort doesn't count). */
export function hasActiveFilters(f: TaskFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.status !== '' ||
    f.priority !== '' ||
    f.due !== 'any' ||
    f.showArchived
  );
}

/** Resets every filter but keeps the sort order. */
export function clearTaskFilters(f: TaskFilters): TaskFilters {
  return { ...DEFAULT_TASK_FILTERS, sort: f.sort };
}

/** True when the range filter has both ends and the end is before the start. */
export function isInvalidDueRange(f: TaskFilters): boolean {
  return f.due === 'range' && !!f.dueFrom && !!f.dueTo && f.dueTo < f.dueFrom;
}

/**
 * Maps toolbar filters to `GET /api/tasks` params (handoff §1 recipes):
 * "Overdue" → `overdue=true`, "Due today" → `dueFrom=dueTo=today`, "Show archived" → `archived=true`.
 * An inverted date range is ignored (the toolbar shows an error instead).
 */
export function toTaskListQuery(f: TaskFilters, today: string): TaskListQuery {
  const [sortBy, sortDir] = f.sort.split(':') as ['createdAt' | 'dueDate', 'asc' | 'desc'];
  const query: TaskListQuery = { sortBy, sortDir, today };
  const search = f.search.trim();
  if (search) query.search = search;
  if (f.status) query.status = f.status;
  if (f.priority) query.priority = f.priority;
  switch (f.due) {
    case 'overdue':
      query.overdue = true;
      break;
    case 'today':
      query.dueFrom = today;
      query.dueTo = today;
      break;
    case 'range':
      if (!isInvalidDueRange(f)) {
        if (f.dueFrom) query.dueFrom = f.dueFrom;
        if (f.dueTo) query.dueTo = f.dueTo;
      }
      break;
  }
  if (f.showArchived) query.archived = true;
  return query;
}
