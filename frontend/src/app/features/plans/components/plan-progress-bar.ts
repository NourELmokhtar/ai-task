import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Completion bar for a plan (or anything with done/total): `role="progressbar"` + `NN%` text.
 *
 * ```html
 * <app-plan-progress-bar [percent]="plan.progressPercent" [done]="plan.doneItems" [total]="plan.totalItems" />
 * ```
 * Reusable by M07/M08. Test id `plan-progress` (with `data-percent`).
 */
@Component({
  selector: 'app-plan-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress" data-testid="plan-progress" [attr.data-percent]="value()">
      <div
        class="progress__track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="value()"
        [attr.aria-label]="label()"
        [attr.aria-valuetext]="text()"
      >
        <div class="progress__fill" [class.progress__fill--done]="value() === 100" [style.width.%]="value()"></div>
      </div>
      <span class="progress__text" data-testid="plan-progress-text">{{ text() }}</span>
    </div>
  `,
  styles: `
    .progress { display: flex; align-items: center; gap: 0.6rem; }
    .progress__track {
      flex: 1;
      height: 0.55rem;
      border-radius: 999px;
      background: var(--primary-soft);
      overflow: hidden;
    }
    .progress__fill { height: 100%; background: var(--primary); transition: width 0.25s ease; }
    .progress__fill--done { background: var(--success); }
    .progress__text { min-width: 5.5rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; text-align: right; }
    @media (prefers-reduced-motion: reduce) { .progress__fill { transition: none; } }
  `,
})
export class PlanProgressBar {
  /** 0–100 (clamped and rounded). */
  readonly percent = input.required<number>();
  /** Optional counts; when both are set the text reads `33% · 1/3`. */
  readonly done = input<number | null>(null);
  readonly total = input<number | null>(null);
  /** Accessible name of the bar. */
  readonly label = input('Plan progress');

  protected readonly value = computed(() => {
    const p = this.percent();
    return Number.isFinite(p) ? Math.min(100, Math.max(0, Math.round(p))) : 0;
  });

  protected readonly text = computed(() => {
    const done = this.done();
    const total = this.total();
    return done !== null && total !== null ? `${this.value()}% · ${done}/${total}` : `${this.value()}%`;
  });
}
