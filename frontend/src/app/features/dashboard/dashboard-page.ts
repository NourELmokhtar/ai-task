import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { fromEvent, Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { SettingsService } from '../../core/settings';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { ToastService } from '../../shared/toast/toast.service';
import { todayLocal } from '../../shared/utils/date-utils';
import { HabitCard, HabitDto, HabitFormDialog, HabitsApi } from '../habits';
import { LearningCardFormDialog } from '../learning';
import { PlanProgressBar, PlanStartWatcherService, PlanStatusBadge, RestTime } from '../plans';
import { TaskDto, TaskFormDialog, TaskItem, TasksApi } from '../tasks';
import { DashboardMetricCards } from './components/dashboard-metrics';
import { DashboardApi } from './dashboard-api.service';
import {
  DashboardResponse,
  formatLongDate,
  fromHabitDto,
  greeting,
  toDashboardMetrics,
  toHabitDto,
} from './dashboard.models';

/** Periodic refresh (F9, ≤ 60 s). */
export const DASHBOARD_REFRESH_MS = 30_000;
/** A window focus refreshes only if the last request started at least this long ago (as on Todo Plans). */
export const DASHBOARD_FOCUS_REFRESH_GAP_MS = 15_000;

/**
 * /dashboard (M08): greeting, summary cards, today's tasks, today's habit checklist, active plans
 * with live rest time, a learning snapshot and quick-add actions. One `GET /api/dashboard` feeds
 * everything; counts are never patched locally.
 *
 * Refresh (F9): on mount, after every action (task/habit toggle, quick-add save), on window focus
 * (throttled), every `DASHBOARD_REFRESH_MS`, when a rest-time countdown reaches zero and when the
 * global plan start watcher reports a start. At most one request is in flight: background triggers
 * are skipped while one runs, action triggers are queued and run once it settles (so the result
 * always reflects the action).
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DashboardMetricCards,
    TaskItem,
    TaskFormDialog,
    HabitCard,
    HabitFormDialog,
    LearningCardFormDialog,
    PlanProgressBar,
    PlanStatusBadge,
    RestTime,
    EmptyState,
    ErrorState,
    LoadingState,
  ],
  template: `
    <section class="page">
      <header class="page-header head">
        <div>
          <h1>Dashboard</h1>
          <p class="head__greeting" data-testid="dashboard-greeting">{{ greetingText() }}</p>
          <p class="muted head__date" data-testid="dashboard-date">{{ dateText() }}</p>
        </div>
        <div class="head__quick" role="group" aria-label="Quick add" data-testid="quick-add">
          <button type="button" class="btn btn--primary" (click)="taskOpen.set(true)">Add Task</button>
          <button type="button" class="btn" (click)="habitOpen.set(true)">Add Habit</button>
          <button type="button" class="btn" (click)="learningOpen.set(true)">Add Learning Card</button>
          <a class="btn" routerLink="/plans/new">Create Plan</a>
        </div>
      </header>

      @if (error(); as err) {
        <app-error-state title="Couldn't load the dashboard" [message]="err.message" (retry)="retry()" />
      } @else if (data(); as d) {
        @if (refreshError(); as rerr) {
          <p class="stale" role="status" data-testid="dashboard-stale">
            Couldn't refresh: {{ rerr.message }}
            <button type="button" class="btn btn--small" (click)="refreshNow()">Retry</button>
          </p>
        }
        <app-dashboard-metrics [metrics]="metrics()!" />

        <div class="grid">
          <section class="card panel" aria-labelledby="dash-tasks" data-testid="dashboard-tasks">
            <div class="panel__head">
              <h2 id="dash-tasks">Today's tasks</h2>
              <a routerLink="/tasks">All tasks</a>
            </div>
            @if (d.tasks.dueToday.length === 0 && d.tasks.overdue.length === 0) {
              <app-empty-state
                title="Nothing due today"
                message="No tasks are due today or overdue."
                actionLabel="Add Task"
                (action)="taskOpen.set(true)"
              />
            } @else {
              <h3 class="panel__sub">Due today</h3>
              @if (d.tasks.dueToday.length) {
                <ul class="rows" aria-label="Due today" data-testid="dashboard-due-today">
                  @for (t of d.tasks.dueToday; track t.id) {
                    <li><app-task-item [task]="t" [actions]="false" [busy]="busyTasks().has(t.id)" (completeChange)="toggleTask(t, $event)" /></li>
                  }
                </ul>
              } @else {
                <p class="muted none">Nothing due today.</p>
              }
              @if (d.tasks.overdue.length) {
                <h3 class="panel__sub panel__sub--alert">Overdue</h3>
                <ul class="rows" aria-label="Overdue" data-testid="dashboard-overdue">
                  @for (t of d.tasks.overdue; track t.id) {
                    <li><app-task-item [task]="t" [actions]="false" [busy]="busyTasks().has(t.id)" (completeChange)="toggleTask(t, $event)" /></li>
                  }
                </ul>
              }
            }
          </section>

          <section class="card panel" aria-labelledby="dash-habits" data-testid="dashboard-habits">
            <div class="panel__head">
              <h2 id="dash-habits">Today's habits</h2>
              <a routerLink="/habits">All habits</a>
            </div>
            @if (habits().length === 0) {
              <app-empty-state
                title="No habits yet"
                message="Add a habit to build your daily checklist."
                actionLabel="Add Habit"
                (action)="habitOpen.set(true)"
              />
            } @else {
              <ul class="rows" aria-label="Habit checklist">
                @for (h of habits(); track h.id) {
                  <li>
                    <app-habit-card
                      [habit]="h"
                      [actions]="false"
                      [showDescription]="false"
                      [busy]="busyHabits().has(h.id)"
                      (completedChange)="toggleHabit(h, $event)"
                    />
                  </li>
                }
              </ul>
            }
          </section>

          <section class="card panel" aria-labelledby="dash-plans" data-testid="dashboard-plans">
            <div class="panel__head">
              <h2 id="dash-plans">Active plans</h2>
              <a routerLink="/plans">View all plans</a>
            </div>
            @if (d.plans.active.length === 0) {
              <app-empty-state
                title="No active plans"
                [message]="noPlansMessage()"
                actionLabel="Create Plan"
                (action)="createPlan()"
              />
            } @else {
              <ul class="rows" aria-label="Active plans">
                @for (p of d.plans.active; track p.id) {
                  <li class="plan" data-testid="dashboard-plan" [attr.data-plan-id]="p.id">
                    <div class="plan__head">
                      <h3 class="plan__title"><a routerLink="/plans">{{ p.title }}</a></h3>
                      <app-plan-status-badge [status]="p.status" />
                    </div>
                    <app-plan-progress-bar [percent]="p.progressPercent" [done]="p.doneItems" [total]="p.totalItems" [label]="p.title + ' progress'" />
                    <app-rest-time
                      [endDateTime]="p.endDateTime"
                      [serverNow]="d.serverNow"
                      [restTimeSeconds]="p.restTimeSeconds"
                      (elapsed)="refreshNow()"
                    />
                  </li>
                }
              </ul>
            }
          </section>

          @let l = metrics()!.learning;
          <section
            class="card panel"
            aria-labelledby="dash-learning"
            data-testid="dashboard-learning"
            [attr.data-milestones-done]="l.milestonesDone"
            [attr.data-milestones-total]="l.milestonesTotal"
            [attr.data-recent]="l.milestonesLast7Days"
          >
            <div class="panel__head">
              <h2 id="dash-learning">Learning</h2>
              <a routerLink="/learning">All learning</a>
            </div>
            @if (l.totalCards === 0) {
              <app-empty-state
                title="No learning cards yet"
                message="Track a course, book or skill with milestones."
                actionLabel="Add Learning Card"
                (action)="learningOpen.set(true)"
              />
            } @else {
              <ul class="stats" aria-label="Learning cards by status">
                <li data-testid="learning-not-started"><strong>{{ l.notStarted }}</strong> Not started</li>
                <li data-testid="learning-in-progress"><strong>{{ l.inProgress }}</strong> In progress</li>
                <li data-testid="learning-completed"><strong>{{ l.completed }}</strong> Completed</li>
              </ul>
              <p class="panel__sub">Milestones</p>
              <app-plan-progress-bar [percent]="l.milestonePercent" [done]="l.milestonesDone" [total]="l.milestonesTotal" label="Milestones done" />
              <p class="muted none" data-testid="learning-recent">
                {{ l.milestonesLast7Days }} {{ l.milestonesLast7Days === 1 ? 'milestone' : 'milestones' }} completed in the last 7 days
              </p>
            }
          </section>
        </div>
      } @else {
        <app-loading-state message="Loading dashboard…" />
      }
    </section>

    <app-task-form-dialog [(open)]="taskOpen" [defaultDueDate]="today()" (saved)="refreshNow()" />
    <app-habit-form-dialog [(open)]="habitOpen" (saved)="refreshNow()" />
    <app-learning-card-form-dialog [(open)]="learningOpen" (saved)="refreshNow()" />
  `,
  styles: `
    .head { align-items: flex-start; }
    .head__greeting { margin: 0.25rem 0 0; font-size: 1.1rem; font-weight: 600; }
    .head__date { margin: 0; font-size: 0.9rem; }
    .head__quick { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .stale { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0 0 0.75rem; color: var(--warning-fg); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr)); gap: 1rem; margin-top: 1rem; }
    .panel { display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
    .panel__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
    .panel__head h2 { margin: 0; }
    .panel__head a { font-size: 0.875rem; }
    .panel__sub { margin: 0.25rem 0 0; color: var(--text-muted); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .panel__sub--alert { color: var(--danger); }
    .rows { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .none { margin: 0; font-size: 0.9rem; }
    .plan { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 1rem; border: 1px solid var(--border); border-left: 4px solid var(--success); border-radius: var(--radius); }
    .plan__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .plan__title { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
    .plan__title a { color: inherit; text-decoration: none; }
    .plan__title a:hover { text-decoration: underline; }
    .stats { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 0; padding: 0; list-style: none; color: var(--text-muted); }
    .stats strong { color: var(--text); font-size: 1.25rem; }
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly tasksApi = inject(TasksApi);
  private readonly habitsApi = inject(HabitsApi);
  private readonly settings = inject(SettingsService);
  private readonly watcher = inject(PlanStartWatcherService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly data = signal<DashboardResponse | null>(null);
  /** Error of a load with nothing to show yet (full error state). */
  protected readonly error = signal<ApiError | null>(null);
  /** Error of a background refresh while data is shown (inline notice, data kept). */
  protected readonly refreshError = signal<ApiError | null>(null);
  /** True while the single dashboard request is in flight. */
  readonly inFlight = signal(false);

  protected readonly busyTasks = signal<ReadonlySet<number>>(new Set());
  protected readonly busyHabits = signal<ReadonlySet<number>>(new Set());
  protected readonly taskOpen = signal(false);
  protected readonly habitOpen = signal(false);
  protected readonly learningOpen = signal(false);

  /** Client clock for the greeting and date; advanced on every request (≤ 60 s apart). */
  private readonly now = signal(new Date());
  protected readonly today = computed(() => todayLocal(this.now()));
  protected readonly greetingText = computed(() => greeting(this.settings.displayName(), this.now()));
  protected readonly dateText = computed(() => formatLongDate(this.now()));

  protected readonly metrics = computed(() => {
    const d = this.data();
    return d ? toDashboardMetrics(d) : null;
  });
  protected readonly habits = computed(() => (this.data()?.habits.items ?? []).map(toHabitDto));
  protected readonly noPlansMessage = computed(() => {
    const upcoming = this.data()?.plans.upcomingCount ?? 0;
    return upcoming > 0
      ? `No plan is in progress right now. ${upcoming} upcoming.`
      : 'No plan is in progress right now. Build one from your tasks, habits and learning.';
  });

  private sub?: Subscription;
  private queued = false;
  private lastLoadAt = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.request(true);
    const timer = setInterval(() => this.refresh(), DASHBOARD_REFRESH_MS);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.sub?.unsubscribe();
    });
    fromEvent(window, 'focus')
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        if (Date.now() - this.lastLoadAt >= DASHBOARD_FOCUS_REFRESH_GAP_MS) this.refresh();
      });
    // A plan just started: its status and the counts changed on the server.
    this.watcher.started$.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.refreshNow());
  }

  /** Background refresh (timer, focus): skipped while a request is in flight. */
  refresh(): void {
    this.request(false);
  }

  /** Refresh that must reflect something that just happened: queued if a request is in flight. */
  refreshNow(): void {
    this.request(true);
  }

  protected retry(): void {
    this.error.set(null);
    this.refreshNow();
  }

  protected createPlan(): void {
    void this.router.navigate(['/plans/new']);
  }

  /** M02 toggle, then refetch (the row shows the saved task until the fresh dashboard lands). */
  protected toggleTask(task: TaskDto, done: boolean): void {
    setFlag(this.busyTasks, task.id, true);
    this.tasksApi.setCompleted(task, done).subscribe({
      next: (saved) => {
        this.replaceTask(saved);
        setFlag(this.busyTasks, task.id, false);
        this.toast.success(done ? 'Task completed' : 'Task marked as to do');
        this.refreshNow();
      },
      error: (e: unknown) => {
        setFlag(this.busyTasks, task.id, false);
        this.toast.error(`Couldn't update the task: ${toApiError(e).message}`);
        this.refreshNow();
      },
    });
  }

  /** M03 toggle (409/404 handled by the service), then refetch. */
  protected toggleHabit(habit: HabitDto, done: boolean): void {
    setFlag(this.busyHabits, habit.id, true);
    this.habitsApi.setCompletedToday(habit, done).subscribe({
      next: (fresh) => {
        this.replaceHabit(fresh);
        setFlag(this.busyHabits, habit.id, false);
        this.toast.success(done ? 'Marked as done today' : 'Marked as not done today');
        this.refreshNow();
      },
      error: (e: unknown) => {
        setFlag(this.busyHabits, habit.id, false);
        this.toast.error(`Couldn't update the habit: ${toApiError(e).message}`);
        this.refreshNow();
      },
    });
  }

  /** The single in-flight guard: one request at a time, plus at most one queued follow-up. */
  private request(queueIfBusy: boolean): void {
    if (this.inFlight()) {
      if (queueIfBusy) this.queued = true;
      return;
    }
    this.inFlight.set(true);
    this.lastLoadAt = Date.now();
    this.now.set(new Date());
    this.sub = this.api.get(todayLocal(this.now())).subscribe({
      next: (d) => {
        this.data.set(d);
        this.error.set(null);
        this.refreshError.set(null);
        this.settle();
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        if (this.data()) this.refreshError.set(err);
        else this.error.set(err);
        this.settle();
      },
    });
  }

  private settle(): void {
    this.inFlight.set(false);
    if (this.queued) {
      this.queued = false;
      this.request(false);
    }
  }

  private replaceTask(task: TaskDto): void {
    this.data.update((d) => {
      if (!d) return d;
      const swap = (list: TaskDto[]) => list.map((t) => (t.id === task.id ? task : t));
      return { ...d, tasks: { ...d.tasks, dueToday: swap(d.tasks.dueToday), overdue: swap(d.tasks.overdue) } };
    });
  }

  private replaceHabit(habit: HabitDto): void {
    this.data.update((d) => {
      if (!d) return d;
      const items = d.habits.items.map((h) => (h.id === habit.id ? fromHabitDto(habit) : h));
      return { ...d, habits: { ...d.habits, items } };
    });
  }
}

function setFlag(set: WritableSignal<ReadonlySet<number>>, id: number, on: boolean): void {
  set.update((s) => {
    const next = new Set(s);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
}
