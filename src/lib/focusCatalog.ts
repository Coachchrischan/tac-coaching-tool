// THE focus catalog: one record per session focus, one list per stream.
//
// Before this file existed, adding or changing a focus meant editing five
// hand-synchronised tables in four files (FOCUS_LABEL and STREAM_DEFS in
// programStreams, FOCUS_CLASS_TYPE and FOCUS_DAY_PICK in classDays,
// STRENGTH_PLAN in the push plugin, plus HomeTab's STREAM_FOR_CLASS) - and
// the push, email, Home and TV disagreed the day one edit missed one table
// (both 2026-09-01 panels, architecture seats). Every one of those tables is
// now DERIVED from here. Edit this file only.
//
// The .js extension on the type import keeps this loadable from the Vite
// plugins, which compile under nodenext resolution as well as from the app.

import type { SessionFocus } from '../types/documents.js';

export interface FocusDef {
  focus: SessionFocus;
  /** UI label ("Full Body A", "ROX Strong"). */
  label: string;
  /** The Schedule class type this focus is delivered as. */
  classTypeId: string;
  /**
   * Which of the class type's weekly days this focus takes, where several
   * focuses share one class (the Hyrox tracks): an index into the class's
   * sorted distinct days. `null` = deliberately parked, no day (ROX Engine).
   * Absent = the earliest day the class runs, which is what every
   * single-focus class wants.
   */
  dayPick?: number | null;
  /**
   * Title used when this focus is pushed to TrainHeroic. Only focuses with a
   * pushTitle are pushed; the plan is the push-titled focuses of the stream,
   * in stream order.
   */
  pushTitle?: string;
}

export interface StreamDef {
  id: string;
  name: string;
  /** In display order; also the order sessions are created and pushed. */
  focuses: SessionFocus[];
}

const FOCUS_DEFS: FocusDef[] = [
  // Strength. A/B first: they are the live split (from 14 Sept 2026). The
  // old three focuses stay valid for the archived Lower/Upper/Full era.
  // Friday strength is on hold (club decision, 2026-08-31), so no LIVE focus
  // maps to fbs while the split runs; the archived 'full' one still does.
  { focus: 'full-a', label: 'Full Body A', classTypeId: 'lbs', pushTitle: 'Day 1 - Full Body A' },
  { focus: 'full-b', label: 'Full Body B', classTypeId: 'ubs', pushTitle: 'Day 2 - Full Body B' },
  { focus: 'lower', label: 'Lower', classTypeId: 'lbs' },
  { focus: 'upper', label: 'Upper', classTypeId: 'ubs' },
  { focus: 'full', label: 'Full Body', classTypeId: 'fbs' },
  // ESD.
  { focus: 'esd', label: 'ESD', classTypeId: 'esd' },
  // Hyrox: the club runs two Hyrox classes a week (Monday and Friday). ROX
  // Strong takes the first, ROX Race the second; ROX Engine is written but
  // parked with no day rather than guessed onto a Wednesday that does not
  // exist. 'hyrox' is the pre-tracks focus, kept for the August sessions.
  { focus: 'rox-strong', label: 'ROX Strong', classTypeId: 'hyrox', dayPick: 0 },
  { focus: 'rox-engine', label: 'ROX Engine', classTypeId: 'hyrox', dayPick: null },
  { focus: 'rox-race', label: 'ROX Race', classTypeId: 'hyrox', dayPick: 1 },
  { focus: 'hyrox', label: 'Hyrox', classTypeId: 'hyrox' },
  // Game Day.
  { focus: 'gameday', label: 'Game Day', classTypeId: 'gameday' },
];

export const STREAM_DEFS: StreamDef[] = [
  { id: 'strength', name: 'Strength', focuses: ['full-a', 'full-b', 'lower', 'upper', 'full'] },
  { id: 'esd', name: 'ESD', focuses: ['esd'] },
  // 'hyrox' last: pre-tracks sessions still belong to this stream.
  { id: 'hyrox', name: 'Hyrox', focuses: ['rox-strong', 'rox-engine', 'rox-race', 'hyrox'] },
  { id: 'gameday', name: 'Game Day', focuses: ['gameday'] },
];

// ---------------------------------------------------------------------------
// Derived tables. Consumers keep importing these under their historical names
// (mostly re-exported from programStreams/classDays); only this file holds
// the underlying facts.
// ---------------------------------------------------------------------------

const byFocus = new Map(FOCUS_DEFS.map((d) => [d.focus, d]));

export function focusDef(focus: SessionFocus): FocusDef {
  const def = byFocus.get(focus);
  if (!def) throw new Error(`focus '${focus}' is not in the catalog`);
  return def;
}

export const FOCUS_LABEL: Record<SessionFocus, string> = Object.fromEntries(
  FOCUS_DEFS.map((d) => [d.focus, d.label]),
) as Record<SessionFocus, string>;

export const FOCUS_CLASS_TYPE: Record<SessionFocus, string> = Object.fromEntries(
  FOCUS_DEFS.map((d) => [d.focus, d.classTypeId]),
) as Record<SessionFocus, string>;

export const FOCUS_DAY_PICK: Partial<Record<SessionFocus, number | null>> = Object.fromEntries(
  FOCUS_DEFS.filter((d) => d.dayPick !== undefined).map((d) => [d.focus, d.dayPick]),
);

/** The push plan for a stream: its push-titled focuses, in stream order. */
export function pushPlanFor(streamId: string): { focus: SessionFocus; title: string }[] {
  const stream = STREAM_DEFS.find((s) => s.id === streamId);
  if (!stream) return [];
  return stream.focuses
    .map((f) => focusDef(f))
    .filter((d): d is FocusDef & { pushTitle: string } => Boolean(d.pushTitle))
    .map((d) => ({ focus: d.focus, title: d.pushTitle }));
}

/** Which programming stream delivers a timetable class, where one does. */
export const STREAM_FOR_CLASS: Record<string, string> = Object.fromEntries(
  STREAM_DEFS.flatMap((s) =>
    s.focuses.map((f) => [focusDef(f).classTypeId, s.id] as [string, string]),
  ).reverse(), // earlier streams win on shared class types
);
