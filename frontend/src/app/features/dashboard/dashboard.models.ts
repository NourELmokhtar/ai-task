/**
 * Dashboard DTOs mirroring the M08 handoff (`GET /api/dashboard?today=`), plus pure helpers for the
 * page: metric mapping, greeting and date text. Nothing here re-implements a business rule; every
 * count comes from the server.
 */
import { HabitDto, HabitFrequency } from '../habits';
import { TaskDto } from '../tasks';

export interface DashboardTasks {
  /** `dueDate == today`, not archived, any status (Done included). */
  dueToday: TaskDto[];
  /** `dueDate < today`, not Done, not archived (A-05). */
  overdue: TaskDto[];
  completedTodayCount: number;
  /** Non-archived tasks, any status. */
  totalActive: number;
  doneCount: number;
  /** 0–100, `round(done / totalActive × 100)`, 0 when there are no tasks (A-25). */
  completionPercent: number;
}

export interface DashboardHabitItem {
  id: number;
  name: string;
  frequency: HabitFrequency;
  /** A completion dated exactly `today`. */
  completedToday: boolean;
  /** Daily: same as `completedToday`. Weekly: any completion this ISO week. */
  completedForCurrentPeriod: boolean;
  currentStreak: number;
}

export interface DashboardHabits {
  activeCount: number;
  /** Active habits completed **today** (a weekly habit done earlier this week is not counted). */
  completedTodayCount: number;
  /** Active habits, oldest first. */
  items: DashboardHabitItem[];
}

export interface DashboardActivePlan {
  id: number;
  title: string;
  /** ISO UTC */
  startDateTime: string;
  /** ISO UTC */
  endDateTime: string;
  priorityOrder: number;
  status: 'InProgress';
  /** 0–100 */
  progressPercent: number;
  doneItems: number;
  totalItems: number;
  /** Whole seconds until `endDateTime` at `serverNow` (≥ 0). Use `RestTime` for the live countdown. */
  restTimeSeconds: number;
}

export interface DashboardPlans {
  inProgressCount: number;
  upcomingCount: number;
  completedCount: number;
  /** `InProgress` plans in A-16 order. */
  active: DashboardActivePlan[];
}

export interface DashboardLearning {
  notStartedCount: number;
  inProgressCount: number;
  completedCount: number;
  milestonesDone: number;
  milestonesTotal: number;
  /** Rolling window: `isDone && completedAt ≥ serverNow − 7 × 24 h`. */
  milestonesCompletedLast7Days: number;
}

export interface DashboardResponse {
  /** ISO UTC: the instant used for plan status / rest time and the 7-day window. */
  serverNow: string;
  /** `YYYY-MM-DD`, the effective today (echo of `?today=`). */
  today: string;
  tasks: DashboardTasks;
  habits: DashboardHabits;
  plans: DashboardPlans;
  learning: DashboardLearning;
}

/** Values shown on the four summary cards (F3). */
export interface DashboardMetrics {
  tasks: {
    completionPercent: number;
    doneCount: number;
    totalActive: number;
    dueToday: number;
    overdue: number;
    completedToday: number;
  };
  habits: {
    /** The agreed metric (handoff §5): habits completed **today**. */
    completedToday: number;
    active: number;
    /** Habits done for their current period (daily: today, weekly: this week). Shown as a secondary line. */
    doneThisPeriod: number;
    weekly: number;
  };
  plans: { inProgress: number; upcoming: number; completed: number };
  learning: {
    inProgress: number;
    notStarted: number;
    completed: number;
    totalCards: number;
    milestonesDone: number;
    milestonesTotal: number;
    milestonePercent: number;
    milestonesLast7Days: number;
  };
}

/** Maps the response onto the summary cards. Counts are taken as they are, never recomputed. */
export function toDashboardMetrics(d: DashboardResponse): DashboardMetrics {
  const { tasks, habits, plans, learning } = d;
  return {
    tasks: {
      completionPercent: tasks.completionPercent,
      doneCount: tasks.doneCount,
      totalActive: tasks.totalActive,
      dueToday: tasks.dueToday.length,
      overdue: tasks.overdue.length,
      completedToday: tasks.completedTodayCount,
    },
    habits: {
      completedToday: habits.completedTodayCount,
      active: habits.activeCount,
      doneThisPeriod: habits.items.filter((h) => h.completedForCurrentPeriod).length,
      weekly: habits.items.filter((h) => h.frequency === 'Weekly').length,
    },
    plans: { inProgress: plans.inProgressCount, upcoming: plans.upcomingCount, completed: plans.completedCount },
    learning: {
      inProgress: learning.inProgressCount,
      notStarted: learning.notStartedCount,
      completed: learning.completedCount,
      totalCards: learning.notStartedCount + learning.inProgressCount + learning.completedCount,
      milestonesDone: learning.milestonesDone,
      milestonesTotal: learning.milestonesTotal,
      milestonePercent: learning.milestonesTotal
        ? Math.round((learning.milestonesDone / learning.milestonesTotal) * 100)
        : 0,
      milestonesLast7Days: learning.milestonesCompletedLast7Days,
    },
  };
}

/**
 * A `HabitDto` for the reused M03 `HabitCard` (dashboard items are always active habits and carry no
 * description). Only the fields the card reads matter.
 */
export function toHabitDto(item: DashboardHabitItem): HabitDto {
  return {
    id: item.id,
    name: item.name,
    description: null,
    frequency: item.frequency,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    completedToday: item.completedToday,
    completedForCurrentPeriod: item.completedForCurrentPeriod,
    currentStreak: item.currentStreak,
    lastCompletionDate: null,
  };
}

/** Back from a fresh `HabitDto` (toggle response) to a dashboard item. */
export function fromHabitDto(h: HabitDto): DashboardHabitItem {
  return {
    id: h.id,
    name: h.name,
    frequency: h.frequency,
    completedToday: h.completedToday,
    completedForCurrentPeriod: h.completedForCurrentPeriod,
    currentStreak: h.currentStreak,
  };
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/** 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening (local time). */
export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

/** "Good morning, Sam" or, without a (non-blank) display name, the generic "Good morning". */
export function greeting(displayName: string | null | undefined, now: Date = new Date()): string {
  const base = `Good ${timeOfDay(now)}`;
  const name = displayName?.trim();
  return name ? `${base}, ${name}` : base;
}

/** Long local date, e.g. "Saturday, October 10, 2026" (browser locale). */
export function formatLongDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
}

/** An all-zero response (empty DB), used by tests. */
export function emptyDashboard(today = '2026-10-10', serverNow = '2026-10-10T10:00:00Z'): DashboardResponse {
  return {
    serverNow,
    today,
    tasks: { dueToday: [], overdue: [], completedTodayCount: 0, totalActive: 0, doneCount: 0, completionPercent: 0 },
    habits: { activeCount: 0, completedTodayCount: 0, items: [] },
    plans: { inProgressCount: 0, upcomingCount: 0, completedCount: 0, active: [] },
    learning: {
      notStartedCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      milestonesDone: 0,
      milestonesTotal: 0,
      milestonesCompletedLast7Days: 0,
    },
  };
}
