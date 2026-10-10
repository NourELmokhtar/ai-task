import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { toApiError } from '../../../core/api/api-error';
import { Dialog } from '../../../shared/components/dialog';
import { FieldErrors } from '../../../shared/forms/field-errors';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { ToastService } from '../../../shared/toast/toast.service';
import { createHabitForm, habitFormValue, toHabitFormRequest } from '../habit-form';
import { HABIT_FREQUENCIES, HABIT_FREQUENCY_LABELS, HabitDto } from '../habits.models';
import { HabitsApi } from '../habits-api.service';

let nextFormId = 0;

/**
 * Add/Edit Habit dialog. Saves through `HabitsApi`, shows a toast and emits `saved`.
 * Client validation mirrors BR-06 (name required, ≤ 150 after trim), description ≤ 2000 and the
 * frequency enum. Server 400 field errors (`errors` map) are shown on the fields; other errors
 * (`detail`, e.g. 404/409) are shown as a form-level message.
 *
 * Reusable (M08 quick-add): `<app-habit-form-dialog [(open)]="addOpen" (saved)="reload()" />`.
 * Pass `[habit]="h"` to edit an existing habit.
 */
@Component({
  selector: 'app-habit-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog, ReactiveFormsModule, FieldErrors],
  template: `
    <app-dialog [(open)]="open" [title]="habit() ? 'Edit Habit' : 'Add Habit'" [closeOnBackdrop]="false">
      <form [id]="id" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (formError()) {
          <p class="form-error" role="alert" data-testid="form-error">{{ formError() }}</p>
        }
        <div class="form-field">
          <label [for]="id + '-name'">Name</label>
          <input
            [id]="id + '-name'"
            type="text"
            formControlName="name"
            autocomplete="off"
            autofocus
            [attr.aria-describedby]="id + '-name-errors'"
          />
          <app-field-errors [control]="form.controls.name" label="Name" [errorId]="id + '-name-errors'" />
        </div>
        <div class="form-field">
          <label [for]="id + '-description'">Description</label>
          <textarea
            [id]="id + '-description'"
            rows="3"
            formControlName="description"
            [attr.aria-describedby]="id + '-description-errors'"
          ></textarea>
          <app-field-errors
            [control]="form.controls.description"
            label="Description"
            [errorId]="id + '-description-errors'"
          />
        </div>
        <div class="form-field">
          <label [for]="id + '-frequency'">Frequency</label>
          <select
            [id]="id + '-frequency'"
            formControlName="frequency"
            [attr.aria-describedby]="id + '-frequency-errors'"
          >
            @for (f of frequencies; track f) {
              <option [value]="f">{{ frequencyLabels[f] }}</option>
            }
          </select>
          <app-field-errors
            [control]="form.controls.frequency"
            label="Frequency"
            [errorId]="id + '-frequency-errors'"
          />
        </div>
      </form>
      <ng-container dialog-actions>
        <button type="button" class="btn" (click)="open.set(false)">Cancel</button>
        <button type="submit" class="btn btn--primary" [attr.form]="id" [disabled]="saving()">
          {{ saving() ? 'Saving…' : habit() ? 'Save changes' : 'Add Habit' }}
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
export class HabitFormDialog {
  private readonly api = inject(HabitsApi);
  private readonly toast = inject(ToastService);

  readonly open = model(false);
  /** Habit to edit; `null` creates a new one. */
  readonly habit = input<HabitDto | null>(null);
  /** Emits the created/updated habit after a successful save. */
  readonly saved = output<HabitDto>();

  protected readonly id = `habit-form-${nextFormId++}`;
  protected readonly form = createHabitForm();
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly frequencies = HABIT_FREQUENCIES;
  protected readonly frequencyLabels = HABIT_FREQUENCY_LABELS;

  constructor() {
    // Reset the form each time the dialog opens (or the edited habit changes while open).
    effect(() => {
      if (!this.open()) return;
      const habit = this.habit();
      untracked(() => {
        this.form.reset(habitFormValue(habit));
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
    const habit = this.habit();
    const body = toHabitFormRequest(this.form);
    this.saving.set(true);
    this.formError.set(null);
    const request = habit ? this.api.update(habit.id, body) : this.api.create(body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.success(habit ? 'Habit updated' : 'Habit created');
        this.saved.emit(saved);
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
          this.toast.error(
            habit ? `Couldn't update the habit: ${err.message}` : `Couldn't create the habit: ${err.message}`,
          );
        }
      },
    });
  }
}
