import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { FOCUS_LABEL, circuitParts, seriesBlocks, streamsOf } from '../../lib/programStreams';
import { mergedLibrary } from '../../lib/library';
import { generateBlurb } from '../../lib/blurb';
import { cueFor, effectiveScales, scaleSummary } from '../../lib/prescription';
import { resolveWeekDays } from '../../lib/classDays';
import { isoDate, todayIso, trainingWeekMonday } from '../../lib/trainingWeeks';
import type { CircuitBlock, ExerciseSlot, Session, SessionFocus } from '../../types/documents';

// The microcycle text pack: every session of a block window, written out in
// full as real, selectable text, one A4 page per session. Made for the
// graphic designer who rebuilds the TV boards: it carries exactly what the
// board renders (title, intent, warm-up, series with minutes and part notes,
// numbered exercises with the same prescription line the wall shows, slot
// notes, cues, scaled options, coach note, member app description, blurb),
// nothing summarised. Data-driven from the live documents, so it can never
// drift from the programming.
//
// Print with the browser (Ctrl+P, Save as PDF): the page is styled for A4
// with @page rules, so the PDF keeps the fonts and the text stays text. The
// block overview rasterises its pages; this one deliberately does not, a
// designer needs to copy the words.

const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';
const PINE = '#003030';

/** Same line the TV board prints under an exercise. */
function slotDetail(slot: ExerciseSlot): string {
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

const isWarmup = (label: string) => label.trim().toUpperCase() === 'WU';
const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
const fmtY = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

function sessionWritten(s: Session): boolean {
  if (s.kind === 'circuit') return s.circuit.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()));
  return s.timedBlocks.some((tb) =>
    tb.kind === 'circuit'
      ? tb.pieces.some((p) => p.heading.trim() || p.lines.some((l) => l.text.trim()))
      : tb.slots.some((sl) => sl.name),
  );
}

