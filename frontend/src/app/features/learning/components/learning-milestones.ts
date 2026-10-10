import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { toApiError } from '../../../core/api/api-error';
import { FieldErrors } from '../../../shared/forms/field-errors';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { ToastService } from '../../../shared/toast/toast.service';
import { formatDate, todayLocal } from '../../../shared/utils/date-utils';
import { createMilestoneForm, toMilestoneFormRequest } from '../learning-form';
import { LearningMilestone } from '../learning.models';
import { LearningApi } from '../learning-api.service';

let nextId = 0;

/**
 * Milestones of one learning card: complete checkbox, title, target date, remove (hard delete,
 * A-14/BR-09), plus an inline "add milestone" form (title required ≤ 200, optional target date).
 * Calls `LearningApi` itself and emits `changed` after every successful change (and after a 404),
 * so the parent refetches the card and its `done/total` counts.
 */
@Component({
  selector: 'app-learning-milestones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldErrors],
  template: `
    <section class="sec" [attr.aria-labelledby]="id + '-h'">
      <h3 class="sec__title" [id]="id + '-h'">Milestones</h3>
      @if (visible().length === 0) {
        <p class="muted hint" data-testid="milestones-empty">No milestones yet. Add the first step below.</p>
      } @else {
        <ul class="list">
          @for (m of visible(); track m.id) {
            <li class="ms" [class.ms--done]="m.isDone" data-testid="milestone" [attr.data-milestone-id]="m.id">
              <label class="ms__main">
                <input
                  type="checkbox"
                  [checked]="m.isDone"
                  [disabled]="busy().has(m.id)"
                  [attr.aria-label]="'Mark ' + m.title + ' as done'"
                  (change)="toggle(m, $event)"
                />
                <span class="ms__title">{{ m.title }}</span>
              </label>
              @if (m.targetDate) {
                <span
                  class="ms__date"
                  [class.ms__date--late]="!m.isDone && m.targetDate < today"
                  data-testid="milestone-target"
                  >Target {{ formatDate(m.targetDate) }}</span
                >
              }
              <button
                type="button"
                class="icon-btn"
                title="Remove milestone"
                [disabled]="busy().has(m.id)"
                [attr.aria-label]="'Remove milestone ' + m.title"
                (click)="remove(m)"
              >
                ×
              </button>
            </li>
          }
        </ul>
      }

      <form class="add" [formGroup]="form" (ngSubmit)="add()" novalidate aria-label="Add milestone">
        @if (formError()) {
          <p class="form-error" role="alert">{{ formError() }}</p>
        }
        <div class="form-field add__title">
          <label [for]="id + '-title'">New milestone</label>
          <input
            #titleInput
            [id]="id + '-title'"
            type="text"
            formControlName="title"
            autocomplete="off"
            placeholder="e.g. Chapters 1–5"
            [attr.aria-describedby]="id + '-title-errors'"
          />
          <app-field-errors [control]="form.controls.title" label="Title" [errorId]="id + '-title-errors'" />
        </div>
        <div class="form-field add__date">
          <label [for]="id + '-date'">Target date (optional)</label>
          <input
            [id]="id + '-date'"
            type="date"
            formControlName="targetDate"
            [attr.aria-describedby]="id + '-date-errors'"
          />
          <app-field-errors [control]="form.controls.targetDate" label="Target date" [errorId]="id + '-date-errors'" />
        </div>
        <button type="submit" class="btn btn--small add__btn" [disabled]="adding()">
          {{ adding() ? 'Adding…' : 'Add milestone' }}
        </button>
      </form>
    </section>
  `,
  styles: `
    .sec__title { margin: 0 0 0.4rem; font-size: 0.9rem; }
    .hint { margin: 0 0 0.5rem; font-size: 0.85rem; }
    .list { margin: 0 0 0.5rem; padding: 0; list-style: none; }
    .ms { display: flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0; border-bottom: 1px solid var(--hover); }
    .ms__main { display: flex; flex: 1; align-items: center; gap: 0.45rem; min-width: 0; cursor: pointer; }
    .ms__main input { width: 1.05rem; height: 1.05rem; flex: none; margin: 0; cursor: inherit; }
    .ms__title { overflow-wrap: anywhere; }
    .ms--done .ms__title { color: var(--text-muted); text-decoration: line-through; }
    .ms__date { flex: none; color: var(--text-muted); font-size: 0.78rem; }
    .ms__date--late { color: var(--danger); }
    .add { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0 0.5rem; }
    .add .form-field { margin-bottom: 0.5rem; font-size: 0.85rem; }
    .add__title { flex: 1 1 10rem; }
    .add__date { flex: 0 1 9.5rem; }
    .add__btn { margin-top: 1.45rem; }
    .form-error { width: 100%; margin: 0 0 0.5rem; color: var(--danger); font-size: 0.85rem; }
  `,
})
export class LearningMilestones {
  private readonly api = inject(LearningApi);
  private readonly toast = inject(ToastService);

