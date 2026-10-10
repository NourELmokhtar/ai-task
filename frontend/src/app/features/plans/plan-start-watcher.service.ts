import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { SettingsService } from '../../core/settings/settings.service';
import { ToastService } from '../../shared/toast/toast.service';
import { msUntil, serverOffsetMs } from './plan-tracking';
import { PlanDto } from './plans.models';
import { PlansApi } from './plans-api.service';

/** Background poll interval (≤ 60 s, A-22 / NFR-P2). */
export const PLAN_WATCH_POLL_MS = 60_000;
/** A start timer fires this long after the (offset-corrected) start, so the server is surely past it. */
export const PLAN_START_TIMER_BUFFER_MS = 500;
/** Only starts within this horizon get a precise timer; the poll re-arms later ones. */
export const PLAN_START_TIMER_HORIZON_MS = 6 * 60 * 60 * 1000;
/** How long the "has started" toast stays. */
export const PLAN_START_TOAST_MS = 8000;
/** localStorage key holding the ids of plans whose start was already notified (JSON number array). */
export const PLAN_NOTIFIED_STORAGE_KEY = 'quickflow.plans.startNotified';

/** Emitted when one or more plans were detected as started (by the server-computed status). */
export interface PlanStartedEvent {
  /** The plans that just started (`InProgress`, first time seen by this browser). */
  started: PlanDto[];
  /** The full, fresh `GET /api/plans` list the start was detected in (same `serverNow`). */
  plans: PlanDto[];
}

/**
 * Global plan start watcher (M07 F5, A-22). Root-provided; `App` calls `start()` once, so it works
 * on every route.
 *
 * - Polls `GET /api/plans` every `PLAN_WATCH_POLL_MS` and arms one precise timer per upcoming plan
 *   (start corrected by the `serverNow` offset, + `PLAN_START_TIMER_BUFFER_MS`), which re-checks.
 * - A plan whose server `status` is `InProgress` and whose id isn't notified yet (also on app open)
 *   is notified once: toast `Plan '<title>' has started` when `SettingsService
 *   .planStartNotificationsEnabled()` is on (suppressed otherwise, but still marked as handled),
 *   and highlighted (`highlighted()`, plan ids) while it stays `InProgress`.
 * - Notified ids live in localStorage (`PLAN_NOTIFIED_STORAGE_KEY`); storage failures are ignored.
 * - `started$` lets pages (Todo Plans, M08 Dashboard) apply the fresh list immediately.
 * - Requests never overlap; errors are ignored until the next poll. `stop()`/destroy clears all timers.
 */
@Injectable({ providedIn: 'root' })
export class PlanStartWatcherService implements OnDestroy {
  private readonly api = inject(PlansApi);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(SettingsService);

  private running = false;
  private inFlight: Subscription | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly startTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly notified = new Set<number>(readNotified());

  private readonly _highlighted = signal<ReadonlySet<number>>(new Set());
  private readonly _started = new Subject<PlanStartedEvent>();

  /** Ids of plans that started during this session and are still `InProgress` (card highlight). */
  readonly highlighted = this._highlighted.asReadonly();
  /** Fires after a fetch that detected newly started plans. */
  readonly started$: Observable<PlanStartedEvent> = this._started.asObservable();

  /** True between `start()` and `stop()`. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Starts watching (idempotent): checks now, then polls. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.check();
  }

  /** Stops polling and clears every timer. */
  stop(): void {
    this.running = false;
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this.clearPoll();
    this.clearStartTimers();
  }

  ngOnDestroy(): void {
    this.stop();
    this._started.complete();
  }

  /** Whether the start of plan `id` was already handled (toast shown or suppressed). */
  isNotified(id: number): boolean {
    return this.notified.has(id);
  }

  /** Fetches the plans now (skipped while a request is in flight; its response re-arms the timers). */
  check(): void {
    if (!this.running || this.inFlight) return;
    this.clearPoll();
    const sub = this.api.list().subscribe({
      next: (plans) => {
        this.inFlight = null;
        this.process(plans);
        this.schedulePoll();
      },
      error: () => {
        this.inFlight = null;
        this.schedulePoll();
      },
    });
    if (!sub.closed) this.inFlight = sub;
  }

  private process(plans: PlanDto[]): void {
    const clientNow = Date.now();
    const offset = serverOffsetMs(plans[0]?.serverNow, clientNow);
    const notify = this.settings.planStartNotificationsEnabled();
    const started: PlanDto[] = [];
    // Another tab may have notified meanwhile.
    for (const id of readNotified()) this.notified.add(id);

    for (const p of plans) {
      if (p.status === 'InProgress' && !this.notified.has(p.id)) {
        this.notified.add(p.id);
        started.push(p);
        if (notify) this.toast.info(`Plan '${p.title}' has started`, PLAN_START_TOAST_MS);
      }
    }

    // Forget ids of plans that no longer exist, then persist.
    const present = new Set(plans.map((p) => p.id));
    for (const id of [...this.notified]) if (!present.has(id)) this.notified.delete(id);
    writeNotified(this.notified);

    const inProgress = new Set(plans.filter((p) => p.status === 'InProgress').map((p) => p.id));
    const highlighted = new Set([...this._highlighted()].filter((id) => inProgress.has(id)));
    for (const p of started) highlighted.add(p.id);
    this._highlighted.set(highlighted);

    this.armStartTimers(plans, offset, clientNow);
    if (started.length) this._started.next({ started, plans });
  }

  /** One timer per upcoming plan within the horizon; replaces all previous timers. */
  private armStartTimers(plans: PlanDto[], offset: number, clientNow: number): void {
    this.clearStartTimers();
    for (const p of plans) {
      if (p.status !== 'NotStarted') continue;
      const delay = msUntil(p.startDateTime, offset, clientNow);
      if (delay > PLAN_START_TIMER_HORIZON_MS) continue;
      this.startTimers.set(
        p.id,
        setTimeout(() => {
          this.startTimers.delete(p.id);
          this.check();
        }, delay + PLAN_START_TIMER_BUFFER_MS),
      );
    }
  }

  private schedulePoll(): void {
    this.clearPoll();
    if (this.running) this.pollTimer = setTimeout(() => this.check(), PLAN_WATCH_POLL_MS);
  }

  private clearPoll(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private clearStartTimers(): void {
    for (const t of this.startTimers.values()) clearTimeout(t);
    this.startTimers.clear();
  }
}

function readNotified(): number[] {
  try {
    const raw = localStorage.getItem(PLAN_NOTIFIED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is number => Number.isInteger(v)) : [];
  } catch {
    return [];
  }
}

function writeNotified(ids: ReadonlySet<number>): void {
  try {
    localStorage.setItem(PLAN_NOTIFIED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable (private mode, quota): notify-once then only holds for this session */
  }
}
