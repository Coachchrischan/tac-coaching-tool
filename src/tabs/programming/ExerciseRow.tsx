import type { ExerciseSlot, LibraryOverridesDoc } from '../../types/documents';
import type { LibraryExercise, RankedExercise } from '../../lib/library';
import Combobox from '../../components/Combobox';

const cell =
  'w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-center text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

export const SLOT_FIELDS = [
  ['sets', 'Sets'],
  ['reps', 'Reps'],
  ['load', 'Load'],
  ['intensity', 'Int.'],
  ['rpe', 'RPE'],
  ['tempo', 'Tempo'],
] as const;

export default function ExerciseRow({
  slot,
  overrides,
  search,
  videoUrl,
  expandScales,
  onPatch,
  onCommitExercise,
  onDelete,
  onToggleScales,
  onSetScale,
}: {
  slot: ExerciseSlot;
  overrides: LibraryOverridesDoc;
  search: (query: string) => RankedExercise[];
  videoUrl?: string;
  expandScales: boolean;
  onPatch: (patch: Partial<ExerciseSlot>) => void;
  onCommitExercise: (name: string, exercise: LibraryExercise | null) => void;
  onDelete: () => void;
  onToggleScales: () => void;
  onSetScale: (index: 0 | 1, text: string) => void;
}) {
  const scales = slot.exerciseId !== null ? (overrides.scales[slot.exerciseId] ?? []) : [];
  const hasScales = scales.some((s) => s.trim() !== '');
  const showScales = expandScales || Boolean(slot.showScales);

  return (
    <>
      <tr className="group">
        <td className="py-1 pr-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title={
                slot.exerciseId === null
                  ? 'Pick a library exercise to add scaled options'
                  : 'Scaled options (stored with the exercise, reused everywhere)'
              }
              disabled={slot.exerciseId === null}
              onClick={onToggleScales}
              className={`shrink-0 rounded border px-1.5 py-1 text-[11px] font-semibold ${
                hasScales
                  ? 'border-accent-600 bg-accent-100 text-accent-700'
                  : 'border-ink-300 text-ink-400 hover:text-ink-950'
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              S{hasScales ? scales.filter((s) => s.trim()).length : ''}
            </button>
            <Combobox value={slot.name} search={search} onCommit={onCommitExercise} />
            {videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
                title="Watch the exercise video (TrainHeroic)"
                className="shrink-0 rounded p-1 text-ink-400 hover:bg-accent-100 hover:text-accent-700"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="2.5" y="5" width="19" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M10 9.2v5.6l4.5-2.8L10 9.2Z" fill="currentColor" />
                </svg>
              </a>
            )}
          </div>
        </td>
        {SLOT_FIELDS.map(([key]) => (
          <td key={key} className="w-16 px-0.5 py-1">
            <input
              className={cell}
              value={slot[key] ?? ''}
              onChange={(e) => onPatch({ [key]: e.target.value })}
            />
          </td>
        ))}
        <td className="w-8 py-1 pl-1">
          <button
            type="button"
            title="Remove exercise"
            onClick={onDelete}
            className="rounded px-1.5 py-1 text-sm text-ink-300 hover:text-red-600"
          >
            ✕
          </button>
        </td>
      </tr>
      {showScales && slot.exerciseId !== null && (
        <tr>
          <td colSpan={8} className="pt-0 pb-2 pl-9">
            <div className="space-y-1 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-[11px] font-medium tracking-wide text-ink-400 uppercase">
                    Scale {i + 1}
                  </span>
                  <input
                    className="flex-1 rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
                    placeholder={i === 0 ? 'e.g. box squat to 20 inch box' : 'optional second scale'}
                    value={scales[i] ?? ''}
                    onChange={(e) => onSetScale(i as 0 | 1, e.target.value)}
                  />
                </div>
              ))}
              <p className="text-[11px] text-ink-400">
                Saved with the exercise. Any session using it shows the same scales.
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
