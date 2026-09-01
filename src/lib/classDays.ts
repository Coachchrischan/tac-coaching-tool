// Which weekday each class actually runs, read from the live timetable.
//
// The TrainHeroic push used to assume Monday, Wednesday and Friday. The club
// runs Lower on Tuesday and Upper on Thursday, so every pushed session landed
// on a day its class does not run. Days now come from the LIVE Schedule
// scenario (see lib/scenarios.ts), not the one on screen, and the confirm
// dialogue shows what was resolved before anything is created.

// The .js extension keeps this importable from the Vite plugin, which is
// compiled under nodenext resolution as well as from the app.
import type { ScheduleDoc, SessionFocus } from '../types/documents.js';
import { liveScenario } from './scenarios.js';

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

// The focus-to-class mapping and day picks live in ONE place, the focus
// catalog; re-exported here so existing import sites keep working.
import { FOCUS_CLASS_TYPE, FOCUS_DAY_PICK } from './focusCatalog.js';

export { FOCUS_CLASS_TYPE, FOCUS_DAY_PICK };

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
  /** Focuses the live timetable has no class for. */
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
  // The LIVE timetable, never the one being viewed: a sketch on screen must
  // not decide the day a real athlete session lands on.
  const scenario = liveScenario(schedule);
  const days = focuses.map((focus): ResolvedDay => {
    const classTypeId = FOCUS_CLASS_TYPE[focus];
    // Distinct days the class runs, in week order. A class running twice on
    // one day is still one day: the week's programming belongs to the first.
    const classDays = [
      ...new Set((scenario?.blocks ?? []).filter((b) => b.classTypeId === classTypeId).map((b) => b.day)),
    ].sort((a, b) => a - b);
    const pick = focus in FOCUS_DAY_PICK ? FOCUS_DAY_PICK[focus] : 0;
    const dayIndex = pick === null || pick === undefined ? null : (classDays[pick] ?? null);
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
