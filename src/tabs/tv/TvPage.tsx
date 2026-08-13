import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { generateBlurb } from '../../lib/blurb';
import { mergedLibrary } from '../../lib/library';
import type { ProgramDoc, Session } from '../../types/documents';

const W = 1920;
const H = 1080;

const FOCUS_TITLE: Record<Session['focus'], string> = {
  lower: 'LOWER BODY',
  upper: 'UPPER BODY',
  full: 'FULL BODY',
};

function findSession(doc: ProgramDoc, sessionId: string) {
  for (let b = 0; b < doc.blocks.length; b++) {
    for (let w = 0; w < doc.blocks[b].weeks.length; w++) {
      for (const session of doc.blocks[b].weeks[w].sessions) {
        if (session.id === sessionId) {
          return { session, blockIndex: b, weekIndex: w, theme: doc.blocks[b].theme };
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

  const { session, blockIndex, weekIndex, theme } = found;
  const overrides = lib.data;
  const merged = library ? mergedLibrary(library, overrides) : [];
  const blurb = session.blurbOverride ?? (library ? generateBlurb(session, merged, overrides) : '');
  const fileBase = `tac-${session.focus}-block${blockIndex + 1}-week${weekIndex + 1}`;

  // html-to-image's toPng uses img.decode(), which can hang in background tabs,
  // so we do the SVG -> canvas -> PNG conversion ourselves with onload.
  async function capturePng(): Promise<string> {
    const node = slideRef.current!;
    const svgUrl = await toSvg(node, { width: W, height: H, style: { transform: 'none' } });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('slide render failed'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.getContext('2d')!.drawImage(img, 0, 0, W, H);
    return canvas.toDataURL('image/png');
  }

  async function exportPng() {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileBase}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, W, H);
      pdf.save(`${fileBase}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const scale = `min(calc(100vw / ${W}), calc(100vh / ${H}))`;

  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-black">
      {/* control bar */}
      <div className="fixed top-4 right-4 z-10 flex gap-2">
        <button
          type="button"
          disabled={exporting}
          onClick={exportPng}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={exportPdf}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-50"
        >
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
        <button
          type="button"
          onClick={() => navigate('/programming')}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
        >
          Close
        </button>
      </div>

      {/* 1920x1080 slide, scaled to fit the viewport */}
      <div
        ref={slideRef}
        className="shrink-0 origin-center"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          background: 'linear-gradient(160deg, #201d1d 0%, #292626 55%, #0d2724 100%)',
        }}
      >
        <div className="flex h-full flex-col px-20 py-14">
          {/* header */}
          <header className="flex items-end justify-between border-b-2 border-white/15 pb-8">
            <div>
              <p className="text-[26px] font-semibold tracking-[0.35em] text-[#DEC5AE]">
                TENERIFFE ATHLETIC CLUB
              </p>
              <h1 className="font-display mt-2 text-[80px] leading-none font-semibold tracking-tight text-[#F5F3EB]">
                {FOCUS_TITLE[session.focus]}
              </h1>
            </div>
            <div className="text-right">
              <p className="text-[30px] font-semibold text-white/85">
                Block {blockIndex + 1} · Week {weekIndex + 1}
              </p>
              {theme && <p className="mt-1 text-[24px] text-white/50 italic">{theme}</p>}
            </div>
          </header>

          {/* timed blocks */}
          <main className="mt-10 flex min-h-0 flex-1 gap-10">
            {session.timedBlocks.map((block) => (
              <section key={block.id} className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline gap-4">
                  <span className="rounded-lg bg-[#003030] px-4 py-1 text-[34px] font-extrabold text-[#F5F3EB]">
                    {block.label}
                  </span>
                  <span className="text-[26px] font-semibold text-white/60">{block.minutes} min</span>
                </div>
                <ul className="mt-6 space-y-6">
                  {block.slots
                    .filter((slot) => slot.name)
                    .map((slot) => {
                      const scales =
                        slot.exerciseId !== null
                          ? (overrides.scales[slot.exerciseId] ?? []).filter((s) => s.trim())
                          : [];
                      const detail = [
                        slot.sets && slot.reps ? `${slot.sets} × ${slot.reps}` : slot.sets || slot.reps,
                        slot.load,
                        slot.intensity,
                        slot.rpe ? `RPE ${slot.rpe}` : undefined,
                        slot.tempo ? `tempo ${slot.tempo}` : undefined,
                      ]
                        .filter(Boolean)
                        .join('  ·  ');
                      return (
                        <li key={slot.id}>
                          <p className="text-[40px] leading-tight font-bold text-[#F5F3EB]">{slot.name}</p>
                          {detail && (
                            <p className="mt-1 text-[28px] font-medium text-[#DEC5AE]">{detail}</p>
                          )}
                          {scales.map((s, i) => (
                            <p key={i} className="mt-0.5 text-[22px] text-white/50">
                              Scale: {s}
                            </p>
                          ))}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </main>

          {/* blurb strip */}
          {blurb && (
            <footer className="mt-8 border-t-2 border-white/15 pt-6">
              <p className="text-[24px] leading-relaxed text-white/65">{blurb}</p>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
