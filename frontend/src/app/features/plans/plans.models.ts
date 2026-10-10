/**
 * Todo Plans DTOs mirroring the M06 API contract (see the M06 handoff), plus small pure helpers.
 * Times are ISO-8601 UTC strings; the UI shows them in local time.
 */
import { formatDateTime, toDateOnly } from '../../shared/utils/date-utils';

/**
 * Server-computed on every read (M07, A-20): all items done → `Completed`; now < start →
 * `NotStarted`; start ≤ now < end → `InProgress`; now ≥ end → `Completed`. Never sent by the client.
 */
export type PlanStatus = 'NotStarted' | 'InProgress' | 'Completed';

/** `GET /api/plans?group=` (M07): `active` = InProgress, `upcoming` = NotStarted, `completed` = history. */
export type PlanGroup = 'active' | 'upcoming' | 'completed';

export type PlanItemSourceType = 'Task' | 'Habit' | 'LearningResource';

export const PLAN_SOURCE_TYPES: readonly PlanItemSourceType[] = ['Task', 'Habit', 'LearningResource'];

export const PLAN_SOURCE_TYPE_LABELS: Readonly<Record<PlanItemSourceType, string>> = {
  Task: 'Task',
  Habit: 'Habit',
  LearningResource: 'Learning',
};

/** Decorative glyph per source type (always shown next to the text label). */
export const PLAN_SOURCE_TYPE_ICONS: Readonly<Record<PlanItemSourceType, string>> = {
  Task: '✓',
  Habit: '↻',
  LearningResource: '◆',
};

/** Validation limits (A-14..A-16). */
export const PLAN_TITLE_MAX = 200;

/** `PlanItemResponse`. */
export interface PlanItemDto {
  /** Use for the PATCH route. */
  id: number;
  sourceType: PlanItemSourceType;
  sourceId: number;
  /** Still resolved after the source is deleted; `null` only if the source row is missing entirely. */
  sourceTitle: string | null;
  /** `false` once the source was soft-deleted (A-24): show "Source removed". Still counts toward progress. */
  sourceAvailable: boolean;
  isDone: boolean;
}

/** `PlanResponse` (list, get, POST, PUT and PATCH all return it). */
export interface PlanDto {
  id: number;
  title: string;
  estimatedDurationMinutes: number;
  /** ISO UTC */
  startDateTime: string;
  /** ISO UTC, after `startDateTime` */
  endDateTime: string;
  /** ≥ 1, lower = higher priority. */
  priorityOrder: number;
  /** Computed by the server at `serverNow` (M07). */
  status: PlanStatus;
  /**
   * Whole seconds until `endDateTime` at `serverNow`, only while `InProgress`; otherwise `null` (A-21).
   * For a live countdown use `endDateTime` with the `serverNow` offset (see `RestTime`), don't decrement this.
   */
  restTimeSeconds: number | null;
  /** ISO UTC server time at which `status` / `restTimeSeconds` were computed (same for a whole list). */
  serverNow: string;
  /** ISO UTC */
  createdAt: string;
  /** ISO UTC. Changes on PUT and when the server saves a status transition (not "last edited"). */
  updatedAt: string;
  totalItems: number;
  doneItems: number;
  /** 0–100, `round(done / total × 100)`. */
  progressPercent: number;
  /** Creation order. */
  items: PlanItemDto[];
}

/** One `(sourceType, sourceId)` reference in a create request. */
export interface PlanItemRef {
  sourceType: PlanItemSourceType;
  sourceId: number;
}

/** A picker selection: the reference plus the title shown in the builder. */
export interface SelectedPlanItem extends PlanItemRef {
  title: string;
}

/** `PUT /api/plans/{id}`: metadata only, full replacement. */
export interface UpdatePlanRequest {
  title: string;
  estimatedDurationMinutes: number;
  /** ISO UTC (`Date.toISOString()`) */
  startDateTime: string;
  /** ISO UTC */
  endDateTime: string;
  priorityOrder: number;
}

