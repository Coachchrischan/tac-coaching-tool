import type { ExerciseSlot, LibraryOverridesDoc, ScaledOption } from '../../types/documents';
import type { LibraryExercise, RankedExercise } from '../../lib/library';
import Combobox from '../../components/Combobox';
import { normaliseIntensity, scaleKey, scaleOptions } from '../../lib/prescription';

const cell =
  'w-full rounded-md border border-ink-300 bg-white px-1.5 py-1 text-center text-[13px] text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

/**
 * The demo video mark. A scale is a movement a member will be sent away to do
 * on their own, so it needs the video at least as much as the main lift does.
 * Always rendered, so every name field on the row is the same width and stops
 * on the same pixel; without a link it is the muted crossed-out icon.
 */
function VideoMark({ url }: { url?: string }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Watch the exercise video (TrainHeroic)"
        className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2.5" y="5" width="19" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 9.2v5.6l4.5-2.8L10 9.2Z" fill="currentColor" />
        </svg>
      </a>
    );
  }
  return (
    <span title="No video linked" className="shrink-0 cursor-default rounded p-1 text-ink-200">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.5 9.5l7 5M15.5 9.5l-7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

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
  videoUrlFor,
  expandScales,
  onPatch,
  onCommitExercise,
  onDelete,
  onToggleScales,
  onSetScale,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  slot: ExerciseSlot;
  overrides: LibraryOverridesDoc;
  search: (query: string) => RankedExercise[];
  videoUrlFor: (ref: { exerciseId?: number | null; name?: string }) => string | undefined;
  expandScales: boolean;
  onPatch: (patch: Partial<ExerciseSlot>) => void;
  onCommitExercise: (name: string, exercise: LibraryExercise | null) => void;
  onDelete: () => void;
  onToggleScales: () => void;
  onSetScale: (index: 0 | 1, patch: Partial<ScaledOption>) => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const scales = scaleOptions(overrides, slot);
  const hasScales = scales.some((s) => s.name.trim() !== '');
  const showScales = expandScales || Boolean(slot.showScales);
  // Anything with a name can be scaled. It used to need a TrainHeroic library
  // id, which left eleven free-text movements, the drag through among them,
  // with no way to record a scale.
  const canScale = scaleKey(slot) !== null;

  return (
    <>
      <tr className="group">
        <td className="py-1 pr-2">
          <div className="flex items-center gap-1.5">
            {/* Reorder without deleting and retyping. Stacked so the pair is
                no wider than one button, and applied to every week of the
                phase, since the same exercises run all phase. */}
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                title="Move up (every week of this phase)"
                aria-label="Move exercise up"
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
                className="rounded px-1 text-[10px] leading-[1.15] text-ink-300 hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-20"
              >
                ▲
              </button>
              <button
                type="button"
                title="Move down (every week of this phase)"
                aria-label="Move exercise down"
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
                className="rounded px-1 text-[10px] leading-[1.15] text-ink-300 hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-20"
              >
                ▼
              </button>
            </div>
            <button
              type="button"
              title={
                canScale
                  ? 'Scaled options (stored with the exercise, reused everywhere)'
                  : 'Name the exercise first, then it can carry scaled options'
              }
              disabled={!canScale}
              onClick={onToggleScales}
              className={`shrink-0 rounded border px-1.5 py-1 text-[11px] font-semibold ${
                hasScales
                  ? 'border-accent-600 bg-accent-100 text-accent-700'
                  : 'border-ink-300 text-ink-400 hover:text-ink-950'
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              S{hasScales ? scales.filter((s) => s.name.trim()).length : ''}
            </button>
            <Combobox value={slot.name} search={search} onCommit={onCommitExercise} />
            <VideoMark url={videoUrlFor(slot)} />
          </div>
        </td>
        {SLOT_FIELDS.map(([key]) => (
          <td key={key} className="w-16 px-0.5 py-1">
            <input
              className={cell}
              value={slot[key] ?? ''}
              onChange={(e) => onPatch({ [key]: e.target.value })}
              onBlur={
                key === 'intensity'
                  ? (e) => {
                      const next = normaliseIntensity(e.target.value);
                      if (next !== e.target.value) onPatch({ intensity: next });
                    }
                  : undefined
              }
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
      {/* A scale is a row of the same table, not a panel floating under it.
          Laid out in the table's own cells, so its name box ends exactly where
          the exercise box above ends and every number sits under its column
          heading. As a colSpan flexbox nothing lined up with anything. */}
      {showScales &&
        canScale &&
        [0, 1].map((i) => {
          const opt = scales[i] ?? { name: '' };
          return (
            <tr key={`scale-${i}`} className="bg-ink-50">
              <td className="py-1 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-14 shrink-0 pl-1 text-[11px] font-medium tracking-wide text-ink-400 uppercase">
                    Scale {i + 1}
                  </span>
                  {/* The same picker the exercise above uses, so a scale
                      chosen from the library carries its id and therefore its
                      demo video. Free text still works; it just falls back to
                      matching the name. */}
                  <Combobox
                    value={opt.name}
                    search={search}
                    placeholder={
                      i === 0 ? 'e.g. box squat to 20 inch box' : 'optional second scale'
                    }
                    onCommit={(name, exercise) =>
                      onSetScale(i as 0 | 1, { name, exerciseId: exercise?.id ?? null })
                    }
                  />
                  <VideoMark url={videoUrlFor(opt)} />
                </div>
              </td>
              {/* Its own prescription: a scale is rarely the same sets and reps
                  as the movement it replaces, and TrainHeroic needs the numbers
                  to push it as a line of its own. */}
              {SLOT_FIELDS.map(([key, label]) => (
                <td key={key} className="w-16 px-0.5 py-1">
                  <input
                    className={cell}
                    // No placeholder: the box now sits under its own column
                    // heading, so repeating "Sets" inside it is noise.
                    title={`${label} for this scaled option`}
                    value={opt[key] ?? ''}
                    onChange={(e) => onSetScale(i as 0 | 1, { [key]: e.target.value })}
                    onBlur={
                      key === 'intensity'
                        ? (e) => {
                            const next = normaliseIntensity(e.target.value);
                            if (next !== e.target.value) onSetScale(i as 0 | 1, { intensity: next });
                          }
                        : undefined
                    }
                  />
                </td>
              ))}
              <td className="w-8 py-1 pl-1" />
            </tr>
          );
        })}
      {showScales && canScale && (
        // A caption row, not a cell inside the grid: it says nothing about any
        // one column and must not push one wider.
        <tr className="bg-ink-50">
          <td colSpan={8} className="pb-2 pl-[68px] text-[11px] text-ink-400">
            Saved with the exercise. Any session using it shows the same scales.
          </td>
        </tr>
      )}
    </>
  );
}
