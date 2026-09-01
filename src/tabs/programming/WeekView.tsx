// The Week view: the session editor a coach lives in daily. Extracted from
// ProgrammingTab (split step 3, roundtable 2 sequencing); the parent owns the
// document and the mutators, this file owns the editing surface.

import type {
  ExerciseSlot,
  LibraryOverridesDoc,
  ProgramBlock,
  ScaledOption,
  SeriesBlock,
  Session,
  SessionFocus,
  TimedBlock,
} from '../../types/documents';
import type { LibraryExercise, RankedExercise } from '../../lib/library';
import { FOCUS_LABEL, sessionLabel } from '../../lib/programStreams';
import CircuitEditor from './CircuitEditor';
import CircuitPartCard from './CircuitPartCard';
import TimedBlockCard from './TimedBlockCard';
import SessionBlurb from './SessionBlurb';

export interface WeekViewProps {
  session: Session;
  sessions: Session[];
  blocks: ProgramBlock[];
  bi: number;
  wi: number;
  streamFocuses: SessionFocus[];
  overrides: LibraryOverridesDoc;
  library: LibraryExercise[] | null;
  merged: LibraryExercise[] | null;
  search: (query: string) => RankedExercise[];
  videoUrlFor: (ref: { exerciseId?: number | null; name?: string }) => string | undefined;
  expandScales: boolean;
  sessionEditOpen: boolean;
  setSessionEditOpen: (open: boolean) => void;
  patchSession: (fn: (s: Session) => Session) => void;
  removeSession: () => void;
  patchTimedBlock: (blockId: string, fn: (b: SeriesBlock) => TimedBlock | null) => void;
  addSlot: (blockId?: string) => void;
  commitExercise: (blockId: string, slotId: string, name: string, ex: LibraryExercise | null) => void;
  setScale: (slot: ExerciseSlot, index: 0 | 1, patch: Partial<ScaledOption>) => void;
  moveSlot: (blockId: string, slotId: string, dir: -1 | 1) => void;
  addTimedBlock: () => void;
  addCircuitPart: () => void;
}

export default function WeekView({
  session,
  sessions,
  blocks,
  bi,
  wi,
  streamFocuses,
  overrides,
  library,
  merged,
  search,
  videoUrlFor,
  expandScales,
  sessionEditOpen,
  setSessionEditOpen,
  patchSession,
  removeSession,
  patchTimedBlock,
  addSlot,
  commitExercise,
  setScale,
  moveSlot,
  addTimedBlock,
  addCircuitPart,
}: WeekViewProps) {
  return (
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
  );
}
