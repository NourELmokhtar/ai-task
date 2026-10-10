import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { todayLocal } from '../../shared/utils/date-utils';
import {
  CreateTaskRequest,
  TaskDto,
  TaskListQuery,
  toUpdateRequest,
  UpdateTaskRequest,
} from './tasks.models';

/**
 * Tasks API (M02 handoff). Every call that returns tasks sends `?today=<local date>` so
 * `isOverdue` uses the browser's calendar date. Errors arrive as `ApiError`.
 *
 * Reusable: M06 (item picker: `list({ search })`), M08 (dashboard: `list`, `setCompleted`).
 */
@Injectable({ providedIn: 'root' })
export class TasksApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/tasks`. `today` defaults to the local date. */
  list(query: TaskListQuery = {}): Observable<TaskDto[]> {
    return this.api.get<TaskDto[]>('/api/tasks', { ...query, today: query.today ?? todayLocal() });
  }

  get(id: number): Observable<TaskDto> {
    return this.api.get<TaskDto>(`/api/tasks/${id}`, this.today());
  }

  create(body: CreateTaskRequest): Observable<TaskDto> {
    return this.api.post<TaskDto>('/api/tasks', body, this.today());
  }

  /** Full replacement. Use `toUpdateRequest(task, changes)` to build the body. */
  update(id: number, body: UpdateTaskRequest): Observable<TaskDto> {
    return this.api.put<TaskDto>(`/api/tasks/${id}`, body, this.today());
  }

  complete(id: number): Observable<TaskDto> {
    return this.api.post<TaskDto>(`/api/tasks/${id}/complete`, null, this.today());
  }

  archive(id: number): Observable<TaskDto> {
    return this.api.post<TaskDto>(`/api/tasks/${id}/archive`, null, this.today());
  }

  restore(id: number): Observable<TaskDto> {
    return this.api.post<TaskDto>(`/api/tasks/${id}/restore`, null, this.today());
  }

  /** Soft delete (204). */
  delete(id: number): Observable<void> {
    return this.api.delete<void>(`/api/tasks/${id}`);
  }

  /**
   * Complete toggle: `done=true` → `POST /complete`; `done=false` → `PUT` with status `Todo`
   * and the task's other current fields (handoff §4, "un-complete").
   */
  setCompleted(task: TaskDto, done: boolean): Observable<TaskDto> {
    return done
      ? this.complete(task.id)
      : this.update(task.id, toUpdateRequest(task, { status: 'Todo' }));
  }

  private today(): { today: string } {
    return { today: todayLocal() };
  }
}
