import type { SaveState } from '../lib/useDoc';

const LABELS: Record<SaveState, string> = {
  idle: '',
  dirty: 'Editing…',
  saving: 'Saving…',
  saved: 'Saved',
  conflict: 'Conflict',
  error: 'Save failed',
};

export default function SaveBadge({
  state,
  onReloadTheirs,
  onKeepMine,
}: {
  state: SaveState;
  onReloadTheirs?: () => void;
  onKeepMine?: () => void;
}) {
  if (state === 'conflict') {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="font-medium text-amber-700">Someone else saved a newer version.</span>
        <button
          type="button"
          onClick={onReloadTheirs}
          className="rounded border border-ink-300 px-2 py-0.5 font-medium text-ink-700 hover:bg-ink-100"
        >
          Load theirs
        </button>
        <button
          type="button"
          onClick={onKeepMine}
          className="rounded border border-ink-300 px-2 py-0.5 font-medium text-ink-700 hover:bg-ink-100"
        >
          Keep mine
        </button>
      </span>
    );
  }
  if (state === 'error') {
    return <span className="text-xs font-medium text-red-600">{LABELS[state]}</span>;
  }
  return <span className="text-xs text-ink-400">{LABELS[state]}</span>;
}
