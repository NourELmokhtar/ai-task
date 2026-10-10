import { makeTask } from '../tasks/testing/task-fixtures';
import { emptyDashboard, fromHabitDto, greeting, timeOfDay, toDashboardMetrics, toHabitDto } from './dashboard.models';
import { makeDashboard, makeHabitItem } from './testing/dashboard-fixtures';

const at = (h: number, m = 0) => new Date(2026, 9, 10, h, m, 0);

describe('dashboard models', () => {
  describe('toDashboardMetrics', () => {
    it('maps an empty dashboard to zeros', () => {
      const m = toDashboardMetrics(emptyDashboard());
      expect(m.tasks).toEqual({ completionPercent: 0, doneCount: 0, totalActive: 0, dueToday: 0, overdue: 0, completedToday: 0 });
      expect(m.habits).toEqual({ completedToday: 0, active: 0, doneThisPeriod: 0, weekly: 0 });
      expect(m.plans).toEqual({ inProgress: 0, upcoming: 0, completed: 0 });
      expect(m.learning.totalCards).toBe(0);
      expect(m.learning.milestonePercent).toBe(0);
    });

    it('takes the server counts as they are and counts list lengths for due today / overdue', () => {
      const m = toDashboardMetrics(
        makeDashboard({
          tasks: {
            dueToday: [makeTask({ id: 1 }), makeTask({ id: 2, status: 'Done' })],
            overdue: [makeTask({ id: 3, isOverdue: true })],
            completedTodayCount: 4,
            totalActive: 50,
            doneCount: 16,
            completionPercent: 32,
          },
          plans: { inProgressCount: 4, upcomingCount: 3, completedCount: 2 },
          learning: {
            notStartedCount: 4,
            inProgressCount: 3,
            completedCount: 3,
            milestonesDone: 13,
            milestonesTotal: 30,
            milestonesCompletedLast7Days: 9,
          },
        }),
      );
      expect(m.tasks).toEqual({ completionPercent: 32, doneCount: 16, totalActive: 50, dueToday: 2, overdue: 1, completedToday: 4 });
      expect(m.plans).toEqual({ inProgress: 4, upcoming: 3, completed: 2 });
      expect(m.learning).toEqual({
        inProgress: 3,
        notStarted: 4,
        completed: 3,
        totalCards: 10,
        milestonesDone: 13,
        milestonesTotal: 30,
        milestonePercent: 43,
        milestonesLast7Days: 9,
      });
    });

    it('habits: the main metric is completedTodayCount; weekly habits done earlier count only for the period', () => {
      const m = toDashboardMetrics(
        makeDashboard({
          habits: {
            activeCount: 3,
            completedTodayCount: 1,
            items: [
              makeHabitItem({ id: 1, completedToday: true, completedForCurrentPeriod: true }),
              makeHabitItem({ id: 2, frequency: 'Weekly', completedToday: false, completedForCurrentPeriod: true }),
              makeHabitItem({ id: 3 }),
            ],
          },
        }),
      );
      expect(m.habits).toEqual({ completedToday: 1, active: 3, doneThisPeriod: 2, weekly: 1 });
    });
  });

  describe('greeting', () => {
    it('picks the time of day (05–11 morning, 12–17 afternoon, otherwise evening)', () => {
      expect(timeOfDay(at(4, 59))).toBe('evening');
      expect(timeOfDay(at(5))).toBe('morning');
      expect(timeOfDay(at(11, 59))).toBe('morning');
      expect(timeOfDay(at(12))).toBe('afternoon');
      expect(timeOfDay(at(17, 59))).toBe('afternoon');
      expect(timeOfDay(at(18))).toBe('evening');
      expect(timeOfDay(at(0))).toBe('evening');
    });

    it('adds the display name when set', () => {
      expect(greeting('Sam', at(8))).toBe('Good morning, Sam');
      expect(greeting('  Sam  ', at(13))).toBe('Good afternoon, Sam');
    });

    it('is generic when the name is null, empty or blank', () => {
      expect(greeting(null, at(20))).toBe('Good evening');
      expect(greeting(undefined, at(8))).toBe('Good morning');
      expect(greeting('', at(8))).toBe('Good morning');
      expect(greeting('   ', at(13))).toBe('Good afternoon');
    });
  });

  it('converts habit items to HabitDto (active, no description) and back', () => {
    const item = makeHabitItem({ id: 7, name: 'Read', frequency: 'Weekly', completedForCurrentPeriod: true, currentStreak: 2 });
    const dto = toHabitDto(item);
    expect(dto.isActive).toBeTrue();
    expect(dto.description).toBeNull();
    expect(dto.completedForCurrentPeriod).toBeTrue();
    expect(fromHabitDto(dto)).toEqual(item);
  });
});
