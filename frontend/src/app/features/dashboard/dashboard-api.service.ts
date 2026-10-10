import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { todayLocal } from '../../shared/utils/date-utils';
import { DashboardResponse } from './dashboard.models';

/**
 * Dashboard API (M08 handoff). Always sends `?today=<local date>`, the same value the Tasks and
 * Habits services send, so due today / overdue / habit progress use the browser's calendar date.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly api = inject(ApiClient);

  /** `GET /api/dashboard?today=`: every section in one response. */
  get(today: string = todayLocal()): Observable<DashboardResponse> {
    return this.api.get<DashboardResponse>('/api/dashboard', { today });
  }
}
