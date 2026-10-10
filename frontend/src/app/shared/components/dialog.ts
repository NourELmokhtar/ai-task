import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

let nextDialogId = 0;

/**
 * Modal dialog built on the native `<dialog>` element (focus trap, Escape, top layer).
 *
 * ```html
 * <app-dialog [(open)]="editOpen" title="Edit task">
 *   ...body...
 *   <ng-container dialog-actions>
 *     <button class="btn" (click)="editOpen.set(false)">Cancel</button>
 *     <button class="btn btn--primary" (click)="save()">Save</button>
 *   </ng-container>
 * </app-dialog>
 * ```
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="dialog"
      [attr.aria-labelledby]="titleId"
      (cancel)="onCancel($event)"
      (click)="onDialogClick($event)"
    >
      <div class="dialog__panel">
        <header class="dialog__header">
          <h2 class="dialog__title" [id]="titleId">{{ title() }}</h2>
          <button type="button" class="icon-btn" aria-label="Close dialog" (click)="close()">
            ×
          </button>
        </header>
        <div class="dialog__body"><ng-content /></div>
        <footer class="dialog__footer"><ng-content select="[dialog-actions]" /></footer>
      </div>
    </dialog>
  `,
})
export class Dialog {
  /** Two-way bindable open state: `[(open)]="isOpen"`. */
  readonly open = model(false);
  readonly title = input.required<string>();
  /** Close when the backdrop is clicked. */
  readonly closeOnBackdrop = input(true);
  /** Emits whenever the dialog closes (close button, Escape, backdrop, or `open` set to false). */
  readonly closed = output<void>();

  protected readonly titleId = `app-dialog-title-${nextDialogId++}`;
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const el = this.dialogRef().nativeElement;
      const shouldOpen = this.open();
      if (shouldOpen && !el.open) {
        el.showModal();
      } else if (!shouldOpen && el.open) {
        el.close();
        this.closed.emit();
      }
    });
  }

  close(): void {
    this.open.set(false);
  }

  protected onCancel(event: Event): void {
    event.preventDefault(); // keep state in sync through `open`
    this.close();
  }

  protected onDialogClick(event: MouseEvent): void {
    // The panel fills the dialog box, so a click whose target is the <dialog> itself is on the backdrop.
    if (this.closeOnBackdrop() && event.target === this.dialogRef().nativeElement) this.close();
  }
}
