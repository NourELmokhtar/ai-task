import { ChangeDetectionStrategy, Component, effect, inject, model, output, signal, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { toApiError } from '../../../core/api/api-error';
import { Dialog } from '../../../shared/components/dialog';
import { FieldErrors } from '../../../shared/forms/field-errors';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { ToastService } from '../../../shared/toast/toast.service';
import { createLearningCardForm, toLearningCardFormRequest } from '../learning-form';
import { LearningCardDetail } from '../learning.models';
import { LearningApi } from '../learning-api.service';

let nextFormId = 0;

/**
 * Add Learning Card dialog. Creates the card through `LearningApi`, shows a toast, emits `saved`
 * and closes. Client validation mirrors BR-08 (title required, ≤ 200 after trim) and the
 * description limit (≤ 2000). Server 400 field errors are shown on the fields; other errors
 * (`detail ?? title`) as a form-level message and a toast.
 *
 * Reusable (M08 quick-add): `<app-learning-card-form-dialog [(open)]="addOpen" (saved)="reload()" />`.
 */
@Component({
  selector: 'app-learning-card-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog, ReactiveFormsModule, FieldErrors],
  template: `
    <app-dialog [(open)]="open" title="Add Learning Card" [closeOnBackdrop]="false">
      <form [id]="id" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (formError()) {
          <p class="form-error" role="alert" data-testid="form-error">{{ formError() }}</p>
        }
        <div class="form-field">
          <label [for]="id + '-title'">Title</label>
          <input
            [id]="id + '-title'"
            type="text"
            formControlName="title"
            autocomplete="off"
            placeholder="e.g. Clean Code"
            [attr.aria-describedby]="id + '-title-errors'"
          />
          <app-field-errors [control]="form.controls.title" label="Title" [errorId]="id + '-title-errors'" />
        </div>
        <div class="form-field">
          <label [for]="id + '-description'">Description or source</label>
          <textarea
            [id]="id + '-description'"
            rows="3"
            formControlName="description"
            placeholder="Link, book, course name…"
            [attr.aria-describedby]="id + '-description-errors'"
          ></textarea>
          <app-field-errors
            [control]="form.controls.description"
            label="Description"
            [errorId]="id + '-description-errors'"
          />
        </div>
      </form>
      <ng-container dialog-actions>
        <button type="button" class="btn" (click)="open.set(false)">Cancel</button>
        <button type="submit" class="btn btn--primary" [attr.form]="id" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Add Learning Card' }}
        </button>
      </ng-container>
    </app-dialog>
  `,
  styles: `
    .form-error {
      margin: 0 0 1rem;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius);
      background: var(--danger-soft);
      color: var(--danger);
    }
  `,
})
export class LearningCardFormDialog {
  private readonly api = inject(LearningApi);
  private readonly toast = inject(ToastService);

  readonly open = model(false);
  /** Emits the created card (detail with empty milestones/notes). */
  readonly saved = output<LearningCardDetail>();

  protected readonly id = `learning-card-form-${nextFormId++}`;
  protected readonly form = createLearningCardForm();
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  constructor() {
    // Start with an empty form each time the dialog opens.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.form.reset();
        this.formError.set(null);
        this.saving.set(false);
      });
    });
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.api.create(toLearningCardFormRequest(this.form)).subscribe({
      next: (card) => {
        this.saving.set(false);
        this.toast.success('Learning card created');
        this.saved.emit(card);
        this.open.set(false);
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        this.saving.set(false);
        if (err.isValidationError && err.hasFieldErrors) {
          const rest = applyServerErrors(this.form, err);
          this.formError.set(rest.length ? rest.join(' ') : null);
        } else {
          this.formError.set(err.message);
          this.toast.error(`Couldn't create the learning card: ${err.message}`);
        }
      },
    });
  }
}
