import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { fromEvent, Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { ConfirmDialog } from '../../shared/components/confirm-dialog';
import { EmptyState } from '../../shared/components/empty-state';
import { ErrorState } from '../../shared/components/error-state';
import { LoadingState } from '../../shared/components/loading-state';
import { ToastService } from '../../shared/toast/toast.service';
import { PlanCard, PlanItemDoneChange } from './components/plan-card';
import { PlanStatusBadge } from './components/plan-status-badge';
import { PlanTiming } from './components/plan-timing';
import { PlanStartWatcherService } from './plan-start-watcher.service';
import { groupPlans } from './plan-tracking';
import { PlanDto } from './plans.models';
import { PlansApi } from './plans-api.service';

/** Periodic list refresh (F7, ≤ 60 s). */
export const PLANS_REFRESH_MS = 60_000;
/** A window focus refreshes only if the last load started at least this long ago (no request bursts). */
export const PLANS_FOCUS_REFRESH_GAP_MS = 15_000;

/**
 * /plans: Todo Plans grouped by the server-computed status (M07):
 * - **Active & Upcoming**: `InProgress` ("In progress") first, then `NotStarted` ("Upcoming"), each by priority.
 * - **Completed / History**: `Completed`, end date desc, with completion %.
 *
 * One `GET /api/plans` feeds every group (client-side split, so all cards share one `serverNow`).
 * Refreshed every `PLANS_REFRESH_MS`, on window focus, when a rest-time countdown reaches zero and when
 * the global start watcher detects a start (its fresh list is applied directly). Item toggles replace
 * the plan with the PATCH response, so status, progress and group change immediately (F6).
 */
@Component({
  selector: 'app-plans-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, PlanCard, PlanStatusBadge, PlanTiming, ConfirmDialog, EmptyState, LoadingState, ErrorState],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Todo Plans</h1>
        <a class="btn btn--primary" routerLink="new">Create Plan</a>
      </header>

      @if (error(); as err) {
        <app-error-state title="Couldn't load plans" [message]="err.message" (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading-state message="Loading plans…" />
      } @else if (plans().length === 0) {
        <app-empty-state
          title="No plans yet"
          message="Build a time-boxed plan from your tasks, habits and learning resources."
          actionLabel="Create Plan"
          (action)="create()"
        />
      } @else {
        @let g = groups();
        <p class="summary muted" aria-live="polite" data-testid="plans-summary">
          {{ plans().length }} {{ plans().length === 1 ? 'plan' : 'plans' }} · {{ g.active.length }} in progress ·
          {{ g.upcoming.length }} upcoming · {{ g.completed.length }} completed
          @if (loading()) {
            <span>· Updating…</span>
          }
        </p>

        <section class="group" aria-labelledby="plans-current-title" data-testid="plans-group-current">
          <h2 id="plans-current-title" class="group__title">Active &amp; Upcoming</h2>
          @if (g.active.length === 0 && g.upcoming.length === 0) {
            <app-empty-state message="No plans in progress or coming up. Create one to get started." actionLabel="Create Plan" (action)="create()" />
          }
          @if (g.active.length) {
            <h3 class="group__sub">In progress</h3>
            <ul class="list" aria-label="Active plans" data-testid="plans-active">
              @for (p of g.active; track p.id) {
                <ng-container *ngTemplateOutlet="planTpl; context: { $implicit: p }" />
              }
            </ul>
          }
          @if (g.upcoming.length) {
            <h3 class="group__sub">Upcoming</h3>
            <ul class="list" aria-label="Upcoming plans" data-testid="plans-upcoming">
              @for (p of g.upcoming; track p.id) {
                <ng-container *ngTemplateOutlet="planTpl; context: { $implicit: p }" />
              }
            </ul>
          }
        </section>

        <section class="group" aria-labelledby="plans-history-title" data-testid="plans-group-completed">
          <h2 id="plans-history-title" class="group__title">Completed / History</h2>
          @if (g.completed.length === 0) {
            <app-empty-state message="Completed plans will appear here with their completion." />
          } @else {
            <ul class="list" aria-label="Completed plans" data-testid="plans-completed">
              @for (p of g.completed; track p.id) {
                <ng-container *ngTemplateOutlet="planTpl; context: { $implicit: p }" />
              }
            </ul>
          }
        </section>
      }
    </section>

    <ng-template #planTpl let-p>
      <li class="entry" [class.entry--highlight]="isHighlighted(p)" data-testid="plan-entry" [attr.data-plan-id]="p.id" [attr.data-highlighted]="isHighlighted(p)">
        <app-plan-card
          [plan]="p"
          [busy]="busyPlans().has(p.id)"
          [busyItemIds]="busyItems()"
          (itemDoneChange)="toggleItem(p, $event)"
          (edit)="edit(p)"
          (remove)="askRemove(p)"
        >
          <app-plan-status-badge planCardStatus [status]="p.status" />
          <app-plan-timing planCardExtra [plan]="p" (elapsed)="refresh()" />
        </app-plan-card>
      </li>
    </ng-template>

    <app-confirm-dialog
      [(open)]="confirmOpen"
      title="Remove plan?"
      [message]="removeMessage()"
      confirmLabel="Remove"
      [danger]="true"
      (confirmed)="confirmRemove()"
    />
  `,
  styles: `
    .summary { margin: 0 0 0.75rem; font-size: 0.85rem; }
    .group { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.75rem; }
    .group__title { margin: 0; font-size: 1.15rem; }
    .group__sub { margin: 0.25rem 0 0; color: var(--text-muted); font-size: 0.8rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .list { display: flex; flex-direction: column; gap: 1rem; margin: 0; padding: 0; list-style: none; }
    .entry { border-radius: var(--radius); transition: box-shadow 0.3s; }
    .entry--highlight { box-shadow: 0 0 0 3px var(--success); }
  `,
})
export class PlansPage {
  private readonly api = inject(PlansApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly watcher = inject(PlanStartWatcherService);

  protected readonly plans = signal<PlanDto[]>([]);
  protected readonly groups = computed(() => groupPlans(this.plans()));
  protected readonly loading = signal(false);
  /** True after the first successful load (until then the loading state is shown). */
  protected readonly loaded = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busyPlans = signal<ReadonlySet<number>>(new Set());
  protected readonly busyItems = signal<ReadonlySet<number>>(new Set());

  protected readonly confirmOpen = signal(false);
  protected readonly removing = signal<PlanDto | null>(null);
  protected readonly removeMessage = computed(
    () => `"${this.removing()?.title ?? ''}" will be removed. Its tasks, habits and learning resources stay.`,
  );

  private loadSub?: Subscription;
  private lastLoadAt = 0;

  constructor() {
    this.load();
    const destroyRef = inject(DestroyRef);
    const timer = setInterval(() => this.refresh(), PLANS_REFRESH_MS);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.loadSub?.unsubscribe();
    });
    fromEvent(window, 'focus')
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        if (Date.now() - this.lastLoadAt >= PLANS_FOCUS_REFRESH_GAP_MS) this.refresh();
      });
    // A plan just started (global watcher): its fetch is fresh, so show it right away.
    this.watcher.started$.pipe(takeUntilDestroyed(destroyRef)).subscribe(({ plans }) => {
      if (this.loading()) return; // our own fresh load is about to land
      this.plans.set(plans);
      this.loaded.set(true);
      this.error.set(null);
    });
  }

  /** Loads the list, showing the loading/error states. */
  load(): void {
    this.fetch(false);
  }

  /** Background refresh: keeps the current list (no error state) if it fails; skipped while loading. */
  refresh(): void {
    if (this.loading()) return;
    this.fetch(true);
  }

  /** Highlight (A-22) while a plan that started during this session is still in progress. */
  protected isHighlighted(plan: PlanDto): boolean {
    return plan.status === 'InProgress' && this.watcher.highlighted().has(plan.id);
  }

  private fetch(silent: boolean): void {
    this.loadSub?.unsubscribe();
    this.lastLoadAt = Date.now();
    this.loading.set(true);
    if (!silent) this.error.set(null);
    this.loadSub = this.api.list().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loaded.set(true);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        if (silent && this.loaded()) return;
        this.error.set(toApiError(e));
        this.loaded.set(false);
      },
    });
  }

  protected create(): void {
    void this.router.navigate(['/plans/new']);
  }

  protected edit(plan: PlanDto): void {
    void this.router.navigate(['/plans', plan.id, 'edit']);
  }

  /**
   * PATCH the item, then replace the card with the returned plan: progress, status, rest time and
   * group change immediately (F6).
   */
  protected toggleItem(plan: PlanDto, { item, isDone }: PlanItemDoneChange): void {
    update(this.busyItems, item.id, true);
    this.api.setItemDone(plan.id, item.id, isDone).subscribe({
      next: (saved) => {
        this.replace(saved);
        update(this.busyItems, item.id, false);
        const what = item.sourceType === 'Task' && isDone ? 'Item done and task completed' : 'Item updated';
        this.toast.success(`${what} · ${saved.progressPercent}% complete`);
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        update(this.busyItems, item.id, false);
        this.toast.error(`Couldn't update the item: ${err.message}`);
        if (err.isNotFound) this.load();
      },
    });
  }

  protected askRemove(plan: PlanDto): void {
    this.removing.set(plan);
    this.confirmOpen.set(true);
  }

  protected confirmRemove(): void {
    const plan = this.removing();
    if (!plan) return;
    update(this.busyPlans, plan.id, true);
    this.api.delete(plan.id).subscribe({
      next: () => {
        update(this.busyPlans, plan.id, false);
        this.plans.update((list) => list.filter((p) => p.id !== plan.id));
        this.toast.success('Plan removed');
      },
      error: (e: unknown) => {
        const err = toApiError(e);
        update(this.busyPlans, plan.id, false);
        this.toast.error(`Couldn't remove the plan: ${err.message}`);
        if (err.isNotFound) this.load();
      },
    });
  }

  private replace(plan: PlanDto): void {
    this.plans.update((list) => list.map((p) => (p.id === plan.id ? plan : p)));
  }
}

function update(set: WritableSignal<ReadonlySet<number>>, id: number, on: boolean): void {
  set.update((s) => {
    const next = new Set(s);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
}