/** `POST /api/plans`. Items are fixed after creation (A-17). */
export interface CreatePlanRequest extends UpdatePlanRequest {
  items: PlanItemRef[];
}

/** `PATCH /api/plans/{id}/items/{itemId}`. */
export interface UpdatePlanItemRequest {
  isDone: boolean;
}

/** Stable key for a source reference, e.g. `Task:42`. */
export function planItemKey(ref: PlanItemRef): string {
  return `${ref.sourceType}:${ref.sourceId}`;
}

/** `{ hours, minutes }` → total minutes. Empty/invalid parts count as 0. */
export function durationToMinutes(hours: number | null | undefined, minutes: number | null | undefined): number {
  const h = Number.isFinite(hours) ? Number(hours) : 0;
  const m = Number.isFinite(minutes) ? Number(minutes) : 0;
  return h * 60 + m;
}

/** Total minutes → `{ hours, minutes }` (for the builder in edit mode). */
export function minutesToDuration(total: number): { hours: number; minutes: number } {
  const mins = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  return { hours: Math.floor(mins / 60), minutes: mins % 60 };
}

/** PUT body from a plan, keeping its metadata, with optional overrides. */
export function toUpdatePlanRequest(
  plan: Pick<PlanDto, 'title' | 'estimatedDurationMinutes' | 'startDateTime' | 'endDateTime' | 'priorityOrder'>,
  changes: Partial<UpdatePlanRequest> = {},
): UpdatePlanRequest {
  const { title, estimatedDurationMinutes, startDateTime, endDateTime, priorityOrder } = plan;
  return { title, estimatedDurationMinutes, startDateTime, endDateTime, priorityOrder, ...changes };
}

/**
 * Local display of a plan's window: `Oct 11, 2026, 9:00 AM – 12:00 PM` on one day, otherwise both
 * full date-times.
 */
export function formatPlanWindow(startIso: string, endIso: string, locale?: string): string {
  const start = formatDateTime(startIso, undefined, locale);
  const end = new Date(endIso);
  if (!start || isNaN(end.getTime())) return start;
  const sameDay = toDateOnly(new Date(startIso)) === toDateOnly(end);
  const endText = sameDay
    ? formatDateTime(end, { timeStyle: 'short' }, locale)
    : formatDateTime(end, undefined, locale);
  return `${start} – ${endText}`;
}

/** Display title of an item (falls back when the source row is missing). */
export function planItemTitle(item: Pick<PlanItemDto, 'sourceTitle' | 'sourceType' | 'sourceId'>): string {
  return item.sourceTitle ?? `${PLAN_SOURCE_TYPE_LABELS[item.sourceType]} #${item.sourceId}`;
}

const ITEM_ERROR_KEY = /^items\[(\d+)\](?:\.(.+))?$/;

/**
 * Turns server `errors` keyed `items[i]`, `items[i].sourceId`, `items[i].sourceType` (BR-10, A-17)
 * into readable messages naming the i-th selected item. Other keys are returned untouched in `rest`.
 */
export function mapPlanItemErrors(
  fieldErrors: Readonly<Record<string, readonly string[]>>,
  items: readonly Pick<SelectedPlanItem, 'sourceType' | 'title'>[],
): { itemMessages: string[]; rest: Record<string, string[]> } {
  const itemMessages: string[] = [];
  const rest: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const m = ITEM_ERROR_KEY.exec(key);
    if (!m) {
      rest[key] = [...messages];
      continue;
    }
    const index = Number(m[1]);
    const item = items[index];
    const label = item
      ? `Item ${index + 1} (${PLAN_SOURCE_TYPE_LABELS[item.sourceType]} "${item.title}")`
      : `Item ${index + 1}`;
    for (const msg of messages) itemMessages.push(`${label}: ${msg}`);
  }
  return { itemMessages, rest };
}
