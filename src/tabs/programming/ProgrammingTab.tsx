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
  SeriesBlock,
  ProgramBlock,
  ProgramDoc,
  ProgramWeek,
  PushLogDoc,
  PushLogEntry,
  SeriesSession,
  Session,
  SessionFocus,
  SessionKind,
  ScaledOption,
  TimedBlock,
} from '../../types/documents';
import TimedBlockCard from './TimedBlockCard';
import SessionBlurb from './SessionBlurb';
import { defaultSeries } from '../../seed';
import { MonthGrid, PhaseRotation, buildBlockRows } from './EditableGrid';
import type { BlockRows } from './EditableGrid';
import type { AddTarget, SlotRef } from './EditableGrid';
import { downloadProgramCsv } from '../../lib/exportCsv';
import {
  FOCUS_LABEL,
  STREAM_DEFS,
  circuitParts,
  formatOf,
  seriesBlocks,
  sessionLabel,
  streamsOf,
  withStreamBlocks,
} from '../../lib/programStreams';
import { FOCUS_DAY_PICK, resolveWeekDays } from '../../lib/classDays';
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
import CircuitPartCard from './CircuitPartCard';
import { circuitToText, equipmentFor } from '../../lib/circuit';
import { scaleKey, scaleOptions } from '../../lib/prescription';

type ProgramView = 'week' | 'block' | 'month';

// Chris's terminology: blocks[] in the data model are PHASES; the 3-4 week
// training blocks live inside a phase. Views: Week (edit one week), Block
// (one block within the phase), Phase (the blocks' exercise rotation side by
// side, then every week's periodisation, under one scroll bar).
const VIEW_LABEL: Record<ProgramView, string> = {
  week: 'Week',
  block: 'Block',
  month: 'Phase',
};

/** Default block length when a phase does not set its own. */
const BLOCK_LEN = 4;

