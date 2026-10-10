import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectivityService } from './connectivity.service';

/** Non-blocking banner shown while the API is unreachable. */
@Component({
  selector: 'app-connectivity-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (connectivity.isOffline()) {
      <div class="banner" role="alert" data-testid="connectivity-banner">
        <span>
          Can't reach the QuickFlow server ({{ connectivity.apiBaseUrl }}). Data can't be loaded or
          saved until it's back.
        </span>
        <button
          type="button"
          class="btn btn--small"
          (click)="connectivity.check()"
          [disabled]="connectivity.checking()"
        >
          {{ connectivity.checking() ? 'Checking…' : 'Retry' }}
        </button>
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
      padding: 0.6rem 1rem;
      background: var(--warning-bg);
      color: var(--warning-fg);
      border-bottom: 1px solid var(--warning-border);
      font-size: 0.9rem;
    }
  `,
})
export class ConnectivityBanner {
  protected readonly connectivity = inject(ConnectivityService);
}
