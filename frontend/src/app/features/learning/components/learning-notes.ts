import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { toApiError } from '../../../core/api/api-error';
import { FieldErrors } from '../../../shared/forms/field-errors';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { ToastService } from '../../../shared/toast/toast.service';
import { formatDateTime } from '../../../shared/utils/date-utils';
import { createNoteForm, toNoteFormRequest } from '../learning-form';
import { LearningNote } from '../learning.models';
import { LearningApi } from '../learning-api.service';

let nextId = 0;

/** Short excerpt of a note for accessible button names. */
export function noteExcerpt(text: string, max = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Notes of one learning card: text, local timestamp, remove (hard delete), plus an inline
 * "add note" form (text required, ≤ 4000 after trim). Calls `LearningApi` itself and emits
 * `changed` after every successful change (and after a 404) so the parent refetches the card.
 */
@Component({
  selector: 'app-learning-notes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldErrors],
  template: `
    <section class="sec" [attr.aria-labelledby]="id + '-h'">
      <h3 class="sec__title" [id]="id + '-h'">Notes</h3>
      @if (visible().length === 0) {
        <p class="muted hint" data-testid="notes-empty">No notes yet. Write down what you learned.</p>
      } @else {
        <ul class="list">
          @for (n of visible(); track n.id) {
            <li class="note" data-testid="note" [attr.data-note-id]="n.id">
              <div class="note__body">
                <p class="note__text">{{ n.text }}</p>
                <time class="note__time" [attr.datetime]="n.createdAt" data-testid="note-time">{{
                  formatDateTime(n.createdAt)
                }}</time>
              </div>
              <button
                type="button"
                class="icon-btn"
                title="Remove note"
                [disabled]="busy().has(n.id)"
                [attr.aria-label]="'Remove note ' + excerpt(n.text)"
                (click)="remove(n)"
              >
                ×
              </button>
            </li>
          }
        </ul>
      }

      <form class="add" [formGroup]="form" (ngSubmit)="add()" novalidate aria-label="Add note">
        @if (formError()) {
          <p class="form-error" role="alert">{{ formError() }}</p>
        }
        <div class="form-field">
          <label [for]="id + '-text'">New note</label>
          <textarea
            [id]="id + '-text'"
            rows="2"
            formControlName="text"
            placeholder="Key takeaway, question, link…"
            [attr.aria-describedby]="id + '-text-errors'"
          ></textarea>
          <app-field-errors [control]="form.controls.text" label="Text" [errorId]="id + '-text-errors'" />
        </div>
        <button type="submit" class="btn btn--small" [disabled]="adding()">
          {{ adding() ? 'Adding…' : 'Add note' }}
        </button>
      </form>
    </section>
  `,
  styles: `
    .sec__title { margin: 0 0 0.4rem; font-size: 0.9rem; }
    .hint { margin: 0 0 0.5rem; font-size: 0.85rem; }
    .list { display: flex; flex-direction: column; gap: 0.4rem; margin: 0 0 0.6rem; padding: 0; list-style: none; }
    .note { display: flex; align-items: flex-start; gap: 0.4rem; padding: 0.4rem 0.5rem; background: var(--bg); border-radius: var(--radius); }
    .note__body { flex: 1; min-width: 0; }
    .note__text { margin: 0; white-space: pre-line; overflow-wrap: anywhere; font-size: 0.9rem; }
    .note__time { color: var(--text-muted); font-size: 0.75rem; }
    .add .form-field { margin-bottom: 0.4rem; font-size: 0.85rem; }
    .form-error { margin: 0 0 0.5rem; color: var(--danger); font-size: 0.85rem; }
  `,
})
export class LearningNotes {
  private readonly api = inject(LearningApi);
  private readonly toast = inject(ToastService);

  readonly cardId = input.required<number>();
  readonly notes = input.required<readonly LearningNote[]>();
  /** A note was added or removed (or a 404 showed the data is stale): refetch the card. */
  readonly changed = output<void>();

  protected readonly id = `learning-notes-${nextId++}`;
  protected readonly form = createNoteForm();
  protected readonly adding = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal<ReadonlySet<number>>(new Set());
  /** Removed locally until the parent's refetch arrives. */
  private readonly removed = signal<ReadonlySet<number>>(new Set());
  protected readonly visible = computed(() => this.notes().filter((n) => !this.removed().has(n.id)));
  protected readonly formatDateTime = formatDateTime;
  protected readonly excerpt = noteExcerpt;

  protected remove(note: LearningNote): void {
    this.setBusy(note.id, true);
    this.api.deleteNote(note.learningCardId, note.id).subscribe({
      next: () => {
        this.setBusy(note.id, false);
        this.removed.update((s) => new Set(s).add(note.id));
        this.toast.success('Note removed');
        this.changed.emit();
      },
      error: (e: unknown) => {
        this.setBusy(note.id, false);
        this.fail(e, "Couldn't remove the note");
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
    this.api.addNote(this.cardId(), toNoteFormRequest(this.form)).subscribe({
      next: () => {
        this.adding.set(false);
        this.form.reset();
        this.toast.success('Note added');
        this.changed.emit();
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        this.adding.set(false);
        if (err.isValidationError && err.hasFieldErrors) {
          const rest = applyServerErrors(this.form, err);
          this.formError.set(rest.length ? rest.join(' ') : null);
        } else {
          this.fail(err, "Couldn't add the note");
        }
      },
    });
  }

  /** Error toast; a 404 means the card or note is gone, so ask the parent to refetch. */
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
