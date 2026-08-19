// Which weekday each class actually runs, read from the live timetable.
//
// The TrainHeroic push used to assume Monday, Wednesday and Friday. The club
// runs Lower on Tuesday and Upper on Thursday, so every pushed session landed
// on a day its class does not run. Days now come from the active Schedule
// scenario, and the confirm dialogue shows what was resolved before anything
// is created.

import type { ScheduleDoc, SessionFocus } from '../types/documents';

/** Day index 0 is Monday, matching ClassBlock.day. */
export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** The Schedule class type each programming focus is delivered as. */
export const FOCUS_CLASS_TYPE: Record<SessionFocus, string> = {
  lower: 'lbs',
  upper: 'ubs',
  full: 'fbs',
  esd: 'esd',
  hyrox: 'hyrox',
  gameday: 'gameday',
};

export interface ResolvedDay {
  focus: SessionFocus;
  /** 0 = Monday, or null when this class does not run in the scenario. */
  dayIndex: number | null;
  /** ISO date of the session, or null when it has no day. */
  date: string | null;
  dayName: string | null;
}

export interface ResolvedWeek {
  scenarioName: string;
  days: ResolvedDay[];
  /** Focuses the active timetable has no class for. */
  missing: SessionFocus[];
}

function isoAfter(monday: string, days: number): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The earliest weekday each focus runs on in the active scenario. Earliest,
 * because a class that runs several times a week is programmed once: the first
 * session of the week is the one the week's programming belongs to.
 */
export function resolveWeekDays(
  schedule: ScheduleDoc,
  monday: string,
  focuses: SessionFocus[],
): ResolvedWeek {
  const scenario =
    schedule.scenarios.find((s) => s.id === schedule.activeScenarioId) ?? schedule.scenarios[0];
  const days = focuses.map((focus): ResolvedDay => {
    const classTypeId = FOCUS_CLASS_TYPE[focus];
    const dayIndex = (scenario?.blocks ?? [])
      .filter((b) => b.classTypeId === classTypeId)
      .reduce<number | null>((min, b) => (min === null || b.day < min ? b.day : min), null);
    return {
      focus,
      dayIndex,
      date: dayIndex === null ? null : isoAfter(monday, dayIndex),
      dayName: dayIndex === null ? null : DAY_NAMES[dayIndex],
    };
  });
  return {
    scenarioName: scenario?.name ?? 'no scenario',
    days,
    missing: days.filter((d) => d.dayIndex === null).map((d) => d.focus),
  };
}
