import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import { ErrorState } from '../../../shared/components/error-state';
import { LoadingState } from '../../../shared/components/loading-state';
import { ToastService } from '../../../shared/toast/toast.service';
import {
  formatMilestoneProgress,
  isHttpUrl,
  LEARNING_CARD_STATUS_LABELS,
  LEARNING_CARD_STATUSES,
  LearningCardDetail,
  LearningCardStatus,
  LearningCardSummary,
  milestonePercent,
} from '../learning.models';
import { LearningApi } from '../learning-api.service';
import { LearningMilestones } from './learning-milestones';
import { LearningNotes } from './learning-notes';

let nextId = 0;

/**
 * One learning card. Collapsed: title, description/source (a lone URL becomes a link), status
 * badge, milestone progress `done/total`, status select, details toggle, remove.
 * Expanded: loads `GET /api/learning-cards/{id}` and shows the milestones and notes (with inline
 * add forms). After any milestone/note change it refetches the card and emits `changed` with the
 * fresh detail so the parent can update the counts.
 *
 * Status and remove are delegated to the parent (`statusChange`, `remove`); the parent sets `busy`
 * while its request runs. If the status request fails, the select reverts when `busy` clears.
 */
@Component({
  selector: 'app-learning-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LearningMilestones, LearningNotes, LoadingState, ErrorState],
  template: `
    @let c = card();
    <article class="lc" [class.lc--open]="expanded()" data-testid="learning-card" [attr.data-card-id]="c.id" [attr.data-card-status]="c.status">
      <header class="lc__head">
        <h2 class="lc__title">{{ c.title }}</h2>
        <span class="badge" data-testid="learning-status" [attr.data-status]="c.status">{{ statusLabel() }}</span>
      </header>
      @if (c.description) {
        @if (descriptionIsUrl()) {
          <a class="lc__desc" [href]="c.description" target="_blank" rel="noopener noreferrer">{{ c.description }}</a>
        } @else {
          <p class="lc__desc">{{ c.description }}</p>
        }
      }
      <div
        class="lc__progress"
        data-testid="milestone-progress"
        [attr.data-done]="c.milestonesDone"
        [attr.data-total]="c.milestonesTotal"
      >
        @if (c.milestonesTotal > 0) {
          <span class="bar" aria-hidden="true"><span [style.width.%]="percent()"></span></span>
          <span><strong>{{ progress() }}</strong> milestones done</span>
        } @else {
          <span class="muted">No milestones yet</span>
        }
      </div>
      <div class="lc__actions">
        <select
          class="lc__status"
          [attr.aria-label]="'Status of ' + c.title"
          [disabled]="busy()"
          (change)="onStatus($event)"
        >
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="s === selectedStatus()">{{ statusLabels[s] }}</option>
          }
        </select>
        <button
          type="button"
          class="btn btn--small"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="id"
          [attr.aria-label]="(expanded() ? 'Hide details for ' : 'Show details for ') + c.title"
          (click)="toggleExpanded()"
        >
          {{ expanded() ? 'Hide details' : 'Show details' }}
        </button>
        <button
          type="button"
          class="btn btn--small lc__remove"
          [disabled]="busy()"
          [attr.aria-label]="'Remove ' + c.title"
          (click)="remove.emit()"
        >
          Remove
        </button>
      </div>
      @if (expanded()) {
        <div class="lc__details" [id]="id" data-testid="learning-card-details">
          @if (detail(); as d) {
            <app-learning-milestones [cardId]="c.id" [milestones]="d.milestones" (changed)="loadDetail()" />
            <app-learning-notes [cardId]="c.id" [notes]="d.notes" (changed)="loadDetail()" />
          } @else if (detailError(); as err) {
            <app-error-state title="Couldn't load details" [message]="err.message" (retry)="loadDetail()" />
          } @else {
            <app-loading-state message="Loading details…" />
          }
        </div>
      }
    </article>
  `,
  styles: `
    .lc { display: flex; flex-direction: column; gap: 0.55rem; height: 100%; padding: 0.9rem 1rem; background: var(--surface); border: 1px solid var(--border); border-top: 4px solid var(--border); border-radius: var(--radius); }
    .lc[data-card-status='InProgress'] { border-top-color: var(--primary); }
    .lc[data-card-status='Completed'] { border-top-color: var(--success); }
    .lc__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
    .lc__title { margin: 0; font-size: 1.05rem; overflow-wrap: anywhere; }
    .lc__desc { margin: 0; color: var(--text-muted); font-size: 0.9rem; white-space: pre-line; overflow-wrap: anywhere; }
    a.lc__desc { color: var(--primary); }
    .badge { flex: none; padding: 0.05rem 0.55rem; border-radius: 999px; background: var(--hover); color: var(--text-muted); font-size: 0.78rem; font-weight: 600; }
    .badge[data-status='InProgress'] { background: var(--primary-soft); color: var(--primary); }
    .badge[data-status='Completed'] { background: #e3f4ea; color: var(--success); }
    .lc__progress { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
    .bar { flex: 0 0 5rem; height: 0.4rem; overflow: hidden; background: var(--hover); border-radius: 999px; }
    .bar span { display: block; height: 100%; background: var(--success); }
    .lc__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-top: auto; }
    .lc__status { min-height: 1.9rem; padding: 0.2rem 0.4rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); font: inherit; font-size: 0.875rem; }
    .lc__remove { margin-left: auto; color: var(--danger); }
    .lc__details { display: flex; flex-direction: column; gap: 0.9rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
  `,
})
export class LearningCard {
  private readonly api = inject(LearningApi);
  private readonly toast = inject(ToastService);

