// The 1920x1080 board itself, with no chrome: the TV page wraps it in its
// controls, and the designer pack renders one per session off-screen to
// capture the current board next to the session's inputs.
//
// The board measures itself and shrinks the work area until everything fits
// (a long session used to run off the bottom edge and simply disappear). The
// fit state is reported upward so the page can warn the coach.

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { ExerciseSlot, LibraryOverridesDoc, SeriesBlock, Session } from '../../types/documents';
import { circuitParts, seriesBlocks } from '../../lib/programStreams';
import { cueFor as cueForRef, effectiveScales, scaleSummary } from '../../lib/prescription';
import { BOARD_H, BOARD_W, FOCUS_TITLE, isWarmup, slideTitle, slotDetail } from './boardRules';

// FIT_WARN is where the type stops being readable from the back of the room.
// Going below it is allowed, but the coach is told, because at that point the
// session is too long for one board and the fix is coaching, not layout.
// The floor rose from 0.42 once parts could be curated off the board: type
// below ~55% is unreadable from the back of the room, so past that the board
// says "cut" and the fix is curation, not more compression.
const FIT_MIN = 0.55;
const FIT_WARN = 0.64;
const FIT_STEP = 0.04;

// TAC palette (TAC/brand.md): cream, charcoal, deep pine, warm sand.
const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';

export type FitState = 'ok' | 'small' | 'cut';

export interface BoardFit {
  fit: number;
  fitState: FitState;
  /** True once the shrink loop has stopped: the board is safe to capture. */
  settled: boolean;
}

export interface TvBoardProps {
  session: Session;
  blockIndex: number;
  weekIndex: number;
  blockWeeks: number;
  theme?: string;
  cadence: 'phases' | 'months' | 'blocks';
  overrides: LibraryOverridesDoc;
  /** The footer line of sell (generated or coach-edited). */
  blurb: string;
  slideRef?: RefObject<HTMLDivElement | null>;
  /** Extra style on the slide root, e.g. the viewport-fit transform. */
  style?: CSSProperties;
  onFit?: (fit: BoardFit) => void;
}

/** Parts the coach took off the wall, for the page's off-board notice. */
export function hiddenPartsOf(session: Session): string[] {
  return session.kind === 'circuit'
    ? session.circuit.filter((c) => c.hideFromBoard).map((c) => c.heading || 'untitled piece')
    : session.timedBlocks.filter((b) => b.hideFromBoard).map((b) => b.label);
}

