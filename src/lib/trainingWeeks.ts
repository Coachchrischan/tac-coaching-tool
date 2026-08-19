// Turning training weeks into calendar dates, around the club's shutdowns.
//
// Phase lengths are counted in TRAINING weeks: a 6 week phase is six weeks of
// classes. The Christmas break is not a phase, it is a club-wide window when
// nothing runs. So the calendar position of a training week is its index plus
// however many shutdown weeks it has stepped over. Both the Annual Plan ruler
// and the Programming week dates go through here, so they cannot disagree.

import type { BreakWindow } from '../types/documents';

/** Whole weeks between two Mondays; negative if iso is before startDate. */
function weeksBetween(startDate: string, iso: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const at = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((at - start) / (7 * 24 * 60 * 60 * 1000));
}

/** Calendar week offsets from startDate on which the club runs no classes. */
export function shutdownOffsets(startDate: string, breaks: BreakWindow[] = []): Set<number> {
  const blocked = new Set<number>();
  for (const b of breaks) {
    const first = weeksBetween(startDate, b.start);
    for (let i = 0; i < Math.max(0, b.weeks); i++) {
      if (first + i >= 0) blocked.add(first + i);
    }
  }
  return blocked;
}

// A year of weeks is the ruler's span; the cap only stops a malformed break
// list (one covering every week) from spinning forever.
const MAX_OFFSET = 520;

/**
 * Calendar week offset of the nth training week, counting from 0 and stepping
 * over every shutdown week.
 */
export function trainingWeekOffset(n: number, blocked: Set<number>): number {
  let offset = 0;
  let counted = 0;
  while (offset < MAX_OFFSET) {
    while (blocked.has(offset)) offset++;
    if (counted === n) return offset;
    counted++;
    offset++;
  }
  return offset;
}

/** The Monday of the nth training week (0-based), skipping shutdowns. */
export function trainingWeekMonday(
  startDate: string,
  n: number,
  breaks: BreakWindow[] = [],
): Date {
  const offset = trainingWeekOffset(n, shutdownOffsets(startDate, breaks));
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + offset * 7);
  return d;
}

/** A calendar month's worth of training weeks, for month-cadence streams. */
export interface MonthGroup {
  label: string; // "Sep 2026"
  weeks: number;
}

/**
 * Split a run of training weeks into calendar months. ESD and Hyrox are
 * programmed month to month rather than in phases, so their blocks[] are
 * months: a week belongs to the month its Monday falls in, and shutdown weeks
 * are already stepped over by the training-week dating.
 */
export function monthPartition(
  startDate: string,
  weekCount: number,
  breaks: BreakWindow[] = [],
  from = 0,
): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (let i = 0; i < weekCount; i++) {
    const monday = trainingWeekMonday(startDate, from + i, breaks);
    const label = monday.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.weeks++;
    else groups.push({ label, weeks: 1 });
  }
  return groups;
}

/**
 * The shutdown, if any, sitting immediately before the nth training week. Used
 * to mark the gap in the week pills so a coach can see why the dates jump.
 */
export function shutdownBefore(
  startDate: string,
  n: number,
  breaks: BreakWindow[] = [],
): BreakWindow | undefined {
  if (n <= 0) return undefined;
  const blocked = shutdownOffsets(startDate, breaks);
  const prev = trainingWeekOffset(n - 1, blocked);
  const here = trainingWeekOffset(n, blocked);
  if (here - prev <= 1) return undefined;
  return breaks.find((b) => {
    const first = weeksBetween(startDate, b.start);
    return first > prev && first < here;
  });
}
