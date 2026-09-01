import type { CircuitBlock, CircuitPart } from '../../types/documents';
import { circuitToText, lineToText, splitLoad } from '../../lib/circuit';

// A circuit part sitting inside an otherwise sets-and-reps session: a strength
// day that finishes on a 10 minute AMRAP. Written exactly the way ESD and Hyrox
// sessions are written, so there is one way to write a circuit in this tool.

const input =
  'w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

export default function CircuitPartCard({
  part,
  onPatch,
  onDelete,
}: {
  part: CircuitPart;
  onPatch: (patch: Partial<CircuitPart>) => void;
  onDelete: () => void;
}) {
  const pieces = part.pieces;
  const setPieces = (next: CircuitBlock[]) => onPatch({ pieces: next });

  function patchPiece(id: string, patch: Partial<CircuitBlock>) {
    setPieces(pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPiece() {
    setPieces([...pieces, { id: crypto.randomUUID(), heading: '', lines: [] }]);
  }

  function move(id: string, dir: -1 | 1) {
    const i = pieces.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pieces.length) return;
    const next = [...pieces];
    [next[i], next[j]] = [next[j], next[i]];
    setPieces(next);
  }

  return (
    <section
      data-block-id={part.id}
      className="rounded-lg border border-ink-300/70 bg-ink-50 px-4 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-14 rounded-md bg-ink-700 px-2 py-1 text-center text-sm font-bold text-white focus:outline-none"
          value={part.label}
          title="Series label"
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        <span className="text-[12px] font-semibold tracking-wide text-ink-950 uppercase">
          Circuit
        </span>
        <div className="ml-3 flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            step={1}
            className="w-16 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
            value={part.minutes}
            onChange={(e) => onPatch({ minutes: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-sm text-ink-500">min</span>
        </div>
        <button
          type="button"
          title={
            part.hideFromBoard
              ? 'Hidden from the TV board (still in the email, CSV and PDF). Click to put it back on the wall.'
              : 'On the TV board. Click to take it off the wall (it stays in the email, CSV and PDF).'
          }
          onClick={() => onPatch({ hideFromBoard: part.hideFromBoard ? undefined : true })}
          className={`ml-auto rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
            part.hideFromBoard
              ? 'border-amber-400 bg-amber-50 text-amber-700'
              : 'border-ink-200 text-ink-400 hover:text-ink-700'
          }`}
        >
          {part.hideFromBoard ? 'off board' : 'on board'}
        </button>
        <button
          type="button"
          title="Remove this circuit"
          onClick={onDelete}
          className="rounded px-2 py-1 text-sm text-ink-300 hover:text-red-600"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {pieces.map((p, i) => (
          <div key={p.id} className="rounded-md border border-ink-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <input
                className={`${input} font-semibold`}
                placeholder="AMRAP in 10 minutes / In 8 minutes / 0:00-10:00"
                value={p.heading}
                onChange={(e) => patchPiece(p.id, { heading: e.target.value })}
              />
              <button
                type="button"
                title="Move up"
                onClick={() => move(p.id, -1)}
                className="rounded px-1.5 py-1 text-sm text-ink-400 hover:text-ink-950"
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                onClick={() => move(p.id, 1)}
                className="rounded px-1.5 py-1 text-sm text-ink-400 hover:text-ink-950"
              >
                ↓
              </button>
              <button
                type="button"
                title="Remove this piece"
                onClick={() => setPieces(pieces.filter((x) => x.id !== p.id))}
                className="rounded px-1.5 py-1 text-sm text-ink-300 hover:text-red-600"
              >
                ✕
              </button>
            </div>
            {/* Loads are typed inline, "50m Sled push @ 60kg", and split off, so
                the board can show the weight under the movement. */}
            <textarea
              className={`${input} mt-2 resize-y leading-relaxed`}
              rows={Math.max(3, p.lines.length + 1)}
              placeholder={'200m Run\n10 DB Push ups @ 22.5kg\n15 Wall balls'}
              value={p.lines.map(lineToText).join('\n')}
              onChange={(e) =>
                patchPiece(p.id, { lines: e.target.value.split('\n').map(splitLoad) })
              }
            />
            <input
              className={`${input} mt-2 w-48 text-[13px] italic`}
              placeholder="Rest 2 minutes"
              value={p.restAfter ?? ''}
              onChange={(e) => patchPiece(p.id, { restAfter: e.target.value || undefined })}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPiece}
        className="mt-2 text-[13px] font-medium text-accent-600 hover:text-accent-700"
      >
        + Piece
      </button>

      {pieces.length > 0 && (
        <details className="mt-2 rounded-md border border-ink-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-500">
            Plain text (for copying out)
          </summary>
          <pre className="mt-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-800">
            {circuitToText(pieces)}
          </pre>
        </details>
      )}
    </section>
  );
}
