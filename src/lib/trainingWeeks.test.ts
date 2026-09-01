// Regression tests for the training-week date maths. The Brisbane timezone
// bug (every TrainHeroic push landing a day early because a local-midnight
// Date was read back through toISOString) and the Christmas-break stepping
// are encoded here as named cases so no refactor can quietly reintroduce them.

import { describe, expect, it } from 'vitest';
import {
  isoDate,
  mondayOfIso,
  monthPartition,
  shutdownBefore,
  shutdownOffsets,
  trainingWeekIndexOf,
  trainingWeekMonday,
  trainingWeekOffset,
} from './trainingWeeks';
import type { BreakWindow } from '../types/documents';

const YEAR_START = '2026-08-24'; // Monday, the club's year start
const CHRISTMAS: BreakWindow[] = [
  { id: 'xmas', name: 'Christmas break', start: '2026-12-21', weeks: 2 },
];

describe('isoDate (the Brisbane UTC regression)', () => {
  it('reads a local-midnight Date off the local calendar, not UTC', () => {
    // In Brisbane (UTC+10), local midnight is 14:00 the PREVIOUS day in UTC.
    // toISOString().slice(0, 10) on this Date returns 2026-08-23; that exact
    // round trip once sent every pushed session a day early.
    const d = new Date('2026-08-24T00:00:00');
    expect(isoDate(d)).toBe('2026-08-24');
  });

  it('pads single-digit months and days', () => {
    expect(isoDate(new Date('2027-01-04T00:00:00'))).toBe('2027-01-04');
  });
});

describe('trainingWeekMonday', () => {
  it('week 0 is the year start', () => {
    expect(isoDate(trainingWeekMonday(YEAR_START, 0))).toBe('2026-08-24');
  });

  it('counts plain weeks with no breaks', () => {
    expect(isoDate(trainingWeekMonday(YEAR_START, 3))).toBe('2026-09-14');
  });

  it('week 17 (first week after Christmas) steps over the two-week break', () => {
    // Weeks 0-16 run to w/c 14 Dec; the break covers 21 and 28 Dec; training
    // week 17 must land on 4 Jan 2027, not 21 Dec 2026.
    expect(isoDate(trainingWeekMonday(YEAR_START, 16, CHRISTMAS))).toBe('2026-12-14');
    expect(isoDate(trainingWeekMonday(YEAR_START, 17, CHRISTMAS))).toBe('2027-01-04');
  });

  it('a break before the year start does not shift anything', () => {
    const early: BreakWindow[] = [{ id: 'b', name: 'b', start: '2026-08-10', weeks: 1 }];
    expect(isoDate(trainingWeekMonday(YEAR_START, 0, early))).toBe('2026-08-24');
  });
});

describe('trainingWeekIndexOf', () => {
  it('maps a mid-week date to its training week', () => {
    expect(trainingWeekIndexOf(YEAR_START, '2026-09-01')).toBe(1); // Tue of week 2
  });

  it('returns null before the year starts', () => {
    expect(trainingWeekIndexOf(YEAR_START, '2026-08-20')).toBeNull();
  });

  it('returns null inside a shutdown and resumes correctly after it', () => {
    expect(trainingWeekIndexOf(YEAR_START, '2026-12-23', CHRISTMAS)).toBeNull();
    expect(trainingWeekIndexOf(YEAR_START, '2027-01-06', CHRISTMAS)).toBe(17);
  });

  it('round-trips with trainingWeekMonday across the break', () => {
    for (const n of [0, 5, 16, 17, 25]) {
      const monday = isoDate(trainingWeekMonday(YEAR_START, n, CHRISTMAS));
      expect(trainingWeekIndexOf(YEAR_START, monday, CHRISTMAS)).toBe(n);
    }
  });
});

describe('mondayOfIso', () => {
  it('finds the Monday of any weekday', () => {
    expect(mondayOfIso('2026-09-03')).toBe('2026-08-31'); // a Thursday
    expect(mondayOfIso('2026-08-31')).toBe('2026-08-31'); // already Monday
    expect(mondayOfIso('2026-09-06')).toBe('2026-08-31'); // a Sunday
  });
});

describe('shutdownOffsets and shutdownBefore', () => {
  it('marks the calendar offsets a break covers', () => {
    const blocked = shutdownOffsets(YEAR_START, CHRISTMAS);
    expect(blocked.has(17)).toBe(true); // w/c 21 Dec
    expect(blocked.has(18)).toBe(true); // w/c 28 Dec
    expect(blocked.has(16)).toBe(false);
    expect(blocked.has(19)).toBe(false);
  });

  it('trainingWeekOffset steps over blocked weeks', () => {
    const blocked = shutdownOffsets(YEAR_START, CHRISTMAS);
    expect(trainingWeekOffset(16, blocked)).toBe(16);
    expect(trainingWeekOffset(17, blocked)).toBe(19);
  });

  it('shutdownBefore names the break sitting before a training week', () => {
    expect(shutdownBefore(YEAR_START, 17, CHRISTMAS)?.name).toBe('Christmas break');
    expect(shutdownBefore(YEAR_START, 16, CHRISTMAS)).toBeUndefined();
    expect(shutdownBefore(YEAR_START, 0, CHRISTMAS)).toBeUndefined();
  });

  it('a malformed break list cannot spin forever', () => {
    const everything: BreakWindow[] = [
      { id: 'x', name: 'x', start: YEAR_START, weeks: 10000 },
    ];
    const blocked = shutdownOffsets(YEAR_START, everything);
    expect(trainingWeekOffset(5, blocked)).toBeGreaterThan(0); // terminates
  });
});

describe('monthPartition', () => {
  it('splits weeks into calendar months by their Monday', () => {
    const groups = monthPartition(YEAR_START, 6);
    // 24, 31 Aug then 7, 14, 21, 28 Sept
    expect(groups.map((g) => g.weeks)).toEqual([2, 4]);
  });

  it('steps over the break when partitioning across it', () => {
    const groups = monthPartition(YEAR_START, 18, CHRISTMAS);
    const last = groups[groups.length - 1];
    expect(last.label).toContain('2027'); // week 17 fell into January
  });
});
