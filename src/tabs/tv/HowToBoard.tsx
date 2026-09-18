import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useFitScale } from '../../lib/useFitScale';

// A how-to board: the same 1920x1080 TAC wall board as a session TV output,
// but carrying an instruction sequence instead of a workout. First one is the
// TrainHeroic sign-up, which has two pathways (already have the app, or not)
// that converge on one access code, so the board splits down the middle and
// the code runs full width underneath.
//
// It is artwork for the designer as much as a wall board, so everything he has
// to supply is drawn as a LABELLED placeholder rather than left out: the app
// screenshots, the store badges, and the access code itself (pass ?code=XXXX
// to fill it in without a code change).
//
// Content lives in BOARDS, so a second board (etiquette, a challenge, a class
// format) is a data entry here, not another page.

const W = 1920;
const H = 1080;

// TAC palette (TAC/brand.md), the same constants the session board uses.
const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';

interface Step {
  text: string;
  /** The half-line under a step. Only where it is actually known. */
  detail?: string;
}

interface Pathway {
  label: string;
  sub: string;
  steps: Step[];
  /** What the designer should drop into this column's phone frame. */
  shot: string;
}

interface BoardDef {
  /** Uppercase kicker on the right of the header. */
  kicker: string;
  title: string;
  standfirst: string;
  pathways: [Pathway, Pathway];
  /** The thing both pathways end at. */
  payoff: { label: string; note: string };
  footer: string;
  fileBase: string;
}

const BOARDS: Record<string, BoardDef> = {
  trainheroic: {
    kicker: 'TrainHeroic set-up',
    title: 'Get your programming',
    standfirst:
      'Every session you do here is written in the TrainHeroic app. Two ways in, depending on whether you already have it.',
    pathways: [
      {
        label: "I don't have the app",
        sub: 'Starting from scratch',
        shot: 'App Store listing, or the "Already have a coach" sign-up screen',
        steps: [
          { text: 'Download TrainHeroic', detail: 'App Store or Google Play' },
          { text: 'Create an account' },
          { text: 'Select "Already have a coach"' },
          { text: 'Enter the access code' },
        ],
      },
      {
        label: 'I already have the app',
        sub: 'You have an account already',
        shot: 'The settings screen, with the initials and gear icon visible',
        steps: [
          { text: 'Tap your initials', detail: 'Bottom right corner' },
          { text: 'Tap the gear icon' },
          { text: 'Tap "My Training"' },
          { text: 'Enter the access code' },
        ],
      },
    ],
    payoff: {
      label: 'Access code',
      note: 'Same code either way',
    },
    footer: 'Stuck on any step? Grab a coach on the floor and we will do it with you.',
    fileBase: 'tac-trainheroic-how-to',
  },
};

