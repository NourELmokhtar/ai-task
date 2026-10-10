import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatMinutes } from '../../../shared/utils/date-utils';
import {
  formatPlanWindow,
  PLAN_SOURCE_TYPE_ICONS,
  PLAN_SOURCE_TYPE_LABELS,
  PlanDto,
  PlanItemDto,
  planItemTitle,
} from '../plans.models';
import { PlanProgressBar } from './plan-progress-bar';

/** Emitted when the user toggles an item's done checkbox. */
export interface PlanItemDoneChange {
  item: PlanItemDto;
  isDone: boolean;
}

/**
 * One plan: title, priority, local start–end, estimated duration, progress bar and items with
 * done toggles. Presentational: the parent calls `PlansApi.setItemDone` and replaces the plan
 * with the response (the full plan).
 *
 * While an item id is in `busyItemIds`, its checkbox shows the requested state (`!isDone`) and is
 * disabled; when the id leaves the set without a plan change (an error) it reverts.
 *
 * Extension slots (M07):
 * - `<x planCardStatus>`: projected into the header next to the priority (status badge).
 * - `<x planCardExtra>`: projected between the meta line and the progress bar (rest-time countdown).
 */
@Component({
  selector: 'app-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanProgressBar],
  template: `
    @let p = plan();
    <article class="card plan" data-testid="plan-card" [attr.data-plan-id]="p.id" [attr.data-priority]="p.priorityOrder">
      <header class="plan__header">
        <div class="plan__heading">
          <h2 class="plan__title">{{ p.title }}</h2>
          <span class="badge" data-testid="plan-priority">Priority {{ p.priorityOrder }}</span>
          <ng-content select="[planCardStatus]" />
        </div>
        @if (actions()) {
          <div class="plan__actions">
            <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Edit ' + p.title" (click)="edit.emit()">
              Edit
            </button>
            <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Remove ' + p.title" (click)="remove.emit()">
              Remove
            </button>
          </div>
        }
      </header>
      <p class="plan__meta muted">
        <span data-testid="plan-window">{{ window() }}</span>
        <span aria-hidden="true">·</span>
        <span data-testid="plan-duration">Est. {{ duration() }}</span>
      </p>
      <ng-content select="[planCardExtra]" />
      <app-plan-progress-bar [percent]="p.progressPercent" [done]="p.doneItems" [total]="p.totalItems" [label]="'Progress of ' + p.title" />
      <ul class="plan__items" [attr.aria-label]="'Items in ' + p.title">
        @for (item of p.items; track item.id) {
          <li class="item" data-testid="plan-item" [attr.data-item-id]="item.id" [attr.data-source-type]="item.sourceType" [attr.data-done]="item.isDone">
            <input
              type="checkbox"
              [id]="'plan-item-' + item.id"
              [checked]="checked(item)"
              [disabled]="busy() || busyItemIds().has(item.id)"
              [attr.aria-label]="'Mark ' + title(item) + ' as done'"
              (change)="toggle(item, $event)"
            />
            <span class="item__type" data-testid="plan-item-type" [attr.data-type]="item.sourceType">
              <span aria-hidden="true">{{ icons[item.sourceType] }}</span> {{ labels[item.sourceType] }}
            </span>
            <label class="item__title" [class.item__title--done]="item.isDone" [for]="'plan-item-' + item.id">{{ title(item) }}</label>
            @if (!item.sourceAvailable) {
              <span class="badge badge--removed" data-testid="plan-item-removed">Source removed</span>
            }
          </li>
        }
      </ul>
    </article>
  `,
  styles: `
    .plan { display: flex; flex-direction: column; gap: 0.6rem; }
    .plan__header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
    .plan__heading { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
    .plan__title { margin: 0; overflow-wrap: anywhere; }
    .plan__actions { display: flex; gap: 0.4rem; }
    .plan__meta { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0; font-size: 0.875rem; }
    .badge {
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      background: var(--primary-soft);
      color: var(--primary);
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge--removed { background: var(--warning-bg); color: var(--warning-fg); }
    .plan__items { display: flex; flex-direction: column; gap: 0.15rem; margin: 0; padding: 0; list-style: none; }
    .item { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-top: 1px solid var(--border); }
    .item input { width: 1.05rem; height: 1.05rem; margin: 0; }
    .item__type { min-width: 5.5rem; color: var(--text-muted); font-size: 0.8rem; }
    .item__title { flex: 1; min-width: 8rem; overflow-wrap: anywhere; cursor: pointer; }
    .item__title--done { color: var(--text-muted); text-decoration: line-through; }
  `,
})
export class PlanCard {
  readonly plan = input.required<PlanDto>();
  /** Item ids with a PATCH in flight. */
  readonly busyItemIds = input<ReadonlySet<number>>(new Set());
  /** Disables all controls (e.g. while the plan is being removed). */
  readonly busy = input(false);
  /** Show Edit / Remove (set `false` for a compact dashboard card). */
  readonly actions = input(true);

  readonly itemDoneChange = output<PlanItemDoneChange>();
  readonly edit = output<void>();
  readonly remove = output<void>();

  protected readonly icons = PLAN_SOURCE_TYPE_ICONS;
  protected readonly labels = PLAN_SOURCE_TYPE_LABELS;
  protected readonly title = planItemTitle;
  protected readonly window = computed(() => formatPlanWindow(this.plan().startDateTime, this.plan().endDateTime));
  protected readonly duration = computed(() => formatMinutes(this.plan().estimatedDurationMinutes));

  /** Requested state while busy, else the server state. */
  protected checked(item: PlanItemDto): boolean {
    return this.busyItemIds().has(item.id) ? !item.isDone : item.isDone;
  }

  protected toggle(item: PlanItemDto, event: Event): void {
    this.itemDoneChange.emit({ item, isDone: (event.target as HTMLInputElement).checked });
  }
}
