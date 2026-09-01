import { useState } from 'react';
import type { CircuitBlock, CircuitSession } from '../../types/documents';
import { circuitToText, lineToText, parseCircuit, splitLoad } from '../../lib/circuit';

// Circuit sessions carry far less structure than strength ones: a heading, the
// movements under it, and a rest. So the editor is close to writing it out,
// with a paste box for dropping a whole session in at once.

const input =
  'w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

export default function CircuitEditor({
  session,
  onPatch,
}: {
  session: CircuitSession;
  onPatch: (fn: (s: CircuitSession) => CircuitSession) => void;
}) {
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const blocks = session.circuit;

  function setBlocks(next: CircuitBlock[]) {
    onPatch((s) => ({ ...s, circuit: next }));
  }

  function patchBlock(id: string, patch: Partial<CircuitBlock>) {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    setBlocks([...blocks, { id: crypto.randomUUID(), heading: '', lines: [] }]);
  }

  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  }

  function importPaste() {
    const { blocks: parsed, note, intent } = parseCircuit(paste);
    if (parsed.length === 0) return;
    onPatch((s) => {
      const next: CircuitSession = { ...s, circuit: parsed };
      if (note) next.note = note;
      if (intent) next.intent = intent;
      return next;
    });
    setPaste('');
    setShowPaste(false);
  }

  return (
    <div className="space-y-3">
      {/* Paste a whole session in */}
      <div className="rounded-lg border border-accent-500/40 bg-accent-100/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="text-[12px] font-semibold tracking-wide text-accent-700 uppercase"
        >
          {showPaste ? '− Paste a session' : '+ Paste a session'}
        </button>
        {showPaste && (
          <>
            <textarea
              className={`${input} mt-2 resize-y font-mono text-[13px] leading-relaxed`}
              rows={10}
              placeholder={'AMRAP in 10 minutes:\n200m Run\n10 DB Push ups\n\nRest 2 minutes\n\n…'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={!paste.trim()}
                onClick={importPaste}
                className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Read it in
              </button>
              <span className="text-[11px] text-ink-500">
                Replaces this session. Headings, rests and *notes are picked up automatically.
              </span>
            </div>
          </>
        )}
      </div>

      {/* Blocks */}
      {blocks.map((b, i) => (
        <section key={b.id} className="rounded-lg border border-ink-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <input
              className={`${input} font-semibold`}
              placeholder="AMRAP in 10 minutes / In 8 minutes / 0:00-10:00"
              value={b.heading}
              onChange={(e) => patchBlock(b.id, { heading: e.target.value })}
            />
            <button
              type="button"
              title="Move up"
              onClick={() => move(b.id, -1)}
              className="rounded px-1.5 py-1 text-sm text-ink-400 hover:text-ink-950"
            >
              ↑
            </button>
            <button
              type="button"
              title="Move down"
              onClick={() => move(b.id, 1)}
              className="rounded px-1.5 py-1 text-sm text-ink-400 hover:text-ink-950"
            >
              ↓
            </button>
            <button
              type="button"
              title={
                b.hideFromBoard
                  ? 'Hidden from the TV board (still in the email, CSV and PDF). Click to put it back on the wall.'
                  : 'On the TV board. Click to take it off the wall (it stays in the email, CSV and PDF).'
              }
              onClick={() => patchBlock(b.id, { hideFromBoard: b.hideFromBoard ? undefined : true })}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                b.hideFromBoard
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'border-ink-200 text-ink-400 hover:text-ink-700'
              }`}
            >
              {b.hideFromBoard ? 'off board' : 'on board'}
            </button>
            <button
              type="button"
              title="Remove this piece"
              onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}
              className="rounded px-1.5 py-1 text-sm text-ink-300 hover:text-red-600"
            >
              ✕
            </button>
          </div>
          {/* Loads are typed inline the way they are said on the floor
              ("50m Sled push @ 60kg") and split off automatically, so the board
              can show the weight under the movement without a field per line. */}
          <textarea
            className={`${input} mt-2 resize-y leading-relaxed`}
            rows={Math.max(3, b.lines.length + 1)}
            placeholder={'200m Run\n10 DB Push ups @ 22.5kg\n50m Sled push @ 60kg'}
            value={b.lines.map(lineToText).join('\n')}
            onChange={(e) => patchBlock(b.id, { lines: e.target.value.split('\n').map(splitLoad) })}
          />
          {b.lines.some((l) => l.load) && (
            <p className="mt-1 text-[11px] text-ink-500">
              Loads on the board:{' '}
              {b.lines
                .filter((l) => l.load)
                .map((l) => `${l.text} ${l.load}`)
                .join(', ')}
            </p>
          )}
          <input
            className={`${input} mt-2 w-48 text-[13px] italic`}
            placeholder="Rest 2 minutes"
            value={b.restAfter ?? ''}
            onChange={(e) => patchBlock(b.id, { restAfter: e.target.value || undefined })}
          />
        </section>
      ))}

      <button
        type="button"
        onClick={addBlock}
        className="rounded-md border border-dashed border-ink-300 px-4 py-2 text-sm font-medium text-ink-500 hover:border-accent-600 hover:text-accent-600"
      >
        + Piece
      </button>

      {/* Session footnote */}
      <div>
        <label className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
          Note for coaches
        </label>
        <textarea
          className={`${input} mt-0.5 resize-y text-[13px] italic`}
          rows={2}
          placeholder="e.g. Both team mates run at the same time; the lunge and sled are shared."
          value={session.note ?? ''}
          onChange={(e) => onPatch((s) => {
            const next = { ...s };
            if (e.target.value) next.note = e.target.value;
            else delete next.note;
            return next;
          })}
        />
      </div>

      {/* What it reads as */}
      {blocks.length > 0 && (
        <details className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-500">
            Plain text (for copying out)
          </summary>
          <pre className="mt-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-800">
            {circuitToText(blocks, session.note)}
          </pre>
        </details>
      )}
    </div>
  );
}