  readonly card = input.required<LearningCardSummary>();
  /** Disables the status select and remove while the parent's request for this card runs. */
  readonly busy = input(false);

  /** The user picked another status (the parent PUTs it, e.g. `LearningApi.setStatus`). */
  readonly statusChange = output<LearningCardStatus>();
  /** Remove clicked (the parent confirms and deletes). */
  readonly remove = output<void>();
  /** Fresh card detail after it was (re)loaded, e.g. after a milestone/note change. */
  readonly changed = output<LearningCardDetail>();
  /** The card no longer exists (404 while loading the detail). */
  readonly missing = output<void>();

  protected readonly id = `learning-card-details-${nextId++}`;
  protected readonly statuses = LEARNING_CARD_STATUSES;
  protected readonly statusLabels = LEARNING_CARD_STATUS_LABELS;
  protected readonly statusLabel = computed(() => LEARNING_CARD_STATUS_LABELS[this.card().status]);
  protected readonly progress = computed(() => formatMilestoneProgress(this.card()));
  protected readonly percent = computed(() => milestonePercent(this.card()));
  protected readonly descriptionIsUrl = computed(() => isHttpUrl(this.card().description));

  protected readonly expanded = signal(false);
  protected readonly detail = signal<LearningCardDetail | null>(null);
  protected readonly detailError = signal<ApiError | null>(null);

  /** Select value: optimistic while `busy`, otherwise the card's status (reverts after a failure). */
  protected readonly selectedStatus = linkedSignal<{ card: LearningCardSummary; busy: boolean }, LearningCardStatus>({
    source: () => ({ card: this.card(), busy: this.busy() }),
    computation: (src, prev) => (src.busy && prev ? prev.value : src.card.status),
  });

  private detailSub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detailSub?.unsubscribe());
  }

  protected toggleExpanded(): void {
    const open = !this.expanded();
    this.expanded.set(open);
    if (open) this.loadDetail();
  }

  /** (Re)loads the card with milestones and notes; the previous detail stays visible meanwhile. */
  loadDetail(): void {
    this.detailSub?.unsubscribe();
    this.detailError.set(null);
    this.detailSub = this.api.get(this.card().id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.changed.emit(detail);
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        if (err.isNotFound) {
          this.toast.error(`This learning card no longer exists: ${err.message}`);
          this.missing.emit();
          return;
        }
        this.detail.set(null);
        this.detailError.set(err);
      },
    });
  }

  protected onStatus(event: Event): void {
    const status = (event.target as HTMLSelectElement).value as LearningCardStatus;
    if (status === this.card().status) return;
    this.selectedStatus.set(status);
    this.statusChange.emit(status);
  }
}
