import type { ExerciseSlot, LibraryOverridesDoc, TimedBlock } from '../../types/documents';
import type { LibraryExercise, RankedExercise } from '../../lib/library';
import ExerciseRow, { SLOT_FIELDS } from './ExerciseRow';

// Distinct shading per series so warm-up and A/B/C read apart at a glance.
// Falls back to a neutral tint for any custom series label.
const SERIES_STYLE: Record<string, { bar: string; card: string; head: string }> = {
  WU: { bar: 'bg-sand-500 text-ink-950', card: 'border-sand-500/50 bg-sand-100/40', head: 'text-sand-600' },
  A: { bar: 'bg-accent-600 text-white', card: 'border-accent-500/40 bg-accent-100/40', head: 'text-accent-700' },
  B: { bar: 'bg-accent-500 text-white', card: 'border-accent-500/30 bg-accent-100/25', head: 'text-accent-600' },
  C: { bar: 'bg-ink-500 text-white', card: 'border-ink-300/60 bg-ink-100/50', head: 'text-ink-600' },
};
const NEUTRAL = { bar: 'bg-ink-700 text-white', card: 'border-ink-200 bg-white', head: 'text-ink-500' };

export default function TimedBlockCard({
  block,
  overrides,
  search,
  videoUrlFor,
  expandScales,
  onPatchBlock,
  onDeleteBlock,
  onAddSlot,
  onPatchSlot,
  onCommitExercise,
  onDeleteSlot,
  onToggleScales,
  onSetScale,
}: {
  block: TimedBlock;
  overrides: LibraryOverridesDoc;
  search: (query: string) => RankedExercise[];
  videoUrlFor: (exerciseId: number) => string | undefined;
  expandScales: boolean;
  onPatchBlock: (patch: Partial<TimedBlock>) => void;
  onDeleteBlock: () => void;
  onAddSlot: () => void;
  onPatchSlot: (slotId: string, patch: Partial<ExerciseSlot>) => void;
  onCommitExercise: (slotId: string, name: string, exercise: LibraryExercise | null) => void;
  onDeleteSlot: (slotId: string) => void;
  onToggleScales: (slotId: string) => void;
  onSetScale: (slot: ExerciseSlot, index: 0 | 1, text: string) => void;
}) {
  const style = SERIES_STYLE[block.label.toUpperCase()] ?? NEUTRAL;
  const isWarmup = block.label.toUpperCase() === 'WU';

  return (
    <section
      data-block-id={block.id}
      className={`rounded-lg border px-4 py-2.5 ${style.card}`}
    >
      <div className="flex items-center gap-2">
        <input
          className={`w-14 rounded-md px-2 py-1 text-center text-sm font-bold focus:outline-none ${style.bar}`}
          value={block.label}
          title="Series label"
          onChange={(e) => onPatchBlock({ label: e.target.value })}
        />
        <span className="text-sm font-semibold text-ink-950">
          {isWarmup ? 'warm-up' : 'series'}
        </span>
        <div className="ml-3 flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            step={1}
            className="w-16 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
            value={block.minutes}
            onChange={(e) => onPatchBlock({ minutes: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-sm text-ink-500">min</span>
        </div>
        <button
          type="button"
          title="Remove this series"
          onClick={onDeleteBlock}
          className="ml-auto rounded px-2 py-1 text-sm text-ink-300 hover:text-red-600"
        >
          ✕
        </button>
      </div>

      <table className="mt-2 w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={`pb-1 text-left text-[11px] font-medium tracking-wide uppercase ${style.head}`}>
              {isWarmup ? 'Warm-up exercise' : 'Exercise'}
            </th>
            {SLOT_FIELDS.map(([key, label]) => (
              <th
                key={key}
                className="w-16 pb-1 text-center text-[11px] font-medium tracking-wide text-ink-400 uppercase"
              >
                {label}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {block.slots.map((slot) => (
            <ExerciseRow
              key={slot.id}
              slot={slot}
              overrides={overrides}
              search={search}
              videoUrl={slot.exerciseId !== null ? videoUrlFor(slot.exerciseId) : undefined}
              expandScales={expandScales}
              onPatch={(patch) => onPatchSlot(slot.id, patch)}
              onCommitExercise={(name, ex) => onCommitExercise(slot.id, name, ex)}
              onDelete={() => onDeleteSlot(slot.id)}
              onToggleScales={() => onToggleScales(slot.id)}
              onSetScale={(i, text) => onSetScale(slot, i, text)}
            />
          ))}
        </tbody>
      </table>

      <button
        type="button"
        onClick={onAddSlot}
        className="mt-1 text-[13px] font-medium text-accent-600 hover:text-accent-700"
      >
        + {isWarmup ? 'Warm-up exercise' : 'Exercise'} <span className="text-ink-400">(Ctrl+Enter)</span>
      </button>
    </section>
  );
}
