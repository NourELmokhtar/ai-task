import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Loading indicator. `<app-loading-state message="Loading tasks…" />` */
@Component({
  selector: 'app-loading-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state" role="status" aria-live="polite" data-testid="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <p class="state__message">{{ message() }}</p>
    </div>
  `,
})
export class LoadingState {
  readonly message = input<string>('Loading…');
}
