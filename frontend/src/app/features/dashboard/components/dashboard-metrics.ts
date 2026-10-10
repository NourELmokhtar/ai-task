import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DashboardMetrics } from '../dashboard.models';

/**
 * The four summary cards (F3). Presentational. Each card has a test id (`metric-tasks`,
 * `metric-habits`, `metric-plans`, `metric-learning`) and exposes its numbers as `data-*`
 * attributes, so e2e tests can read a value before and after an action.
 */
@Component({
  selector: 'app-dashboard-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = metrics();
    <ul class="metrics" aria-label="Summary">
      <li
        class="metric"
        data-testid="metric-tasks"
        [attr.data-completion]="m.tasks.completionPercent"
        [attr.data-done]="m.tasks.doneCount"
        [attr.data-total]="m.tasks.totalActive"
        [attr.data-due-today]="m.tasks.dueToday"
        [attr.data-overdue]="m.tasks.overdue"
      >
        <h2 class="metric__title">Tasks</h2>
        <p class="metric__value">{{ m.tasks.completionPercent }}%<span class="metric__unit"> complete</span></p>
        <p class="metric__line">{{ m.tasks.doneCount }} of {{ m.tasks.totalActive }} done</p>
        <p class="metric__line">
          <span data-testid="metric-tasks-due">{{ m.tasks.dueToday }} due today</span> ·
          <span data-testid="metric-tasks-overdue" [class.metric__alert]="m.tasks.overdue > 0">{{ m.tasks.overdue }} overdue</span>
        </p>
      </li>
      <li
        class="metric"
        data-testid="metric-habits"
        [attr.data-completed-today]="m.habits.completedToday"
        [attr.data-active]="m.habits.active"
        [attr.data-period]="m.habits.doneThisPeriod"
      >
        <h2 class="metric__title">Habits</h2>
        <p class="metric__value">{{ m.habits.completedToday }} / {{ m.habits.active }}<span class="metric__unit"> done today</span></p>
        @if (m.habits.weekly > 0) {
          <p class="metric__line" title="Weekly habits count once per week">
            {{ m.habits.doneThisPeriod }} / {{ m.habits.active }} on track this period (weekly: this week)
          </p>
        } @else {
          <p class="metric__line">{{ m.habits.active }} active {{ m.habits.active === 1 ? 'habit' : 'habits' }}</p>
        }
      </li>
      <li
        class="metric"
        data-testid="metric-plans"
        [attr.data-in-progress]="m.plans.inProgress"
        [attr.data-upcoming]="m.plans.upcoming"
      >
        <h2 class="metric__title">Plans</h2>
        <p class="metric__value">{{ m.plans.inProgress }}<span class="metric__unit"> in progress</span></p>
        <p class="metric__line">{{ m.plans.upcoming }} upcoming · {{ m.plans.completed }} completed</p>
      </li>
      <li
        class="metric"
        data-testid="metric-learning"
        [attr.data-in-progress]="m.learning.inProgress"
        [attr.data-milestones-done]="m.learning.milestonesDone"
        [attr.data-milestones-total]="m.learning.milestonesTotal"
        [attr.data-recent]="m.learning.milestonesLast7Days"
      >
        <h2 class="metric__title">Learning</h2>
        <p class="metric__value">{{ m.learning.inProgress }}<span class="metric__unit"> in progress</span></p>
        <p class="metric__line">{{ m.learning.milestonesDone }} / {{ m.learning.milestonesTotal }} milestones done</p>
        <p class="metric__line">{{ m.learning.milestonesLast7Days }} completed in the last 7 days</p>
      </li>
    </ul>
  `,
  styles: `
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .metric {
      padding: 0.9rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: 3px solid var(--primary);
      border-radius: var(--radius);
    }
    .metric__title { margin: 0; color: var(--text-muted); font-size: 0.8rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .metric__value { margin: 0.2rem 0; font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .metric__unit { color: var(--text-muted); font-size: 0.85rem; font-weight: 500; }
    .metric__line { margin: 0; color: var(--text-muted); font-size: 0.85rem; }
    .metric__alert { color: var(--danger); font-weight: 600; }
  `,
})
export class DashboardMetricCards {
  readonly metrics = input.required<DashboardMetrics>();
}
