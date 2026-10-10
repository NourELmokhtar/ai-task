import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { ToastService } from '../../shared/toast/toast.service';
import { LearningCard } from './components/learning-card';
import { LearningCardFormDialog } from './components/learning-card-form-dialog';
import {
  LEARNING_CARD_STATUS_LABELS,
  LearningCardDetail,
  LearningCardStatus,
  LearningCardSummary,
  toLearningCardSummary,
} from './learning.models';
import { LearningApi } from './learning-api.service';

/**
 * /learning: grid of learning cards (oldest first). Add cards, change their status, remove them
 * (confirm, soft delete), and expand a card to manage its milestones and notes (M04).
 */
@Component({
  selector: 'app-learning-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LearningCard, LearningCardFormDialog, ConfirmDialog, EmptyState, LoadingState, ErrorState],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Learning Resources</h1>
        <button type="button" class="btn btn--primary" (click)="openCreate()">Add Learning Card</button>
      </header>

      @if (error(); as err) {
        <app-error-state title="Couldn't load learning cards" [message]="err.message" (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading-state message="Loading learning cards…" />
      } @else if (cards().length === 0) {
        <app-empty-state
          title="No learning cards yet"
          message="Add a course, book or topic, then track milestones and notes for it."
          actionLabel="Add Learning Card"
          (action)="openCreate()"
        />
      } @else {
        <p class="summary muted" aria-live="polite" data-testid="learning-summary">
          {{ cards().length }} {{ cards().length === 1 ? 'card' : 'cards' }} · {{ counts().InProgress }} in progress ·
          {{ counts().Completed }} completed
          @if (loading()) {
            <span>· Updating…</span>
          }
        </p>
        <ul class="grid" aria-label="Learning cards">
          @for (c of cards(); track c.id) {
            <li>
              <app-learning-card
                [card]="c"
                [busy]="busy().has(c.id)"
                (statusChange)="changeStatus(c, $event)"
                (remove)="askRemove(c)"
                (changed)="replace($event)"
                (missing)="load()"
              />
            </li>
          }
        </ul>
      }
    </section>

    <app-learning-card-form-dialog [(open)]="formOpen" (saved)="onCreated($event)" />
    <app-confirm-dialog
      [(open)]="confirmOpen"
      title="Remove learning card?"
      [message]="removeMessage()"
      confirmLabel="Remove"
      [danger]="true"
      (confirmed)="confirmRemove()"
    />
  `,
  styles: `
    .summary { margin: 0 0 0.75rem; font-size: 0.85rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
      align-items: start;
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class LearningPage {
  private readonly api = inject(LearningApi);
  private readonly toast = inject(ToastService);

  protected readonly cards = signal<LearningCardSummary[]>([]);
  protected readonly counts = computed(() => {
    const counts: Record<LearningCardStatus, number> = { NotStarted: 0, InProgress: 0, Completed: 0 };
    for (const c of this.cards()) counts[c.status]++;
    return counts;
  });
  protected readonly loading = signal(false);
  /** True after the first successful load (until then the loading state is shown). */
  protected readonly loaded = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<ReadonlySet<number>>(new Set());

  protected readonly formOpen = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly removing = signal<LearningCardSummary | null>(null);
  protected readonly removeMessage = computed(
    () => `"${this.removing()?.title ?? ''}" and its milestones and notes will be removed.`,
  );

  private loadSub?: Subscription;

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.loadSub = this.api.list().subscribe({
      next: (cards) => {
        this.cards.set(cards);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e));
        this.loaded.set(false);
        this.loading.set(false);
      },
    });
  }

  protected openCreate(): void {
    this.formOpen.set(true);
  }

  /** New cards are the newest, so they go last (the list is oldest first). */
  protected onCreated(card: LearningCardDetail): void {
    this.cards.update((list) => [...list.filter((c) => c.id !== card.id), toLearningCardSummary(card)]);
  }

  /** Updates one card in place (fresh counts after a milestone/note change, or a PUT result). */
  protected replace(card: LearningCardSummary | LearningCardDetail): void {
    const summary = toLearningCardSummary(card);
    this.cards.update((list) => list.map((c) => (c.id === summary.id ? summary : c)));
  }

  /** PUT with the card's current title and description plus the new status (A-12). */
  protected changeStatus(card: LearningCardSummary, status: LearningCardStatus): void {
    this.setBusy(card.id, true);
    this.api.setStatus(card, status).subscribe({
      next: (saved) => {
        this.replace(saved);
        this.setBusy(card.id, false);
        this.toast.success(`Status changed to ${LEARNING_CARD_STATUS_LABELS[saved.status]}`);
      },
      error: (e: unknown) => this.onMutationError(card, e, "Couldn't change the status"),
    });
  }

  protected askRemove(card: LearningCardSummary): void {
    this.removing.set(card);
    this.confirmOpen.set(true);
  }

  protected confirmRemove(): void {
    const card = this.removing();
    if (!card) return;
    this.setBusy(card.id, true);
    this.api.delete(card.id).subscribe({
      next: () => {
        this.setBusy(card.id, false);
        this.cards.update((list) => list.filter((c) => c.id !== card.id));
        this.toast.success('Learning card removed');
      },
      error: (e: unknown) => this.onMutationError(card, e, "Couldn't remove the learning card"),
    });
  }

  /** Error toast; reloads when the card is gone. */
  private onMutationError(card: LearningCardSummary, e: unknown, failure: string): void {
    const err = toApiError(e);
    this.setBusy(card.id, false);
    this.toast.error(`${failure}: ${err.message}`);
    if (err.isNotFound) this.load();
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
