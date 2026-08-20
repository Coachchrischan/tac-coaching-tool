// Period helpers for attendance: a period is a month ('yyyy-mm') or a week
// starting Monday ('yyyy-mm-dd'). All date maths is LOCAL time; never
// toISOString, which shifts AEST dates back a day.

import type { AttendanceEntry } from '../types/documents';

export const isMonth = (period: string) => period.length === 7;

export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return localIso(d);
}

export function thisMonday(): string {
  return mondayOf(localIso(new Date()));
}

export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtPeriod(period: string): string {
  if (isMonth(period)) {
    return new Date(`${period}-01T00:00:00`).toLocaleDateString('en-AU', {
      month: 'short',
      year: '2-digit',
    });
  }
  return `wk ${new Date(`${period}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  })}`;
}

/** Monthly series: monthly entries plus weekly entries rolled into their month.
 *  A direct monthly entry for a (month, class) wins over the weekly roll-up. */
export function monthlyCount(
  entries: AttendanceEntry[],
  month: string,
  classTypeId: string,
): number | null {
  const direct = entries.find((e) => e.period === month && e.classTypeId === classTypeId);
  if (direct) return direct.count;
  const weekly = entries.filter(
    (e) => !isMonth(e.period) && e.period.slice(0, 7) === month && e.classTypeId === classTypeId,
  );
  if (weekly.length === 0) return null;
  return weekly.reduce((s, e) => s + e.count, 0);
}

/** All months represented in the data (direct or via weekly roll-up), sorted. */
export function allMonths(entries: AttendanceEntry[]): string[] {
  return [...new Set(entries.map((e) => e.period.slice(0, 7)))].sort();
}

/** All week periods in the data, sorted. */
export function allWeeks(entries: AttendanceEntry[]): string[] {
  return [...new Set(entries.filter((e) => !isMonth(e.period)).map((e) => e.period))].sort();
}

export function weeklyCount(
  entries: AttendanceEntry[],
  week: string,
  classTypeId: string,
): number | null {
  const e = entries.find((x) => x.period === week && x.classTypeId === classTypeId);
  return e ? e.count : null;
}

// ---------- Comparing periods fairly ----------
//
// A month total is not comparable to another month total: months hold four or
// five weeks, and the current one is always part recorded. Comparing them raw
// makes every class look like it is falling. So months are reported as an
// average week.

/** How many Mondays a month contains, which is how many weeks it can hold. */
export function mondaysInMonth(month: string): number {
  const d = new Date(`${month}-01T00:00:00`);
  const target = d.getMonth();
  let count = 0;
  while (d.getMonth() === target) {
    if (d.getDay() === 1) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

/** Weeks actually recorded for a class inside a month, via weekly entries. */
export function weeksRecorded(
  entries: AttendanceEntry[],
  month: string,
  classTypeId: string,
): number {
  return entries.filter(
    (e) => !isMonth(e.period) && e.period.slice(0, 7) === month && e.classTypeId === classTypeId,
  ).length;
}

/**
 * A month's figure as an average week, so months of different lengths and a
 * part-recorded current month can sit next to each other honestly.
 */
export function monthlyPerWeek(
  entries: AttendanceEntry[],
  month: string,
  classTypeId: string,
): number | null {
  const total = monthlyCount(entries, month, classTypeId);
  if (total === null) return null;
  // Built from weekly entries: divide by the weeks actually recorded. Typed in
  // as one monthly number: divide by the weeks the month holds.
  const recorded = weeksRecorded(entries, month, classTypeId);
  return total / (recorded > 0 ? recorded : mondaysInMonth(month));
}

/** True when this month is still running, so its total is incomplete. */
export function isPartRecorded(month: string): boolean {
  return month === thisMonth();
}
