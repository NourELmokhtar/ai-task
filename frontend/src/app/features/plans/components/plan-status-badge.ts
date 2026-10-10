import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PLAN_STATUS_LABELS } from '../plan-tracking';
import { PlanStatus } from '../plans.models';

/**
 * Status pill for a plan (M07 F4). Reusable (M08). Put it in `PlanCard`'s status slot:
 * `<app-plan-status-badge planCardStatus [status]="p.status" />`.
 * Test id `plan-status` with `data-status` = the raw status.
 */
@Component({
  selector: 'app-plan-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="status status--{{ status() }}" data-testid="plan-status" [attr.data-status]="status()">{{ label() }}</span>`,
  styles: `
    .status {
      display: inline-block;
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      background: var(--hover);
      color: var(--text-muted);
    }
    .status--InProgress { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
    .status--Completed { background: var(--primary-soft); color: var(--primary); }
  `,
})
export class PlanStatusBadge {
  readonly status = input.required<PlanStatus>();
  protected readonly label = computed(() => PLAN_STATUS_LABELS[this.status()] ?? this.status());
}
