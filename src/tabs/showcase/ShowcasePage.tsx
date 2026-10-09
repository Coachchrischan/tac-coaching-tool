import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAnnualPlan } from '../../lib/useAnnualPlan';
import { shutdownOffsets, todayIso, trainingWeekOffset } from '../../lib/trainingWeeks';
import type { AnnualStream } from '../../types/documents';

// The year on one screen, for the members.
//
// This is not the planning view. The Annual Plan tab is where the year gets
// argued about; this is what goes in front of the class, so it answers two
// questions and no others: what are we doing this year, and where are we up to.
//
// Everything on it is written for a member. The planning text ("loaded from
// the club sheet 2026-09-10") stays on the planning tab; each phase carries a
// separate `memberDescription` for this page, and the page scrolls, so there
// is room to say something real about each block.

const CREAM = '#F5F3EB';
const INK = '#201d1d';
const SAND = '#DEC5AE';
const CLAY = '#b4603f';
/** The club shutdown: the sand the brand already uses, not a training colour. */
const PAUSE = '#e8dcc0';
/** The month ruler's height. The "we are here" line starts below it. */
const RULER_H = 34;
/** The bar's height. The workshop stems start where it ends. */
const BAR_H = 210;
const W = 1680;

/**
 * A colour per KIND of block, not per position in the year.
 *
 * Strength-Hypertrophy cycle 1 and cycle 2 are the same block done twice, so
 * they are the same colour; so are the two Strength blocks. A member can then
 * see at a glance that May is the same kind of training as September, which
 * walking a ramp through the year could never show.
 *
 * All four sit in the club's range: two greens, a sand and a warm brown, far
 * enough apart to name from the back of the room. A tighter all-green set and
 * a cool/warm alternating set were both tried and rejected, the first because
 * the blocks stopped being tellable apart, the second because it looked
 * sporadic.
 */
const TYPE_COLOURS: Record<string, string> = {
  'strength-hypertrophy': '#073A32', // deep pine
  strength: '#9C6B4F', // clay
  'muscle endurance': '#5C8070', // sage
  hypertrophy: '#C3B182', // khaki
};

/** Anything not named above, so a new block is never colourless. */
const FALLBACK_COLOURS = ['#2F6F66', '#7A5C48', '#6F8A7D', '#D9C49B'];

/**
 * The block's kind, from its name: "Strength (cycle 2)" is a Strength block.
 * Keying on the name rather than the phase id means a block added next year
 * picks up its family's colour by being called what it is.
 */
