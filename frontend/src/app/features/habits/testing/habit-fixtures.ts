import { HabitDto } from '../habits.models';

/** Test helper: a `HabitDto` with sensible defaults. Not used by app code. */
export function makeHabit(changes: Partial<HabitDto> = {}): HabitDto {
  return {
    id: 1,
    name: 'Habit',
    description: null,
    frequency: 'Daily',
    isActive: true,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
    completedToday: false,
    completedForCurrentPeriod: false,
    currentStreak: 0,
    lastCompletionDate: null,
    ...changes,
  };
}
