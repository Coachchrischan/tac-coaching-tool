import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { mergedLibrary, searchLibrary } from '../../lib/library';
import type { LibraryExercise } from '../../lib/library';
import SaveBadge from '../../components/SaveBadge';
import type {
  ExerciseSlot,
  ProgramBlock,
  ProgramDoc,
  ProgramWeek,
  Session,
  TimedBlock,
} from '../../types/documents';
import TimedBlockCard from './TimedBlockCard';
import SessionBlurb from './SessionBlurb';
import { defaultSeries } from '../../seed';
import { MonthGrid, PhaseExerciseGrid, buildBlockRows } from './EditableGrid';
import type { BlockRows } from './EditableGrid';
import type { AddTarget, EditableRow, SlotRef } from './EditableGrid';
import { downloadProgramCsv } from '../../lib/exportCsv';
import { FOCUS_LABEL, streamsOf, withStreamBlocks } from '../../lib/programStreams';

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

export default function ProgrammingTab() {
  const program = useDoc('program');
  const lib = useDoc('library-overrides');
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

  // Grow a block by cloning the last week's structure: same sessions, series
  // and exercise names, blank prescriptions (the block mental model: same
  // exercises all block, prescriptions progress week to week).
  function cloneWeekStructure(week: ProgramWeek): ProgramWeek {
    return {
      id: crypto.randomUUID(),
      sessions: week.sessions.map((s) => {
        const cloned: Session = {
          id: crypto.randomUUID(),
          focus: s.focus,
          timedBlocks: s.timedBlocks.map((tb) => ({
            id: crypto.randomUUID(),
            label: tb.label,
            minutes: tb.minutes,
            slots: tb.slots
              .filter((sl) => sl.name)
              .map((sl) => ({ id: crypto.randomUUID(), exerciseId: sl.exerciseId, name: sl.name })),
          })),
        };
        if (s.name) cloned.name = s.name;
        return cloned;
      }),
    };
  }

  function blockHasContent(block: ProgramBlock, fromWeek = 0) {
    return block.weeks
      .slice(fromWeek)
      .some((w) => w.sessions.some((s) => s.timedBlocks.some((tb) => tb.slots.some((sl) => sl.name))));
  }

  function setBlockLength(target: number) {
    const block = blocks[bi];
    const next = Math.max(1, Math.min(20, target));
    if (next === block.weeks.length) return;
    if (
      next < block.weeks.length &&
      blockHasContent(block, next) &&
      !window.confirm(
        `Shorten Phase ${bi + 1} to ${next} week${next === 1 ? '' : 's'}? The dropped weeks contain programming that will be deleted.`,
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
          sessions: focuses.map((focus) => ({
            id: crypto.randomUUID(),
            focus,
            timedBlocks: defaultSeries(crypto.randomUUID()),
          })),
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
        `Remove Phase ${bi + 1}${block.theme ? ` (${block.theme})` : ''}${
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
    const fresh: Session = {
      id: crypto.randomUUID(),
      focus: 'esd',
      timedBlocks: defaultSeries(crypto.randomUUID()),
    };
    patchWeekSessions((list) => [...list, fresh]);
    setSi(sessions.length);
  }

  function removeSession() {
    if (sessions.length <= 1) return;
    if (!window.confirm(`Remove this session and its programming? This cannot be undone.`)) return;
    patchWeekSessions((list) => list.filter((_, i) => i !== sIdx));
    setSi(0);
  }

  function patchTimedBlock(blockId: string, fn: (b: TimedBlock) => TimedBlock | null) {
    patchSession((s) => ({
      ...s,
      timedBlocks: s.timedBlocks
        .map((b) => (b.id === blockId ? fn(b) : b))
        .filter((b): b is TimedBlock => b !== null),
    }));
  }

  function addSlot(blockId?: string) {
    const targetId = blockId ?? session.timedBlocks[session.timedBlocks.length - 1]?.id;
    const slot: ExerciseSlot = { id: crypto.randomUUID(), exerciseId: null, name: '' };
    if (!targetId) {
      patchSession((s) => ({
        ...s,
        timedBlocks: [{ id: crypto.randomUUID(), label: 'A', minutes: 15, slots: [slot] }],
      }));
      return;
    }
    patchTimedBlock(targetId, (b) => ({ ...b, slots: [...b.slots, slot] }));
  }

  function addTimedBlock() {
    patchSession((s) => ({
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

  // Push the selected week to the TrainHeroic team calendar as DRAFTS
  // (lower=Mon, upper=Wed, full=Fri, dated off the annual plan's year start).
  // The server refuses if the target days already hold sessions; publishing
  // stays manual in the coach app.
  async function pushWeekToTrainHeroic() {
    setPushState('pushing');
    try {
      const annual = await (await fetch('/api/store/annual-plan')).json();
      const start = new Date(annual.data.startDate + 'T00:00:00Z');
      // Program weeks run consecutively from the year start; blocks vary in
      // length, so the offset is the sum of the earlier blocks' weeks.
      const weeksBefore = blocks.slice(0, bi).reduce((n, b) => n + b.weeks.length, 0);
      start.setUTCDate(start.getUTCDate() + (weeksBefore + wi) * 7);
      const monday = start.toISOString().slice(0, 10);
      if (
        !window.confirm(
          `Push Phase ${bi + 1} Week ${wi + 1} to the TAC Strength Class team calendar as DRAFTS?\n\nLower → Mon ${monday}, Upper → Wed, Full Body → Fri.\nNothing is published; you publish in the coach app.`,
        )
      )
        return;
      const res = await fetch('/api/team-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: bi + 1, week: wi + 1, monday }),
      });
      const out = await res.json();
      if (!res.ok) {
        window.alert(
          `Push refused: ${out.error}\n${(out.existing ?? []).join('\n')}${out.detail ? '\n' + out.detail : ''}`,
        );
        return;
      }
      window.alert(
        `Pushed as drafts:\n${out.pushed.join('\n')}${
          out.skipped?.length ? '\n\nSkipped (no TrainHeroic id):\n' + out.skipped.join('\n') : ''
        }`,
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
          .flatMap((s) => s.timedBlocks)
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
                if (s.id !== target.id) return s;
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
                sessions: w.sessions.map((s) => ({
                  ...s,
                  timedBlocks: s.timedBlocks.map((tb) => ({
                    ...tb,
                    slots: tb.slots.filter((sl) => !ids.has(sl.id)),
                  })),
                })),
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
                        s.id !== ref.sessionId
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
          .flatMap((s) => s.timedBlocks)
          .find((tb) => tb.label.trim().toUpperCase() === seriesKey);
        return {
          ...b,
          weeks: b.weeks.map((w, wIdx) => {
            if (wIdx !== t.weekIndex) return w;
            return {
              ...w,
              sessions: w.sessions.map((s) => {
                if (s.id !== t.sessionId) return s;
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
          Phase {bi + 1}
          {blocks[bi].theme ? ` · ${blocks[bi].theme}` : ''} · Week {wi + 1} of{' '}
          {blocks[bi].weeks.length}
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
      </aside>

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
              title="Which phase of this stream"
            >
              {blocks.map((b, i) => (
                <option key={b.id} value={i}>
                  Phase {i + 1}
                  {b.theme ? ` · ${b.theme}` : ''} ({b.weeks.length} wk)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            {sessions.map((s, i) => (
              <button key={s.id} type="button" className={pill(i === sIdx)} onClick={() => setSi(i)}>
                {s.name || FOCUS_LABEL[s.focus]}
              </button>
            ))}
            {view === 'week' && (
              <button
                type="button"
                title="Add a session to this week"
                onClick={addSession}
                className="rounded-md border border-dashed border-ink-300 px-2.5 py-1.5 text-sm font-medium text-ink-400 hover:border-accent-600 hover:text-accent-600"
              >
                +
              </button>
            )}
          </div>
          {view === 'week' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {blocks[bi].weeks.map((w, i) => (
                <button key={w.id} type="button" className={pill(i === wi)} onClick={() => setWi(i)}>
                  W{i + 1}
                </button>
              ))}
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

          {/* Right-hand controls: how you're looking at it */}
          <div className="ml-auto flex items-center gap-3">
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

        {/* Edit panel: phase structure, out of the way until wanted */}
        {editOpen && (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <label className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Phase {bi + 1} theme
              <input
                className="mt-0.5 block w-56 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
                placeholder="e.g. Strength-Hypertrophy"
                value={blocks[bi].theme ?? ''}
                onChange={(e) =>
                  updateBlocks((all) =>
                    all.map((b, i) => (i === bi ? { ...b, theme: e.target.value } : b)),
                  )
                }
              />
            </label>
            <div className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Phase length
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
              + Add phase
            </button>
            <button
              type="button"
              disabled={blocks.length <= 1}
              onClick={removeBlock}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete phase {bi + 1}
            </button>
            <p className="w-full text-[11px] text-ink-400">
              {stream.name} · {blocks.length} phase{blocks.length === 1 ? '' : 's'} ·{' '}
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
      {/* Session settings */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Session</span>
        <select
          className="rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
          value={session.focus}
          onChange={(e) => patchSession((s) => ({ ...s, focus: e.target.value as Session['focus'] }))}
        >
          {(Object.keys(FOCUS_LABEL) as Session['focus'][]).map((f) => (
            <option key={f} value={f}>
              {FOCUS_LABEL[f]}
            </option>
          ))}
        </select>
        <input
          className="w-48 rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
          placeholder="Custom name (optional)"
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
        <button
          type="button"
          disabled={sessions.length <= 1}
          onClick={removeSession}
          className="rounded-md border border-ink-300 px-2 py-1 text-sm font-medium text-ink-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Remove session
        </button>
      </div>

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

      {/* Session */}
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
      </div>
      )}
      </div>
      </div>
    </div>
  );
}

// ---------- Output rail ----------

/** Icon button with a label that slides out on hover/focus. */
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
