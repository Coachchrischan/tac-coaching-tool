import { describe, expect, it } from 'vitest';
import {
  attendanceWindow,
  krProgress,
  newMeeting,
  previousMeeting,
  quarterOf,
  sortDump,
} from './meetings';
import type { AttendanceEntry, Meeting } from '../types/documents';

const wk = (period: string, count: number, seeded = false): AttendanceEntry => ({
  id: `${period}:hyrox`,
  period,
  classTypeId: 'hyrox',
  count,
  seeded,
});

describe('attendanceWindow', () => {
  it('reads the eight full weeks before the meeting week', () => {
    // Meeting Thu 8 Oct 2026: window is Mon 10 Aug to Mon 28 Sep.
    const entries = [wk('2026-08-03', 99), wk('2026-08-10', 10), wk('2026-09-28', 20), wk('2026-10-05', 99)];
    const w = attendanceWindow(entries, null, 'hyrox', '2026-10-08');
    expect(w.weeks[0].monday).toBe('2026-08-10');
    expect(w.weeks[7].monday).toBe('2026-09-28');
    expect(w.avgWeek).toBe(15);
    expect(w.prevAvgWeek).toBe(99);
    expect(w.seeded).toBe(false);
  });

  it('flags demo rows inside the window only', () => {
    const w = attendanceWindow([wk('2026-09-07', 5, true)], null, 'hyrox', '2026-10-08');
    expect(w.seeded).toBe(true);
    expect(attendanceWindow([wk('2026-01-05', 5, true)], null, 'hyrox', '2026-10-08').seeded).toBe(false);
  });

  it('falls back to a month per-week average, marked estimated', () => {
    const w = attendanceWindow([{ ...wk('2026-09', 40) }], null, 'hyrox', '2026-10-08');
    const sept = w.weeks.filter((p) => p.monday.startsWith('2026-09'));
    expect(sept.every((p) => p.estimated && p.count === 10)).toBe(true);
  });
});

describe('newMeeting', () => {
  it('carries objectives and open actions forward, not notes or done actions', () => {
    const prev: Meeting = {
      ...newMeeting('hyrox', '2026-10-08'),
      notes: { wins: 'x' },
      objectives: [{ id: 'o1', text: 'Grow', sectionId: 'attendance', keyResults: [] }],
      actions: [
        { id: 'a1', text: 'open', owner: 'J', done: false, raised: '2026-10-08' },
        { id: 'a2', text: 'done', owner: 'J', done: true, raised: '2026-10-08' },
      ],
    };
    const next = newMeeting('hyrox', '2026-11-05', prev);
    expect(next.notes).toEqual({});
    expect(next.objectives[0].id).toBe('o1');
    expect(next.actions.map((a) => a.id)).toEqual(['a1']);
    expect(next.period).toBe('Q4 2026');
    expect(previousMeeting([prev, next], next)?.id).toBe(prev.id);
    expect(previousMeeting([prev, next], prev)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('quarters and KR progress', () => {
    expect(quarterOf('2027-02-01')).toBe('Q1 2027');
    expect(krProgress({ start: 20, target: 40, current: 30 })).toBe(0.5);
    expect(krProgress({ start: 20, target: 40, current: 50 })).toBe(1);
    expect(krProgress({ start: 20, target: 40, current: null })).toBeNull();
  });

  it('sorts a brain dump by prefix, then keyword, leaving the rest', () => {
    const r = sortDump(
      'events: sim day in November\nNeed more reels on Instagram\nno-shows on Friday 5:15\nrandom thought',
      {},
    );
    expect(r.notes.events).toBe('- sim day in November');
    expect(r.notes.marketing).toBe('- Need more reels on Instagram');
    expect(r.notes.admin).toBe('- no-shows on Friday 5:15');
    expect(r.leftover).toBe('random thought');
    expect(r.moved).toBe(3);
  });
});

describe('attendanceWindow with report slots', () => {
  it('averages per session that actually ran', () => {
    const e = (period: string, counts: number[]): AttendanceEntry => ({
      ...wk(period, counts.reduce((s, x) => s + x, 0)),
      slots: counts.map((count, i) => ({ label: `S${i}`, count })),
    });
    const w = attendanceWindow([e('2026-09-21', [10, 2]), e('2026-09-28', [8, 4, 6])], null, 'hyrox', '2026-10-08');
    expect(w.avgSession).toBe(30 / 5);
    expect(w.slots.find((s) => s.label === 'S0')).toMatchObject({ counts: [10, 8], avg: 9 });
    expect(w.sessionsPerWeek).toBe(3);
  });
});

describe('attendanceWindow, meeting week', () => {
  it('shows the meeting week when entered but leaves it out of the average', () => {
    const w = attendanceWindow([wk('2026-09-28', 20), wk('2026-10-05', 4)], null, 'hyrox', '2026-10-08');
    expect(w.weeks).toHaveLength(9);
    expect(w.weeks[8]).toMatchObject({ monday: '2026-10-05', count: 4, partWeek: true });
    expect(w.avgWeek).toBe(20);
    expect(attendanceWindow([wk('2026-09-28', 20)], null, 'hyrox', '2026-10-08').weeks).toHaveLength(8);
  });
});