  readonly cardId = input.required<number>();
  readonly milestones = input.required<readonly LearningMilestone[]>();
  /** A milestone was added, toggled or removed (or a 404 showed the data is stale): refetch the card. */
  readonly changed = output<void>();

  protected readonly id = `learning-ms-${nextId++}`;
  protected readonly form = createMilestoneForm();
  protected readonly adding = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal<ReadonlySet<number>>(new Set());
  /** Removed locally until the parent's refetch arrives. */
  private readonly removed = signal<ReadonlySet<number>>(new Set());
  protected readonly visible = computed(() => this.milestones().filter((m) => !this.removed().has(m.id)));
  protected readonly today = todayLocal();
  protected readonly formatDate = formatDate;
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  protected toggle(milestone: LearningMilestone, event: Event): void {
    const box = event.target as HTMLInputElement;
    const isDone = box.checked;
    this.setBusy(milestone.id, true);
    this.api.setMilestoneDone(milestone, isDone).subscribe({
      next: () => {
        this.setBusy(milestone.id, false);
        this.toast.success(isDone ? 'Milestone completed' : 'Milestone marked as not done');
        this.changed.emit();
      },
      error: (e: unknown) => {
        this.setBusy(milestone.id, false);
        box.checked = milestone.isDone;
        this.fail(e, "Couldn't update the milestone");
      },
    });
  }

  protected remove(milestone: LearningMilestone): void {
    this.setBusy(milestone.id, true);
    this.api.deleteMilestone(milestone.learningCardId, milestone.id).subscribe({
      next: () => {
        this.setBusy(milestone.id, false);
        this.removed.update((s) => new Set(s).add(milestone.id));
        this.toast.success('Milestone removed');
        this.changed.emit();
      },
      error: (e: unknown) => {
        this.setBusy(milestone.id, false);
        this.fail(e, "Couldn't remove the milestone");
      },
    });
  }

  protected add(): void {
    if (this.adding()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.adding.set(true);
    this.formError.set(null);
    this.api.addMilestone(this.cardId(), toMilestoneFormRequest(this.form)).subscribe({
      next: () => {
        this.adding.set(false);
        this.form.reset();
        this.toast.success('Milestone added');
        this.changed.emit();
        this.titleInput()?.nativeElement.focus();
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        this.adding.set(false);
        if (err.isValidationError && err.hasFieldErrors) {
          const rest = applyServerErrors(this.form, err);
          this.formError.set(rest.length ? rest.join(' ') : null);
        } else {
          this.fail(err, "Couldn't add the milestone");
        }
      },
    });
  }

  /** Error toast; a 404 means the card or milestone is gone, so ask the parent to refetch. */
  private fail(e: unknown, message: string): void {
    const err = toApiError(e);
    this.toast.error(`${message}: ${err.message}`);
    if (err.isNotFound) this.changed.emit();
  }

  private setBusy(id: number, busy: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
