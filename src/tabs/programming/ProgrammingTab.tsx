import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { mergedLibrary, searchLibrary } from '../../lib/library';
import type { LibraryExercise } from '../../lib/library';
import SaveBadge from '../../components/SaveBadge';
import type {
  Coach,
  ExerciseSlot,
  ProgramBlock,
  ProgramDoc,
  ProgramWeek,
  SeriesSession,
  Session,
  SessionFocus,
  SessionKind,
  TimedBlock,
} from '../../types/documents';
import TimedBlockCard from './TimedBlockCard';
import SessionBlurb from './SessionBlurb';
import { defaultSeries } from '../../seed';
import { MonthGrid, PhaseExerciseGrid, buildBlockRows } from './EditableGrid';
import type { BlockRows } from './EditableGrid';
import type { AddTarget, EditableRow, SlotRef } from './EditableGrid';
import { downloadProgramCsv } from '../../lib/exportCsv';
import {
  FOCUS_LABEL,
  STREAM_DEFS,
  formatOf,
  sessionLabel,
  streamsOf,
  withStreamBlocks,
} from '../../lib/programStreams';
import { resolveWeekDays } from '../../lib/classDays';
import {
  isoDate,
  shutdownBefore,
  todayIso,
  trainingWeekIndexOf,
  trainingWeekMonday,
} from '../../lib/trainingWeeks';
import {
  gmailComposeUrl,
  looksLikeEmail,
  weekEmailBody,
  weekEmailSubject,
} from '../../lib/weekEmail';
import CircuitEditor from './CircuitEditor';
import { circuitToText, equipmentFor } from '../../lib/circuit';

type ProgramView = 'week' | 'block' | 'month';

// Chris's terminology: blocks[] in the data model are PHASES (10/1/6 weeks);
// the 3-4 week training blocks live inside a phase. Views: Week (edit one
// week), Block (one 4-week block within the phase), Phase (the whole phase's
// weeks, plus the phase-to-phase Exercise rotation planner as a mode).
const VIEW_LABEL: Record<ProgramView, string> = {
  week: 'Week',
  block: 'Block',
  month: 'Phase',
};

const BLOCK_LEN = 4;

// The Block view is a 4-week window into the phase; SlotRefs inside cells
// keep their absolute week indices, so edits land on the right week.
function sliceBlockRows(rows: BlockRows, start: number, end: number): BlockRows {
  return {
    blockIndex: rows.blockIndex,
    weekSessions: rows.weekSessions.slice(start, end),
    rows: rows.rows.map((r) => ({ ...r, cells: r.cells.slice(start, end) })),
  };
}

const selectCls =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-950 focus:border-accent-600 focus:outline-none';

