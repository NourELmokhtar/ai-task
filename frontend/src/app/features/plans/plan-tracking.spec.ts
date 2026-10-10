import {
  compareByEndDesc,
  compareByPriority,
  formatCountdown,
  groupPlans,
  msUntil,
  PLAN_STATUS_LABELS,
  serverOffsetMs,
} from './plan-tracking';
import { makePlan } from './testing/plan-fixtures';

describe('plan tracking helpers', () => {
  const T0 = Date.parse('2026-10-10T16:00:00Z');

  describe('serverOffsetMs', () => {
    it('is server − client (server ahead → positive, behind → negative)', () => {
      expect(serverOffsetMs('2026-10-10T16:00:30Z', T0)).toBe(30_000);
      expect(serverOffsetMs('2026-10-10T15:59:55.500Z', T0)).toBe(-4_500);
      expect(serverOffsetMs('2026-10-10T16:00:00.0000000Z', T0)).toBe(0);
    });

    it('falls back to 0 for missing or invalid serverNow', () => {
      expect(serverOffsetMs(null, T0)).toBe(0);
      expect(serverOffsetMs(undefined, T0)).toBe(0);
      expect(serverOffsetMs('nope', T0)).toBe(0);
    });
  });

  describe('msUntil (countdown math with clock skew)', () => {
    const end = '2026-10-10T17:00:00Z';

    it('without skew: end − now', () => {
      expect(msUntil(end, 0, T0)).toBe(3_600_000);
    });

    it('client clock 2 min behind the server: corrected by the offset', () => {
      // Server says 16:00:00 while the client reads 15:58:00 → offset +120 s.
      const client = T0 - 120_000;
      const offset = serverOffsetMs('2026-10-10T16:00:00Z', client);
      expect(msUntil(end, offset, client)).toBe(3_600_000);
      // 10 s later on the client clock, 10 s less remain.
      expect(msUntil(end, offset, client + 10_000)).toBe(3_590_000);
    });

    it('client clock ahead of the server', () => {
      const client = T0 + 45_000;
      const offset = serverOffsetMs('2026-10-10T16:00:00Z', client);
      expect(msUntil(end, offset, client)).toBe(3_600_000);
    });

    it('never negative; invalid target → 0', () => {
      expect(msUntil(end, 0, Date.parse(end) + 5_000)).toBe(0);
      expect(msUntil('bad', 0, T0)).toBe(0);
    });
  });

  describe('formatCountdown', () => {
    it('formats hh:mm:ss, truncating partial seconds', () => {
      expect(formatCountdown(0)).toBe('00:00:00');
      expect(formatCountdown(999)).toBe('00:00:00');
      expect(formatCountdown(1_000)).toBe('00:00:01');
      expect(formatCountdown(59_999)).toBe('00:00:59');
      expect(formatCountdown(3_599_000)).toBe('00:59:59');
      expect(formatCountdown(3_723_000)).toBe('01:02:03');
    });

    it('keeps counting hours past a day and clamps negatives', () => {
      expect(formatCountdown(49 * 3_600_000)).toBe('49:00:00');
      expect(formatCountdown(-5_000)).toBe('00:00:00');
      expect(formatCountdown(NaN)).toBe('00:00:00');
    });
  });

  describe('groupPlans', () => {
    const p = (id: number, status: 'NotStarted' | 'InProgress' | 'Completed', priorityOrder: number, start: string, end: string) =>
      makePlan({ id, status, priorityOrder, startDateTime: start, endDateTime: end });

    it('splits by status: InProgress, NotStarted (both by priority, start, id) and Completed (end desc, id desc)', () => {
      const plans = [
        p(1, 'NotStarted', 2, '2026-10-11T08:00:00Z', '2026-10-11T09:00:00Z'),
        p(2, 'Completed', 1, '2026-10-09T08:00:00Z', '2026-10-09T09:00:00Z'),
        p(3, 'InProgress', 3, '2026-10-10T15:00:00Z', '2026-10-10T18:00:00Z'),
        p(4, 'NotStarted', 1, '2026-10-12T08:00:00Z', '2026-10-12T09:00:00Z'),
        p(5, 'InProgress', 1, '2026-10-10T15:30:00Z', '2026-10-10T17:00:00Z'),
        p(6, 'Completed', 5, '2026-10-10T08:00:00Z', '2026-10-10T09:00:00Z'),
        p(7, 'NotStarted', 2, '2026-10-11T07:00:00Z', '2026-10-11T09:00:00Z'),
        p(8, 'Completed', 2, '2026-10-08T08:00:00Z', '2026-10-10T09:00:00Z'),
        p(9, 'InProgress', 1, '2026-10-10T15:30:00Z', '2026-10-10T19:00:00Z'),
      ];
      const g = groupPlans(plans);
      expect(g.active.map((x) => x.id)).toEqual([5, 9, 3]);
      expect(g.upcoming.map((x) => x.id)).toEqual([4, 7, 1]);
      expect(g.completed.map((x) => x.id)).toEqual([8, 6, 2]);
    });

    it('does not mutate the input and handles an empty list', () => {
      const plans = [p(2, 'NotStarted', 5, '2026-10-11T08:00:00Z', '2026-10-11T09:00:00Z'), p(1, 'NotStarted', 1, '2026-10-11T08:00:00Z', '2026-10-11T09:00:00Z')];
      groupPlans(plans);
      expect(plans.map((x) => x.id)).toEqual([2, 1]);
      expect(groupPlans([])).toEqual({ active: [], upcoming: [], completed: [] });
    });

    it('comparators', () => {
      const a = p(1, 'Completed', 1, '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z');
      const b = p(2, 'Completed', 1, '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z');
      expect(compareByPriority(a, b)).toBeLessThan(0);
      expect(compareByEndDesc(a, b)).toBeGreaterThan(0);
    });
  });

  it('has a label for every status', () => {
    expect(PLAN_STATUS_LABELS).toEqual({ NotStarted: 'Not started', InProgress: 'In progress', Completed: 'Completed' });
  });
});
