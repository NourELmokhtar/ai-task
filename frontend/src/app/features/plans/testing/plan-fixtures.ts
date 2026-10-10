import { PlanDto, PlanItemDto } from '../plans.models';

/* Test helpers with sensible defaults. Not used by app code. */

export function makeItem(changes: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: 1,
    sourceType: 'Task',
    sourceId: 10,
    sourceTitle: 'Write report',
    sourceAvailable: true,
    isDone: false,
    ...changes,
  };
}

/** A plan whose counts/percent follow its items unless overridden. */
export function makePlan(changes: Partial<PlanDto> = {}): PlanDto {
  const items = changes.items ?? [makeItem()];
  const done = items.filter((i) => i.isDone).length;
  return {
    id: 1,
    title: 'Morning plan',
    estimatedDurationMinutes: 90,
    startDateTime: '2026-10-11T06:00:00Z',
    endDateTime: '2026-10-11T09:00:00Z',
    priorityOrder: 1,
    status: 'NotStarted',
    restTimeSeconds: null,
    serverNow: '2026-10-10T10:00:00Z',
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
    totalItems: items.length,
    doneItems: done,
    progressPercent: items.length ? Math.round((done / items.length) * 100) : 0,
    items,
    ...changes,
  };
}

/** Three items: task, habit, learning card. */
export function threeItems(): PlanItemDto[] {
  return [
    makeItem({ id: 1, sourceType: 'Task', sourceId: 42, sourceTitle: 'Write report' }),
    makeItem({ id: 2, sourceType: 'Habit', sourceId: 16, sourceTitle: 'Stretch' }),
    makeItem({ id: 3, sourceType: 'LearningResource', sourceId: 3, sourceTitle: 'Clean Code' }),
  ];
}
