import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { generateBlurb } from '../../lib/blurb';
import { mergedLibrary } from '../../lib/library';
import type { ExerciseSlot, ProgramDoc, SeriesBlock, Session, TimedBlock } from '../../types/documents';
import { circuitParts, seriesBlocks, streamsOf } from '../../lib/programStreams';
import { cueFor as cueForRef, effectiveScales, scaleSummary } from '../../lib/prescription';

const W = 1920;
const H = 1080;

// Two different thresholds, and conflating them is how work gets hidden.
//
// FIT_MIN is how far the board will shrink to get everything on screen. It is
// a sanity bound, not a judgement: showing the whole session small always beats
// showing part of it large, because the class does what is on the wall.
//
// FIT_WARN is where the type stops being readable from the back of the room.
// Going below it is allowed, but the coach is told, because at that point the
// session is too long for one board and the fix is coaching, not layout.
const FIT_MIN = 0.42;
const FIT_WARN = 0.64;
const FIT_STEP = 0.04;

// TAC palette (TAC/brand.md): cream, charcoal, deep pine, warm sand.
const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';

const FOCUS_TITLE: Record<Session['focus'], string> = {
  lower: 'LOWER BODY',
  upper: 'UPPER BODY',
  full: 'FULL BODY',
  'full-a': 'FULL BODY A',
  'full-b': 'FULL BODY B',
  esd: 'ESD',
  hyrox: 'HYROX',
  'rox-strong': 'ROX STRONG',
  'rox-engine': 'ROX ENGINE',
  'rox-race': 'ROX RACE',
  gameday: 'GAME DAY',
};

function slideTitle(session: Session): string {
  return (session.name ?? FOCUS_TITLE[session.focus]).toUpperCase();
}