function blockKind(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function colourFor(name: string, index: number): string {
  return TYPE_COLOURS[blockKind(name)] ?? FALLBACK_COLOURS[index % FALLBACK_COLOURS.length];
}

/** Mix a hex colour toward another by `amount` (0 to 1). */
function mix(hex: string, towards: string, amount: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(towards);
  const c = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `#${[c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Ink or cream, whichever can be read on this background. */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Rec. 601 luma is close enough for flat brand colours.
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? INK : CREAM;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Micro {
  weeks: number;
  startOffset: number;
  span: number;
  colour: string;
}
interface Block {
  id: string;
  name: string;
  description: string;
  weeks: number;
  startOffset: number;
  span: number;
  colour: string;
  micros: Micro[];
  startDate: Date;
  endDate: Date;
}
interface BreakSegment {
  kind: 'break';
  id: string;
  name: string;
  startOffset: number;
  span: number;
}
type Segment = ({ kind: 'block'; block: Block } | BreakSegment) & { number: number };

/** Calendar span of `weeks` training weeks starting at a calendar offset. */
function spanOf(start: number, weeks: number, blocked: Set<number>): number {
  let span = 0;
  let counted = 0;
  while (counted < weeks) {
    if (!blocked.has(start + span)) counted++;
    span++;
  }
  return span;
}

export default function ShowcasePage() {
  const [params] = useSearchParams();
  const streamId = params.get('stream') ?? 'strength';
  const annual = useAnnualPlan();

  const model = useMemo(() => {
    const doc = annual;
    if (!doc) return null;
    const stream = doc.streams.find((s) => s.id === streamId) as AnnualStream | undefined;
    if (!stream) return null;

    const blocked = shutdownOffsets(doc.startDate, doc.breaks ?? []);
    const start = new Date(`${doc.startDate}T00:00:00`);
    const dateAt = (offset: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + offset * 7);
      return d;
    };

    const blocks: Block[] = [];
    // A stream can start later than the plan does; see AnnualStream.startsWeek.
    let trained = stream.startsWeek ?? 0;
    stream.phases.forEach((phase, i) => {
      const startOffset = trainingWeekOffset(trained, blocked);
      const span = spanOf(startOffset, phase.weeks, blocked);
      const colour = colourFor(phase.name, i);

      // A phase with no microcycles stated is drawn as one, so the year is
      // never missing a block just because its waves are not decided yet.
      const lengths = phase.microcycles?.length ? phase.microcycles : [phase.weeks];
      const micros: Micro[] = [];
      let within = 0;
      lengths.forEach((weeks, mi) => {
        const mStart = trainingWeekOffset(trained + within, blocked);
        micros.push({
          weeks,
          startOffset: mStart,
          span: spanOf(mStart, weeks, blocked),
          // Each microcycle a step lighter than the last, through the whole
          // height of the block, so the waves are visible without the block
          // stopping being one colour.
          colour: mix(colour, CREAM, mi * 0.11),
        });
        within += weeks;
      });

      const end = dateAt(startOffset + span - 1);
      end.setDate(end.getDate() + 6);
      blocks.push({
        id: phase.id,
        name: phase.name,
        // The members' words where they have been written, the planning text
        // only as a fallback so a new phase is never blank on the wall.
        description: phase.memberDescription?.trim() || phase.focus,
        weeks: phase.weeks,
        startOffset,
        span,
        colour,
        micros,
        startDate: dateAt(startOffset),
        endDate: end,
      });
      trained += phase.weeks;
    });

    // The bar's coordinate space is this stream's own run, not the plan's.
    const origin = blocks.length ? blocks[0].startOffset : 0;
    const total = blocks.length
      ? blocks[blocks.length - 1].startOffset + blocks[blocks.length - 1].span - origin
      : 1;

    // Where we are up to: today's calendar week offset from the plan start.
    const today = new Date(`${todayIso()}T00:00:00`);
    const nowOffset = Math.floor((today.getTime() - start.getTime()) / (7 * 86_400_000));
    const inRange = nowOffset >= origin && nowOffset < origin + total;
    const hereBlock = blocks.find((b) => nowOffset >= b.startOffset && nowOffset < b.startOffset + b.span);
    const hereMicroIndex = hereBlock
      ? hereBlock.micros.findIndex((m) => nowOffset >= m.startOffset && nowOffset < m.startOffset + m.span)
      : -1;
    const weekInBlock = hereBlock
      ? [...Array(nowOffset - hereBlock.startOffset + 1).keys()].filter(
          (i) => !blocked.has(hereBlock.startOffset + i),
        ).length
      : null;

    // A club shutdown has to BE a segment. Without one the blocks either side
    // close up, the Christmas weeks vanish and every block after them is drawn
    // two weeks early.
    const segments: Segment[] = [];
    let at = origin;
    for (const b of blocks) {
      if (b.startOffset > at) {
        const br = (doc.breaks ?? []).find(
          (w) =>
            Math.round(
              (new Date(`${w.start}T00:00:00`).getTime() - start.getTime()) / (7 * 86_400_000),
            ) === at,
        );
        segments.push({
          kind: 'break',
          number: segments.length + 1,
          id: br?.id ?? `gap-${at}`,
          name: br?.name ?? 'Club shutdown',
          startOffset: at,
          span: b.startOffset - at,
        });
      }
      segments.push({ kind: 'block', block: b, number: segments.length + 1 });
      at = b.startOffset + b.span;
    }

    // The workshops pencilled into this stream, placed by the week they fall in.
    const workshops = (doc.workshops ?? [])
      .filter((w) => w.streamId === streamId)
      .map((w) => ({
        ...w,
        at: Math.round((new Date(`${w.date}T00:00:00`).getTime() - start.getTime()) / (7 * 86_400_000)),
      }))
      .filter((w) => w.at >= origin && w.at < origin + total)
      .sort((a, b) => a.at - b.at);

    // Month labels along the top, as a share of the whole span.
    const marks: { label: string; at: number }[] = [];
    let seen = '';
    for (let o = origin; o < origin + total; o++) {
      const d = dateAt(o);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== seen) {
        seen = key;
        marks.push({ label: `${MONTHS[d.getMonth()]}${d.getMonth() === 0 ? ` ${d.getFullYear()}` : ''}`, at: o });
      }
    }

    return {
      stream, blocks, segments, origin, total, nowOffset, inRange,
      hereBlock, hereMicroIndex, weekInBlock, marks, workshops,
    };
  }, [annual, streamId]);

  if (!model) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: CREAM, color: INK }}>
        <p className="text-2xl">{annual ? 'No such stream in the plan.' : 'Loading the year…'}</p>
      </div>
    );
  }

  const {
    segments, origin, total, nowOffset, inRange, hereBlock, weekInBlock, marks, workshops,
  } = model;
  /** An offset on the bar. */
  const pct = (n: number) => `${((n - origin) / total) * 100}%`;
  /** A width on the bar: a span has no origin to take off. */
  const wpct = (span: number) => `${(span / total) * 100}%`;

  return (
    // The page scrolls, so each block can say something worth reading. The
    // first screenful is the year; below it is a block at a time.
    <div style={{ background: CREAM, color: INK, minHeight: '100vh' }}>
      <div style={{ width: W, maxWidth: '100%', margin: '0 auto', padding: '52px 56px 72px' }}>
        <header style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 18 }}>
          {/* The club's landscape logo rather than its name typed out. It
              already carries the wordmark, so nothing repeats it. */}
          <img
            src="/brand/tac-landscape.png"
            alt="Teneriffe Athletic Club"
            style={{ height: 66, width: 'auto', display: 'block', marginBottom: 10 }}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 62, lineHeight: 1.05, margin: '6px 0 0' }}>
              {model.stream.name} · the year ahead
            </h1>
            {inRange && hereBlock && (
              <p style={{ fontSize: 22, fontWeight: 700, color: '#003030', paddingBottom: 8 }}>
                We are here: {hereBlock.name}
                {weekInBlock ? `, week ${weekInBlock} of ${hereBlock.weeks}` : ''}
              </p>
            )}
          </div>
        </header>

        {/* The ruler, the bar and the marker share one coordinate space: a
            calendar week offset as a share of this stream's whole run. */}
        <div style={{ position: 'relative', marginTop: 38, paddingBottom: 122 }}>
          <div style={{ position: 'relative', height: RULER_H }}>
            {marks.map((m) => (
              <span
                key={m.at}
                style={{
                  position: 'absolute',
                  left: pct(m.at),
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#5a5a52',
                }}
              >
                {m.label.toUpperCase()}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 5, height: BAR_H }}>
            {segments.map((seg) => {
              // The shutdown reads down the bar, not across it: two weeks is a
              // narrow column and the name never fitted horizontally.
              if (seg.kind === 'break') {
                return (
                  <div
                    key={seg.id}
                    style={{
                      width: wpct(seg.span),
                      borderRadius: 8,
                      background: PAUSE,
                      color: INK,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* The name only. A second line of vertical text runs
                        past the bottom of the bar and gets clipped. */}
                    <span
                      style={{
                        fontFamily: 'Fraunces, Georgia, serif',
                        fontSize: 20,
                        whiteSpace: 'nowrap',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {seg.name}
                    </span>
                  </div>
                );
              }

              const b = seg.block;
              return (
                <div
                  key={b.id}
                  style={{
                    width: wpct(b.span),
                    // A four-week block is narrow enough that "endurance" lost
                    // its last letter. Every block gets a floor; the wide ones
                    // give up the few pixels, which is invisible on a bar this
                    // long and better than a cropped word.
                    minWidth: 124,
                    borderRadius: 8,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* The microcycle shades run the full height of the block,
                      not a strip along the bottom. */}
                  <div style={{ display: 'flex', height: '100%' }}>
                    {b.micros.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          width: `${(m.span / b.span) * 100}%`,
                          background: m.colour,
                          color: textOn(m.colour),
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          paddingBottom: 11,
                          fontSize: 14,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {m.weeks} {m.weeks === 1 ? 'week' : 'weeks'}
                      </div>
                    ))}
                  </div>
                  {/* The name sits over its own block, centred, at the same
                      size in every block. Sizing it by how wide the block is
                      made the bar read as several different typefaces. */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      padding: '12px 8px 42px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      color: textOn(b.colour),
                      pointerEvents: 'none',
                    }}
                  >
                    <p
                      style={{
                        fontFamily: 'Fraunces, Georgia, serif',
                        fontSize: 21,
                        lineHeight: 1.15,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {b.name}
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 700, opacity: 0.8, marginTop: 6 }}>
                      {b.weeks} weeks
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* The workshops pencilled into the year. Each one hangs off the
              bar on its own stem, below the "we are here" label, so a flag
              and the marker never land on top of each other. */}
          {workshops.map((w, i) => (
            <div
              key={w.id}
              style={{
                position: 'absolute',
                left: `calc(${pct(w.at + 0.5)} - 0.5px)`,
                top: RULER_H + BAR_H,
                bottom: i % 2 === 0 ? 26 : 0,
                width: 1,
                background: w.tentative ? 'transparent' : CLAY,
                borderLeft: w.tentative ? `1px dashed ${CLAY}` : undefined,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 5px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontSize: 17,
                  fontWeight: 700,
                  color: CLAY,
                }}
              >
                {w.name}
              </span>
            </div>
          ))}


          {/* We are here. */}
          {inRange && (
            <div
              style={{
                position: 'absolute',
                left: `calc(${pct(nowOffset + 0.5)} - 1.5px)`,
                // Starts at the top of the bar, not the top of the ruler: run
                // any higher and it draws a line straight through a month.
                top: RULER_H,
                bottom: 92,
                width: 3,
                background: CLAY,
              }}
            >
              <div
                style={{
                  position: 'absolute', bottom: -4, left: -9, width: 0, height: 0,
                  borderLeft: '10px solid transparent',
                  borderRight: '10px solid transparent',
                  borderTop: `14px solid ${CLAY}`,
                }}
              />
              {/* The words go where the arrow is pointing. */}
              <p
                style={{
                  position: 'absolute',
                  bottom: -38,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontSize: 19,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: CLAY,
                }}
              >
                WE ARE HERE
              </p>
            </div>
          )}
        </div>

        <p
          style={{
            marginTop: 112,
            fontSize: 17,
            fontWeight: 700,
            color: '#5a5a52',
            borderTop: `2px solid ${SAND}`,
            paddingTop: 14,
          }}
        >
          Each colour is a block. The bands inside it are the microcycles: the three or four week waves
          we build through, then step up from.
        </p>

        {/* A card per block, in the order the year runs, saying what it is.
            Every name is the same size here: the bar has to fit its names into
            blocks of different widths, this does not, so this is where a
            member actually reads them. */}
        <div
          style={{
            marginTop: 26,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 18,
          }}
        >
          {segments.map((seg) => {
            const n = String(seg.number).padStart(2, '0');
            const isBreak = seg.kind === 'break';
            const colour = isBreak ? PAUSE : seg.block.colour;
            const current = !isBreak && hereBlock?.id === seg.block.id;
            const name = isBreak ? seg.name : seg.block.name;
            const text = isBreak
              ? 'The club closes for two weeks. Rest, eat, come back in January ready to work.'
              : seg.block.description;
            return (
              <section
                key={isBreak ? seg.id : seg.block.id}
                style={{
                  background: isBreak ? '#f3ecdd' : '#fff',
                  borderLeft: `6px solid ${colour}`,
                  borderRadius: 4,
                  padding: '18px 20px 22px',
                  boxShadow: current ? '0 2px 16px rgba(32,29,29,0.14)' : '0 1px 3px rgba(32,29,29,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 10,
                }}
              >
                <div className="flex w-full items-start justify-between" style={{ gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#8a867c', letterSpacing: '0.06em' }}>
                    {n}
                  </span>
                  {(current || isBreak) && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        color: current ? CLAY : '#8a867c',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {current ? 'RUNNING NOW' : 'RECOVERY'}
                    </span>
                  )}
                </div>
                <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, lineHeight: 1.12 }}>{name}</p>
                <p style={{ fontSize: 17, lineHeight: 1.5, color: '#3a3636' }}>{text}</p>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
