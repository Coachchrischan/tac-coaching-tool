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
   * The weekday this focus runs on, 0 = Monday, where the class type runs
   * several times a week and their ORDER is not what tells them apart.
   * Conditioning is three sessions of one class type in one week, so an index
   * into the sorted days breaks the moment another class of that type appears
   * (the timetable already carries a stray Tuesday ESD). Takes precedence over
   * dayPick. Absent = fall back to dayPick, then the earliest day.
   */
  weekday?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * The headline the TV board carries, before it is uppercased. Defaults to
   * the label, which is right for anything already named like a class.
   */
  boardTitle?: string;
  /**
   * How the generated coaching blurb names the day ("Lower body day").
   * Defaults to the label.
   */
  dayTitle?: string;
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
  // Strength. The live split is the three-day Lower / Upper / Full Body
  // (Chris's call, 2026-09-10, loaded from the club sheet; it replaces the
  // two-day A/B the club chose on 2026-08-31, which is archived in
  // archive/strength-full-body-ab-2026-09.json). Friday strength is back on:
  // 'full' feeds the fbs class. Which weekday each focus lands on comes from
  // the live timetable (lbs Tuesday, ubs Thursday, fbs Friday), never from the
  // sheet's day numbering. A/B stay valid for the Primer weeks and the archive.
  // The club runs UPPER on Tuesday and LOWER on Thursday (confirmed against
  // the TrainHeroic calendar, 2026-09-18), so upper takes the Tuesday class
  // and lower the Thursday one. The class-type ids still read lbs/ubs from
  // when the split was Lower/Upper; the DAY is what matters and it is right.
  { focus: 'upper', label: 'Upper', classTypeId: 'lbs', pushTitle: 'Upper Body', boardTitle: 'Upper Body', dayTitle: 'Upper body day' },
  { focus: 'lower', label: 'Lower', classTypeId: 'ubs', pushTitle: 'Lower Body', boardTitle: 'Lower Body', dayTitle: 'Lower body day' },
  { focus: 'full', label: 'Full Body', classTypeId: 'fbs', pushTitle: 'Full Body', dayTitle: 'Full body day' },
  { focus: 'full-a', label: 'Full Body A', classTypeId: 'lbs' },
  { focus: 'full-b', label: 'Full Body B', classTypeId: 'ubs' },
  // Conditioning: three classes a week on the ESD class type, each with its
  // own theme and its own fixed weekday (Chris, 2026-09-18). Sessions are
  // named by their day, never given titles, which is his standing rule for
  // the conditioning programme. 'esd' stays for the sessions written before
  // the three-day week existed.
  { focus: 'cond-mon', label: 'Monday Conditioning', classTypeId: 'esd', weekday: 0 },
  { focus: 'cond-wed', label: 'Wednesday Conditioning', classTypeId: 'esd', weekday: 2 },
  { focus: 'cond-fri', label: 'Friday Conditioning', classTypeId: 'esd', weekday: 4 },
  { focus: 'esd', label: 'ESD', classTypeId: 'esd', dayTitle: 'ESD day' },
  // Hyrox: the club runs two Hyrox classes a week (Monday and Friday). ROX
  // Strong takes the first, ROX Race the second; ROX Engine is written but
  // parked with no day rather than guessed onto a Wednesday that does not
  // exist. 'hyrox' is the pre-tracks focus, kept for the August sessions.
  { focus: 'rox-strong', label: 'ROX Strong', classTypeId: 'hyrox', dayPick: 0, dayTitle: 'ROX Strong day' },
  { focus: 'rox-engine', label: 'ROX Engine', classTypeId: 'hyrox', dayPick: null, dayTitle: 'ROX Engine day' },
  { focus: 'rox-race', label: 'ROX Race', classTypeId: 'hyrox', dayPick: 1, dayTitle: 'ROX Race day' },
  { focus: 'hyrox', label: 'Hyrox', classTypeId: 'hyrox', dayTitle: 'Hyrox day' },
  // Saturday. The club calls it a community session, and the session itself is
  // written with the conditioning rather than in the tool, so this focus only
  // names the class; nothing is programmed against it here.
  { focus: 'gameday', label: 'Saturday Community Session', classTypeId: 'gameday' },
];

export const STREAM_DEFS: StreamDef[] = [
  { id: 'strength', name: 'Strength', focuses: ['upper', 'lower', 'full', 'full-a', 'full-b'] },
  { id: 'esd', name: 'Conditioning', focuses: ['cond-mon', 'cond-wed', 'cond-fri', 'esd'] },
  // 'hyrox' last: pre-tracks sessions still belong to this stream.
  { id: 'hyrox', name: 'Hyrox', focuses: ['rox-strong', 'rox-engine', 'rox-race', 'hyrox'] },
  { id: 'gameday', name: 'Saturday Community', focuses: ['gameday'] },
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

/**
 * The TV board's headline per focus, uppercased. Derived, because this was the
 * third hand-maintained focus table the type checker caught when conditioning
 * arrived (the other two were the blurb's day names and the Phase view's
 * labels). Nothing hand-keys a focus table any more.
 */
export const FOCUS_BOARD_TITLE: Record<SessionFocus, string> = Object.fromEntries(
  FOCUS_DEFS.map((d) => [d.focus, (d.boardTitle ?? d.label).toUpperCase()]),
) as Record<SessionFocus, string>;

/** How the generated blurb names the day. Derived; see FOCUS_BOARD_TITLE. */
export const FOCUS_DAY_TITLE: Record<SessionFocus, string> = Object.fromEntries(
  FOCUS_DEFS.map((d) => [d.focus, d.dayTitle ?? d.label]),
) as Record<SessionFocus, string>;

/** Fixed weekday per focus, 0 = Monday. See FocusDef.weekday. */
export const FOCUS_WEEKDAY: Partial<Record<SessionFocus, 0 | 1 | 2 | 3 | 4 | 5 | 6>> = Object.fromEntries(
  FOCUS_DEFS.filter((d) => d.weekday !== undefined).map((d) => [d.focus, d.weekday]),
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
