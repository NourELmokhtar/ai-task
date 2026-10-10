import { computed, inject, Injectable, signal } from '@angular/core';
import { timeout } from 'rxjs';
import { ApiClient } from '../api/api-client';

export interface HealthResponse {
  status: string;
  serverTime: string;
}

export type ConnectivityStatus = 'unknown' | 'online' | 'offline';

/** Tracks whether the QuickFlow API is reachable via `GET /api/health`. */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly api = inject(ApiClient);

  readonly status = signal<ConnectivityStatus>('unknown');
  readonly checking = signal(false);
  readonly isOffline = computed(() => this.status() === 'offline');
  readonly apiBaseUrl = this.api.url('').replace(/\/$/, '');

  check(timeoutMs = 5000): void {
    if (this.checking()) return;
    this.checking.set(true);
    this.api
      .get<HealthResponse>('/api/health')
      .pipe(timeout(timeoutMs))
      .subscribe({
        next: (res) => {
          this.status.set(res?.status === 'Healthy' ? 'online' : 'offline');
          this.checking.set(false);
        },
        error: () => {
          this.status.set('offline');
          this.checking.set(false);
        },
      });
  }
}
