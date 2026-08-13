import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { mergedLibrary, searchLibrary } from '../../lib/library';
import type { LibraryExercise } from '../../lib/library';
import SaveBadge from '../../components/SaveBadge';
import type {
  ExerciseSlot,
  ProgramDoc,
  ProgramWeek,
  Session,
  TimedBlock,
} from '../../types/documents';
import TimedBlockCard from './TimedBlockCard';
import SessionBlurb from './SessionBlurb';
import { MonthView, ProgressionGrid } from './ProgressionViews';
import type { GridColumn } from './ProgressionViews';
import { downloadProgramCsv } from '../../lib/exportCsv';

type ProgramView = 'week' | 'month' | 'block' | 'phase';

const VIEW_LABEL: Record<ProgramView, string> = {
  week: 'Week',
  month: 'Month',
  block: 'Block',
  phase: 'Phase',
};

const FOCUS_LABEL: Record<Session['focus'], string> = {
  lower: 'Lower',
  upper: 'Upper',
  full: 'Full Body',
  esd: 'ESD',
  hyrox: 'Hyrox',
};

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

  const [bi, setBi] = useState(0);
  const [wi, setWi] = useState(0);
  const [si, setSi] = useState(0);
  const [view, setView] = useState<ProgramView>('week');
  const [expandScales, setExpandScales] = useState(false);

  const overrides = lib.data;
  const merged = library && overrides ? mergedLibrary(library, overrides) : null;

  const search = useCallback(
    (query: string) => (merged ? searchLibrary(merged, query) : []),
    [merged],
  );

  if (!program.data || !overrides) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading program…</p>;
  }

  const doc = program.data;
  const sessions = doc.blocks[bi].weeks[wi].sessions;
  const sIdx = Math.min(si, Math.max(sessions.length - 1, 0));
  const session = sessions[sIdx];

  function patchWeekSessions(fn: (sessions: Session[]) => Session[]) {
    program.update((d: ProgramDoc) => {
      const blocks = d.blocks.map((b, bIdx) =>
        bIdx !== bi
          ? b
          : {
              ...b,
              weeks: b.weeks.map((w, wIdx) =>
                wIdx !== wi ? w : { ...w, sessions: fn(w.sessions) },
              ) as (typeof b)['weeks'],
            },
      ) as ProgramDoc['blocks'];
      return { ...d, blocks };
    });
  }

  function patchSession(fn: (s: Session) => Session) {
    patchWeekSessions((list) => list.map((s, i) => (i !== sIdx ? s : fn(s))));
  }

  function addSession() {
    const fresh: Session = {
      id: crypto.randomUUID(),
      focus: 'esd',
      timedBlocks: [{ id: crypto.randomUUID(), label: 'A', minutes: 15, slots: [] }],
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

  const blockColumns: GridColumn[] = doc.blocks[bi].weeks.map((w, wIdx) => ({
    label: `W${wIdx + 1}`,
    session: matchSession(w),
    weekIndex: wIdx,
    blockIndex: bi,
  }));

  const phaseColumns: GridColumn[] = doc.blocks.flatMap((b, bIdx) =>
    b.weeks.map((w, wIdx) => ({
      label: `B${bIdx + 1} W${wIdx + 1}`,
      session: matchSession(w),
      weekIndex: wIdx,
      blockIndex: bIdx,
    })),
  );

  function openColumn(col: GridColumn) {
    setBi(col.blockIndex);
    setWi(col.weekIndex);
    setView('week');
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
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          className="rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-ink-950 hover:border-ink-300 focus:border-accent-600 focus:outline-none"
          value={doc.name}
          onChange={(e) => program.update((d) => ({ ...d, name: e.target.value }))}
        />
        <div className="flex items-center gap-3">
          {/* View switcher: Week edits, Month/Block/Phase read side by side */}
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
          <label className="flex items-center gap-1.5 text-sm text-ink-500">
            <input
              type="checkbox"
              checked={expandScales}
              onChange={(e) => setExpandScales(e.target.checked)}
              className="accent-accent-600"
            />
            Show scales
          </label>
          <button
            type="button"
            onClick={() => navigate(`/tv/${session.id}`)}
            className="rounded-md bg-ink-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
          >
            TV output
          </button>
          <button
            type="button"
            title="Download the whole 12-week program as a CSV that imports straight into Google Sheets"
            onClick={() => downloadProgramCsv(doc)}
            className="rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            Export for Sheets
          </button>
        </div>
      </div>

      {libraryError && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Exercise library failed to load. Run <code>npm run refresh-library</code> and reload.
        </p>
      )}

      {/* Navigation */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {view !== 'phase' && (
        <div className="flex items-center gap-1.5">
          {doc.blocks.map((b, i) => (
            <button key={b.id} type="button" className={pill(i === bi)} onClick={() => setBi(i)}>
              Block {i + 1}
            </button>
          ))}
          <input
            className="ml-1 w-44 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink-500 italic hover:border-ink-300 focus:border-accent-600 focus:text-ink-950 focus:outline-none"
            placeholder="Block theme…"
            value={doc.blocks[bi].theme ?? ''}
            onChange={(e) =>
              program.update((d) => ({
                ...d,
                blocks: d.blocks.map((b, i) =>
                  i === bi ? { ...b, theme: e.target.value } : b,
                ) as ProgramDoc['blocks'],
              }))
            }
          />
        </div>
        )}
        {view === 'week' && (
          <div className="flex items-center gap-1.5">
            {doc.blocks[bi].weeks.map((w, i) => (
              <button key={w.id} type="button" className={pill(i === wi)} onClick={() => setWi(i)}>
                W{i + 1}
              </button>
            ))}
          </div>
        )}
        {view !== 'month' && (
          <div className="flex items-center gap-1.5">
            {sessions.map((s, i) => (
              <button key={s.id} type="button" className={pill(i === sIdx)} onClick={() => setSi(i)}>
                {s.name || FOCUS_LABEL[s.focus]}
              </button>
            ))}
            {view === 'week' && (
              <button
                type="button"
                title="Add a session to this week (e.g. an ESD or Hyrox day)"
                onClick={addSession}
                className="rounded-md border border-dashed border-ink-300 px-2.5 py-1.5 text-sm font-medium text-ink-400 hover:border-accent-600 hover:text-accent-600"
              >
                +
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'month' && (
        <MonthView
          block={doc.blocks[bi]}
          onOpenWeek={(wIdx, sIdx2) => {
            setWi(wIdx);
            setSi(sIdx2);
            setView('week');
          }}
        />
      )}

      {view === 'block' && <ProgressionGrid columns={blockColumns} onOpenColumn={openColumn} />}

      {view === 'phase' && <ProgressionGrid columns={phaseColumns} onOpenColumn={openColumn} />}

      {view === 'week' && (
      <>
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

      {/* Session */}
      <div className="space-y-4">
        {session.timedBlocks.map((block) => (
          <TimedBlockCard
            key={block.id}
            block={block}
            overrides={overrides}
            search={search}
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
      </>
      )}
    </div>
  );
}
