import {
  durationToMinutes,
  formatPlanWindow,
  mapPlanItemErrors,
  minutesToDuration,
  planItemKey,
  planItemTitle,
  SelectedPlanItem,
  toUpdatePlanRequest,
} from './plans.models';
import { makePlan } from './testing/plan-fixtures';

describe('plans.models', () => {
  describe('duration hours/minutes <-> minutes', () => {
    it('converts hours + minutes to total minutes', () => {
      expect(durationToMinutes(1, 30)).toBe(90);
      expect(durationToMinutes(0, 45)).toBe(45);
      expect(durationToMinutes(2, 0)).toBe(120);
    });

    it('treats empty parts as 0', () => {
      expect(durationToMinutes(null, 20)).toBe(20);
      expect(durationToMinutes(3, null)).toBe(180);
      expect(durationToMinutes(null, undefined)).toBe(0);
    });

    it('splits total minutes into hours and minutes', () => {
      expect(minutesToDuration(90)).toEqual({ hours: 1, minutes: 30 });
      expect(minutesToDuration(45)).toEqual({ hours: 0, minutes: 45 });
      expect(minutesToDuration(600)).toEqual({ hours: 10, minutes: 0 });
      expect(minutesToDuration(-5)).toEqual({ hours: 0, minutes: 0 });
    });

    it('round-trips', () => {
      for (const total of [1, 59, 60, 61, 125, 1439]) {
        const { hours, minutes } = minutesToDuration(total);
        expect(durationToMinutes(hours, minutes)).toBe(total);
      }
    });
  });

  it('planItemKey identifies type + id', () => {
    expect(planItemKey({ sourceType: 'Task', sourceId: 4 })).toBe('Task:4');
    expect(planItemKey({ sourceType: 'Habit', sourceId: 4 })).not.toBe(planItemKey({ sourceType: 'Task', sourceId: 4 }));
  });

  it('toUpdatePlanRequest keeps metadata only, with overrides', () => {
    const plan = makePlan({ title: 'P', priorityOrder: 2 });
    const body = toUpdatePlanRequest(plan, { priorityOrder: 5 });
    expect(body).toEqual({
      title: 'P',
      estimatedDurationMinutes: 90,
      startDateTime: plan.startDateTime,
      endDateTime: plan.endDateTime,
      priorityOrder: 5,
    });
    expect('items' in body).toBeFalse();
  });

  describe('formatPlanWindow', () => {
    it('shows only the end time when start and end are on the same local day', () => {
      const start = new Date(2026, 9, 11, 9, 0).toISOString();
      const end = new Date(2026, 9, 11, 12, 30).toISOString();
      const text = formatPlanWindow(start, end, 'en-US').replace(/\s/g, ' ');
      expect(text).toBe('Oct 11, 2026, 9:00 AM – 12:30 PM');
    });

    it('shows both dates when the window spans days', () => {
      const start = new Date(2026, 9, 11, 22, 0).toISOString();
      const end = new Date(2026, 9, 12, 1, 0).toISOString();
      expect(formatPlanWindow(start, end, 'en-US').replace(/\s/g, ' ')).toBe('Oct 11, 2026, 10:00 PM – Oct 12, 2026, 1:00 AM');
    });
  });

  it('planItemTitle falls back when the source title is missing', () => {
    expect(planItemTitle({ sourceTitle: 'X', sourceType: 'Task', sourceId: 1 })).toBe('X');
    expect(planItemTitle({ sourceTitle: null, sourceType: 'Habit', sourceId: 7 })).toBe('Habit #7');
  });

  describe('mapPlanItemErrors', () => {
    const items: SelectedPlanItem[] = [
      { sourceType: 'Task', sourceId: 42, title: 'Write report' },
      { sourceType: 'Habit', sourceId: 99, title: 'Stretch' },
      { sourceType: 'Task', sourceId: 42, title: 'Write report' },
    ];

    it('names the i-th selected item for items[i].sourceId and items[i] keys', () => {
      const { itemMessages, rest } = mapPlanItemErrors(
        {
          'items[1].sourceId': ["Habit with id '99' does not exist or has been deleted."],
          'items[2]': ['Duplicate item: Task 42 is already in the plan (items[0]).'],
        },
        items,
      );
      expect(itemMessages).toEqual([
        `Item 2 (Habit "Stretch"): Habit with id '99' does not exist or has been deleted.`,
        'Item 3 (Task "Write report"): Duplicate item: Task 42 is already in the plan (items[0]).',
      ]);
      expect(rest).toEqual({});
    });

    it('keeps other keys (including plain "items") in rest', () => {
      const { itemMessages, rest } = mapPlanItemErrors(
        { items: ['At least one item is required.'], endDateTime: ['End date/time must be after the start date/time.'] },
        [],
      );
      expect(itemMessages).toEqual([]);
      expect(rest).toEqual({
        items: ['At least one item is required.'],
        endDateTime: ['End date/time must be after the start date/time.'],
      });
    });

    it('handles sourceType keys and indexes outside the selection', () => {
      const { itemMessages } = mapPlanItemErrors(
        { 'items[0].sourceType': ['Source type is required.'], 'items[5]': ['Item is required.'] },
        items,
      );
      expect(itemMessages).toEqual([
        'Item 1 (Task "Write report"): Source type is required.',
        'Item 6: Item is required.',
      ]);
    });
  });
});
