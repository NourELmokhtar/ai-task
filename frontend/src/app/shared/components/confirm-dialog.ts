import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { Dialog } from './dialog';

/**
 * Confirmation dialog.
 *
 * ```html
 * <app-confirm-dialog [(open)]="confirmDelete" title="Delete task?" message="This can't be undone."
 *   confirmLabel="Delete" [danger]="true" (confirmed)="delete()" />
 * ```
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog],
  template: `
    <app-dialog [(open)]="open" [title]="title()" (closed)="onClosed()">
      <p class="confirm-message">{{ message() }}</p>
      <ng-container dialog-actions>
        <button type="button" class="btn" (click)="cancel()">{{ cancelLabel() }}</button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="danger()"
          [class.btn--primary]="!danger()"
          (click)="confirm()"
        >
          {{ confirmLabel() }}
        </button>
      </ng-container>
    </app-dialog>
  `,
})
export class ConfirmDialog {
  readonly open = model(false);
  readonly title = input<string>('Are you sure?');
  readonly message = input<string>('');
  readonly confirmLabel = input<string>('Confirm');
  readonly cancelLabel = input<string>('Cancel');
  /** Style the confirm button as destructive. */
  readonly danger = input(false);
  readonly confirmed = output<void>();
  /** Emits when closed without confirming (Cancel, Escape, close button, backdrop). */
  readonly cancelled = output<void>();

  private confirming = false;

  protected confirm(): void {
    this.confirming = true;
    this.confirmed.emit();
    this.open.set(false);
  }

  protected cancel(): void {
    this.open.set(false);
  }

  protected onClosed(): void {
    if (!this.confirming) this.cancelled.emit();
    this.confirming = false;
  }
}
