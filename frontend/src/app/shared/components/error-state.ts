import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Error panel with a retry button.
 * `<app-error-state [message]="error()?.message" (retry)="load()" />`
 */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state state--error" role="alert" data-testid="error-state">
      <h2 class="state__title">{{ title() }}</h2>
      @if (message()) {
        <p class="state__message">{{ message() }}</p>
      }
      @if (retryLabel()) {
        <button type="button" class="btn" (click)="retry.emit()">{{ retryLabel() }}</button>
      }
    </div>
  `,
})
export class ErrorState {
  readonly title = input<string>('Something went wrong');
  readonly message = input<string | null | undefined>('');
  /** Retry button label. No button when empty. */
  readonly retryLabel = input<string>('Try again');
  readonly retry = output<void>();
}