function findSession(doc: ProgramDoc, sessionId: string) {
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

function slotDetail(slot: ExerciseSlot): string {
  // A sets count with no reps ("1") is coach bookkeeping, not a prescription;
  // leave it off the screen.
  return [
    slot.sets && slot.reps ? `${slot.sets} × ${slot.reps}` : slot.reps,
    slot.load,
    slot.intensity ? `@ ${slot.intensity}` : undefined,
    slot.rpe ? `RPE ${slot.rpe}` : undefined,
    slot.tempo ? `${slot.tempo} tempo` : undefined,
  ]
    .filter(Boolean)
    .join('   |   ');
}

const isWarmup = (b: TimedBlock) => b.label.trim().toUpperCase() === 'WU';

export default function TvPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const program = useDoc('program');
  const lib = useDoc('library-overrides');
  const { library } = useLibrary();
  const slideRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  // The board is a fixed 1920x1080 slide, so a long session used to run past
  // the bottom edge and simply disappear: the class did what was on the wall
  // and finished two movements short, with the board still looking complete.
  // It now measures itself and shrinks the work area until everything fits.
  const [fit, setFit] = useState(1);
  // 'ok' fits at readable size, 'small' fits but below FIT_WARN, 'cut' means it
  // shrank as far as it goes and work is still off the board. The three are
  // different things to tell a coach, so they are not one boolean.
  const [fitState, setFitState] = useState<'ok' | 'small' | 'cut'>('ok');

  // A different session starts the measurement again from full size.
  useLayoutEffect(() => {
    setFit(1);
    setFitState('ok');
  }, [sessionId]);

  // No dependency list on purpose: this runs after every paint and either
  // shrinks one step or leaves the state alone, so it settles within a few
  // frames and then stops calling setState.
  useLayoutEffect(() => {
    const node = slideRef.current;
    if (!node) return;
    const lists = node.querySelectorAll<HTMLElement>('[data-fit-measure]');
    let overflows = false;
    lists.forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 1) overflows = true;
    });
    if (overflows && fit > FIT_MIN) {
      setFit((f) => Math.max(FIT_MIN, Number((f - FIT_STEP).toFixed(2))));
      return;
    }
    const next = overflows ? 'cut' : fit < FIT_WARN ? 'small' : 'ok';
    if (next !== fitState) setFitState(next);
  });

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
  const fileBase = `tac-${session.focus}-block${blockIndex + 1}-week${weekIndex + 1}`;

  const filled = (b: SeriesBlock) => b.slots.filter((s) => s.name);
  const timedBlocks = session.kind === 'series' ? seriesBlocks(session.timedBlocks) : [];
  // A strength session can finish on a circuit part; it renders as a board card.
  const partCircuits = session.kind === 'series' ? circuitParts(session.timedBlocks) : [];
  const warmups = timedBlocks.filter((b) => isWarmup(b) && filled(b).length > 0);
  const series = timedBlocks.filter((b) => !isWarmup(b) && filled(b).length > 0);

  // ESD, Hyrox and Game Day are written as circuits, so the board shows the
  // pieces rather than a sets-and-reps table.
  const circuit =
    session.kind === 'circuit'
      ? session.circuit.filter((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()))
      : [];
  const isCircuit = session.kind === 'circuit';
  // Each class gets its own backdrop: the room for strength, the members for
  // the group classes.
  const BACKDROP: Record<string, string> = {
    esd: '/tv/bg-esd.jpg',
    hyrox: '/tv/bg-hyrox.jpg',
    'rox-strong': '/tv/bg-hyrox.jpg',
    'rox-engine': '/tv/bg-hyrox.jpg',
    'rox-race': '/tv/bg-hyrox.jpg',
    gameday: '/tv/bg-gameday.jpg',
  };
  const backdrop = BACKDROP[session.focus] ?? '/tv/bg-gym-dark.jpg';
  // The member photos are portrait, so they sit in a narrower panel and are
  // framed on the group rather than cropped through it.
  const backdropStyle = BACKDROP[session.focus]
    ? { width: '42%', objectPosition: '50% 32%', filter: 'brightness(1.05)' }
    : { width: '66%', objectPosition: '50% 62%', filter: 'brightness(1.3)' };

  // Free text included: cues are keyed like scales (id, or name for free text).
  const cueFor = (slot: ExerciseSlot) => cueForRef(overrides, slot);
  const scalesFor = (slot: ExerciseSlot) =>
    effectiveScales(overrides, slot).filter((s) => s.name.trim());

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
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H], hotfixes: ['px_scaling'] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, W, H);
      pdf.save(`${fileBase}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const scale = `min(calc(100vw / ${W}), calc(100vh / ${H}))`;

  // Lay the work area out larger than its box, then scale it back, so the type
  // shrinks and the board keeps its full width.
  const fitStyle = {
    width: `${100 / fit}%`,
    height: `${100 / fit}%`,
    transform: `scale(${fit})`,
    transformOrigin: 'top left',
  } as const;

  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-black">
      {/* Outside the slide on purpose: this is for the coach at the laptop,
          and it must never reach the wall or the exported image. */}
      {fitState !== 'ok' && (
        <div
          className={`fixed top-4 left-4 z-10 max-w-md rounded-md px-3 py-2 text-sm font-semibold shadow-lg ${
            fitState === 'cut' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'
          }`}
        >
          {fitState === 'cut' ? (
            <>
              This session does not fit on one board. It is down to{' '}
              {Math.round(fit * 100)}% type and work is still off the screen. Split
              it across two boards, or take the scaling off the wall.
            </>
          ) : (
            <>
              Everything is on the board, but only at {Math.round(fit * 100)}%
              type, which is small from the back of the room. Consider splitting
              it across two boards.
            </>
          )}
        </div>
      )}
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
        className="relative shrink-0 origin-center overflow-hidden"
        style={{ width: W, height: H, transform: `scale(${scale})`, backgroundColor: CHARCOAL }}
      >
        {/* club photo anchored right, fading under the content like the wall boards */}
        <img
          src={backdrop}
          alt=""
          className="absolute inset-y-0 right-0 h-full object-cover"
          style={backdropStyle}
        />
        <div
          className="absolute inset-0"
          style={{
            // A four-piece board runs the full width, so the photo has to sit
            // back further and read as texture behind the last card.
            background: isCircuit
              ? circuit.length >= 4
                ? `linear-gradient(90deg, ${CHARCOAL} 0%, ${CHARCOAL} 62%, rgba(32,29,29,0.93) 78%, rgba(32,29,29,0.80) 100%)`
                : `linear-gradient(90deg, ${CHARCOAL} 0%, ${CHARCOAL} 56%, rgba(32,29,29,0.86) 68%, rgba(13,39,36,0.28) 100%)`
              : `linear-gradient(90deg, ${CHARCOAL} 0%, ${CHARCOAL} 38%, rgba(32,29,29,0.82) 60%, rgba(13,39,36,0.30) 100%)`,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'linear-gradient(0deg, rgba(0,48,48,0.35), transparent)' }}
        />

        <div className="relative flex h-full flex-col px-16 pt-10 pb-8">
          {/* header */}
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
                  {isCircuit ? (
                    <>
                      {FOCUS_TITLE[session.focus]} <span style={{ color: SAND }}>·</span>{' '}
                      {session.name ?? `Week ${weekIndex + 1}`}
                    </>
                  ) : (
                    <>
                      Week {weekIndex + 1} <span style={{ color: SAND }}>·</span>{' '}
                      {slideTitle(session)}
                    </>
                  )}
                </h1>
              </div>
            </div>
            <div className="pt-2 text-right">
              {/* Circuits are named by class in the headline, so the phase
                  theme would only repeat noise: show the week instead. */}
              {isCircuit ? (
                <p className="text-[26px] font-extrabold tracking-[0.14em] text-white/90 uppercase">
                  Week {weekIndex + 1}
                </p>
              ) : (
                theme && (
                  <p className="text-[26px] font-extrabold tracking-[0.14em] text-white/90 uppercase">
                    {theme}
                  </p>
                )
              )}
              <p className="mt-1 text-[21px] font-semibold text-white/55">
                {cadence === 'phases' ? `Phase ${blockIndex + 1}` : theme} · Week{' '}
                {weekIndex + 1} of {blockWeeks}
              </p>
              <p className="font-display mt-2 text-[20px] italic" style={{ color: SAND }}>
                Train better, live better.
              </p>
            </div>
          </header>

          {/* session intent */}
          {session.intent && (
            <p
              className="font-display mt-5 border-l-4 pl-5 text-[24px] leading-snug italic"
              style={{ borderColor: SAND, color: 'rgba(245,243,235,0.85)' }}
            >
              {session.intent}
            </p>
          )}

          {/* circuit board: the pieces of an ESD / Hyrox / Game Day session */}
          {isCircuit && (
            <>
              {/* Kept clear of the right-hand photo panel so the members show */}
              <main
                className="mt-6 min-h-0 flex-1 overflow-hidden"
                style={{ width: circuit.length >= 4 ? '100%' : '74%' }}
              >
              {/* Laid out at 1/fit of the real size and scaled back down, so
                  shrinking buys vertical room without narrowing the board. */}
              <div className="grid gap-6" style={{ ...fitStyle, gridTemplateColumns: `repeat(${Math.min(circuit.length, 4)}, minmax(0, 1fr))` }}>
                {circuit.map((piece, i) => (
                  <section
                    key={piece.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/12"
                    style={{ backgroundColor: 'rgba(32,29,29,0.72)' }}
                  >
                    <div
                      className="border-b-[3px] px-6 py-4"
                      style={{ borderColor: SAND }}
                    >
                      <span
                        className="text-[15px] font-bold tracking-[0.22em] uppercase"
                        style={{ color: 'rgba(222,197,174,0.65)' }}
                      >
                        Piece {i + 1}
                      </span>
                      <p
                        className="text-[30px] leading-tight font-extrabold"
                        style={{ color: SAND }}
                      >
                        {piece.heading || '·'}
                      </p>
                    </div>
                    <ul data-fit-measure className="flex-1 space-y-3 overflow-hidden px-6 py-5">
                      {piece.lines
                        .filter((l) => l.text.trim())
                        .map((line, li) => (
                          <li
                            key={li}
                            className="text-[34px] leading-tight font-bold"
                            style={{ color: CREAM }}
                          >
                            {line.text}
                            {/* The station's load, so nobody has to ask what
                                goes on the sled. */}
                            {line.load && (
                              <span
                                className="block text-[26px] font-semibold"
                                style={{ color: SAND }}
                              >
                                {line.load}
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                    {piece.restAfter && (
                      <div
                        className="border-t border-white/10 px-6 py-3 text-[22px] font-semibold tracking-wide"
                        style={{ color: 'rgba(245,243,235,0.55)' }}
                      >
                        {piece.restAfter}
                      </div>
                    )}
                  </section>
                ))}
              </div>
              </main>

              {/* the coach note belongs on the wall, not just in the app */}
              {session.note && (
                <p
                  className="mt-5 rounded-lg border-l-4 px-5 py-3 text-[24px] leading-snug font-semibold"
                  style={{
                    borderColor: SAND,
                    color: CREAM,
                    backgroundColor: 'rgba(222,197,174,0.14)',
                  }}
                >
                  {session.note}
                </p>
              )}
            </>
          )}

          {/* warm-up strip */}
          {!isCircuit && warmups.map((wu) => (
            <section
              key={wu.id}
              className="mt-6 rounded-lg border-2"
              style={{ borderColor: 'rgba(222,197,174,0.55)', backgroundColor: 'rgba(32,29,29,0.55)' }}
            >
              <div className="flex divide-x divide-white/10">
                <div className="flex w-56 shrink-0 flex-col justify-center px-6 py-4">
                  <span className="text-[26px] leading-tight font-extrabold tracking-[0.08em]" style={{ color: SAND }}>
                    WARM UP
                  </span>
                  <span className="text-[20px] font-semibold text-white/55">{wu.minutes} min · with coach</span>
                </div>
                {filled(wu).map((slot) => (
                  <div key={slot.id} className="flex min-w-0 flex-1 flex-col justify-center px-6 py-4">
                    <p className="text-[26px] leading-tight font-bold" style={{ color: CREAM }}>
                      {slot.name}
                    </p>
                    {slotDetail(slot) && (
                      <p className="mt-0.5 text-[21px] font-semibold" style={{ color: SAND }}>
                        {slotDetail(slot)}
                      </p>
                    )}
                    {cueFor(slot) && (
                      <p className="mt-0.5 text-[18px] text-white/55 italic">{cueFor(slot)}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* series columns */}
          {!isCircuit && (
          <main className="mt-7 min-h-0 flex-1 overflow-hidden">
          <div className="grid grid-flow-col auto-cols-fr gap-8" style={fitStyle}>
            {series.map((block) => (
              <section
                key={block.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/12"
                style={{ backgroundColor: 'rgba(32,29,29,0.62)' }}
              >
                <div
                  className="flex items-baseline justify-between border-b-[3px] px-7 py-4"
                  style={{ borderColor: SAND }}
                >
                  <span className="text-[34px] font-extrabold tracking-[0.06em]" style={{ color: SAND }}>
                    {block.label.toUpperCase()} SERIES
                  </span>
                  <span className="text-[23px] font-bold tracking-[0.1em] text-white/60 uppercase">
                    {block.minutes} min
                  </span>
                </div>
                {/* How the part is run. Without it the wall lists movements and
                    never says it is a 22 minute AMRAP in pairs, which is the
                    one thing the class needs before it starts. */}
                {block.note && (
                  <p
                    className="border-b border-white/10 px-7 py-3 text-[21px] leading-snug font-semibold"
                    style={{ color: SAND }}
                  >
                    {block.note}
                  </p>
                )}
                <ul data-fit-measure className="flex-1 space-y-6 overflow-hidden px-7 py-6">
                  {filled(block).map((slot, i) => (
                    <li key={slot.id} className="flex gap-5">
                      <span
                        className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-[21px] font-extrabold"
                        style={{ borderColor: SAND, color: SAND }}
                      >
                        {block.label.toUpperCase()}
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[31px] leading-tight font-bold" style={{ color: CREAM }}>
                          {slot.name}
                        </p>
                        {slotDetail(slot) && (
                          <p className="mt-1 text-[24px] leading-tight font-semibold" style={{ color: SAND }}>
                            {slotDetail(slot)}
                          </p>
                        )}
                        {/* Which minute of the EMOM, whose choice the machine
                            is, the scaling for this slot. It is written per
                            slot, so it belongs beside the slot. */}
                        {slot.note && (
                          <p className="mt-1 text-[19px] leading-snug" style={{ color: 'rgba(222,197,174,0.75)' }}>
                            {slot.note}
                          </p>
                        )}
                        {cueFor(slot) && (
                          <p className="mt-1 text-[20px] leading-snug text-white/60 italic">{cueFor(slot)}</p>
                        )}
                        {scalesFor(slot).map((s, si) => (
                          <p key={si} className="mt-0.5 text-[19px] leading-snug text-white/45">
                            Scale: {scaleSummary(s)}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {/* A circuit finisher inside a strength session gets its own
                column, read the same way the ESD board reads. */}
            {partCircuits
              .filter((p) => p.pieces.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim())))
              .map((part) => (
                <section
                  key={part.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/12"
                  style={{ backgroundColor: 'rgba(32,29,29,0.62)' }}
                >
                  <div
                    className="flex items-baseline justify-between border-b-[3px] px-7 py-4"
                    style={{ borderColor: SAND }}
                  >
                    <span className="text-[34px] font-extrabold tracking-[0.06em]" style={{ color: SAND }}>
                      {part.label.toUpperCase()}
                    </span>
                    <span className="text-[23px] font-bold tracking-[0.1em] text-white/60 uppercase">
                      {part.minutes} min
                    </span>
                  </div>
                  <ul data-fit-measure className="flex-1 space-y-5 overflow-hidden px-7 py-6">
                    {part.pieces.map((piece) => (
                      <li key={piece.id}>
                        {piece.heading.trim() && (
                          <p className="text-[26px] font-extrabold" style={{ color: SAND }}>
                            {piece.heading}
                          </p>
                        )}
                        {piece.lines
                          .filter((l) => l.text.trim())
                          .map((line, li) => (
                            <p key={li} className="text-[30px] leading-tight font-bold" style={{ color: CREAM }}>
                              {line.text}
                              {line.load && (
                                <span className="block text-[23px] font-semibold" style={{ color: SAND }}>
                                  {line.load}
                                </span>
                              )}
                            </p>
                          ))}
                        {piece.restAfter?.trim() && (
                          <p className="mt-1 text-[20px] font-semibold text-white/55">
                            {piece.restAfter}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
          </main>
          )}

          {/* footer: coaching blurb + address */}
          <footer className="mt-6 flex items-end justify-between gap-10 border-t border-white/15 pt-4">
            <p className="max-w-[1300px] text-[19px] leading-relaxed text-white/55">
              {isCircuit ? '' : blurb}
            </p>
            <p className="shrink-0 text-[17px] font-semibold tracking-[0.28em] text-white/35 uppercase">
              76 Commercial Road, Teneriffe
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
