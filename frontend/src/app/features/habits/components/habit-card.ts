import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { formatStreak, HABIT_FREQUENCY_LABELS, HabitDto } from '../habits.models';

/**
 * One habit: today's completion toggle, name, description, frequency label, "Done this week"
 * (weekly habits), streak, and (optionally) edit / deactivate|activate / remove buttons.
 * Inactive habits are dimmed and their toggle is disabled (the API rejects completing them).
 *
 * Presentational only: the parent performs the API calls, e.g. `HabitsApi.setCompletedToday(h, done)`.
 * Reusable (M08 dashboard checklist):
 * `<app-habit-card [habit]="h" [actions]="false" [busy]="busyId() === h.id" (completedChange)="toggle(h, $event)" />`.
 */
@Component({
  selector: 'app-habit-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = habit();
    <article
      class="habit"
      [class.habit--done]="h.completedToday"
      [class.habit--inactive]="!h.isActive"
      data-testid="habit-card"
      [attr.data-habit-id]="h.id"
    >
      <label class="habit__toggle" [title]="h.isActive ? '' : 'Activate the habit to complete it'">
        <input
          type="checkbox"
          [checked]="checked()"
          [disabled]="busy() || !h.isActive"
          [attr.aria-label]="'Mark ' + h.name + ' as done today'"
          (change)="onToggle($event)"
        />
        <span class="habit__toggle-text">Today</span>
      </label>
      <div class="habit__main">
        <span class="habit__name">{{ h.name }}</span>
        @if (h.description && showDescription()) {
          <p class="habit__desc">{{ h.description }}</p>
        }
        <div class="habit__meta">
          <span class="badge" [attr.data-frequency]="h.frequency" data-testid="habit-frequency">{{ frequencyLabel() }}</span>
          @if (h.frequency === 'Weekly') {
            <span class="badge" [class.badge--ok]="h.completedForCurrentPeriod" data-testid="habit-week">
              {{ h.completedForCurrentPeriod ? 'Done this week' : 'Not done this week' }}
            </span>
          }
          <span class="habit__streak" data-testid="habit-streak" [attr.data-streak]="h.currentStreak">Streak: {{ streakLabel() }}</span>
          @if (!h.isActive) {
            <span class="badge" data-testid="habit-inactive">Inactive</span>
          }
        </div>
      </div>
      @if (actions()) {
        <div class="habit__actions">
          <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Edit ' + h.name" (click)="edit.emit()">Edit</button>
          @if (h.isActive) {
            <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Deactivate ' + h.name" (click)="deactivate.emit()">Deactivate</button>
          } @else {
            <button type="button" class="btn btn--small" [disabled]="busy()" [attr.aria-label]="'Activate ' + h.name" (click)="activate.emit()">Activate</button>
          }
          <button type="button" class="btn btn--small habit__remove" [disabled]="busy()" [attr.aria-label]="'Remove ' + h.name" (click)="remove.emit()">Remove</button>
        </div>
      }
    </article>
  `,
  styles: `
    .habit {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--border);
      border-radius: var(--radius);
    }
    .habit--done { border-left-color: var(--success); }
    .habit--inactive { background: var(--hover); }
    .habit--inactive .habit__toggle, .habit--inactive .habit__main { opacity: 0.6; }
    .habit__toggle { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; font-size: 0.7rem; color: var(--text-muted); cursor: pointer; }
    .habit__toggle input { width: 1.25rem; height: 1.25rem; margin: 0.1rem 0 0; cursor: inherit; }
    .habit--inactive .habit__toggle { cursor: not-allowed; }
    .habit__main { flex: 1; min-width: 0; }
    .habit__name { font-weight: 600; overflow-wrap: anywhere; }
    .habit__desc { margin: 0.15rem 0 0; color: var(--text-muted); font-size: 0.9rem; white-space: pre-line; overflow-wrap: anywhere; }
    .habit__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-top: 0.35rem; font-size: 0.8rem; }
    .habit__streak { color: var(--text-muted); font-weight: 600; }
    .badge { padding: 0.05rem 0.5rem; border-radius: 999px; background: var(--hover); color: var(--text-muted); font-weight: 600; }
    [data-frequency='Daily'] { background: var(--primary-soft); color: var(--primary); }
    [data-frequency='Weekly'] { background: var(--warning-bg); color: var(--warning-fg); }
    .badge--ok { background: #e3f4ea; color: var(--success); }
    .habit__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.35rem; }
    .habit__remove { color: var(--danger); }
    @media (max-width: 640px) {
      .habit { flex-wrap: wrap; }
      .habit__actions { width: 100%; justify-content: flex-start; padding-left: 2.6rem; }
    }
  `,
})
export class HabitCard {
  readonly habit = input.required<HabitDto>();
  /** Disables the controls while a request for this habit is running. */
  readonly busy = input(false);
  /** Show the edit / deactivate|activate / remove buttons. */
  readonly actions = input(true);
  /** Show the description (a compact dashboard row may hide it). */
  readonly showDescription = input(true);

  /** `true` = mark done today, `false` = remove today's completion. */
  readonly completedChange = output<boolean>();
  readonly edit = output<void>();
  readonly deactivate = output<void>();
  readonly activate = output<void>();
  readonly remove = output<void>();

  /**
   * Toggle state: optimistic while `busy`, otherwise follows `completedToday`. When a request fails
   * the parent clears `busy` without changing the habit, so the box reverts.
   */
  protected readonly checked = linkedSignal<{ habit: HabitDto; busy: boolean }, boolean>({
    source: () => ({ habit: this.habit(), busy: this.busy() }),
    computation: (src, prev) => (src.busy && prev ? prev.value : src.habit.completedToday),
  });
  protected readonly frequencyLabel = computed(() => HABIT_FREQUENCY_LABELS[this.habit().frequency]);
  protected readonly streakLabel = computed(() =>
    formatStreak(this.habit().currentStreak, this.habit().frequency),
  );

  protected onToggle(event: Event): void {
    const wanted = (event.target as HTMLInputElement).checked;
    this.checked.set(wanted);
    this.completedChange.emit(wanted);
  }
}
