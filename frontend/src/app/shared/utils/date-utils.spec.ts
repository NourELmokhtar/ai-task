import {
  addDays,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMinutes,
  isDateOnly,
  localDateTimeToUtcIso,
  parseDateOnly,
  todayLocal,
  toDateOnly,
  utcIsoToLocalDateTime,
} from './date-utils';

describe('date-utils', () => {
  describe('formatDuration', () => {
    it('formats h m s and omits zero parts', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(45)).toBe('45s');
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(3600)).toBe('1h');
      expect(formatDuration(3661)).toBe('1h 1m 1s');
      expect(formatDuration(7320)).toBe('2h 2m');
      expect(formatDuration(36000 + 5)).toBe('10h 5s');
    });

    it('clamps negative/invalid values and floors fractions', () => {
      expect(formatDuration(-5)).toBe('0s');
      expect(formatDuration(Number.NaN)).toBe('0s');
      expect(formatDuration(59.9)).toBe('59s');
    });

    it('formats minutes', () => {
      expect(formatMinutes(0)).toBe('0m');
      expect(formatMinutes(45)).toBe('45m');
      expect(formatMinutes(90)).toBe('1h 30m');
    });
  });

  describe('local dates', () => {
    it('todayLocal uses the local calendar date, zero-padded', () => {
      expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
      expect(todayLocal(new Date(2026, 9, 10, 0, 1))).toBe('2026-10-10');
    });

    it('parses and validates YYYY-MM-DD', () => {
      const d = parseDateOnly('2026-10-10');
      expect(d).not.toBeNull();
      expect([d!.getFullYear(), d!.getMonth(), d!.getDate(), d!.getHours()]).toEqual([2026, 9, 10, 0]);
      expect(parseDateOnly('2026-02-30')).toBeNull();
      expect(parseDateOnly('2026-1-5')).toBeNull();
      expect(isDateOnly('2024-02-29')).toBeTrue();
      expect(isDateOnly('2025-02-29')).toBeFalse();
    });

    it('adds days across month and year boundaries', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
      expect(toDateOnly(new Date(2026, 2, 9))).toBe('2026-03-09');
    });
  });

  describe('UTC conversion', () => {
    it('converts datetime-local values to UTC ISO and back', () => {
      const iso = localDateTimeToUtcIso('2026-10-10T08:30');
      expect(iso).toBe(new Date(2026, 9, 10, 8, 30).toISOString());
      expect(iso!.endsWith('Z')).toBeTrue();
      expect(utcIsoToLocalDateTime(iso!)).toBe('2026-10-10T08:30');
    });

    it('returns null for invalid input', () => {
      expect(localDateTimeToUtcIso('not a date')).toBeNull();
      expect(utcIsoToLocalDateTime('nope')).toBeNull();
    });
  });

  describe('formatting', () => {
    it('formats date-only values without a time-zone shift', () => {
      expect(formatDate('2026-10-01', undefined, 'en-US')).toBe('Oct 1, 2026');
      expect(formatDate(null)).toBe('');
      expect(formatDate('garbage')).toBe('');
    });

    it('formats timestamps in local time', () => {
      const local = new Date(2026, 9, 10, 14, 5);
      expect(formatDateTime(local.toISOString(), { hour: '2-digit', minute: '2-digit', hour12: false }, 'en-US')).toBe(
        '14:05',
      );
    });
  });
});
