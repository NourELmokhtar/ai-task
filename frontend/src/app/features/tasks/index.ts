/**
 * Public, reusable pieces of the Tasks feature (M02) for other features:
 * - M06 Todo Plans item picker: `TasksApi.list({ search })`, `TaskDto`
 * - M08 Dashboard: `TaskItem` (row with complete toggle), `TaskFormDialog` (quick add), `TasksApi.setCompleted`
 * The route page (`TasksPage`) is intentionally not exported.
 */
export * from './tasks.models';
export { TasksApi } from './tasks-api.service';
export { TaskItem } from './components/task-item';
export { TaskFormDialog } from './components/task-form-dialog';
export { TasksToolbar } from './components/tasks-toolbar';
export { createTaskForm, toTaskRequest, taskFormValue, type TaskForm } from './task-form';