const pill = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 border border-ink-300 hover:text-ink-950'
  }`;

function nextLabel(blocks: TimedBlock[]): string {
  const last = blocks[blocks.length - 1]?.label ?? '';
  if (last.length === 1 && last >= 'A' && last < 'Z') {
    return String.fromCharCode(last.charCodeAt(0) + 1);
  }
  return String.fromCharCode(65 + blocks.length);
}

/**
 * Clone a session, carrying whichever payload it actually holds. Growing a
 * phase used to drop circuits here, because the clone was written as if every
 * session were a series. The discriminator now makes that unrepresentable.
 */
function cloneSession(s: Session): Session {
  const common = {
    id: crypto.randomUUID(),
    focus: s.focus,
    ...(s.name ? { name: s.name } : {}),
    ...(s.note ? { note: s.note } : {}),
    ...(s.intent ? { intent: s.intent } : {}),
  };
  if (s.kind === 'circuit') {
    return {
      ...common,
      kind: 'circuit',
      circuit: s.circuit.map((b) => ({
        id: crypto.randomUUID(),
        heading: b.heading,
        lines: [...b.lines],
        ...(b.restAfter ? { restAfter: b.restAfter } : {}),
      })),
    };
  }
  // Same exercises all phase, blank prescriptions: they progress week to week.
  return {
    ...common,
    kind: 'series',
    timedBlocks: s.timedBlocks.map((tb) => ({
      id: crypto.randomUUID(),
      label: tb.label,
      minutes: tb.minutes,
      slots: tb.slots
        .filter((sl) => sl.name)
        .map((sl) => ({ id: crypto.randomUUID(), exerciseId: sl.exerciseId, name: sl.name })),
    })),
  };
}

/** A fresh, empty session written the way its stream is written. */
function newSession(focus: SessionFocus, kind: SessionKind): Session {
  const id = crypto.randomUUID();
  return kind === 'circuit'
    ? { id, focus, kind: 'circuit', circuit: [] }
    : { id, focus, kind: 'series', timedBlocks: defaultSeries(id) };
}

/** Does this session hold real programming, in whichever way it is written? */
function sessionHasContent(s: Session): boolean {
  return s.kind === 'circuit'
    ? s.circuit.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()))
    : s.timedBlocks.some((tb) => tb.slots.some((sl) => sl.name));
}

export default function ProgrammingTab() {
  const program = useDoc('program');
  const lib = useDoc('library-overrides');
  const annual = useDoc('annual-plan');
  const layouts = useDoc('layouts');
  const schedule = useDoc('schedule');
  const { library, error: libraryError } = useLibrary();
  const navigate = useNavigate();

  const [siRaw, setStreamIndex] = useState(0);
  const [biRaw, setBi] = useState(0);
  const [wiRaw, setWi] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [si, setSi] = useState(0);
  const [view, setView] = useState<ProgramView>('week');
  const [pushState, setPushState] = useState<'idle' | 'pushing'>('idle');
  // Phase view has two modes: this phase's weeks, or the phase-to-phase
  // exercise rotation planner (names only, across all phases).
  const [phaseMode, setPhaseMode] = useState<'weeks' | 'exercises'>('weeks');
  // Which 4-week block within the phase the Block view shows.
  const [blockPageRaw, setBlockPage] = useState(0);
  const [expandScales, setExpandScales] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  // The "e" beside the session pills: name, type and remove, on demand.
  const [sessionEditOpen, setSessionEditOpen] = useState(false);

  const overrides = lib.data;
  const merged = library && overrides ? mergedLibrary(library, overrides) : null;

  const search = useCallback(
    (query: string) => (merged ? searchLibrary(merged, query) : []),
    [merged],
  );

  const videoById = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of merged ?? []) if (e.videoUrl) m.set(e.id, e.videoUrl);
    return m;
  }, [merged]);

  // Open on the week actually running, not on Phase 1 Week 1. A coach opening
  // this ten minutes before a class should not have to count forward. Runs
  // once, and only until the coach navigates themselves.
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (jumped || !program.data || !annual.data) return;
    setJumped(true);
    const start = annual.data.startDate;
    const week = trainingWeekIndexOf(start, todayIso(), annual.data.breaks ?? []);
    if (week === null) return; // before the year starts, or a shutdown week
    const target = streamsOf(program.data)[Math.min(siRaw, streamsOf(program.data).length - 1)];
    if (!target) return;
    let remaining = week;
    for (let b = 0; b < target.blocks.length; b++) {
      const len = target.blocks[b].weeks.length;
      if (remaining < len) {
        setBi(b);
        setWi(remaining);
        return;
      }
      remaining -= len;
    }
    // Past the end of what is programmed: land on the last written week.
    setBi(target.blocks.length - 1);
    setWi(Math.max(0, target.blocks[target.blocks.length - 1].weeks.length - 1));
  }, [jumped, program.data, annual.data, siRaw]);

  if (!program.data || !overrides) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading program…</p>;
  }

  const doc = program.data;
  // Streams (Strength / ESD / Hyrox / Game Day) each hold their own phases,
  // which vary in length (10/1/6...), so every index is clamped rather than
  // trusted: switching stream or phase must land somewhere that exists.
  const streams = streamsOf(doc);
  const streamIndex = Math.min(siRaw, streams.length - 1);
  const stream = streams[streamIndex];
  const blocks = stream.blocks;
  const bi = Math.min(biRaw, blocks.length - 1);
  const wi = Math.min(wiRaw, blocks[bi].weeks.length - 1);
  const blockPages = Math.max(1, Math.ceil(blocks[bi].weeks.length / BLOCK_LEN));
  const blockPage = Math.min(blockPageRaw, blockPages - 1);
  const sessions = blocks[bi].weeks[wi].sessions;

  // Week 1 of phase 1 starts on the annual plan's year start. Weeks are
  // TRAINING weeks, so the dates step over the club's shutdowns rather than
  // running through them: without that, everything after Christmas is two
  // weeks early.
  const weeksBefore = blocks.slice(0, bi).reduce((n, b) => n + b.weeks.length, 0);
  const yearStart = annual.data?.startDate;
  const breaks = annual.data?.breaks ?? [];
  function mondayOfWeek(weekInPhase: number): Date | null {
    if (!yearStart) return null;
    return trainingWeekMonday(yearStart, weeksBefore + weekInPhase, breaks);
  }
  /** The shutdown sitting just before this week, if the dates jump over one. */
  function breakBefore(weekInPhase: number) {
    if (!yearStart) return undefined;
    return shutdownBefore(yearStart, weeksBefore + weekInPhase, breaks);
  }
  const fmtDay = (d: Date | null, opts?: Intl.DateTimeFormatOptions) =>
    d ? d.toLocaleDateString('en-AU', opts ?? { day: 'numeric', month: 'short' }) : '';

  // How this stream is written, and the focuses it is allowed to use.
  const streamKind = formatOf(stream);
  const streamFocuses = STREAM_DEFS.find((d) => d.id === stream.id)?.focuses ?? [];
  // Strength runs the annual plan's phases. ESD, Hyrox and Game Day are
  // programmed month to month, so the same control is called a Month there.
  const byMonth = stream.cadence === 'months';
  const UNIT = byMonth ? 'Month' : 'Phase';
  const unit = byMonth ? 'month' : 'phase';
  /** What a block is called in this stream: its month name, or "Phase 2". */
  const blockLabel = (i: number) =>
    byMonth ? (blocks[i].theme ?? `Month ${i + 1}`) : `Phase ${i + 1}`;

  // A phase-cadence stream delivers the annual plan's lane, so the lane owns
  // the phase names and lengths. Programming shows what it is linked to and
  // says so when the two disagree, rather than quietly holding a second answer.
  const annualLane = byMonth ? undefined : annual.data?.streams.find((s) => s.id === stream.id);
  const annualPhase = (i: number) =>
    annualLane?.phases.find((p) => p.id === blocks[i].annualPhaseId);
  const linkedName = (i: number) => annualPhase(i)?.name ?? blocks[i].theme;
  /** Set when this phase's length no longer matches the annual plan's. */
  const lengthDrift = (i: number) => {
    const p = annualPhase(i);
    return p && p.weeks !== blocks[i].weeks.length ? p.weeks : null;
  };

  /** What the week's email says: this stream, this week, these sessions. */
  const emailInput = {
    stream,
    blockLabel: blockLabel(bi),
    weekNumber: wi + 1,
    monday: mondayOfWeek(wi),
    sessions,
  };

  /** Bring this stream's phases into line with its annual lane. */
  function pullFromAnnual() {
    if (!annualLane) return;
    const existing = new Set(blocks.map((b) => b.annualPhaseId).filter(Boolean));
    const missing = annualLane.phases.filter((p) => !existing.has(p.id));
    const drifts = blocks
      .map((_, i) => ({ i, want: lengthDrift(i) }))
      .filter((d): d is { i: number; want: number } => d.want !== null);

    const lines = [
      missing.length
        ? `Add ${missing.length} phase${missing.length === 1 ? '' : 's'} from the annual plan:\n${missing.map((p) => `  ${p.name} (${p.weeks} wk)`).join('\n')}`
        : null,
      drifts.length
        ? `These phases are a different length here than in the annual plan, and are left alone:\n${drifts.map((d) => `  ${blockLabel(d.i)}: ${blocks[d.i].weeks.length} wk here, ${d.want} wk in the plan`).join('\n')}`
        : null,
    ].filter(Boolean);

    if (!missing.length) {
      window.alert(
        lines.length
          ? `Nothing to add: every annual phase is already here.\n\n${lines.join('\n\n')}`
          : 'Nothing to add: this stream already matches the annual plan.',
      );
      return;
    }
    if (!window.confirm(`${lines.join('\n\n')}\n\nGo ahead?`)) return;

    const focuses = sessions.map((s) => s.focus);
    updateBlocks((all) => [
      ...all,
      ...missing.map((p) => ({
        id: crypto.randomUUID(),
        theme: p.name,
        annualPhaseId: p.id,
        weeks: Array.from({ length: p.weeks }, (): ProgramWeek => ({
          id: crypto.randomUUID(),
          sessions: focuses.map((focus) => newSession(focus, streamKind)),
        })),
      })),
    ]);
  }

  /** Every phase edit goes through here so it lands on the active stream. */
  function updateBlocks(fn: (blocks: ProgramBlock[]) => ProgramBlock[]) {
    program.update((d: ProgramDoc) => {
      const current = streamsOf(d)[streamIndex];
      return withStreamBlocks(d, streamIndex, fn(current.blocks));
    });
  }
  const sIdx = Math.min(si, Math.max(sessions.length - 1, 0));
  const session = sessions[sIdx];

  function patchWeekSessions(fn: (sessions: Session[]) => Session[]) {
    updateBlocks((all) =>
      all.map((b, bIdx) =>
        bIdx !== bi
          ? b
          : {
              ...b,
              weeks: b.weeks.map((w, wIdx) =>
                wIdx !== wi ? w : { ...w, sessions: fn(w.sessions) },
              ),
            },
      ),
    );
  }

  function patchSession(fn: (s: Session) => Session) {
    patchWeekSessions((list) => list.map((s, i) => (i !== sIdx ? s : fn(s))));
  }

  // Grow a phase by cloning the last week's structure.
  function cloneWeekStructure(week: ProgramWeek): ProgramWeek {
    return { id: crypto.randomUUID(), sessions: week.sessions.map(cloneSession) };
  }

  /** Does this phase hold real programming, in either format? */
  function blockHasContent(block: ProgramBlock, fromWeek = 0) {
    return block.weeks.slice(fromWeek).some((w) => w.sessions.some(sessionHasContent));
  }

  function setBlockLength(target: number) {
    const block = blocks[bi];
    const next = Math.max(1, Math.min(20, target));
    if (next === block.weeks.length) return;
    if (
      next < block.weeks.length &&
      blockHasContent(block, next) &&
      !window.confirm(
        `Shorten ${blockLabel(bi)} to ${next} week${next === 1 ? '' : 's'}? The dropped weeks contain programming that will be deleted.`,
      )
    )
      return;
    updateBlocks((all) =>
      all.map((b, i) => {
        if (i !== bi) return b;
        if (next < b.weeks.length) return { ...b, weeks: b.weeks.slice(0, next) };
        const weeks = [...b.weeks];
        while (weeks.length < next) weeks.push(cloneWeekStructure(weeks[weeks.length - 1]));
        return { ...b, weeks };
      }),
    );
    if (wi >= next) setWi(next - 1);
  }

  function addBlock() {
    // A new phase mirrors the sessions this stream already runs.
    const focuses = sessions.map((s) => s.focus);
    updateBlocks((all) => [
      ...all,
      {
        id: crypto.randomUUID(),
        weeks: Array.from({ length: 4 }, (): ProgramWeek => ({
          id: crypto.randomUUID(),
          sessions: focuses.map((focus) => newSession(focus, streamKind)),
        })),
      },
    ]);
    setBi(blocks.length);
    setWi(0);
  }

  function removeBlock() {
    if (blocks.length <= 1) return;
    const block = blocks[bi];
    if (
      !window.confirm(
        `Remove ${blockLabel(bi)}${!byMonth && block.theme ? ` (${block.theme})` : ''}${
          blockHasContent(block) ? ' and ALL its programming' : ''
        }? This cannot be undone.`,
      )
    )
      return;
    updateBlocks((all) => all.filter((_, i) => i !== bi));
    setBi(Math.max(0, bi - 1));
    setWi(0);
  }

  function addSession() {
    // Add the next session this stream runs that the week does not have yet:
    // a week with Lower gets Upper, then Full Body. Adding always used to give
    // another "Lower" that then had to be re-typed by hand, which is the only
    // reason a session-type control needed to sit on screen at all.
    const used = new Set(sessions.map((s) => s.focus));
    const focus =
      streamFocuses.find((f) => !used.has(f)) ??
      streamFocuses[0] ??
      sessions[0]?.focus ??
      'esd';
    patchWeekSessions((list) => [...list, newSession(focus, streamKind)]);
    setSi(sessions.length);
  }

  function removeSession() {
    if (sessions.length <= 1) return;
    if (!window.confirm(`Remove this session and its programming? This cannot be undone.`)) return;
    patchWeekSessions((list) => list.filter((_, i) => i !== sIdx));
    setSi(0);
  }

  /** A series-only edit. Circuits have no series, so this is a no-op there. */
  function patchSeries(fn: (s: SeriesSession) => SeriesSession) {
    patchSession((s) => (s.kind === 'series' ? fn(s) : s));
  }

  function patchTimedBlock(blockId: string, fn: (b: TimedBlock) => TimedBlock | null) {
    patchSeries((s) => ({
      ...s,
      timedBlocks: s.timedBlocks
        .map((b) => (b.id === blockId ? fn(b) : b))
        .filter((b): b is TimedBlock => b !== null),
    }));
  }

  function addSlot(blockId?: string) {
    if (session.kind !== 'series') return;
    const targetId = blockId ?? session.timedBlocks[session.timedBlocks.length - 1]?.id;
    const slot: ExerciseSlot = { id: crypto.randomUUID(), exerciseId: null, name: '' };
    if (!targetId) {
      patchSeries((s) => ({
        ...s,
        timedBlocks: [{ id: crypto.randomUUID(), label: 'A', minutes: 15, slots: [slot] }],
      }));
      return;
    }
    patchTimedBlock(targetId, (b) => ({ ...b, slots: [...b.slots, slot] }));
  }

  function addTimedBlock() {
    patchSeries((s) => ({
      ...s,
      timedBlocks: [
        ...s.timedBlocks,
        { id: crypto.randomUUID(), label: nextLabel(s.timedBlocks), minutes: 10, slots: [] },
      ],
    }));
  }

  function commitExercise(
    blockId: string,
    slotId: string,
    name: string,
    exercise: LibraryExercise | null,
  ) {
    // A free-text commit that exactly matches a library title keeps the link,
    // so an edit-then-retype never silently detaches scales, cues and patterns.
    let resolved = exercise;
    if (!resolved && merged) {
      const needle = name.trim().toLowerCase();
      resolved = merged.find((e) => e.title.toLowerCase() === needle) ?? null;
    }
    patchTimedBlock(blockId, (b) => ({
      ...b,
      slots: b.slots.map((sl) =>
        sl.id === slotId ? { ...sl, name, exerciseId: resolved ? resolved.id : null } : sl,
      ),
    }));
  }

  function setScale(slot: ExerciseSlot, index: 0 | 1, text: string) {
    if (slot.exerciseId === null) return;
    const id = slot.exerciseId;
    lib.update((d) => {
      const current = [...(d.scales[id] ?? ['', ''])];
      current[index] = text;
      while (current.length < 2) current.push('');
      const scales = { ...d.scales };
      if (current.every((s) => s.trim() === '')) delete scales[id];
      else scales[id] = current.slice(0, 2);
      return { ...d, scales };
    });
  }

  // Find the equivalent session in another week: same custom name first, then
  // same focus, so Lower lines up with Lower across the whole phase.
  function matchSession(week: ProgramWeek): Session | undefined {
    if (session.name) {
      const byName = week.sessions.find((s) => s.name === session.name);
      if (byName) return byName;
    }
    return week.sessions.find((s) => s.focus === session.focus);
  }

  // Push the selected week to the TrainHeroic team calendar as DRAFTS. Each
  // session's day comes from the active Schedule scenario, so Lower lands on
  // the day Lower actually runs. The server re-derives the same days and
  // refuses if any already holds a session; publishing stays manual.
  async function pushWeekToTrainHeroic() {
    const startDate = annual.data?.startDate;
    if (!startDate || !schedule.data) {
      window.alert('The annual plan or the timetable has not loaded yet. Try again in a moment.');
      return;
    }
    const monday = mondayOfWeek(wi);
    if (!monday) return;
    const mondayIso = isoDate(monday);

    const resolved = resolveWeekDays(
      schedule.data,
      mondayIso,
      sessions.map((s) => s.focus),
    );
    const lines = resolved.days.map((d, i) => {
      const label = sessionLabel(sessions[i]);
      return d.date
        ? `  ${label} → ${d.dayName} ${d.date}`
        : `  ${label} → no class in this timetable, will be skipped`;
    });
    if (resolved.days.every((d) => !d.date)) {
      window.alert(
        `Nothing to push: the "${resolved.scenarioName}" timetable has no class for this week's sessions.`,
      );
      return;
    }
    if (
      !window.confirm(
        `Push Phase ${bi + 1} Week ${wi + 1} to the TAC Strength Class team calendar as DRAFTS?\n\n` +
          `Days come from the "${resolved.scenarioName}" timetable:\n${lines.join('\n')}\n\n` +
          `Nothing is published; you publish in the coach app.`,
      )
    )
      return;
    setPushState('pushing');
    try {
      const res = await fetch('/api/team-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block: bi + 1,
          week: wi + 1,
          monday: mondayIso,
          streamId: stream.id,
        }),
      });
      const out = await res.json();
      if (!res.ok) {
        window.alert(
          `Push refused: ${out.error}\n${(out.existing ?? []).join('\n')}${out.detail ? '\n' + out.detail : ''}`,
        );
        return;
      }
      window.alert(
        `Pushed as drafts, dated off the "${out.scenario}" timetable:\n${out.pushed.join('\n')}${
          out.missing?.length ? '\n\nNo class runs these, so they were not pushed:\n' + out.missing.join(', ') : ''
        }${out.skipped?.length ? '\n\nSkipped (no TrainHeroic id):\n' + out.skipped.join('\n') : ''}`,
      );
    } catch (err) {
      window.alert(`Push failed: ${String(err)}`);
    } finally {
      setPushState('idle');
    }
  }

  // Phase exercise view: committing a cell makes that exercise this block's
  // occupant of the series position. Existing slots rename in place (keeping
  // each week's prescription); weeks without the slot get it created, so a
  // freshly planned block fills all four weeks at once.
  function commitPhaseExercise(
    blockIndex: number,
    series: string,
    n: number,
    row: EditableRow | null,
    name: string,
    exercise: LibraryExercise | null,
  ) {
    const trimmed = name.trim();
    if (!trimmed) return;
    let resolved = exercise;
    if (!resolved && merged) {
      const needle = trimmed.toLowerCase();
      resolved = merged.find((e) => e.title.toLowerCase() === needle) ?? null;
    }
    const exerciseId = resolved ? resolved.id : null;
    const seriesKey = series.trim().toUpperCase();
    updateBlocks((all) =>
      all.map((b, bIdx) => {
        if (bIdx !== blockIndex) return b;
        const sibling = b.weeks
          .flatMap((w) => w.sessions)
          .flatMap((s) => (s.kind === 'series' ? s.timedBlocks : []))
          .find((tb) => tb.label.trim().toUpperCase() === seriesKey);
        return {
          ...b,
          weeks: b.weeks.map((w, wIdx) => {
            const target = matchSession(w);
            if (!target) return w;
            const ref = row?.cells[wIdx] ?? null;
            return {
              ...w,
              sessions: w.sessions.map((s) => {
                // The grids only build rows from series sessions.
                if (s.id !== target.id || s.kind !== 'series') return s;
                if (ref) {
                  return {
                    ...s,
                    timedBlocks: s.timedBlocks.map((tb) =>
                      tb.id !== ref.timedBlockId
                        ? tb
                        : {
                            ...tb,
                            slots: tb.slots.map((sl) =>
                              sl.id !== ref.slotId ? sl : { ...sl, name: trimmed, exerciseId },
                            ),
                          },
                    ),
                  };
                }
                const slot: ExerciseSlot = { id: crypto.randomUUID(), exerciseId, name: trimmed };
                const existing = s.timedBlocks.find(
                  (tb) => tb.label.trim().toUpperCase() === seriesKey,
                );
                if (existing) {
                  // Insert at the row's position so out-of-order planning still
                  // lines the blocks up once the earlier positions are filled.
                  const at = Math.min(n - 1, existing.slots.length);
                  const slots = [...existing.slots];
                  slots.splice(at, 0, slot);
                  return {
                    ...s,
                    timedBlocks: s.timedBlocks.map((tb) =>
                      tb.id !== existing.id ? tb : { ...tb, slots },
                    ),
                  };
                }
                return {
                  ...s,
                  timedBlocks: [
                    ...s.timedBlocks,
                    {
                      id: crypto.randomUUID(),
                      label: series,
                      minutes: sibling?.minutes ?? 10,
                      slots: [slot],
                    },
                  ],
                };
              }),
            };
          }),
        };
      }),
    );
  }

  function removePhaseExercise(blockIndex: number, row: EditableRow) {
    if (
      !window.confirm(
        `Remove ${row.name} (and its sets/reps) from every week of Phase ${blockIndex + 1}?`,
      )
    )
      return;
    const ids = new Set(row.cells.filter(Boolean).map((ref) => ref!.slotId));
    updateBlocks((all) =>
      all.map((b, bIdx) =>
        bIdx !== blockIndex
          ? b
          : {
              ...b,
              weeks: b.weeks.map((w) => ({
                ...w,
                sessions: w.sessions.map((s) =>
                  s.kind !== 'series'
                    ? s
                    : {
                        ...s,
                        timedBlocks: s.timedBlocks.map((tb) => ({
                          ...tb,
                          slots: tb.slots.filter((sl) => !ids.has(sl.id)),
                        })),
                      },
                ),
              })),
            },
      ),
    );
  }

  // Patch a single slot anywhere in the program, addressed by ids (the
  // Month/Phase grids edit slots outside the currently selected week).
  function patchSlotByRef(ref: SlotRef, patch: Partial<ExerciseSlot>) {
    updateBlocks((all) =>
      all.map((b, bIdx) =>
        bIdx !== ref.blockIndex
          ? b
          : {
              ...b,
              weeks: b.weeks.map((w, wIdx) =>
                wIdx !== ref.weekIndex
                  ? w
                  : {
                      ...w,
                      sessions: w.sessions.map((s) =>
                        s.id !== ref.sessionId || s.kind !== 'series'
                          ? s
                          : {
                              ...s,
                              timedBlocks: s.timedBlocks.map((tb) =>
                                tb.id !== ref.timedBlockId
                                  ? tb
                                  : {
                                      ...tb,
                                      slots: tb.slots.map((sl) =>
                                        sl.id !== ref.slotId ? sl : { ...sl, ...patch },
                                      ),
                                    },
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    );
  }

  // Create a slot in a week that doesn't have this exercise yet, keeping the
  // series label (and minutes, copied from a sibling week) consistent.
  function addSlotFromTarget(t: AddTarget) {
    const slot: ExerciseSlot = { id: crypto.randomUUID(), exerciseId: t.exerciseId, name: t.name };
    const seriesKey = t.series.trim().toUpperCase();
    updateBlocks((all) =>
      all.map((b, bIdx) => {
        if (bIdx !== t.blockIndex) return b;
        const sibling = b.weeks
          .flatMap((w) => w.sessions)
          .flatMap((s) => (s.kind === 'series' ? s.timedBlocks : []))
          .find((tb) => tb.label.trim().toUpperCase() === seriesKey);
        return {
          ...b,
          weeks: b.weeks.map((w, wIdx) => {
            if (wIdx !== t.weekIndex) return w;
            return {
              ...w,
              sessions: w.sessions.map((s) => {
                if (s.id !== t.sessionId || s.kind !== 'series') return s;
                const existing = s.timedBlocks.find(
                  (tb) => tb.label.trim().toUpperCase() === seriesKey,
                );
                if (existing) {
                  return {
                    ...s,
                    timedBlocks: s.timedBlocks.map((tb) =>
                      tb.id !== existing.id ? tb : { ...tb, slots: [...tb.slots, slot] },
                    ),
                  };
                }
                return {
                  ...s,
                  timedBlocks: [
                    ...s.timedBlocks,
                    {
                      id: crypto.randomUUID(),
                      label: t.series,
                      minutes: sibling?.minutes ?? 10,
                      slots: [slot],
                    },
                  ],
                };
              }),
            };
          }),
        };
      }),
    );
  }

  /**
   * Read the week's sessions and lay the room out for them: everything the
   * workout calls for gets placed, in a tidy row down the free floor. The
   * air runners, rig and sled track are fixtures, so a Run or a Sled push
   * needs nothing added.
   */
  function buildLayoutForWeek() {
    const text = sessions
      .map((s) =>
        s.kind === 'circuit'
          ? circuitToText(s.circuit, s.note)
          : s.timedBlocks.flatMap((tb) => tb.slots.map((sl) => sl.name)).join('\n'),
      )
      .join('\n');
    const needed = equipmentFor(text);
    if (needed.length === 0) {
      window.alert('Nothing in this week needs equipment placing: it is all runners, rig and sled.');
      return;
    }
    const target = (layouts.data?.rooms ?? []).find((r) => r.id === stream.id);
    if (!target) {
      window.alert(`No floor layout exists for ${stream.name} yet.`);
      return;
    }
    if (
      target.items.length > 0 &&
      !window.confirm(
        `Replace the ${stream.name} layout with the gear this week calls for?\n\n${needed
          .map((n) => `• ${n.label}`)
          .join('\n')}`,
      )
    )
      return;

    // Lay each kind out as a row across the open floor between rig and sled.
    const items = needed.map((hint, i) => {
      return {
        id: crypto.randomUUID(),
        kind: hint.kind,
        label: hint.label,
        x: 60,
        y: 300 + i * 46,
        w: 0,
        h: 0,
        count: 3,
        gap: 16,
        dir: 'row' as const,
        station: i + 1,
      };
    });
    layouts.update((d) => ({
      ...d,
      rooms: d.rooms.map((r) => (r.id === stream.id ? { ...r, items } : r)),
    }));
    window.alert(
      `${stream.name} layout built from Week ${wi + 1}: ${needed.map((n) => n.label).join(', ')}.\nOpen the Layouts tab to arrange it.`,
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest('[data-block-id]');
      addSlot(el ? String(el.getAttribute('data-block-id')) : undefined);
    } else if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      addTimedBlock();
    }
  }

  return (
    <div onKeyDown={handleKeyDown}>
      {/* Program banner: full width across the very top */}
      <div className="relative mb-4 rounded-xl bg-ink-950 px-6 py-3 text-center shadow-sm">
        <div className="absolute top-3 right-4">
          {(() => {
            const urgent = mostUrgent([program, lib]);
            return (
              <SaveBadge
                state={urgent.saveState}
                onReloadTheirs={urgent.reloadTheirs}
                onKeepMine={urgent.keepMine}
                onRetry={urgent.retry}
              />
            );
          })()}
        </div>
        <input
          className="font-display block w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-center text-[26px] leading-tight text-ink-50 hover:border-white/25 focus:border-sand-500 focus:outline-none"
          value={doc.name}
          onChange={(e) => program.update((d) => ({ ...d, name: e.target.value }))}
        />
        <p className="text-[11px] font-semibold tracking-[0.28em] text-sand-500 uppercase">
          {stream.name} · {blockLabel(bi)}
          {!byMonth && blocks[bi].theme ? ` · ${blocks[bi].theme}` : ''} · Week {wi + 1} of{' '}
          {blocks[bi].weeks.length}
          {mondayOfWeek(wi) && (
            <span className="ml-2 text-white/70">
              week of{' '}
              {fmtDay(mondayOfWeek(wi), { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          )}
        </p>
      </div>

      <div className="flex gap-4">
      {/* Output rail: the three "send this somewhere" actions, out of the
          way of the editing controls. Labels appear on hover. */}
      <aside className="sticky top-4 flex h-[calc(100vh-10rem)] w-14 shrink-0 flex-col items-center gap-2 self-start rounded-xl border border-ink-200 bg-white py-3 shadow-sm">
        <RailButton label="TV output" onClick={() => navigate(`/tv/${session.id}`)}>
          <TvIcon />
        </RailButton>
        <RailButton label="Export for Sheets" onClick={() => downloadProgramCsv(doc)}>
          <SheetsIcon />
        </RailButton>
        <RailButton
          label={pushState === 'pushing' ? 'Pushing…' : `Push W${wi + 1} to TrainHeroic (drafts)`}
          onClick={pushWeekToTrainHeroic}
          disabled={pushState === 'pushing'}
        >
          <TrainHeroicIcon />
        </RailButton>
        <RailButton
          label={`Build the ${stream.name} floor layout from this week`}
          onClick={buildLayoutForWeek}
        >
          <LayoutIcon />
        </RailButton>
        <RailButton
          label={`Email week ${wi + 1} to the coaches`}
          onClick={() => setEmailOpen(true)}
        >
          <GmailIcon />
        </RailButton>
      </aside>

      {emailOpen && (
        <EmailWeekPanel
          coaches={schedule.data?.coaches ?? []}
          subject={weekEmailSubject(emailInput)}
          body={weekEmailBody(emailInput)}
          onClose={() => setEmailOpen(false)}
        />
      )}

      <div className="min-w-0 flex-1">
      {libraryError && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Exercise library failed to load. Run <code>npm run refresh-library</code> and reload.
        </p>
      )}

      {/* Navigation: a stable two-row structure so nothing jumps when the
          view changes. Row 1 is always the phase controls; row 2 always
          starts with the session pills, then the one view-specific group
          (week pills, block pills, or the phase mode toggle). */}
      <div className="mb-4 space-y-2">
        {/* One bar: what you're programming (stream), which phase, which
            session; then the view controls on the right. Length editing
            lives behind Edit so it isn't underfoot. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <select
              className={selectCls}
              value={streamIndex}
              onChange={(e) => {
                setStreamIndex(Number(e.target.value));
                setBi(0);
                setWi(0);
                setSi(0);
              }}
              title="Which class you're programming"
            >
              {streams.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className={selectCls}
              value={bi}
              onChange={(e) => {
                setBi(Number(e.target.value));
                setWi(0);
                setBlockPage(0);
              }}
              title={`Which ${unit} of this stream`}
            >
              {blocks.map((b, i) => (
                <option key={b.id} value={i}>
                  {blockLabel(i)}
                  {!byMonth && b.theme ? ` · ${b.theme}` : ''} ({b.weeks.length} wk)
                </option>
              ))}
            </select>
          </div>

          {/* The sessions take the space between the phase dropdown and the
              view controls, and centre in it, so the blank space either side
              is even however long the phase name or the class list is. */}
          <div className="flex flex-1 items-center justify-center gap-1.5">
            {sessions.map((s, i) => (
              <button key={s.id} type="button" className={pill(i === sIdx)} onClick={() => setSi(i)}>
                {s.name || FOCUS_LABEL[s.focus]}
              </button>
            ))}
            {view === 'week' && (
              <>
                <button
                  type="button"
                  title="Add a session to this week"
                  onClick={addSession}
                  className="rounded-md border border-dashed border-ink-300 px-2.5 py-1.5 text-sm font-medium text-ink-400 hover:border-accent-600 hover:text-accent-600"
                >
                  +
                </button>
                {/* Everything about the selected session lives behind this:
                    its name, what it is, and removing it. Same size as +. */}
                <button
                  type="button"
                  title={`Edit ${sessionLabel(session)}: name, type, remove`}
                  aria-expanded={sessionEditOpen}
                  onClick={() => setSessionEditOpen((v) => !v)}
                  className={`rounded-md border px-2.5 py-1.5 text-sm font-medium ${
                    sessionEditOpen
                      ? 'border-accent-600 bg-accent-100/40 text-accent-700'
                      : 'border-ink-300 text-ink-400 hover:border-accent-600 hover:text-accent-600'
                  }`}
                >
                  e
                </button>
              </>
            )}
          </div>

          {/* Right-hand controls: how you're looking at it. On this row with
              the stream, phase and session controls, so every button that
              changes what you are looking at sits on one line. */}
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-md border border-ink-300">
              {(Object.keys(VIEW_LABEL) as ProgramView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === v ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                  }`}
                >
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-sm text-ink-500">
              <input
                type="checkbox"
                checked={expandScales}
                onChange={(e) => setExpandScales(e.target.checked)}
                className="accent-accent-600"
              />
              Scales
            </label>
            <button
              type="button"
              title="Phase name, length and structure"
              onClick={() => setEditOpen((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                editOpen
                  ? 'border-ink-950 bg-ink-950 text-white'
                  : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-100'
              }`}
            >
              Edit
            </button>
          </div>
        </div>

        {/* Row 2: which week (or block, or phase mode), centred on the page. */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {view === 'week' && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {blocks[bi].weeks.map((w, i) => {
                // A club shutdown between two weeks is drawn as a greyed strip
                // so the jump in dates is visible, not just implied.
                const gap = breakBefore(i);
                return (
                  <span key={w.id} className="flex items-center gap-1.5">
                    {gap && (
                      <span
                        title={`${gap.name}: ${gap.weeks} week${gap.weeks === 1 ? '' : 's'} with no classes`}
                        className="rounded-md border border-dashed border-ink-300 bg-ink-50 px-2 py-1 text-[10px] font-medium tracking-wide text-ink-400 uppercase"
                      >
                        {gap.name}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`${pill(i === wi)} flex flex-col items-center leading-tight`}
                      onClick={() => setWi(i)}
                      title={
                        mondayOfWeek(i)
                          ? `Week starting ${fmtDay(mondayOfWeek(i), { weekday: 'long', day: 'numeric', month: 'long' })}`
                          : undefined
                      }
                    >
                      W{i + 1}
                      {mondayOfWeek(i) && (
                        <span className="text-[10px] font-normal opacity-70">
                          {fmtDay(mondayOfWeek(i))}
                        </span>
                      )}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {view === 'block' && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: blockPages }, (_, i) => {
                const first = i * BLOCK_LEN + 1;
                const last = Math.min((i + 1) * BLOCK_LEN, blocks[bi].weeks.length);
                return (
                  <button
                    key={i}
                    type="button"
                    className={pill(i === blockPage)}
                    onClick={() => setBlockPage(i)}
                  >
                    Block {i + 1}
                    <span className="ml-1 text-[11px] opacity-60">
                      {first === last ? `W${first}` : `W${first}–${last}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {view === 'month' && (
            /* Mode toggle: segmented control, matching the view switcher
               (segmented = pick a mode, pills = pick an item). */
            <div className="flex overflow-hidden rounded-md border border-ink-300">
              <button
                type="button"
                title="This phase's weeks side by side"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  phaseMode === 'weeks' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
                onClick={() => setPhaseMode('weeks')}
              >
                Weeks
              </button>
              <button
                type="button"
                title="Plan which exercises rotate phase to phase, names only"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  phaseMode === 'exercises' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
                onClick={() => setPhaseMode('exercises')}
              >
                Exercise rotation
              </button>
            </div>
          )}
        </div>

        {/* Edit panel: phase structure, out of the way until wanted */}
        {editOpen && (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <label className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              {byMonth ? 'Month name' : `Phase ${bi + 1} theme`}
              <input
                className="mt-0.5 block w-56 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
                placeholder={byMonth ? 'e.g. Sept 2026' : 'e.g. Strength-Hypertrophy'}
                value={blocks[bi].theme ?? ''}
                onChange={(e) =>
                  updateBlocks((all) =>
                    all.map((b, i) => (i === bi ? { ...b, theme: e.target.value } : b)),
                  )
                }
              />
            </label>
            {!byMonth && annualLane && (
              <p className="text-[11px] tracking-normal text-ink-500 normal-case">
                {annualPhase(bi) ? (
                  <>
                    Linked to the annual plan:{' '}
                    <span className="font-semibold text-ink-950">{linkedName(bi)}</span>
                    {lengthDrift(bi) !== null && (
                      <span className="mt-0.5 block text-amber-600">
                        The annual plan has this as {lengthDrift(bi)} weeks, this is{' '}
                        {blocks[bi].weeks.length}.
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-amber-600">
                    Not linked to the annual plan, so its name and length are only set here.
                  </span>
                )}
              </p>
            )}
            <div className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              {UNIT} length
              <div className="mt-0.5 flex items-center gap-1 rounded-md border border-ink-300 bg-white px-1.5 py-1">
                <button
                  type="button"
                  title="One week shorter"
                  onClick={() => setBlockLength(blocks[bi].weeks.length - 1)}
                  className="rounded px-1.5 text-sm font-bold text-ink-500 hover:text-ink-950 disabled:opacity-30"
                  disabled={blocks[bi].weeks.length <= 1}
                >
                  −
                </button>
                <span className="min-w-12 text-center text-sm text-ink-700">
                  {blocks[bi].weeks.length} wk
                </span>
                <button
                  type="button"
                  title="One week longer (clones the last week's exercises, blank prescriptions)"
                  onClick={() => setBlockLength(blocks[bi].weeks.length + 1)}
                  className="rounded px-1.5 text-sm font-bold text-ink-500 hover:text-ink-950"
                >
                  +
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={addBlock}
              className="rounded-md border border-dashed border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
            >
              + Add {unit}
            </button>
            {!byMonth && annualLane && (
              <button
                type="button"
                onClick={pullFromAnnual}
                title="Add any phase from this stream's annual lane that is not here yet"
                className="rounded-md border border-dashed border-accent-600 bg-white px-3 py-1.5 text-sm font-medium text-accent-600 hover:bg-accent-100/40"
              >
                Pull phases from the annual plan
              </button>
            )}
            <button
              type="button"
              disabled={blocks.length <= 1}
              onClick={removeBlock}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete {byMonth ? blockLabel(bi) : blockLabel(bi).toLowerCase()}
            </button>
            <p className="w-full text-[11px] text-ink-400">
              {stream.name} · {blocks.length} {unit}{blocks.length === 1 ? '' : 's'} ·{' '}
              {blocks.reduce((n, b) => n + b.weeks.length, 0)} weeks total
            </p>
          </div>
        )}
      </div>

      {view === 'block' && (
        <MonthGrid
          block={sliceBlockRows(
            buildBlockRows(blocks[bi], bi, matchSession),
            blockPage * BLOCK_LEN,
            (blockPage + 1) * BLOCK_LEN,
          )}
          weekOffset={blockPage * BLOCK_LEN}
          onEdit={patchSlotByRef}
          onAdd={addSlotFromTarget}
          onOpenWeek={(wIdx) => {
            setWi(wIdx);
            setView('week');
          }}
        />
      )}

      {view === 'month' && phaseMode === 'weeks' && (
        <MonthGrid
          block={buildBlockRows(blocks[bi], bi, matchSession)}
          onEdit={patchSlotByRef}
          onAdd={addSlotFromTarget}
          onOpenWeek={(wIdx) => {
            setWi(wIdx);
            setView('week');
          }}
        />
      )}

      {view === 'month' && phaseMode === 'exercises' && (
        <PhaseExerciseGrid
          blocks={blocks.map((b, bIdx) => buildBlockRows(b, bIdx, matchSession))}
          themes={blocks.map((b) => b.theme)}
          search={search}
          onCommitCell={commitPhaseExercise}
          onRemoveCell={removePhaseExercise}
        />
      )}

      {view === 'week' && (
      // Editing wants focus, not sprawl: the whole week editor caps at a
      // readable width, centred on the screen.
      <div className="mx-auto max-w-4xl">
      {/* Behind the "e" beside the pills: everything about the selected
          session, and nothing on screen until it is wanted. */}
      {sessionEditOpen && (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
          <label className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
            Name
            <input
              className="mt-0.5 block w-56 rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
              placeholder={`Optional, shows "${FOCUS_LABEL[session.focus]}"`}
              value={session.name ?? ''}
              onChange={(e) =>
                patchSession((s) => {
                  const next = { ...s };
                  if (e.target.value) next.name = e.target.value;
                  else delete next.name;
                  return next;
                })
              }
            />
          </label>
          {streamFocuses.length > 1 && (
            <label className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Type
              <select
                className="mt-0.5 block rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
                value={session.focus}
                onChange={(e) =>
                  patchSession((s) => ({ ...s, focus: e.target.value as SessionFocus }))
                }
              >
                {streamFocuses.map((f) => (
                  <option key={f} value={f}>
                    {FOCUS_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={sessions.length <= 1}
            onClick={removeSession}
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1 text-sm font-medium text-ink-500 hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remove session
          </button>
          <button
            type="button"
            onClick={() => setSessionEditOpen(false)}
            className="ml-auto text-[12px] font-medium text-ink-500 hover:text-ink-950"
          >
            Done
          </button>
        </div>
      )}

      {/* Session intent: coach-facing note at the very top of the day */}
      <div className="mb-3 border-l-4 border-sand-500 pl-3">
        <label className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
          Session intent
        </label>
        <textarea
          className="mt-0.5 w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-sm leading-relaxed text-ink-950 italic placeholder:not-italic placeholder:text-ink-300 hover:border-ink-200 focus:border-accent-600 focus:bg-white focus:outline-none"
          rows={1}
          placeholder="What is today for? The intent a coach reading this should carry onto the floor."
          value={session.intent ?? ''}
          onChange={(e) =>
            patchSession((s) => {
              const next = { ...s };
              if (e.target.value) next.intent = e.target.value;
              else delete next.intent;
              return next;
            })
          }
        />
      </div>

      {/* Session: circuits for ESD / Hyrox / Game Day, series for Strength.
          Branching on the session itself, not the stream, so the editor always
          matches the payload the session actually carries. */}
      {session.kind === 'circuit' ? (
        <CircuitEditor
          key={session.id}
          session={session}
          onPatch={(fn) => patchSession((s) => (s.kind === 'circuit' ? fn(s) : s))}
        />
      ) : (
      <div className="space-y-3">
        {session.timedBlocks.map((block) => (
          <TimedBlockCard
            key={block.id}
            block={block}
            overrides={overrides}
            search={search}
            videoUrlFor={(id) => videoById.get(id)}
            expandScales={expandScales}
            onPatchBlock={(patch) => patchTimedBlock(block.id, (b) => ({ ...b, ...patch }))}
            onDeleteBlock={() => patchTimedBlock(block.id, () => null)}
            onAddSlot={() => addSlot(block.id)}
            onPatchSlot={(slotId, patch) =>
              patchTimedBlock(block.id, (b) => ({
                ...b,
                slots: b.slots.map((sl) => (sl.id === slotId ? { ...sl, ...patch } : sl)),
              }))
            }
            onCommitExercise={(slotId, name, ex) => commitExercise(block.id, slotId, name, ex)}
            onDeleteSlot={(slotId) =>
              patchTimedBlock(block.id, (b) => ({
                ...b,
                slots: b.slots.filter((sl) => sl.id !== slotId),
              }))
            }
            onToggleScales={(slotId) =>
              patchTimedBlock(block.id, (b) => ({
                ...b,
                slots: b.slots.map((sl) =>
                  sl.id === slotId ? { ...sl, showScales: !sl.showScales } : sl,
                ),
              }))
            }
            onSetScale={setScale}
          />
        ))}

        <button
          type="button"
          onClick={addTimedBlock}
          className="rounded-md border border-dashed border-ink-300 px-4 py-2 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
        >
          + Timed block <span className="text-ink-400">(Ctrl+B)</span>
        </button>

        {library && (
          <SessionBlurb
            session={session}
            library={merged ?? library}
            overrides={overrides}
            onSetOverride={(text) =>
              patchSession((s) => {
                const next = { ...s };
                if (text === undefined) delete next.blurbOverride;
                else next.blurbOverride = text;
                return next;
              })
            }
          />
        )}
      </div>
      )}
      </div>
      )}
      </div>
      </div>
    </div>
  );
}

// ---------- Output rail ----------

/** Icon button with a label that slides out on hover/focus. */
/**
 * Pick who gets this week's programming and open a Gmail compose window with
 * it filled in. Nothing sends from here: the same rule as the TrainHeroic
 * push, the tool prepares it and Chris presses send.
 */
function EmailWeekPanel({
  coaches,
  subject,
  body,
  onClose,
}: {
  coaches: Coach[];
  subject: string;
  body: string;
  onClose: () => void;
}) {
  const withEmail = coaches.filter((c) => c.email && looksLikeEmail(c.email));
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [copied, setCopied] = useState(false);

  const extras = extra
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const badExtras = extras.filter((e) => !looksLikeEmail(e));
  const to = [
    ...withEmail.filter((c) => picked.includes(c.id)).map((c) => c.email as string),
    ...extras.filter(looksLikeEmail),
  ];

  async function openCompose() {
    const { url, viaClipboard } = gmailComposeUrl(to, subject, body);
    if (viaClipboard) {
      try {
        await navigator.clipboard.writeText(body);
        setCopied(true);
      } catch {
        // Clipboard can be blocked; the preview below is still selectable.
      }
    }
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-ink-950/40 p-6">
      <section className="mt-12 w-full max-w-2xl rounded-xl border border-ink-200 bg-white p-5 shadow-lg">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl text-ink-950">Email this week's programming</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-medium text-ink-500 hover:text-ink-950"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-[12px] text-ink-500">
          Opens a Gmail compose window with this filled in. Nothing is sent until you send it.
        </p>

        <div className="mt-3">
          <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
            Coaches
          </span>
          {withEmail.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-500">
              No coach has an email address yet. Add them in Schedule, under Classes, coaches and
              rooms.
            </p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {withEmail.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-1.5 text-[13px] text-ink-700">
                    <input
                      type="checkbox"
                      checked={picked.includes(c.id)}
                      onChange={(e) =>
                        setPicked((p) =>
                          e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="mt-3 block">
          <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
            Anyone else
          </span>
          <input
            className="mt-0.5 w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
            placeholder="another@address.com, and@another.com"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          {badExtras.length > 0 && (
            <span className="mt-0.5 block text-[12px] text-amber-600">
              Not a valid address, and will be left off: {badExtras.join(', ')}
            </span>
          )}
        </label>

        <details className="mt-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-500">
            What gets sent ({subject})
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-800">
            {body}
          </pre>
        </details>

        {copied && (
          <p className="mt-2 text-[12px] text-accent-700">
            The programming was too long for the compose link, so it is on your clipboard. Paste it
            into the email before sending.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={to.length === 0}
            onClick={openCompose}
            className="rounded-md bg-ink-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open in Gmail
          </button>
          <span className="text-[12px] text-ink-500">
            {to.length === 0
              ? 'Pick at least one recipient.'
              : `To ${to.length} recipient${to.length === 1 ? '' : 's'}.`}
          </span>
        </div>
      </section>
    </div>
  );
}

/** Gmail's envelope, in the TAC palette rather than Google's red. */
function GmailIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <path
        d="M5 8.5v7.2c0 .4.3.8.8.8h1.9V11l4.3 3.2L16.3 11v5.5h1.9c.4 0 .8-.3.8-.8V8.5c0-1-1.2-1.6-2-1L12 11 7 7.5c-.8-.6-2 0-2 1Z"
        fill="#DEC5AE"
      />
    </svg>
  );
}

function RailButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:outline-none disabled:cursor-wait disabled:opacity-40"
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-1/2 left-full z-30 ml-2 -translate-y-1/2 rounded-md bg-ink-950 px-2 py-1 text-[12px] font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

/** TV output: a screen on a dark tile, matching the other two rail marks. */
function TvIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="4.6" y="6.2" width="14.8" height="9.8" rx="1.8" fill="#F5F3EB" />
      <path d="M9 19h6" stroke="#F5F3EB" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 16v3" stroke="#F5F3EB" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Google Sheets' app mark: green grid tile on a dark rounded tile. */
function SheetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="tac-sheets-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#12A150" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="4.2" y="6.6" width="15.6" height="10.8" rx="2.4" fill="url(#tac-sheets-green)" />
      <path
        d="M13.6 6.6v10.8M4.2 12h15.6"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Floor layout: a room plan on a dark tile. */
function LayoutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="4.5" y="5" width="15" height="3" rx="1" fill="#DEC5AE" />
      <rect x="4.5" y="10.5" width="6.5" height="3" rx="1" fill="#4E6353" />
      <rect x="13" y="10.5" width="6.5" height="3" rx="1" fill="#4E6353" />
      <rect x="4.5" y="16" width="15" height="3" rx="1" stroke="#8A8580" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/** TrainHeroic's app mark: lime slashed H on a dark rounded tile. Drawn to
 *  match rather than shipped as artwork, and used only to label the link to
 *  their product. */
function TrainHeroicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <g fill="#C9F31D">
        <path d="M7.4 6.2h3.1v11.6H7.4z" />
        <path d="M13.5 6.2h3.1v11.6h-3.1z" />
        <path d="M10.5 12.9l3-3.2v3.4l-3 3.2z" />
      </g>
    </svg>
  );
}
