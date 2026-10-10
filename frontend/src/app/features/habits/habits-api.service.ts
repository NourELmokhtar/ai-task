import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, switchMap, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { toApiError } from '../../core/api/api-error';
import { todayLocal } from '../../shared/utils/date-utils';
import {
  CreateHabitRequest,
  HabitCompletionDto,
  HabitCompletionsQuery,
  HabitDto,
  HabitListQuery,
  UpdateHabitRequest,
} from './habits.models';

/**
 * Habits API (M03 handoff). Every call that returns a habit sends `?today=<local date>` so the
 * progress fields (`completedToday`, `completedForCurrentPeriod`, `currentStreak`) use the
 * browser's calendar date. Errors arrive as `ApiError`.
 *
 * Reusable: M06 (item picker: `list({ active: true })`), M08 (dashboard: `list`, `setCompletedToday`).
 */
@Injectable({ providedIn: 'root' })
export class HabitsApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/habits`. `active` omitted returns all habits. `today` defaults to the local date. */
  list(query: HabitListQuery = {}): Observable<HabitDto[]> {
    return this.api.get<HabitDto[]>('/api/habits', { ...query, today: query.today ?? todayLocal() });
  }

  get(id: number, today = todayLocal()): Observable<HabitDto> {
    return this.api.get<HabitDto>(`/api/habits/${id}`, { today });
  }

  create(body: CreateHabitRequest): Observable<HabitDto> {
    return this.api.post<HabitDto>('/api/habits', body, this.today());
  }

  /** Full replacement of name/description/frequency (does not change `isActive`). */
  update(id: number, body: UpdateHabitRequest): Observable<HabitDto> {
    return this.api.put<HabitDto>(`/api/habits/${id}`, body, this.today());
  }

  activate(id: number): Observable<HabitDto> {
    return this.api.post<HabitDto>(`/api/habits/${id}/activate`, null, this.today());
  }

  deactivate(id: number): Observable<HabitDto> {
    return this.api.post<HabitDto>(`/api/habits/${id}/deactivate`, null, this.today());
  }

  /** Soft delete (204). */
  delete(id: number): Observable<void> {
    return this.api.delete<void>(`/api/habits/${id}`);
  }

  /**
   * `POST /api/habits/{id}/completions?today=…`. Without `date` no body is sent and the server
   * records `today`. 400 (inactive / future date), 404, **409** (already completed on that date).
   */
  complete(id: number, date?: string, today = todayLocal()): Observable<HabitCompletionDto> {
    return this.api.post<HabitCompletionDto>(
      `/api/habits/${id}/completions`,
      date ? { date } : null,
      { today },
    );
  }

  /** `DELETE /api/habits/{id}/completions/{date}` (204). 404 when there is no completion that day. */
  removeCompletion(id: number, date: string = todayLocal()): Observable<void> {
    return this.api.delete<void>(`/api/habits/${id}/completions/${date}`);
  }

  /** `GET /api/habits/{id}/completions?from=&to=` (date ascending). */
  listCompletions(id: number, query: HabitCompletionsQuery = {}): Observable<HabitCompletionDto[]> {
    return this.api.get<HabitCompletionDto[]>(`/api/habits/${id}/completions`, query);
  }

  /**
   * Today's completion toggle, then refetches the habit (the completion response has no progress).
   * - `done=true`: POST completion. A **409** means it is already done today, so it is treated as
   *   success.
   * - `done=false`: DELETE today's completion. A **404** for the completion means it is already
   *   undone; the refetch still reports a 404 if the habit itself is gone.
   * Other errors (e.g. 400 for an inactive habit) are rethrown and no refetch happens.
   */
  setCompletedToday(habit: Pick<HabitDto, 'id'>, done: boolean): Observable<HabitDto> {
    const today = todayLocal();
    const change: Observable<unknown> = done
      ? this.complete(habit.id, undefined, today).pipe(ignoreStatus(409))
      : this.removeCompletion(habit.id, today).pipe(ignoreStatus(404));
    return change.pipe(switchMap(() => this.get(habit.id, today)));
  }

  private today(): { today: string } {
    return { today: todayLocal() };
  }
}

/** Turns an error with the given HTTP status into a completed `null` emission. */
function ignoreStatus<T>(status: number) {
  return catchError<T, Observable<T | null>>((e: unknown) =>
    toApiError(e).status === status ? of(null) : throwError(() => e),
  );
}
