import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatDateTime } from '../../../shared/utils/date-utils';
import { PlanDto } from '../plans.models';
import { RestTime } from './rest-time';

/**
 * Status-dependent timing line for a plan card (M07 F3/F4). Reusable (M08). Put it in `PlanCard`'s
 * extra slot: `<app-plan-timing planCardExtra [plan]="p" (elapsed)="refetch()" />`.
 * - `InProgress`: live `RestTime` countdown (emits `elapsed` at zero).
 * - `NotStarted`: `Starts <local date/time>` (test id `plan-starts`), no rest time.
 * - `Completed`: `Ended <local date/time> · NN% complete` (test id `plan-ended`).
 */
@Component({
  selector: 'app-plan-timing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RestTime],
  template: `
    @let p = plan();
    @switch (p.status) {
      @case ('InProgress') {
        <app-rest-time [endDateTime]="p.endDateTime" [serverNow]="p.serverNow" [restTimeSeconds]="p.restTimeSeconds" (elapsed)="elapsed.emit()" />
      }
      @case ('NotStarted') {
        <span class="timing" data-testid="plan-starts">Starts {{ start() }}</span>
      }
      @default {
        <span class="timing" data-testid="plan-ended">{{ endLabel() }} {{ end() }} · {{ p.progressPercent }}% complete</span>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .timing { color: var(--text-muted); font-size: 0.875rem; }
  `,
})
export class PlanTiming {
  readonly plan = input.required<PlanDto>();
  /** The rest-time countdown reached zero: refetch the plan. */
  readonly elapsed = output<void>();

  protected readonly start = computed(() => formatDateTime(this.plan().startDateTime));
  protected readonly end = computed(() => formatDateTime(this.plan().endDateTime));
  /** "Ended" once the window is over (by the server clock), else the plan was finished early. */
  protected readonly endLabel = computed(() => {
    const p = this.plan();
    const over = Date.parse(p.endDateTime) <= (Date.parse(p.serverNow) || Date.now());
    return over ? 'Ended' : 'Finished early · ends';
  });
}
