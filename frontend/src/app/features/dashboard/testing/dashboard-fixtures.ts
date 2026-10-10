import { DashboardActivePlan, DashboardHabitItem, DashboardResponse, emptyDashboard } from '../dashboard.models';

/* Test helpers. Not used by app code. */

type DeepPartialDashboard = Partial<Omit<DashboardResponse, 'tasks' | 'habits' | 'plans' | 'learning'>> & {
  tasks?: Partial<DashboardResponse['tasks']>;
  habits?: Partial<DashboardResponse['habits']>;
  plans?: Partial<DashboardResponse['plans']>;
  learning?: Partial<DashboardResponse['learning']>;
};

/** An all-zero dashboard with the given sections overridden. */
export function makeDashboard(changes: DeepPartialDashboard = {}): DashboardResponse {
  const base = emptyDashboard(changes.today, changes.serverNow);
  return {
    ...base,
    tasks: { ...base.tasks, ...changes.tasks },
    habits: { ...base.habits, ...changes.habits },
    plans: { ...base.plans, ...changes.plans },
    learning: { ...base.learning, ...changes.learning },
  };
}

export function makeHabitItem(changes: Partial<DashboardHabitItem> = {}): DashboardHabitItem {
  return {
    id: 1,
    name: 'Stretch',
    frequency: 'Daily',
    completedToday: false,
    completedForCurrentPeriod: false,
    currentStreak: 0,
    ...changes,
  };
}

export function makeActivePlan(changes: Partial<DashboardActivePlan> = {}): DashboardActivePlan {
  return {
    id: 1,
    title: 'Deep work',
    startDateTime: '2026-10-10T09:00:00Z',
    endDateTime: '2026-10-10T11:00:00Z',
    priorityOrder: 1,
    status: 'InProgress',
    progressPercent: 33,
    doneItems: 1,
    totalItems: 3,
    restTimeSeconds: 3600,
    ...changes,
  };
}
