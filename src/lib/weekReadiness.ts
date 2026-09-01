// The live training week, per stream, as a coach-facing readiness picture:
// which container week holds today, what is written, what lands on which day,
// and which bookable classes nothing feeds. Built for Home's cockpit
// (roundtable 2, both product seats' top ask) from pieces that already
// existed: the open-on-today walk, the push ledger, the unfed-class check.

import type {
  AnnualPlanDoc,
  ProgramDoc,
  PushLogEntry,
  ScheduleDoc,
  SessionFocus,
} from '../types/documents';
import { sessionLabel, streamsOf } from './programStreams';
import { sessionHasContent } from './sessionEdits';
import { FOCUS_CLASS_TYPE, FOCUS_DAY_PICK } from './focusCatalog';
import { resolveWeekDays } from './classDays';
import { liveScenario } from './scenarios';
import { isoDate, todayIso, trainingWeekIndexOf, trainingWeekMonday } from './trainingWeeks';

export interface ReadySession {
  id: string;
  focus: SessionFocus;
  label: string;
  hasContent: boolean;
  /** ISO date this session runs this week, or null (parked / no class). */
  date: string | null;
  parked: boolean;
  classTypeId: string;
}

export interface StreamWeekReadiness {
  streamId: string;
  streamName: string;
  /** The Monday of the container week holding today, or null when the year
   *  has not started, today is inside a shutdown, or the stream has no week
   *  reaching this far. */
  monday: string | null;
  /** Container label, e.g. "Phase 2 · W1" or "Sept 2026 · W1". */
  containerLabel: string | null;
  written: number;
  /** Deliverable sessions only: parked tracks are excluded so the number is
   *  an honest workload, not inflated by undeliverable content. */
  total: number;
  sessions: ReadySession[];
  /** The most recent push of this week, if the ledger holds one. */
  lastPush?: PushLogEntry;
}

export function weekReadiness(
  program: ProgramDoc,
  annual: AnnualPlanDoc,
  schedule: ScheduleDoc,
  pushEntries: PushLogEntry[] = [],
): StreamWeekReadiness[] {
  const breaks = annual.breaks ?? [];
  const week = trainingWeekIndexOf(annual.startDate, todayIso(), breaks);
  const monday =
    week === null ? null : isoDate(trainingWeekMonday(annual.startDate, week, breaks));

  return streamsOf(program).map((stream) => {
    if (week === null || monday === null) {
      return {
        streamId: stream.id,
        streamName: stream.name,
        monday: null,
        containerLabel: null,
        written: 0,
        total: 0,
        sessions: [],
      };
    }
    // Walk the stream's containers to the one holding this training week.
    let remaining = week;
    let found: { blockIndex: number; weekIndex: number } | null = null;
    for (let b = 0; b < stream.blocks.length; b++) {
      const len = stream.blocks[b].weeks.length;
      if (remaining < len) {
        found = { blockIndex: b, weekIndex: remaining };
        break;
      }
      remaining -= len;
    }
    if (!found) {
      return {
        streamId: stream.id,
        streamName: stream.name,
        monday,
        containerLabel: null,
        written: 0,
        total: 0,
        sessions: [],
      };
    }
    const block = stream.blocks[found.blockIndex];
    const container = block.theme?.trim()
      ? block.theme
      : `${stream.name} ${found.blockIndex + 1}`;
    const containerLabel = `${container} · W${found.weekIndex + 1}`;
    const weekSessions = block.weeks[found.weekIndex]?.sessions ?? [];
    const resolved = resolveWeekDays(
      schedule,
      monday,
      weekSessions.map((s) => s.focus),
    );
    const sessions: ReadySession[] = weekSessions.map((s, i) => ({
      id: s.id,
      focus: s.focus,
      label: sessionLabel(s),
      hasContent: sessionHasContent(s),
      date: resolved.days[i]?.date ?? null,
      parked: FOCUS_DAY_PICK[s.focus] === null,
      classTypeId: FOCUS_CLASS_TYPE[s.focus],
    }));
    const deliverable = sessions.filter((s) => !s.parked);
    const pushes = pushEntries.filter(
      (e) => e.streamId === stream.id && e.monday === monday,
    );
    return {
      streamId: stream.id,
      streamName: stream.name,
      monday,
      containerLabel,
      written: deliverable.filter((s) => s.hasContent).length,
      total: deliverable.length,
      sessions,
      lastPush: pushes[pushes.length - 1],
    };
  });
}

/**
 * The session running TODAY for a given timetable class, so a Today list can
 * deep-link straight to the wall board.
 */
export function todaySessions(readiness: StreamWeekReadiness[]): Map<string, ReadySession> {
  const today = todayIso();
  const map = new Map<string, ReadySession>();
  for (const r of readiness) {
    for (const s of r.sessions) {
      if (s.date === today) map.set(s.classTypeId, s);
    }
  }
  return map;
}

/**
 * Bookable classes in the live format that no programming feeds: an
 * improvised class waiting to happen (Friday strength, currently, while the
 * club weighs the two formats). Shared by Schedule's banner and Home's
 * cockpit so the two can never disagree.
 */
export function unfedClassTypes(schedule: ScheduleDoc, program: ProgramDoc): string[] {
  const live = liveScenario(schedule);
  if (!live) return [];
  const programmedFocuses = new Set(
    streamsOf(program).flatMap((s) =>
      s.blocks.flatMap((b) => b.weeks.flatMap((w) => w.sessions.map((sess) => sess.focus))),
    ),
  );
  const programmableTypes = new Set(Object.values(FOCUS_CLASS_TYPE));
  return [...new Set(live.blocks.map((b) => b.classTypeId))]
    .filter((ct) => programmableTypes.has(ct))
    .filter((ct) => ![...programmedFocuses].some((f) => FOCUS_CLASS_TYPE[f] === ct));
}
