/**
 * Date/time helpers.
 *
 * API conventions (see M01 handoff): date-only values are `YYYY-MM-DD`, timestamps are ISO-8601 UTC
 * (`2026-10-10T08:30:00Z`). The UI shows everything in the browser's local time zone.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Local calendar date of `date` as `YYYY-MM-DD`. */
export function toDateOnly(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's local date as `YYYY-MM-DD` (pass `now` for testing). */
export function todayLocal(now: Date = new Date()): string {
  return toDateOnly(now);
}

/** True when `value` is a valid calendar date in `YYYY-MM-DD` form. */
export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && parseDateOnly(value) !== null;
}

/** Parses `YYYY-MM-DD` as local midnight. Returns `null` for invalid input (e.g. `2026-02-30`). */
export function parseDateOnly(value: string): Date | null {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
    ? date
    : null;
}

/** Adds `days` (may be negative) to a `YYYY-MM-DD` date. */
export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  if (!date) throw new Error(`Invalid date: ${dateOnly}`);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  // Date-only strings are calendar dates, not instants: never shift them through UTC.
  if (DATE_ONLY_RE.test(value)) return parseDateOnly(value);
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** Formats a date (`YYYY-MM-DD`, ISO timestamp or Date) for display, e.g. `Oct 10, 2026`. Empty string if invalid. */
export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
  locale?: string,
): string {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : '';
}

/** Formats an ISO timestamp in local time, e.g. `Oct 10, 2026, 8:30 AM`. Empty string if invalid. */
export function formatDateTime(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale?: string,
): string {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : '';
}

/** Date to ISO-8601 UTC string (`...Z`). */
export function toUtcIso(date: Date): string {
  return date.toISOString();
}

/**
 * Local date-time (as produced by `<input type="datetime-local">`, e.g. `2026-10-10T08:30`)
 * to an ISO-8601 UTC string for the API. Returns `null` for invalid input.
 */
export function localDateTimeToUtcIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  const date = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO-8601 UTC string from the API to a local `YYYY-MM-DDTHH:mm` value for `datetime-local` inputs. */
export function utcIsoToLocalDateTime(iso: string): string | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return `${toDateOnly(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Formats a duration in seconds as `1h 5m 3s`. Zero parts are omitted; `0` gives `0s`.
 * Negative and fractional values are clamped/floored.
 */
export function formatDuration(totalSeconds: number): string {
  const secs = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/** Formats a duration in minutes as `1h 30m` (`0` gives `0m`). */
export function formatMinutes(totalMinutes: number): string {
  const mins = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0;
  return mins === 0 ? '0m' : formatDuration(mins * 60);
}
