import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { formatCountdown, msUntil, serverOffsetMs } from '../plan-tracking';

/** Countdown refresh interval (NFR-P2 needs ≥ 1/min; target every second). */
export const REST_TIME_TICK_MS = 1000;

/**
 * Live rest-time countdown `hh:mm:ss` until `endDateTime` (M07 F3, BR-12 / A-21). Reusable (M08).
 *
 * - Hidden (renders nothing, no timer) when `restTimeSeconds` is `null`, i.e. the plan isn't `InProgress`.
 * - Server-clock corrected: when `serverNow` arrives, `offsetMs = Date.parse(serverNow) − Date.now()`;
 *   every second it shows `endDateTime − (Date.now() + offsetMs)`. `restTimeSeconds` is not decremented.
 *   Pass the `serverNow` of the same (fresh) response the plan came from.
 * - Emits `elapsed` once when the countdown reaches zero (re-armed by new `endDateTime`/`serverNow`),
 *   so the parent can refetch the plan for its new status.
 */
@Component({
  selector: 'app-rest-time',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <span class="rest" data-testid="plan-rest-time" role="timer" [attr.data-seconds]="seconds()" [attr.aria-label]="label() + ' ' + text()">
        <span class="rest__label">{{ label() }}</span>
        <span class="rest__value">{{ text() }}</span>
      </span>
    }
  `,
  styles: `
    .rest { display: inline-flex; align-items: baseline; gap: 0.4rem; font-size: 0.875rem; }
    .rest__label { color: var(--text-muted); }
    .rest__value { font-variant-numeric: tabular-nums; font-weight: 600; }
  `,
})
export class RestTime {
  /** ISO UTC end of the plan window. */
  readonly endDateTime = input.required<string>();
  /** ISO UTC server time of the response (`PlanDto.serverNow`). Missing → no correction. */
  readonly serverNow = input<string | null | undefined>(null);
  /** `PlanDto.restTimeSeconds`. `null` hides the countdown. */
  readonly restTimeSeconds = input<number | null | undefined>(null);
  readonly label = input('Rest time');

  /** The countdown reached zero (the plan should now be `Completed`: refetch it). */
  readonly elapsed = output<void>();

  private readonly now = signal(Date.now());
  protected readonly visible = computed(() => this.restTimeSeconds() !== null && this.restTimeSeconds() !== undefined);
  /** Recomputed only when `serverNow` changes, i.e. when a new response arrives. */
  private readonly offsetMs = computed(() => serverOffsetMs(this.serverNow()));
  /** Remaining milliseconds (≥ 0) on the corrected clock. */
  readonly remainingMs = computed(() => msUntil(this.endDateTime(), this.offsetMs(), this.now()));
  protected readonly seconds = computed(() => Math.floor(this.remainingMs() / 1000));
  protected readonly text = computed(() => formatCountdown(this.remainingMs()));

  constructor() {
    effect((onCleanup) => {
      if (!this.visible()) return;
      // Re-arm the zero event for every new window / response.
      this.endDateTime();
      this.serverNow();
      let fired = false;
      const tick = () => {
        this.now.set(Date.now());
        if (!fired && untracked(this.remainingMs) <= 0) {
          fired = true;
          this.elapsed.emit();
        }
      };
      // First check right away (outside change detection), then every second.
      const first = setTimeout(tick, 0);
      const id = setInterval(tick, REST_TIME_TICK_MS);
      onCleanup(() => {
        clearTimeout(first);
        clearInterval(id);
      });
    });
  }
}