export default function TvBoard({
  session,
  blockIndex,
  weekIndex,
  blockWeeks,
  theme,
  cadence,
  overrides,
  blurb,
  slideRef,
  style,
  onFit,
}: TvBoardProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = slideRef ?? ownRef;
  const [fit, setFit] = useState(1);
  const [fitState, setFitState] = useState<FitState>('ok');
  const reported = useRef<string>('');

  // A different session starts the measurement again from full size.
  useLayoutEffect(() => {
    setFit(1);
    setFitState('ok');
    reported.current = '';
  }, [session.id]);

  // No dependency list on purpose: this runs after every paint and either
  // shrinks one step or leaves the state alone, so it settles within a few
  // frames and then stops calling setState.
  useLayoutEffect(() => {
    const node = ref.current;
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
    const next: FitState = overflows ? 'cut' : fit < FIT_WARN ? 'small' : 'ok';
    if (next !== fitState) {
      setFitState(next);
      return;
    }
    const key = `${session.id}:${fit}:${next}`;
    if (reported.current !== key) {
      reported.current = key;
      onFit?.({ fit, fitState: next, settled: true });
    }
  });

  const filled = (b: SeriesBlock) => b.slots.filter((s) => s.name);
  // Curation beats compression: parts marked off-board (cooldown, station
  // prep) never reach the wall or the export; they stay in the email and PDF.
  const onBoard = <T extends { hideFromBoard?: boolean }>(parts: T[]) => parts.filter((p) => !p.hideFromBoard);
  const timedBlocks = session.kind === 'series' ? onBoard(seriesBlocks(session.timedBlocks)) : [];
  // A strength session can finish on a circuit part; it renders as a board card.
  const partCircuits = session.kind === 'series' ? onBoard(circuitParts(session.timedBlocks)) : [];
  const warmups = timedBlocks.filter((b) => isWarmup(b) && filled(b).length > 0);
  const series = timedBlocks.filter((b) => !isWarmup(b) && filled(b).length > 0);

  // ESD, Hyrox and Game Day are written as circuits, so the board shows the
  // pieces rather than a sets-and-reps table.
  const circuit =
    session.kind === 'circuit'
      ? onBoard(session.circuit).filter((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()))
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
  const scalesFor = (slot: ExerciseSlot) => effectiveScales(overrides, slot).filter((s) => s.name.trim());

  // Lay the work area out larger than its box, then scale it back, so the type
  // shrinks and the board keeps its full width.
  const fitStyle = {
    width: `${100 / fit}%`,
    height: `${100 / fit}%`,
    transform: `scale(${fit})`,
    transformOrigin: 'top left',
  } as const;

  return (
    <div
      ref={ref}
      className="relative shrink-0 origin-center overflow-hidden"
      style={{ width: BOARD_W, height: BOARD_H, backgroundColor: CHARCOAL, ...style }}
    >
      {/* club photo anchored right, fading under the content like the wall boards */}
      <img src={backdrop} alt="" className="absolute inset-y-0 right-0 h-full object-cover" style={backdropStyle} />
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
              <h1 className="font-display mt-1 text-[64px] leading-none font-semibold tracking-tight" style={{ color: CREAM }}>
                {isCircuit ? (
                  <>
                    {FOCUS_TITLE[session.focus]} <span style={{ color: SAND }}>·</span> {session.name ?? `Week ${weekIndex + 1}`}
                  </>
                ) : (
                  <>
                    Week {weekIndex + 1} <span style={{ color: SAND }}>·</span> {slideTitle(session)}
                  </>
                )}
              </h1>
            </div>
          </div>
          <div className="pt-2 text-right">
            {/* Circuits are named by class in the headline, so the phase
                theme would only repeat noise: show the week instead. */}
            {isCircuit ? (
              <p className="text-[26px] font-extrabold tracking-[0.14em] text-white/90 uppercase">Week {weekIndex + 1}</p>
            ) : (
              theme && (
                <p className="text-[26px] font-extrabold tracking-[0.14em] text-white/90 uppercase">{theme}</p>
              )
            )}
            <p className="mt-1 text-[21px] font-semibold text-white/55">
              {cadence === 'phases' ? `Phase ${blockIndex + 1}` : theme} · Week {weekIndex + 1} of {blockWeeks}
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
            <main className="mt-6 min-h-0 flex-1 overflow-hidden" style={{ width: circuit.length >= 4 ? '100%' : '74%' }}>
              {/* Laid out at 1/fit of the real size and scaled back down, so
                  shrinking buys vertical room without narrowing the board. */}
              <div
                className="grid gap-6"
                style={{ ...fitStyle, gridTemplateColumns: `repeat(${Math.min(circuit.length, 4)}, minmax(0, 1fr))` }}
              >
                {circuit.map((piece, i) => (
                  <section
                    key={piece.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/12"
                    style={{ backgroundColor: 'rgba(32,29,29,0.72)' }}
                  >
                    <div className="border-b-[3px] px-6 py-4" style={{ borderColor: SAND }}>
                      <span className="text-[15px] font-bold tracking-[0.22em] uppercase" style={{ color: 'rgba(222,197,174,0.65)' }}>
                        Piece {i + 1}
                      </span>
                      <p className="text-[30px] leading-tight font-extrabold" style={{ color: SAND }}>
                        {piece.heading || '·'}
                      </p>
                    </div>
                    <ul data-fit-measure className="flex-1 space-y-3 overflow-hidden px-6 py-5">
                      {piece.lines
                        .filter((l) => l.text.trim())
                        .map((line, li) => (
                          <li key={li} className="text-[34px] leading-tight font-bold" style={{ color: CREAM }}>
                            {line.text}
                            {/* The station's load, so nobody has to ask what
                                goes on the sled. */}
                            {line.load && (
                              <span className="block text-[26px] font-semibold" style={{ color: SAND }}>
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
                style={{ borderColor: SAND, color: CREAM, backgroundColor: 'rgba(222,197,174,0.14)' }}
              >
                {session.note}
              </p>
            )}
          </>
        )}

        {/* warm-up strip */}
        {!isCircuit &&
          warmups.map((wu) => (
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
                    {cueFor(slot) && <p className="mt-0.5 text-[18px] text-white/55 italic">{cueFor(slot)}</p>}
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
                  <div className="flex items-baseline justify-between border-b-[3px] px-7 py-4" style={{ borderColor: SAND }}>
                    <span className="text-[34px] font-extrabold tracking-[0.06em]" style={{ color: SAND }}>
                      {block.label.toUpperCase()} SERIES
                    </span>
                    <span className="text-[23px] font-bold tracking-[0.1em] text-white/60 uppercase">{block.minutes} min</span>
                  </div>
                  {/* How the part is run. Without it the wall lists movements and
                      never says it is a 22 minute AMRAP in pairs, which is the
                      one thing the class needs before it starts. */}
                  {block.note && (
                    <p className="border-b border-white/10 px-7 py-3 text-[21px] leading-snug font-semibold" style={{ color: SAND }}>
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
                          {cueFor(slot) && <p className="mt-1 text-[20px] leading-snug text-white/60 italic">{cueFor(slot)}</p>}
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
                    <div className="flex items-baseline justify-between border-b-[3px] px-7 py-4" style={{ borderColor: SAND }}>
                      <span className="text-[34px] font-extrabold tracking-[0.06em]" style={{ color: SAND }}>
                        {part.label.toUpperCase()}
                      </span>
                      <span className="text-[23px] font-bold tracking-[0.1em] text-white/60 uppercase">{part.minutes} min</span>
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
                            <p className="mt-1 text-[20px] font-semibold text-white/55">{piece.restAfter}</p>
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
          <p className="max-w-[1300px] text-[19px] leading-relaxed text-white/55">{isCircuit ? '' : blurb}</p>
          <p className="shrink-0 text-[17px] font-semibold tracking-[0.28em] text-white/35 uppercase">
            76 Commercial Road, Teneriffe
          </p>
        </footer>
      </div>
    </div>
  );
}
