import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { CreatePlanRequest, PlanDto, PlanGroup, UpdatePlanItemRequest, UpdatePlanRequest } from './plans.models';

const BASE = '/api/plans';

/** Path of one plan item (`PATCH` target). */
export function planItemPath(planId: number, itemId: number): string {
  return `${BASE}/${planId}/items/${itemId}`;
}

/**
 * Todo Plans API (M06 handoff). Errors arrive as `ApiError`.
 *
 * Every mutation except DELETE returns the full `PlanDto` (with fresh `progressPercent`), so
 * replace the plan in place with the response.
 *
 * Reusable: M07 (lifecycle on top of the same plans), M08 (dashboard: `list()`, `setItemDone`).
 */
@Injectable({ providedIn: 'root' })
export class PlansApi {
  private readonly api = inject(ApiClient);

  /**
   * `GET /api/plans`: priority order asc, then start asc (A-16). No paging.
   * M07: optional `group` filter (`completed` is ordered by end desc). Omitted → all plans.
   */
  list(query: { group?: PlanGroup } = {}): Observable<PlanDto[]> {
    return this.api.get<PlanDto[]>(BASE, { group: query.group });
  }

  /** `GET /api/plans/{id}`. 404 when missing or deleted. */
  get(id: number): Observable<PlanDto> {
    return this.api.get<PlanDto>(`${BASE}/${id}`);
  }

  /** `POST /api/plans` (201). 400 errors may be keyed `items[i]...` (see `mapPlanItemErrors`). */
  create(body: CreatePlanRequest): Observable<PlanDto> {
    return this.api.post<PlanDto>(BASE, body);
  }

  /** `PUT /api/plans/{id}`: metadata only (items never change). */
  update(id: number, body: UpdatePlanRequest): Observable<PlanDto> {
    return this.api.put<PlanDto>(`${BASE}/${id}`, body);
  }

  /** Soft delete (204). Afterwards every route for the plan gives 404. */
  delete(id: number): Observable<void> {
    return this.api.delete<void>(`${BASE}/${id}`);
  }

  /**
   * `PATCH /api/plans/{planId}/items/{itemId}` with `{ isDone }`. Returns the full plan.
   * BR-13: marking a Task item done also completes the task (un-marking does not revert it).
   */
  setItemDone(planId: number, itemId: number, isDone: boolean): Observable<PlanDto> {
    const body: UpdatePlanItemRequest = { isDone };
    return this.api.patch<PlanDto>(planItemPath(planId, itemId), body);
  }
}
