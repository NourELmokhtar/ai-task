/**
 * M07 plan tracking: pure, clock-injected helpers (no Angular). The server is the source of truth
 * for `status`; these only correct the client clock, format the countdown and group/order plans.
 */
import { PlanDto, PlanStatus } from './plans.models';

/** Badge labels per status. */
export const PLAN_STATUS_LABELS: Readonly<Record<PlanStatus, string>> = {
  NotStarted: 'Not started',
  InProgress: 'In progress',
  Completed: 'Completed',
};

/**
 * Server clock offset: `Date.parse(serverNow) − clientNow`. Add it to `Date.now()` to get the
 * server's "now". Compute it when the response arrives. `0` when `serverNow` is missing/invalid.
 */
export function serverOffsetMs(serverNow: string | null | undefined, clientNow: number = Date.now()): number {
  const server = serverNow ? Date.parse(serverNow) : NaN;
  return Number.isFinite(server) ? server - clientNow : 0;
}

/** Milliseconds from the (offset-corrected) client clock until `targetIso`, never negative. */
export function msUntil(targetIso: string, offsetMs: number, clientNow: number = Date.now()): number {
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, target - (clientNow + offsetMs));
}

/** Countdown text `hh:mm:ss` (whole seconds, truncated like the server). Hours may exceed 24 (`49:00:00`). */
export function formatCountdown(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Priority asc, then start asc, then id asc (the server's A-16 order). */
export function compareByPriority(a: PlanDto, b: PlanDto): number {
  return (
    a.priorityOrder - b.priorityOrder ||
    Date.parse(a.startDateTime) - Date.parse(b.startDateTime) ||
    a.id - b.id
  );
}

/** History order (A-23): end desc, then id desc. */
export function compareByEndDesc(a: PlanDto, b: PlanDto): number {
  return Date.parse(b.endDateTime) - Date.parse(a.endDateTime) || b.id - a.id;
}

export interface GroupedPlans {
  /** `InProgress`, by priority. */
  active: PlanDto[];
  /** `NotStarted`, by priority. */
  upcoming: PlanDto[];
  /** `Completed` (history), end date desc. */
  completed: PlanDto[];
}

/**
 * Splits one plan list (from `GET /api/plans`) by the server-computed `status` into the Todo Plans
 * groups. "Active & Upcoming" = `active` followed by `upcoming`.
 */
export function groupPlans(plans: readonly PlanDto[]): GroupedPlans {
  const active: PlanDto[] = [];
  const upcoming: PlanDto[] = [];
  const completed: PlanDto[] = [];
  for (const p of plans) {
    if (p.status === 'InProgress') active.push(p);
    else if (p.status === 'Completed') completed.push(p);
    else upcoming.push(p);
  }
  active.sort(compareByPriority);
  upcoming.sort(compareByPriority);
  completed.sort(compareByEndDesc);
  return { active, upcoming, completed };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