export default function PackPage() {
  const { blockId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const program = useDoc('program');
  const overridesDoc = useDoc('library-overrides');
  const annual = useDoc('annual-plan');
  const schedule = useDoc('schedule');
  const { library } = useLibrary();

  const model = useMemo(() => {
    if (!program.data || !overridesDoc.data || !annual.data || !schedule.data) return null;
    for (const stream of streamsOf(program.data)) {
      let before = 0;
      for (let bi = 0; bi < stream.blocks.length; bi++) {
        const block = stream.blocks[bi];
        if (block.id === blockId) {
          const from = Math.max(1, parseInt(params.get('from') ?? '1', 10) || 1);
          const to = Math.min(block.weeks.length, parseInt(params.get('to') ?? String(block.weeks.length), 10) || block.weeks.length);
          const startDate = annual.data.startDate;
          const breaks = annual.data.breaks ?? [];
          const weekStarts = block.weeks.map((_, i) => trainingWeekMonday(startDate, before + i, breaks));
          const lane = annual.data.streams.find((l) => l.id === stream.id);
          const phase = lane?.phases.find((p) => p.id === block.annualPhaseId);
          const blockLen = Math.max(1, block.blockLength ?? 4);
          const micro = Math.floor((from - 1) / blockLen) + 1;
          const microCount = Math.ceil(block.weeks.length / blockLen);
          const weeks = block.weeks.slice(from - 1, to).map((week, i) => {
            const wi = from - 1 + i;
            const monday = weekStarts[wi];
            const focuses = week.sessions.map((s) => s.focus) as SessionFocus[];
            const resolved = resolveWeekDays(schedule.data!, isoDate(monday), focuses);
            return {
              week,
              wi,
              monday,
              sessions: week.sessions.map((session, si) => ({ session, day: resolved.days[si] })),
            };
          });
          return { stream, block, bi, from, to, micro, microCount, blockLen, weeks, phaseFocus: phase?.focus ?? '' };
        }
        before += block.weeks.length;
      }
    }
    return null;
  }, [program.data, overridesDoc.data, annual.data, schedule.data, blockId, params]);

  if (!model) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-ink-400">
        {program.data && annual.data && schedule.data && overridesDoc.data ? 'Block not found.' : 'Loading…'}
      </div>
    );
  }

  const overrides = overridesDoc.data!;
  const merged = library ? mergedLibrary(library, overrides) : [];
  const { stream, block, bi, from, to, micro, microCount, weeks, phaseFocus } = model;
  const cadence = stream.cadence ?? 'phases';
  const phaseTitle = cadence === 'phases' ? `Phase ${bi + 1}` : (block.theme ?? '');
  const windowTitle =
    from === to ? `Week ${from}` : model.blockLen > 1 && (from - 1) % model.blockLen === 0 && to - from + 1 === model.blockLen
      ? `Microcycle ${micro} of ${microCount}`
      : `Weeks ${from} to ${to}`;
  const first = weeks[0].monday;
  const last = new Date(weeks[weeks.length - 1].monday);
  last.setDate(last.getDate() + 6);
  const sessionCount = weeks.reduce((n, w) => n + w.sessions.length, 0);
  const written = weeks.reduce((n, w) => n + w.sessions.filter((s) => sessionWritten(s.session)).length, 0);

  const scalesFor = (slot: ExerciseSlot) => effectiveScales(overrides, slot).filter((s) => s.name.trim());
  const filled = (slots: ExerciseSlot[]) => slots.filter((s) => s.name);

  const label = 'text-[9px] font-bold tracking-[0.3em] uppercase';

  return (
    <div className="pack min-h-screen bg-black py-8" style={{ fontFamily: 'Mulish, sans-serif' }}>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        .pack .page { width: 210mm; min-height: 297mm; }
        @media print {
          .pack { background: white !important; padding: 0 !important; }
          .pack .chrome { display: none !important; }
          .pack .pages { gap: 0 !important; }
          .pack .page { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
          .pack .page:last-child { break-after: auto; page-break-after: auto; }
          .pack * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="chrome fixed top-4 right-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
        >
          Print / Save as PDF
        </button>
        <button
          type="button"
          onClick={() => navigate('/programming')}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
        >
          Close
        </button>
      </div>

      <div className="pages flex flex-col items-center gap-8">
        {/* Cover */}
        <div className="page relative shrink-0 shadow-xl" style={{ backgroundColor: CHARCOAL }}>
          <div className="flex h-full min-h-[297mm] flex-col px-14 py-16">
            <p className="text-[13px] font-bold tracking-[0.45em]" style={{ color: SAND }}>
              TENERIFFE ATHLETIC CLUB
            </p>
            <h1 className="mt-6 text-[50px] leading-[1.05]" style={{ fontFamily: 'Fraunces, serif', color: CREAM }}>
              {stream.name} {phaseTitle}
              <br />
              {windowTitle}
            </h1>
            {block.theme && (
              <p className="mt-3 text-[20px] font-semibold" style={{ color: SAND }}>
                {block.theme}
              </p>
            )}
            <p className="mt-2 text-[16px] font-semibold" style={{ color: SAND }}>
              {fmtY(first)} to {fmtY(last)} · {weeks.length} weeks · {written} of {sessionCount} sessions written
            </p>
            {phaseFocus && (
              <p className="mt-6 max-w-[520px] text-[14px] leading-relaxed" style={{ color: 'rgba(245,243,235,0.75)' }}>
                {phaseFocus}
              </p>
            )}

            <div className="mt-10 border-l-4 pl-5" style={{ borderColor: SAND }}>
              <p className="text-[18px] font-bold" style={{ fontFamily: 'Fraunces, serif', color: CREAM }}>
                What is in this pack
              </p>
              <p className="mt-2 max-w-[520px] text-[13px] leading-relaxed" style={{ color: 'rgba(245,243,235,0.7)' }}>
                One page per session, in the order the classes run. Each page carries every line the wall board shows:
                the title, the session intent, the warm-up strip, each series with its minutes and how it is run, the
                numbered exercises with their prescription exactly as the board prints it, per-exercise notes, coaching
                cues and scaled options, then the coach note, the member app description and the footer blurb. Weeks
                that repeat a prescription are written out in full anyway, so every board has its own page.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {weeks.map((w) => (
                <div key={w.week.id} className="flex gap-4 text-[13px]">
                  <span className="w-24 shrink-0 font-extrabold" style={{ color: SAND }}>
                    Week {w.wi + 1}
                  </span>
                  <span style={{ color: 'rgba(245,243,235,0.75)' }}>
                    w/c {fmt(w.monday)} ·{' '}
                    {w.sessions
                      .map(({ session, day }) => `${session.name ?? FOCUS_LABEL[session.focus]}${day.dayName ? ` (${day.dayName.slice(0, 3)})` : ''}`)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-auto">
              <p className="text-[15px] italic" style={{ fontFamily: 'Fraunces, serif', color: SAND }}>
                Train better, live better.
              </p>
              <p className="mt-2 text-[11px] font-semibold tracking-[0.28em] uppercase" style={{ color: 'rgba(245,243,235,0.4)' }}>
                76 Commercial Road, Teneriffe · prepared {fmtY(new Date(todayIso() + 'T00:00:00'))} · board text for design
              </p>
            </div>
          </div>
        </div>

        {/* One page per session */}
        {weeks.flatMap((w) =>
          w.sessions.map(({ session, day }) => {
            const title = (session.name ?? FOCUS_LABEL[session.focus]).toUpperCase();
            const blurb = session.blurbOverride ?? (library ? generateBlurb(session, merged, overrides) : '');
            const series = session.kind === 'series' ? seriesBlocks(session.timedBlocks) : [];
            const parts = session.kind === 'series' ? circuitParts(session.timedBlocks) : [];
            const warmups = series.filter((b) => isWarmup(b.label) && filled(b.slots).length > 0);
            const work = series.filter((b) => !isWarmup(b.label) && filled(b.slots).length > 0);
            const circuit: CircuitBlock[] = session.kind === 'circuit' ? session.circuit : [];
            const isWritten = sessionWritten(session);
            return (
              <div key={session.id} className="page relative shrink-0 shadow-xl" style={{ backgroundColor: CREAM, color: CHARCOAL }}>
                <div className="flex h-full min-h-[297mm] flex-col px-12 py-11">
                  <header className="border-b-2 pb-3" style={{ borderColor: PINE }}>
                    <p className={label} style={{ color: PINE }}>
                      Teneriffe Athletic Club · {stream.name} · {phaseTitle}
                      {block.theme ? ` · ${block.theme}` : ''}
                    </p>
                    <h2 className="mt-1 text-[30px] leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
                      Week {w.wi + 1} <span style={{ color: SAND }}>·</span> {title}
                    </h2>
                    <p className="mt-1 text-[11.5px] font-semibold" style={{ color: PINE }}>
                      {phaseTitle} · Week {w.wi + 1} of {block.weeks.length}
                      {day.dayName && day.date ? ` · ${day.dayName} ${fmt(new Date(day.date + 'T00:00:00'))}` : ' · no class day in the live timetable'}
                    </p>
                  </header>

                  {session.intent && (
                    <div className="mt-4">
                      <p className={label} style={{ color: PINE }}>Session intent</p>
                      <p className="mt-0.5 border-l-4 pl-3 text-[13.5px] leading-snug italic" style={{ borderColor: SAND, fontFamily: 'Fraunces, serif' }}>
                        {session.intent}
                      </p>
                    </div>
                  )}

                  {!isWritten && (
                    <p className="mt-6 text-[13px] italic" style={{ color: 'rgba(32,29,29,0.5)' }}>
                      Not written yet.
                    </p>
                  )}

                  {warmups.map((wu) => (
                    <section key={wu.id} className="mt-4 rounded-md border-2 px-4 py-3" style={{ borderColor: SAND }}>
                      <div className="flex items-baseline justify-between">
                        <p className="text-[13px] font-extrabold tracking-[0.08em]" style={{ color: PINE }}>
                          WARM UP
                        </p>
                        <p className="text-[10.5px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(32,29,29,0.55)' }}>
                          {wu.minutes} min · with coach{wu.hideFromBoard ? ' · off the wall' : ''}
                        </p>
                      </div>
                      {wu.note && (
                        <p className="mt-1 text-[11.5px] font-semibold" style={{ color: PINE }}>{wu.note}</p>
                      )}
                      <div className="mt-2 grid grid-cols-4 gap-x-4 gap-y-1.5">
                        {filled(wu.slots).map((slot) => (
                          <div key={slot.id}>
                            <p className="text-[12.5px] font-bold">{slot.name}</p>
                            {slotDetail(slot) && (
                              <p className="text-[11px] font-semibold" style={{ color: PINE }}>{slotDetail(slot)}</p>
                            )}
                            {slot.note && <p className="text-[10.5px]" style={{ color: 'rgba(32,29,29,0.7)' }}>{slot.note}</p>}
                            {cueFor(overrides, slot) && (
                              <p className="text-[10.5px] italic" style={{ color: 'rgba(32,29,29,0.6)' }}>{cueFor(overrides, slot)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}

                  {/* Series side by side, one column each, the way the wall board lays them out. */}
                  <div className="mt-4 grid grid-flow-col auto-cols-fr gap-3">
                  {work.map((blk) => (
                    <section key={blk.id} className="rounded-md border px-3 py-2" style={{ borderColor: SAND }}>
                      <div className="flex items-baseline justify-between border-b-2 pb-1" style={{ borderColor: SAND }}>
                        <p className="text-[15px] font-extrabold tracking-[0.06em]" style={{ color: PINE }}>
                          {blk.label.toUpperCase()} SERIES
                        </p>
                        <p className="text-[10.5px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(32,29,29,0.55)' }}>
                          {blk.minutes} min{blk.hideFromBoard ? ' · off the wall' : ''}
                        </p>
                      </div>
                      {blk.note && (
                        <p className="mt-1.5 text-[11.5px] font-semibold" style={{ color: PINE }}>{blk.note}</p>
                      )}
                      <ul className="mt-2 space-y-2">
                        {filled(blk.slots).map((slot, i) => (
                          <li key={slot.id} className="flex gap-3">
                            <span
                              className="mt-0.5 flex h-6 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-extrabold"
                              style={{ borderColor: PINE, color: PINE }}
                            >
                              {blk.label.toUpperCase()}{i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] leading-tight font-bold">{slot.name}</p>
                              {slotDetail(slot) && (
                                <p className="text-[12px] font-semibold" style={{ color: PINE }}>{slotDetail(slot)}</p>
                              )}
                              {slot.note && (
                                <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'rgba(32,29,29,0.75)' }}>
                                  <span className="font-semibold">Note: </span>{slot.note}
                                </p>
                              )}
                              {cueFor(overrides, slot) && (
                                <p className="mt-0.5 text-[11px] leading-snug italic" style={{ color: 'rgba(32,29,29,0.65)' }}>
                                  <span className="font-semibold not-italic">Cue: </span>{cueFor(overrides, slot)}
                                </p>
                              )}
                              {scalesFor(slot).length > 0 && (
                                <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: 'rgba(32,29,29,0.6)' }}>
                                  <span className="font-semibold">Scale: </span>
                                  {scalesFor(slot).map(scaleSummary).join(' · ')}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  {[...parts.map((p) => ({ id: p.id, label: p.label, minutes: p.minutes, note: p.note, pieces: p.pieces, hidden: p.hideFromBoard })),
                    ...(circuit.length ? [{ id: session.id + '-circuit', label: title, minutes: undefined as number | undefined, note: undefined as string | undefined, pieces: circuit, hidden: false }] : [])]
                    .filter((p) => p.pieces.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim())))
                    .map((part) => (
                      <section key={part.id} className="rounded-md border px-3 py-2" style={{ borderColor: SAND }}>
                        <div className="flex items-baseline justify-between border-b-2 pb-1" style={{ borderColor: SAND }}>
                          <p className="text-[15px] font-extrabold tracking-[0.06em]" style={{ color: PINE }}>
                            {part.label.toUpperCase()}
                          </p>
                          {part.minutes !== undefined && (
                            <p className="text-[10.5px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(32,29,29,0.55)' }}>
                              {part.minutes} min{part.hidden ? ' · off the wall' : ''}
                            </p>
                          )}
                        </div>
                        {part.note && <p className="mt-1.5 text-[11.5px] font-semibold" style={{ color: PINE }}>{part.note}</p>}
                        <ul className="mt-2 space-y-2">
                          {part.pieces.map((piece) => (
                            <li key={piece.id}>
                              {piece.heading.trim() && (
                                <p className="text-[12.5px] font-extrabold" style={{ color: PINE }}>
                                  {piece.heading}{piece.hideFromBoard ? ' (off the wall)' : ''}
                                </p>
                              )}
                              {piece.lines
                                .filter((l) => l.text.trim())
                                .map((line, li) => (
                                  <p key={li} className="text-[13px] leading-tight font-bold">
                                    {line.text}
                                    {line.load && <span className="ml-2 text-[11.5px] font-semibold" style={{ color: PINE }}>{line.load}</span>}
                                  </p>
                                ))}
                              {piece.restAfter?.trim() && (
                                <p className="text-[11px] font-semibold" style={{ color: 'rgba(32,29,29,0.6)' }}>{piece.restAfter}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>

                  <div className="mt-auto space-y-3 pt-6">
                    {session.note && (
                      <div>
                        <p className={label} style={{ color: PINE }}>Coach note (on the wall)</p>
                        <p className="mt-0.5 text-[11.5px] leading-snug">{session.note}</p>
                      </div>
                    )}
                    {session.appDescription && (
                      <div>
                        <p className={label} style={{ color: PINE }}>Member app description</p>
                        <p className="mt-0.5 text-[11.5px] leading-snug">{session.appDescription}</p>
                      </div>
                    )}
                    {blurb && session.kind !== 'circuit' && (
                      <div>
                        <p className={label} style={{ color: PINE }}>Footer blurb</p>
                        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'rgba(32,29,29,0.7)' }}>{blurb}</p>
                      </div>
                    )}
                    <footer className="flex items-end justify-between border-t pt-2" style={{ borderColor: SAND }}>
                      <p className="text-[9.5px]" style={{ color: 'rgba(32,29,29,0.55)' }}>
                        Board text as the coaching tool renders it. Nothing here is published to members.
                      </p>
                      <p className="text-[9px] font-semibold tracking-[0.28em] uppercase" style={{ color: 'rgba(32,29,29,0.45)' }}>
                        76 Commercial Road, Teneriffe
                      </p>
                    </footer>
                  </div>
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