export default function HowToBoard() {
  const { boardId = 'trainheroic' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const slideRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(W, H);
  const [exporting, setExporting] = useState(false);

  const board = BOARDS[boardId];
  if (!board) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-ink-400">
        <p>No board called “{boardId}”. Known boards: {Object.keys(BOARDS).join(', ')}.</p>
        <button type="button" onClick={() => navigate('/programming')} className="rounded border border-ink-700 px-3 py-1.5 text-sm">
          Back to Programming
        </button>
      </div>
    );
  }

  // The real code is not in the repo. Passed in the URL it prints; left out it
  // prints as an obvious placeholder for the designer to set.
  const code = params.get('code')?.trim() ?? '';
  const codePlaceholder = !code;
  // ?bare=1 strips the buttons and the coach's warning, so a headless
  // capture of this URL is the board and nothing else.
  const bare = params.get('bare') === '1';

  // Same capture path as the session board: toPng's decode() hangs in
  // background tabs, so SVG to canvas by hand.
  async function capturePng(): Promise<string> {
    const svgUrl = await toSvg(slideRef.current!, { width: W, height: H, style: { transform: 'none' } });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('board render failed'));
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
      const a = document.createElement('a');
      a.href = await capturePng();
      a.download = `${board.fileBase}.png`;
      a.click();
    } catch (err) {
      window.alert(`PNG export failed: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const dataUrl = await capturePng();
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H], hotfixes: ['px_scaling'] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, W, H);
      pdf.save(`${board.fileBase}.pdf`);
    } catch (err) {
      window.alert(`PDF export failed: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="howto relative h-screen w-screen overflow-hidden bg-black">
      {/* Printing the route straight from the browser keeps the type as real
          text for the designer, so the board unscales and fills one landscape
          page. The screen keeps the fit-to-viewport transform. */}
      <style>{`
        @page { size: ${W}px ${H}px; margin: 0; }
        @media print {
          .howto { display: block !important; min-height: 0 !important; background: #fff !important; }
          .howto .chrome { display: none !important; }
          .howto .board { position: static !important; transform: none !important; margin: 0 !important; }
          .howto * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {!bare && (
      <div className="chrome fixed top-4 right-4 z-10 flex gap-2">
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
          onClick={() => window.print()}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
        >
          Print (text stays text)
        </button>
        <button
          type="button"
          onClick={() => navigate('/programming')}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
        >
          Close
        </button>
      </div>
      )}

      {codePlaceholder && !bare && (
        <div className="chrome fixed top-4 left-4 z-10 max-w-md rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-amber-950 shadow-lg">
          No access code set, so the board shows a placeholder. Add it to the
          address bar to print the real one: <code>?code=ABC123</code>
        </div>
      )}

      {/* 1920x1080 board, scaled to fit the viewport */}
      <div
        ref={slideRef}
        className="board absolute top-1/2 left-1/2 overflow-hidden"
        style={{
          width: W,
          height: H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          backgroundColor: CHARCOAL,
        }}
      >
        <img
          src="/tv/bg-gym-dark.jpg"
          alt=""
          className="absolute inset-y-0 right-0 h-full object-cover"
          style={{ width: '52%', objectPosition: '50% 62%', filter: 'brightness(1.15)' }}
        />
        {/* The two cards are translucent, so the photo has to stay texture the
            whole way across: a lighter tail made the right-hand pathway read as
            a different card from the left one. */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${CHARCOAL} 0%, ${CHARCOAL} 40%, rgba(32,29,29,0.96) 58%, rgba(32,29,29,0.88) 100%)`,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'linear-gradient(0deg, rgba(0,48,48,0.35), transparent)' }}
        />

        <div className="relative flex h-full flex-col px-16 pt-9 pb-7">
          {/* header: the session board's header, same sizes */}
          <header className="flex items-start justify-between">
            <div className="flex items-center gap-8">
              <img src="/tv/tac-icon-white.png" alt="TAC" className="h-[92px] w-auto" />
              <div>
                <p className="text-[19px] font-bold tracking-[0.45em]" style={{ color: SAND }}>
                  TENERIFFE ATHLETIC CLUB
                </p>
                <h1
                  className="font-display mt-1 text-[64px] leading-none font-semibold tracking-tight"
                  style={{ color: CREAM }}
                >
                  {board.title}
                </h1>
              </div>
            </div>
            <div className="pt-2 text-right">
              <p className="text-[26px] font-extrabold tracking-[0.14em] text-white/90 uppercase">
                {board.kicker}
              </p>
              <p className="font-display mt-2 text-[20px] italic" style={{ color: SAND }}>
                Train better, live better.
              </p>
            </div>
          </header>

          <p
            className="font-display mt-5 border-l-4 pl-5 text-[24px] leading-snug italic"
            style={{ borderColor: SAND, color: 'rgba(245,243,235,0.85)' }}
          >
            {board.standfirst}
          </p>

          {/* the two pathways, split down the middle */}
          <main className="relative mt-6 grid min-h-0 flex-1 grid-cols-2 gap-8">
            {board.pathways.map((path, pi) => (
              <section
                key={path.label}
                className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/12"
                style={{ backgroundColor: 'rgba(32,29,29,0.62)' }}
              >
                <div className="border-b-[3px] px-8 py-4" style={{ borderColor: SAND }}>
                  <p className="text-[34px] leading-none font-extrabold tracking-[0.04em]" style={{ color: SAND }}>
                    {path.label.toUpperCase()}
                  </p>
                  <p className="mt-1.5 text-[21px] font-semibold text-white/55">{path.sub}</p>
                </div>

                <div className="flex flex-1 gap-7 px-8 py-6">
                  <ol className="flex flex-1 flex-col justify-between">
                    {path.steps.map((step, si) => (
                      <li key={step.text} className="flex gap-5">
                        <span
                          className="mt-0.5 flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border-2 text-[26px] font-extrabold"
                          style={{ borderColor: SAND, color: SAND }}
                        >
                          {si + 1}
                        </span>
                        <div className="min-w-0 pt-1">
                          <p className="text-[32px] leading-tight font-bold" style={{ color: CREAM }}>
                            {step.text}
                          </p>
                          {step.detail && (
                            <p className="mt-0.5 text-[22px] leading-tight font-semibold" style={{ color: SAND }}>
                              {step.detail}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                  {/* Phone frame: the designer's slot, drawn so the layout is
                      already right when the real screenshot lands. */}
                  <div
                    className="flex w-[232px] shrink-0 flex-col items-center justify-center rounded-[26px] border-2 border-dashed px-4 text-center"
                    style={{ borderColor: 'rgba(222,197,174,0.45)', backgroundColor: 'rgba(245,243,235,0.04)' }}
                  >
                    <p className="text-[15px] font-bold tracking-[0.22em] uppercase" style={{ color: 'rgba(222,197,174,0.8)' }}>
                      App screenshot
                    </p>
                    <p className="mt-2 text-[15px] leading-snug text-white/45">{path.shot}</p>
                    {pi === 0 && (
                      <p className="mt-4 text-[14px] leading-snug text-white/35">
                        Store badges go here too
                      </p>
                    )}
                  </div>
                </div>
              </section>
            ))}

            {/* the split: a rule down the middle with OR on it */}
            <div className="pointer-events-none absolute inset-y-6 left-1/2 flex -translate-x-1/2 flex-col items-center">
              <div className="w-px flex-1" style={{ backgroundColor: 'rgba(222,197,174,0.3)' }} />
              <div
                className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 text-[20px] font-extrabold tracking-[0.1em]"
                style={{ borderColor: SAND, color: SAND, backgroundColor: CHARCOAL }}
              >
                OR
              </div>
              <div className="w-px flex-1" style={{ backgroundColor: 'rgba(222,197,174,0.3)' }} />
            </div>
          </main>

          {/* Both pathways end here, so it runs the full width of the board
              rather than sitting under one column. */}
          <div className="mt-5">
            <section
              className="flex items-center gap-10 rounded-lg border-2 px-10 py-5"
              style={{ borderColor: SAND, backgroundColor: 'rgba(0,48,48,0.45)' }}
            >
              <div className="shrink-0">
                <p className="text-[19px] font-bold tracking-[0.3em] uppercase" style={{ color: SAND }}>
                  {board.payoff.label}
                </p>
                <p className="mt-0.5 text-[18px] font-semibold text-white/50">{board.payoff.note}</p>
              </div>
              <p
                className="flex-1 text-center text-[64px] leading-none font-extrabold tracking-[0.16em]"
                style={{ color: codePlaceholder ? 'rgba(245,243,235,0.35)' : CREAM }}
              >
                {codePlaceholder ? 'X X X X X X' : code.toUpperCase()}
              </p>
              {codePlaceholder && (
                <p className="w-[250px] shrink-0 text-right text-[15px] leading-snug text-white/40">
                  Placeholder. The club's real access code drops in here.
                </p>
              )}
            </section>
          </div>

          <footer className="mt-5 flex items-end justify-between gap-10 border-t border-white/15 pt-4">
            <p className="text-[20px] leading-relaxed text-white/60">{board.footer}</p>
            <p className="shrink-0 text-[17px] font-semibold tracking-[0.28em] text-white/35 uppercase">
              76 Commercial Road, Teneriffe
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
