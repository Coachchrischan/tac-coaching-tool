import type { ExerciseSlot, LibraryOverridesDoc, TimedBlock } from '../../types/documents';
import type { LibraryExercise, RankedExercise } from '../../lib/library';
import ExerciseRow, { SLOT_FIELDS } from './ExerciseRow';

export default function TimedBlockCard({
  block,
  overrides,
  search,
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
  return (
    <section
      data-block-id={block.id}
      className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <input
          className="w-12 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm font-bold text-ink-950 focus:border-accent-600 focus:outline-none"
          value={block.label}
          title="Series label"
          onChange={(e) => onPatchBlock({ label: e.target.value })}
        />
        <span className="text-sm font-semibold text-ink-950">series</span>
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

      <table className="mt-3 w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="pb-1 text-left text-[11px] font-medium tracking-wide text-ink-400 uppercase">
              Exercise
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
        className="mt-2 text-sm font-medium text-accent-600 hover:text-accent-700"
      >
        + Exercise <span className="text-ink-400">(Ctrl+Enter)</span>
      </button>
    </section>
  );
}
