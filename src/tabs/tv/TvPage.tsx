import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { generateBlurb } from '../../lib/blurb';
import { mergedLibrary } from '../../lib/library';
import type { ProgramDoc } from '../../types/documents';
import { streamsOf } from '../../lib/programStreams';
import TvBoard, { hiddenPartsOf, type BoardFit } from './TvBoard';
import { BOARD_RESOLUTIONS, captureNodePng, downloadDataUrl } from './boardExport';
import { BOARD_H, BOARD_W } from './boardRules';

// The TV page: one session's board, scaled to the viewport, with the export
// controls around it. The board itself is TvBoard (shared with the designer
// pack); this page adds the coach-facing chrome: fit warnings, the off-wall
// notice, and PNG / PDF export at the chosen resolution.

export function findSession(doc: ProgramDoc, sessionId: string) {
  for (const stream of streamsOf(doc)) {
    for (let b = 0; b < stream.blocks.length; b++) {
      const phase = stream.blocks[b];
      for (let w = 0; w < phase.weeks.length; w++) {
        for (const session of phase.weeks[w].sessions) {
          if (session.id === sessionId) {
            return {
              session,
              blockIndex: b,
              weekIndex: w,
              blockWeeks: phase.weeks.length,
              theme: phase.theme,
              // Only Strength runs numbered phases. A month or a block
              // container is named, and its name is what the wall needs.
              cadence: stream.cadence ?? 'phases',
            };
          }
        }
      }
    }
  }
  return null;
}

export default function TvPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const program = useDoc('program');
  const lib = useDoc('library-overrides');
  const { library } = useLibrary();
  const slideRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [fit, setFit] = useState<BoardFit>({ fit: 1, fitState: 'ok', settled: false });
  // 1080p is what the gym TVs run today; the larger sizes re-rasterise the
  // same board for a sharper panel (the backdrop photos are the one limit).
  const [resolutionId, setResolutionId] = useState(BOARD_RESOLUTIONS[0].id);
  const resolution = BOARD_RESOLUTIONS.find((r) => r.id === resolutionId) ?? BOARD_RESOLUTIONS[0];

  const found = useMemo(
    () => (program.data && sessionId ? findSession(program.data, sessionId) : null),
    [program.data, sessionId],
  );

  if (!program.data || !lib.data) {
    return <div className="flex min-h-screen items-center justify-center bg-black text-ink-400">Loading…</div>;
  }
  if (!found) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p>Session not found.</p>
        <button type="button" onClick={() => navigate('/programming')} className="rounded border border-ink-700 px-3 py-1.5 text-sm">
          Back to Programming
        </button>
      </div>
    );
  }

  const { session, blockIndex, weekIndex, blockWeeks, theme, cadence } = found;
  const overrides = lib.data;
  const merged = library ? mergedLibrary(library, overrides) : [];
  const blurb = session.blurbOverride ?? (library ? generateBlurb(session, merged, overrides) : '');
  const sizeSuffix = resolution.id === '1080p' ? '' : `-${resolution.id}`;
  const fileBase = `tac-${session.focus}-block${blockIndex + 1}-week${weekIndex + 1}${sizeSuffix}`;
  const hiddenParts = hiddenPartsOf(session);

  async function capturePng(): Promise<string> {
    return captureNodePng(slideRef.current!, {
      width: BOARD_W,
      height: BOARD_H,
      outWidth: resolution.width,
      outHeight: resolution.height,
    });
  }

  async function exportPng() {
    setExporting(true);
    try {
      downloadDataUrl(await capturePng(), `${fileBase}.png`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      const { width, height } = resolution;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [width, height], hotfixes: ['px_scaling'] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
      pdf.save(`${fileBase}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const scale = `min(calc(100vw / ${BOARD_W}), calc(100vh / ${BOARD_H}))`;
  const control =
    'rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-50';

  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-black">
      {/* Outside the slide on purpose: this is for the coach at the laptop,
          and it must never reach the wall or the exported image. */}
      {fit.fitState !== 'ok' && (
        <div
          className={`fixed top-4 left-4 z-10 max-w-md rounded-md px-3 py-2 text-sm font-semibold shadow-lg ${
            fit.fitState === 'cut' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'
          }`}
        >
          {fit.fitState === 'cut' ? (
            <>
              This session does not fit on one board. It is down to {Math.round(fit.fit * 100)}% type and work is still
              off the screen. In Programming, mark the parts the wall does not need (cooldown, station prep) as
              off-board; they stay in the email and PDF.
            </>
          ) : (
            <>
              Everything is on the board, but only at {Math.round(fit.fit * 100)}% type, which is small from the back of
              the room. Consider taking a part off the board in Programming.
            </>
          )}
        </div>
      )}
      {hiddenParts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-10 max-w-md rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/70 backdrop-blur">
          Off the wall (still in the email and PDF): {hiddenParts.join(', ')}
        </div>
      )}
      {/* control bar */}
      <div className="fixed top-4 right-4 z-10 flex items-center gap-2">
        <label className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 backdrop-blur">
          <span>Export size</span>
          <select
            value={resolutionId}
            onChange={(e) => setResolutionId(e.target.value)}
            className="rounded bg-black/40 px-1.5 py-0.5 text-sm font-medium text-white focus:outline-none"
          >
            {BOARD_RESOLUTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={exporting} onClick={exportPng} className={control}>
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
        <button type="button" disabled={exporting} onClick={exportPdf} className={control}>
          Export PDF
        </button>
        <button
          type="button"
          disabled
          title="Google Drive auto-save comes in phase 2"
          className="cursor-not-allowed rounded-md bg-white/5 px-3 py-1.5 text-sm font-medium text-white/30"
        >
          Save to Drive
        </button>
        <button type="button" onClick={() => navigate('/programming')} className={control}>
          Close
        </button>
      </div>

      {/* 1920x1080 slide, scaled to fit the viewport */}
      <TvBoard
        session={session}
        blockIndex={blockIndex}
        weekIndex={weekIndex}
        blockWeeks={blockWeeks}
        theme={theme}
        cadence={cadence}
        overrides={overrides}
        blurb={blurb}
        slideRef={slideRef}
        style={{ transform: `scale(${scale})` }}
        onFit={setFit}
      />
    </div>
  );
}