// The Block view is a 4-week window into the phase; SlotRefs inside cells
// keep their absolute week indices, so edits land on the right week.
//
// The rows are built from the WHOLE phase, so slicing the week columns is not
// enough: an exercise that only runs in weeks 5 to 10 would still be listed on
// Block 1 with four empty cells. Keep only the rows this window actually has,
// and number them within the window so Block 1 reads A1, A2, A3.
function sliceBlockRows(rows: BlockRows, start: number, end: number): BlockRows {
  const seen = new Map<string, number>();
  const sliced = rows.rows
    .map((r) => ({ ...r, cells: r.cells.slice(start, end) }))
    .filter((r) => r.cells.some((c) => c !== null))
    .map((r) => {
      const n = (seen.get(r.seriesKey) ?? 0) + 1;
      seen.set(r.seriesKey, n);
      return { ...r, n };
    });
  return {
    blockIndex: rows.blockIndex,
    weekSessions: rows.weekSessions.slice(start, end),
    rows: sliced,
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
    timedBlocks: seriesBlocks(s.timedBlocks).map((tb) => ({
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

/**
 * Rewrite a session's SERIES parts, leaving any circuit part exactly as it is.
 * Returning null drops that part. Every sets-and-reps edit goes through here,
 * so a circuit finisher can never be mangled by an edit meant for a series.
 */
function mapSeries(
  blocks: TimedBlock[],
  fn: (b: SeriesBlock) => TimedBlock | null,
): TimedBlock[] {
  return blocks
    .map((b) => (b.kind === 'circuit' ? b : fn(b)))
    .filter((b): b is TimedBlock => b !== null);
}

/** Does this session hold real programming, in whichever way it is written? */
function sessionHasContent(s: Session): boolean {
  return s.kind === 'circuit'
    ? s.circuit.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()))
    : seriesBlocks(s.timedBlocks).some((tb) => tb.slots.some((sl) => sl.name));
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
  // Which 4-week block within the phase the Block view shows.
  const [blockPageRaw, setBlockPage] = useState(0);
  // The Phase view is two views behind one button: the blocks' exercise
  // rotation side by side (names only), or the week-by-week periodisation
  // grid. Both edit the same document, so a change in either is a change in
  // the Week and Block views too.
  const [phaseMode, setPhaseMode] = useState<'rotation' | 'weeks'>('rotation');
  const [expandScales, setExpandScales] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  // The "e" beside the session pills: name, type and remove, on demand.
  const [sessionEditOpen, setSessionEditOpen] = useState(false);

  // The push log is the tool's memory of what members' calendars hold. Read
  // directly (not through useDoc): this tab only ever reads it, and it must
  // refresh right after a push without joining the autosave machinery.
  const [pushEntries, setPushEntries] = useState<PushLogEntry[]>([]);
  const refreshPushLog = useCallback(() => {
    void fetch('/api/store/push-log')
      .then((r) => (r.ok ? r.json() : null))
      .then((env: { data?: PushLogDoc } | null) => {
        if (env?.data) setPushEntries(env.data.entries ?? []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshPushLog();
  }, [refreshPushLog]);

  const overrides = lib.data;
  const merged = library && overrides ? mergedLibrary(library, overrides) : null;

  const search = useCallback(
    (query: string) => (merged ? searchLibrary(merged, query) : []),
    [merged],
  );

  // Demo videos, by library id and also by name. The name index is what lets a
  // scaled option written before scales could be picked from the library still
  // find its video, and it is how any free-text row finds one at all.
  const videoLookup = useMemo(() => {
    const byId = new Map<number, string>();
    const byName = new Map<string, string>();
    for (const e of merged ?? []) {
      if (!e.videoUrl) continue;
      byId.set(e.id, e.videoUrl);
      const key = e.title.trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, e.videoUrl);
    }
    return { byId, byName };
  }, [merged]);

  const videoUrlFor = useCallback(
    (ref: { exerciseId?: number | null; name?: string }) =>
      (ref.exerciseId != null ? videoLookup.byId.get(ref.exerciseId) : undefined) ??
      videoLookup.byName.get((ref.name ?? '').trim().toLowerCase()),
    [videoLookup],
  );

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
  /** The most recent push of a given week of the selected phase, if any. */
  const lastPushOf = (weekIndex: number): PushLogEntry | undefined => {
    const hits = pushEntries.filter(
      (e) => e.streamId === stream.id && e.block === bi + 1 && e.week === weekIndex + 1,
    );
    return hits[hits.length - 1];
  };
  const bi = Math.min(biRaw, blocks.length - 1);
  const wi = Math.min(wiRaw, blocks[bi].weeks.length - 1);
  // A block is the 3 to 4 week wave inside a phase; the phase decides which.
  const blockLen = Math.max(1, Math.min(blocks[bi].blockLength ?? BLOCK_LEN, blocks[bi].weeks.length));
  const blockPages = Math.max(1, Math.ceil(blocks[bi].weeks.length / blockLen));
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
  // Strength runs the annual plan's numbered phases. ESD and Game Day are
  // programmed month to month and Hyrox in four-week blocks, so the same
  // control is called a Month or a Block there and the container carries its
  // own name instead of a number.
  const streamCadence = stream.cadence ?? 'phases';
  const numbered = streamCadence === 'phases';
  const UNIT = streamCadence === 'months' ? 'Month' : streamCadence === 'blocks' ? 'Block' : 'Phase';
  const unit = UNIT.toLowerCase();
  /** What a container is called here: "Phase 2", or its own name. */
  const blockLabel = (i: number) =>
    numbered ? `Phase ${i + 1}` : (blocks[i].theme ?? `${UNIT} ${i + 1}`);

  // A phase-cadence stream delivers the annual plan's lane, so the lane owns
  // the phase names and lengths. Programming shows what it is linked to and
  // says so when the two disagree, rather than quietly holding a second answer.
  const annualLane = numbered ? annual.data?.streams.find((s) => s.id === stream.id) : undefined;
  const annualPhase = (i: number) =>
    annualLane?.phases.find((p) => p.id === blocks[i].annualPhaseId);
  const linkedName = (i: number) => annualPhase(i)?.name ?? blocks[i].theme;
  /** Set when this phase's length no longer matches the annual plan's. */
  const lengthDrift = (i: number) => {
    const p = annualPhase(i);
    return p && p.weeks !== blocks[i].weeks.length ? p.weeks : null;
  };

  // The rotation overview's data: for every session identity in this phase
  // (Full Body A, Full Body B), one column per training block window, names
  // only, plus each window's challenge heading. Read-only; editing stays in
  // the Week and Block views.
  const rotationLabels = Array.from({ length: blockPages }, (_, pg) => {
    const first = pg * blockLen + 1;
    const last = Math.min((pg + 1) * blockLen, blocks[bi].weeks.length);
    return `Block ${pg + 1} · ${first === last ? `W${first}` : `W${first}-${last}`}`;
  });
  const rotationSections = (() => {
    const identities: { key: string; title: string; match: (week: ProgramWeek) => Session | undefined }[] = [];
    for (const week of blocks[bi].weeks) {
      for (const sess of week.sessions) {
        const key = sess.name || sess.focus;
        if (!identities.some((i) => i.key === key)) {
          identities.push({
            key,
            title: sessionLabel(sess),
            match: (week2) => week2.sessions.find((s2) => (s2.name || s2.focus) === key),
          });
        }
      }
    }
    return identities
      .map((identity) => {
        // Each column is built from its own window's weeks, not sliced from
        // the whole phase: slicing kept the phase-wide first-seen row order,
        // which put block 3's pull-ups above its bench because pull-ups
        // appeared first back in block 2. A window orders by its own slots.
        const columns = Array.from({ length: blockPages }, (_, pg) =>
          buildBlockRows(
            { ...blocks[bi], weeks: blocks[bi].weeks.slice(pg * blockLen, (pg + 1) * blockLen) },
            bi,
            identity.match,
          ),
        );
        const challenges = Array.from({ length: blockPages }, (_, pg) => {
          const heads: string[] = [];
          for (const week of blocks[bi].weeks.slice(pg * blockLen, (pg + 1) * blockLen)) {
            const sess = identity.match(week);
            if (sess?.kind !== 'series') continue;
            for (const tb of sess.timedBlocks) {
              if (tb.kind !== 'circuit') continue;
              for (const piece of tb.pieces) if (piece.heading.trim()) heads.push(piece.heading.trim());
            }
          }
          return heads.length ? [...new Set(heads)].join(' · ') : null;
        });
        return { title: identity.title, columns, challenges };
      })
      .filter((section) => section.columns.some((c) => c.rows.length > 0));
  })();

  // Rotation needs at least two block columns and some series rows; a circuit
  // stream or a single-block phase falls back to the periodisation grid.
  const rotationAvailable = rotationSections.length > 0 && rotationLabels.length > 1;
  const phaseModeEffective = rotationAvailable ? phaseMode : 'weeks';

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

  /** How many weeks a block runs inside this phase. */
  function setBlockLength2(next: number) {
    const len = Math.max(1, Math.min(next, blocks[bi].weeks.length));
    updateBlocks((all) => all.map((b, i) => (i === bi ? { ...b, blockLength: len } : b)));
    setBlockPage(0);
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
        `Remove ${blockLabel(bi)}${numbered && block.theme ? ` (${block.theme})` : ''}${
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

  function patchTimedBlock(blockId: string, fn: (b: SeriesBlock) => TimedBlock | null) {
    patchSeries((s) => ({
      ...s,
      timedBlocks: mapSeries(s.timedBlocks, (b) => (b.id === blockId ? fn(b) : b)),
    }));
  }

  function addSlot(blockId?: string) {
    if (session.kind !== 'series') return;
    const targetId = blockId ?? session.timedBlocks[session.timedBlocks.length - 1]?.id;
    const slot: ExerciseSlot = { id: crypto.randomUUID(), exerciseId: null, name: '' };
    if (!targetId) {
      patchSeries((s) => ({
        ...s,
        timedBlocks: [{ id: crypto.randomUUID(), kind: 'series', label: 'A', minutes: 15, slots: [slot] }],
      }));
      return;
    }
    patchTimedBlock(targetId, (b) => ({ ...b, slots: [...b.slots, slot] }));
  }

  /**
   * Move an exercise up or down inside its series. The same exercises run all
   * phase and only the prescriptions change week to week, so a reorder is
   * applied to every week's matching series by exercise name. Reordering week 1
   * alone would leave the other nine weeks in the old order.
   *
   * A slot with no name yet cannot be matched across weeks, so that case moves
   * in this session only.
   */
  function moveSlot(blockId: string, slotId: string, dir: -1 | 1) {
    if (session.kind !== 'series') return;
    const series = seriesBlocks(session.timedBlocks).find((tb) => tb.id === blockId);
    if (!series) return;
    const i = series.slots.findIndex((sl) => sl.id === slotId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= series.slots.length) return;

    const aName = series.slots[i].name.trim().toLowerCase();
    const bName = series.slots[j].name.trim().toLowerCase();
    const seriesKey = series.label.trim().toUpperCase();

    // An unnamed slot has no identity to find in the other weeks.
    if (!aName || !bName || aName === bName) {
      patchTimedBlock(blockId, (b) => {
        const slots = [...b.slots];
        [slots[i], slots[j]] = [slots[j], slots[i]];
        return { ...b, slots };
      });
      return;
    }

    updateBlocks((all) =>
      all.map((b, bIdx) => {
        if (bIdx !== bi) return b;
        return {
          ...b,
          weeks: b.weeks.map((w) => {
            const target = matchSession(w);
            if (!target) return w;
            return {
              ...w,
              sessions: w.sessions.map((s) => {
                if (s.id !== target.id || s.kind !== 'series') return s;
                return {
                  ...s,
                  timedBlocks: mapSeries(s.timedBlocks, (tb) => {
                    if (tb.label.trim().toUpperCase() !== seriesKey) return tb;
                    const ai = tb.slots.findIndex(
                      (sl) => sl.name.trim().toLowerCase() === aName,
                    );
                    const bj = tb.slots.findIndex(
                      (sl) => sl.name.trim().toLowerCase() === bName,
                    );
                    if (ai < 0 || bj < 0 || ai === bj) return tb;
                    const slots = [...tb.slots];
                    [slots[ai], slots[bj]] = [slots[bj], slots[ai]];
                    return { ...tb, slots };
                  }),
                };
              }),
            };
          }),
        };
      }),
    );
  }

  /**
   * Make the rest of a block run the same exercises as its first week.
   *
   * Changing week 5 used to leave weeks 6 to 8 on the old exercises, so a block
   * quietly held two different sessions. This aligns the list: series and
   * exercises are taken from the source week, and each target week KEEPS its
   * own sets, reps, % and RPE for any exercise that carries over, so the wave
   * loading across the block survives. Exercises the source week does not have
   * are removed, which is the point, so it confirms first.
   */
  function copyExercisesAcross(fromWeek: number, toWeeks: number[]) {
    const block = blocks[bi];
    const source = matchSession(block.weeks[fromWeek]);
    if (!source || source.kind !== 'series') return;

    const keyOf = (label: string, name: string) =>
      `${label.trim().toUpperCase()}::${name.trim().toLowerCase()}`;
    const sourceKeys = new Set(
      seriesBlocks(source.timedBlocks).flatMap((tb) =>
        tb.slots.filter((sl) => sl.name).map((sl) => keyOf(tb.label, sl.name)),
      ),
    );

    // What the coach is about to gain and lose, named in the confirm.
    const adding = new Set<string>();
    const removing = new Set<string>();
    for (const wIdx of toWeeks) {
      const target = matchSession(block.weeks[wIdx]);
      if (!target || target.kind !== 'series') continue;
      const mine = new Set(
        seriesBlocks(target.timedBlocks).flatMap((tb) =>
          tb.slots.filter((sl) => sl.name).map((sl) => keyOf(tb.label, sl.name)),
        ),
      );
      for (const tb of seriesBlocks(source.timedBlocks))
        for (const sl of tb.slots)
          if (sl.name && !mine.has(keyOf(tb.label, sl.name))) adding.add(sl.name);
      for (const tb of seriesBlocks(target.timedBlocks))
        for (const sl of tb.slots)
          if (sl.name && !sourceKeys.has(keyOf(tb.label, sl.name))) removing.add(sl.name);
    }

    const weekLabel = (i: number) => `Week ${i + 1}`;
    const lines = [
      `Make ${toWeeks.map(weekLabel).join(', ')} run the same exercises as ${weekLabel(fromWeek)}?`,
      '',
      adding.size ? `Adds: ${[...adding].join(', ')}` : null,
      removing.size ? `Removes: ${[...removing].join(', ')}` : null,
      !adding.size && !removing.size ? 'They already match. Nothing to change.' : null,
      '',
      'Sets, reps, % and RPE are kept for every exercise that stays.',
    ].filter((l) => l !== null);
    if (!adding.size && !removing.size) {
      window.alert(lines.join('\n'));
      return;
    }
    if (!window.confirm(lines.join('\n'))) return;

    updateBlocks((all) =>
      all.map((b, bIdx) => {
        if (bIdx !== bi) return b;
        return {
          ...b,
          weeks: b.weeks.map((w, wIdx) => {
            if (!toWeeks.includes(wIdx)) return w;
            const target = matchSession(w);
            if (!target) return w;
            return {
              ...w,
              sessions: w.sessions.map((s) => {
                if (s.id !== target.id || s.kind !== 'series') return s;
                const mine = new Map<string, ExerciseSlot>();
                for (const tb of seriesBlocks(s.timedBlocks))
                  for (const sl of tb.slots)
                    if (sl.name) mine.set(keyOf(tb.label, sl.name), sl);
                return {
                  ...s,
                  timedBlocks: seriesBlocks(source.timedBlocks).map((srcTb) => {
                    const existing = seriesBlocks(s.timedBlocks).find(
                      (tb) => tb.label.trim().toUpperCase() === srcTb.label.trim().toUpperCase(),
                    );
                    return {
                      id: existing?.id ?? crypto.randomUUID(),
                      label: srcTb.label,
                      minutes: existing?.minutes ?? srcTb.minutes,
                      slots: srcTb.slots
                        .filter((sl) => sl.name)
                        .map((srcSl) => {
                          const kept = mine.get(keyOf(srcTb.label, srcSl.name));
                          return kept
                            ? { ...kept, name: srcSl.name, exerciseId: srcSl.exerciseId }
                            : {
                                id: crypto.randomUUID(),
                                exerciseId: srcSl.exerciseId,
                                name: srcSl.name,
                              };
                        }),
                    };
                  }),
                };
              }),
            };
          }),
        };
      }),
    );
  }

  /** Add a circuit to a sets-and-reps session: a finisher, written the ESD way. */
  function addCircuitPart() {
    patchSession((s) =>
      s.kind !== 'series'
        ? s
        : {
            ...s,
            timedBlocks: [
              ...s.timedBlocks,
              {
                id: crypto.randomUUID(),
                kind: 'circuit',
                label: nextLabel(seriesBlocks(s.timedBlocks)),
                minutes: 10,
                pieces: [{ id: crypto.randomUUID(), heading: '', lines: [] }],
              },
            ],
          },
    );
  }

  function addTimedBlock() {
    patchSeries((s) => ({
      ...s,
      timedBlocks: [
        ...s.timedBlocks,
        { id: crypto.randomUUID(), kind: 'series', label: nextLabel(seriesBlocks(s.timedBlocks)), minutes: 10, slots: [] },
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

  /** A scaled option carries its own prescription, so patch one field at a time. */
  function setScale(slot: ExerciseSlot, index: 0 | 1, patch: Partial<ScaledOption>) {
    // A library exercise is keyed by its TrainHeroic id, a free-text one by its
    // name, so a movement the library has never heard of can still be scaled.
    const key = scaleKey(slot);
    if (key === null) return;
    lib.update((d) => {
      const current = scaleOptions(d, slot);
      while (current.length < 2) current.push({ name: '' });
      current[index] = { ...current[index], ...patch };
      const scales = { ...d.scales };
      const empty = (o: ScaledOption) =>
        !o.name.trim() && !o.sets && !o.reps && !o.load && !o.intensity && !o.rpe && !o.tempo;
      if (current.every(empty)) delete scales[key];
      else scales[key] = current.slice(0, 2);
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
    // Only Strength has a TrainHeroic team. Say so here rather than offering a
    // dialogue naming the Strength team and letting the server refuse it.
    if (stream.id !== 'strength') {
      window.alert(
        `${stream.name} has no TrainHeroic team yet, so there is nowhere to push it.\n\n` +
          'Only Strength maps to a team ("TAC Strength Class").',
      );
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
        `Nothing to push: the current format, "${resolved.scenarioName}", has no class for this week's sessions.`,
      );
      return;
    }
    const prior = lastPushOf(wi);
    const priorLine = prior
      ? `This week was already pushed ${new Date(prior.at).toLocaleString('en-AU', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })}. Days already holding a session are left as they are; only missing days are created.\n\n`
      : '';
    if (
      !window.confirm(
        `Push ${blockLabel(bi)} Week ${wi + 1} to the TAC Strength Class team calendar as DRAFTS?\n\n` +
          priorLine +
          `Days come from the current format, "${resolved.scenarioName}":\n${lines.join('\n')}\n\n` +
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
      refreshPushLog();
      window.alert(
        `Pushed as drafts, dated off the "${out.scenario}" timetable:\n${out.pushed.join('\n')}${
          out.alreadyPresent?.length ? '\n\nLeft as they were:\n' + out.alreadyPresent.join('\n') : ''
        }${
          out.missing?.length ? '\n\nNo class runs these, so they were not pushed:\n' + out.missing.join(', ') : ''
        }${out.skipped?.length ? '\n\nSkipped:\n' + out.skipped.join('\n') : ''}`,
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
                              timedBlocks: mapSeries(s.timedBlocks, (tb) =>
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
          .flatMap((s) => (s.kind === 'series' ? seriesBlocks(s.timedBlocks) : []))
          .find((tb) => tb.label.trim().toUpperCase() === seriesKey);
        return {
          ...b,
          weeks: b.weeks.map((w, wIdx) => {
            if (wIdx !== t.weekIndex) return w;
            return {
              ...w,
              sessions: w.sessions.map((s) => {
                if (s.id !== t.sessionId || s.kind !== 'series') return s;
                const existing = seriesBlocks(s.timedBlocks).find(
                  (tb) => tb.label.trim().toUpperCase() === seriesKey,
                );
                if (existing) {
                  return {
                    ...s,
                    timedBlocks: mapSeries(s.timedBlocks, (tb) =>
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
          : [
              ...seriesBlocks(s.timedBlocks).flatMap((tb) => tb.slots.map((sl) => sl.name)),
              // A circuit finisher inside a strength session needs its gear
              // placed too, so its text goes to the equipment scan as well.
              ...circuitParts(s.timedBlocks).map((p) => circuitToText(p.pieces)),
            ].join('\n'),
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
                conflictInfo={urgent.conflictInfo}
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
          {numbered && blocks[bi].theme ? ` · ${blocks[bi].theme}` : ''} · Week {wi + 1} of{' '}
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
      {/* z-40 puts the whole rail above the grids: the tooltips fly out over
          the tables, and the sticky cells in those tables carry their own
          z-index, so without this the labels were painted behind them. */}
      <aside className="sticky top-4 z-40 flex h-[calc(100vh-10rem)] w-14 shrink-0 flex-col items-center gap-2 self-start rounded-xl border border-ink-200 bg-white py-3 shadow-sm">
        <RailButton label="TV output" onClick={() => navigate(`/tv/${session.id}`)}>
          <TvIcon />
        </RailButton>
        <RailButton
          label="Block overview (PDF for coaches)"
          onClick={() => navigate('/overview')}
        >
          <OverviewIcon />
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
                  {numbered && b.theme ? ` · ${b.theme}` : ''} ({b.weeks.length} wk)
                </option>
              ))}
            </select>
          </div>

          {/* The sessions take the space between the phase dropdown and the
              view controls, and centre in it, so the blank space either side
              is even however long the phase name or the class list is. */}
          <div className="flex flex-1 items-center justify-center gap-1.5">
            {sessions.map((s, i) => {
              // A parked track (FOCUS_DAY_PICK null) is written but has no
              // class day, so it must not look like deliverable coverage.
              const parked = FOCUS_DAY_PICK[s.focus] === null;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${pill(i === sIdx)} ${parked ? 'opacity-60' : ''}`}
                  onClick={() => setSi(i)}
                  title={
                    parked
                      ? 'Parked: no class day runs this track, so it is never pushed or emailed. Written for when a day exists.'
                      : undefined
                  }
                >
                  {s.name || FOCUS_LABEL[s.focus]}
                  {parked && <span className="ml-1 text-[10px] font-normal uppercase">· parked</span>}
                </button>
              );
            })}
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
                      className={`${pill(i === wi)} relative flex flex-col items-center leading-tight`}
                      onClick={() => setWi(i)}
                      title={[
                        mondayOfWeek(i)
                          ? `Week starting ${fmtDay(mondayOfWeek(i), { weekday: 'long', day: 'numeric', month: 'long' })}`
                          : null,
                        lastPushOf(i)
                          ? `Pushed to TrainHeroic ${new Date(lastPushOf(i)!.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} (drafts)`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      W{i + 1}
                      {mondayOfWeek(i) && (
                        <span className="text-[10px] font-normal opacity-70">
                          {fmtDay(mondayOfWeek(i))}
                        </span>
                      )}
                      {/* The push ledger's badge: this week is in members'
                          calendars as drafts. Hover for when. */}
                      {lastPushOf(i) && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-white bg-sand-500" />
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
                const first = i * blockLen + 1;
                const last = Math.min((i + 1) * blockLen, blocks[bi].weeks.length);
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
          {view === 'month' && rotationAvailable && (
            /* Two views behind one button: segmented, matching the view
               switcher (segmented = pick a mode, pills = pick an item). */
            <div className="flex overflow-hidden rounded-md border border-ink-300">
              <button
                type="button"
                title="The phase's blocks side by side, exercise names only"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  phaseModeEffective === 'rotation' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
                onClick={() => setPhaseMode('rotation')}
              >
                Exercise rotation
              </button>
              <button
                type="button"
                title="Every week of the phase with sets, reps, % and RPE, editable"
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  phaseModeEffective === 'weeks' ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
                onClick={() => setPhaseMode('weeks')}
              >
                Periodisation
              </button>
            </div>
          )}
        </div>

        {/* Edit panel: phase structure, out of the way until wanted */}
        {editOpen && (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <label className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              {numbered ? `Phase ${bi + 1} theme` : `${UNIT} name`}
              <input
                className="mt-0.5 block w-56 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
                placeholder={
                  numbered
                    ? 'e.g. Strength-Hypertrophy'
                    : streamCadence === 'months'
                      ? 'e.g. Sept 2026'
                      : 'e.g. Block 01 Baseline'
                }
                value={blocks[bi].theme ?? ''}
                onChange={(e) =>
                  updateBlocks((all) =>
                    all.map((b, i) => (i === bi ? { ...b, theme: e.target.value } : b)),
                  )
                }
              />
            </label>
            {numbered && annualLane && (
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
            <div className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Block length
              <div className="mt-0.5 flex items-center gap-1 rounded-md border border-ink-300 bg-white px-1.5 py-1">
                <button
                  type="button"
                  title="Shorter blocks: a three-week wave instead of four"
                  onClick={() => setBlockLength2(blockLen - 1)}
                  disabled={blockLen <= 1}
                  className="rounded px-1.5 text-sm font-bold text-ink-500 hover:text-ink-950 disabled:opacity-30"
                >
                  −
                </button>
                <span className="min-w-12 text-center text-sm text-ink-700">{blockLen} wk</span>
                <button
                  type="button"
                  title="Longer blocks"
                  onClick={() => setBlockLength2(blockLen + 1)}
                  disabled={blockLen >= blocks[bi].weeks.length}
                  className="rounded px-1.5 text-sm font-bold text-ink-500 hover:text-ink-950 disabled:opacity-30"
                >
                  +
                </button>
              </div>
              <span className="mt-0.5 block tracking-normal normal-case">
                {blockPages} block{blockPages === 1 ? '' : 's'} in this {unit}
              </span>
            </div>
            <button
              type="button"
              onClick={addBlock}
              className="rounded-md border border-dashed border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
            >
              + Add {unit}
            </button>
            {numbered && annualLane && (
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
              Delete {numbered ? blockLabel(bi).toLowerCase() : blockLabel(bi)}
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
            blockPage * blockLen,
            (blockPage + 1) * blockLen,
          )}
          weekOffset={blockPage * blockLen}
          onEdit={patchSlotByRef}
          onAdd={addSlotFromTarget}
          onOpenWeek={(wIdx) => {
            setWi(wIdx);
            setView('week');
          }}
          onCopyExercises={copyExercisesAcross}
        />
      )}

      {view === 'month' && phaseModeEffective === 'rotation' && (
        /* Chris's paper sheet as a view: the phase's blocks side by side,
           names only, one table per session identity. */
        <div className="overflow-x-auto pb-2">
          <PhaseRotation
            sections={rotationSections}
            columnLabels={rotationLabels}
            onOpenBlock={(page) => {
              setBlockPage(page);
              setView('block');
            }}
          />
        </div>
      )}

      {view === 'month' && phaseModeEffective === 'weeks' && (
        /* Every week of the phase, editable: an edit here IS an edit in the
           Week and Block views, they all read the same document. */
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

      {/* What members read when they book. Kept apart from the intent above,
          which is for the coach, and from the note further down, which is the
          floor detail nobody outside the club should see. */}
      <div className="mb-3 border-l-4 border-ink-200 pl-3">
        <label className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
          Member app description
        </label>
        <textarea
          className="mt-0.5 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-950 placeholder:text-ink-300 hover:border-ink-200 focus:border-accent-600 focus:bg-white focus:outline-none"
          rows={session.appDescription ? Math.min(16, session.appDescription.split('\n').length + 1) : 1}
          placeholder="The session as members read it in the booking app."
          value={session.appDescription ?? ''}
          onChange={(e) =>
            patchSession((s) => {
              const next = { ...s };
              if (e.target.value) next.appDescription = e.target.value;
              else delete next.appDescription;
              return next;
            })
          }
        />
      </div>

      {/* The floor detail: staggers, capacity, what to watch. A circuit session
          keeps its own copy of this inside CircuitEditor, so only series
          sessions need it here and neither kind ends up with two. */}
      {session.kind === 'series' && (
        <div className="mb-3 border-l-4 border-ink-200 pl-3">
          <label className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
            Note for coaches
          </label>
          <textarea
            className="mt-0.5 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-700 placeholder:text-ink-300 hover:border-ink-200 focus:border-accent-600 focus:bg-white focus:outline-none"
            rows={session.note ? Math.min(12, session.note.split('\n').length + 1) : 2}
            placeholder="How to run the room: staggers, capacity, what to watch."
            value={session.note ?? ''}
            onChange={(e) =>
              patchSession((s) => {
                const next = { ...s };
                if (e.target.value) next.note = e.target.value;
                else delete next.note;
                return next;
              })
            }
          />
        </div>
      )}

      {/* Most of the year's unwritten sessions are circuits, and ESD / Game
          Day weeks are heavily templated: starting from last week's structure
          converts coaching time to output far faster than a blank editor. */}
      {session.kind === 'circuit' &&
        session.circuit.length === 0 &&
        (() => {
          const prevWeek =
            wi > 0
              ? blocks[bi].weeks[wi - 1]
              : bi > 0
                ? blocks[bi - 1].weeks[blocks[bi - 1].weeks.length - 1]
                : undefined;
          const source = prevWeek?.sessions.find(
            (s) => s.focus === session.focus && s.kind === 'circuit' && s.circuit.length > 0,
          );
          if (!source || source.kind !== 'circuit') return null;
          return (
            <button
              type="button"
              className="mb-3 rounded-md border border-dashed border-ink-300 px-4 py-2 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
              onClick={() =>
                patchSession((s) =>
                  s.kind !== 'circuit'
                    ? s
                    : {
                        ...s,
                        intent: s.intent || source.intent,
                        note: s.note || source.note,
                        circuit: source.circuit.map((p) => ({
                          ...p,
                          id: crypto.randomUUID(),
                          lines: p.lines.map((l) => ({ ...l })),
                        })),
                      },
                )
              }
            >
              Start from last week's {sessionLabel(source)} (copies the pieces here to edit)
            </button>
          );
        })()}

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
        {session.timedBlocks.map((block) =>
          block.kind === 'circuit' ? (
            <CircuitPartCard
              key={block.id}
              part={block}
              onPatch={(patch) =>
                patchSession((s) =>
                  s.kind !== 'series'
                    ? s
                    : {
                        ...s,
                        timedBlocks: s.timedBlocks.map((tb) =>
                          tb.id === block.id && tb.kind === 'circuit' ? { ...tb, ...patch } : tb,
                        ),
                      },
                )
              }
              onDelete={() =>
                patchSession((s) =>
                  s.kind !== 'series'
                    ? s
                    : { ...s, timedBlocks: s.timedBlocks.filter((tb) => tb.id !== block.id) },
                )
              }
            />
          ) : (
          <TimedBlockCard
            key={block.id}
            block={block}
            overrides={overrides}
            search={search}
            videoUrlFor={videoUrlFor}
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
            onSetScale={setScale}
            onMoveSlot={(slotId, dir) => moveSlot(block.id, slotId, dir)}
          />
          ),
        )}

        <button
          type="button"
          onClick={addTimedBlock}
          className="rounded-md border border-dashed border-ink-300 px-4 py-2 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
        >
          + Timed block <span className="text-ink-400">(Ctrl+B)</span>
        </button>
        <button
          type="button"
          onClick={addCircuitPart}
          title="Add a circuit to this session, written the way ESD and Hyrox are"
          className="ml-2 rounded-md border border-dashed border-ink-300 px-4 py-2 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
        >
          + Circuit
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
            The week is on your clipboard. If Gmail opened with an empty body, the programming was
            too long for the compose link; paste it in before sending.
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
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(body).then(() => setCopied(true));
            }}
            className="rounded-md border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
            title="Copy the whole week as plain text, for any email client or WhatsApp"
          >
            Copy as text
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

/** Block overview: a stacked-pages document on the same dark tile. */
function OverviewIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="6.2" y="4.8" width="10" height="13" rx="1.4" fill="#F5F3EB" />
      <rect x="8.2" y="6.8" width="10" height="13" rx="1.4" fill="#DEC5AE" />
      <path d="M10.5 10.4h5.4M10.5 13h5.4M10.5 15.6h3.4" stroke="#1B1B1B" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
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
