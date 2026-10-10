/**
 * Habit DTOs mirroring the M03 API contract (see the M03 handoff), plus small display helpers.
 */

export type HabitFrequency = 'Daily' | 'Weekly';

export const HABIT_FREQUENCIES: readonly HabitFrequency[] = ['Daily', 'Weekly'];

export const HABIT_FREQUENCY_LABELS: Readonly<Record<HabitFrequency, string>> = {
  Daily: 'Daily',
  Weekly: 'Weekly',
};

/** Validation limits (BR-06). */
export const HABIT_NAME_MAX = 150;
export const HABIT_DESCRIPTION_MAX = 2000;

/** `HabitResponse` from the API. Progress fields are computed by the server for the `today` param. */
export interface HabitDto {
  id: number;
  name: string;
  description: string | null;
  frequency: HabitFrequency;
  isActive: boolean;
  /** ISO UTC */
  createdAt: string;
  /** ISO UTC */
  updatedAt: string;
  /** A completion exists dated exactly `today`. */
  completedToday: boolean;
  /** Daily: same as `completedToday`. Weekly: any completion in the current ISO week ("Done this week"). */
  completedForCurrentPeriod: boolean;
  /** Consecutive periods (days or ISO weeks) with at least one completion. */
  currentStreak: number;
  /** `YYYY-MM-DD` or null */
  lastCompletionDate: string | null;
}

/** `POST /api/habits` and `PUT /api/habits/{id}` body (PUT is a full replacement; `isActive` is not part of it). */
export interface HabitRequest {
  name: string;
  description: string | null;
  frequency: HabitFrequency;
}
export type CreateHabitRequest = HabitRequest;
export type UpdateHabitRequest = HabitRequest;

/** `CompletionResponse` from the API. */
export interface HabitCompletionDto {
  id: number;
  habitId: number;
  /** `YYYY-MM-DD` */
  date: string;
  /** ISO UTC */
  createdAt: string;
}

/**
 * `GET /api/habits` query params. `active` omitted → all habits (active and inactive),
 * `true` → active only, `false` → inactive only. `today` (`YYYY-MM-DD`) sets the progress fields.
 */
export type HabitListQuery = {
  active?: boolean;
  today?: string;
};

/** `GET /api/habits/{id}/completions` query params (`YYYY-MM-DD`). */
export type HabitCompletionsQuery = {
  from?: string;
  to?: string;
};

/** "3 days", "1 week", "0 days". */
export function formatStreak(streak: number, frequency: HabitFrequency): string {
  const unit = frequency === 'Weekly' ? 'week' : 'day';
  return `${streak} ${unit}${streak === 1 ? '' : 's'}`;
}

/** Splits a habit list into active and inactive habits, keeping the server order. */
export function partitionHabits(habits: readonly HabitDto[]): { active: HabitDto[]; inactive: HabitDto[] } {
  const active: HabitDto[] = [];
  const inactive: HabitDto[] = [];
  for (const h of habits) (h.isActive ? active : inactive).push(h);
  return { active, inactive };
}

/** Builds a full PUT body from a habit, with optional overrides. */
export function toHabitRequest(habit: HabitDto, changes: Partial<HabitRequest> = {}): HabitRequest {
  return { name: habit.name, description: habit.description, frequency: habit.frequency, ...changes };
}
