import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Empty state with optional primary action.
 * `<app-empty-state title="No tasks yet" message="Create your first task." actionLabel="New task" (action)="create()" />`
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state" data-testid="empty-state">
      @if (title()) {
        <h2 class="state__title">{{ title() }}</h2>
      }
      <p class="state__message">{{ message() }}</p>
      <ng-content />
      @if (actionLabel()) {
        <button type="button" class="btn btn--primary" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
})
export class EmptyState {
  readonly title = input<string>('');
  readonly message = input.required<string>();
  /** Label of the primary action button. No button when empty. */
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}
