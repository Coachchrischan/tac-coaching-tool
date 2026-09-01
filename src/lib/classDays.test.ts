// Regression tests for day resolution: the push used to assume Mon/Wed/Fri
// while the club ran Tue/Thu, and later used the VIEWED scenario instead of
// the live one. Both failure modes are pinned here.

import { describe, expect, it } from 'vitest';
import { resolveWeekDays } from './classDays';
import type { ScheduleDoc } from '../types/documents';

function makeSchedule(overrides?: Partial<ScheduleDoc>): ScheduleDoc {
  return {
    classTypes: [],
    coaches: [],
    rooms: [],
    scenarios: [
      {
        id: 'live',
        name: 'Current format',
        blocks: [
          { id: 'a1', day: 1, startMin: 300, durationMin: 60, classTypeId: 'lbs', coachId: null, roomId: null },
          { id: 'a2', day: 1, startMin: 360, durationMin: 60, classTypeId: 'lbs', coachId: null, roomId: null },
          { id: 'b1', day: 3, startMin: 300, durationMin: 60, classTypeId: 'ubs', coachId: null, roomId: null },
          { id: 'h1', day: 0, startMin: 300, durationMin: 60, classTypeId: 'hyrox', coachId: null, roomId: null },
          { id: 'h2', day: 4, startMin: 300, durationMin: 60, classTypeId: 'hyrox', coachId: null, roomId: null },
        ],
      },
      {
        id: 'sketch',
        name: 'A sketch',
        blocks: [
          // Deliberately wrong days: if any of these leak into resolution, the
          // live/viewed split has regressed.
          { id: 's1', day: 5, startMin: 300, durationMin: 60, classTypeId: 'lbs', coachId: null, roomId: null },
        ],
      },
    ],
    activeScenarioId: 'sketch', // the sketch is on screen...
    liveScenarioId: 'live', // ...but the live timetable decides the days
    ...overrides,
  };
}

const MONDAY = '2026-09-14';

describe('resolveWeekDays', () => {
  it('reads the LIVE scenario, never the viewed sketch', () => {
    const week = resolveWeekDays(makeSchedule(), MONDAY, ['full-a']);
    expect(week.scenarioName).toBe('Current format');
    expect(week.days[0].dayName).toBe('Tuesday');
    expect(week.days[0].date).toBe('2026-09-15');
  });

  it('full-a lands on the Tuesday class and full-b on the Thursday class', () => {
    const week = resolveWeekDays(makeSchedule(), MONDAY, ['full-a', 'full-b']);
    expect(week.days.map((d) => d.date)).toEqual(['2026-09-15', '2026-09-17']);
  });

  it('a class running twice in one day is still one programming day', () => {
    // lbs has two Tuesday blocks; full-a must resolve once, to Tuesday.
    const week = resolveWeekDays(makeSchedule(), MONDAY, ['full-a']);
    expect(week.days).toHaveLength(1);
    expect(week.days[0].dayIndex).toBe(1);
  });

  it('the Hyrox tracks split across the two class days by FOCUS_DAY_PICK', () => {
    const week = resolveWeekDays(makeSchedule(), MONDAY, ['rox-strong', 'rox-race']);
    expect(week.days[0].dayName).toBe('Monday');
    expect(week.days[1].dayName).toBe('Friday');
  });

  it('ROX Engine is parked: named as missing, never guessed', () => {
    const week = resolveWeekDays(makeSchedule(), MONDAY, ['rox-engine']);
    expect(week.days[0].dayIndex).toBeNull();
    expect(week.days[0].date).toBeNull();
    expect(week.missing).toEqual(['rox-engine']);
  });

  it('a focus whose class is not in the live timetable is missing, not invented', () => {
    // Friday strength is on hold: nothing maps a focus to fbs, and even the
    // old `full` focus has no fbs class in this scenario.
    const week = resolveWeekDays(makeSchedule(), MONDAY, ['full']);
    expect(week.missing).toEqual(['full']);
  });

  it('falls back to the viewed scenario for documents without liveScenarioId', () => {
    const doc = makeSchedule();
    delete (doc as Partial<ScheduleDoc>).liveScenarioId;
    const week = resolveWeekDays(doc, MONDAY, ['full-a']);
    expect(week.scenarioName).toBe('A sketch');
  });

  it('date arithmetic stays on the calendar across a month boundary', () => {
    const week = resolveWeekDays(makeSchedule(), '2026-08-31', ['full-b']);
    expect(week.days[0].date).toBe('2026-09-03');
  });
});
