import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDoc } from '../../lib/useDoc';
import { FOCUS_LABEL } from '../../lib/focusCatalog';
import { circuitParts, seriesBlocks, streamsOf } from '../../lib/programStreams';
import { effectiveScales, slotDetail } from '../../lib/prescription';
import { resolveWeekDays } from '../../lib/classDays';
import { isoDate, trainingWeekMonday } from '../../lib/trainingWeeks';
import type { ExerciseSlot, SessionFocus } from '../../types/documents';

// The coaching card: one A4 page a coach can hold on the floor.
//
// Not the wall board (which is for the class) and not the pack (which is the
// whole week). This is one session, briefed: what it is for, what runs when,
// and the coach-only apparatus the board deliberately leaves off, which for a
// conditioning session is most of the work: the rotation at 16 / 12 / 8, the
// room set-up, what to watch for.
//
// Printed with the browser, so the type stays real text. ?bare=1 hides the
// controls for a headless capture.

const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';
const PINE = '#003030';

const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });

export default function CardPage() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const program = useDoc('program');
  const overridesDoc = useDoc('library-overrides');
  const annual = useDoc('annual-plan');
  const schedule = useDoc('schedule');
  const bare = params.get('bare') === '1';

  const found = useMemo(() => {
    if (!program.data || !annual.data || !schedule.data) return null;
    const breaks = annual.data.breaks ?? [];
    for (const stream of streamsOf(program.data)) {
      let before = 0;
      for (let bi = 0; bi < stream.blocks.length; bi++) {
        const block = stream.blocks[bi];
        for (let wi = 0; wi < block.weeks.length; wi++) {
          const week = block.weeks[wi];
          const session = week.sessions.find((s) => s.id === sessionId);
          if (session) {
            const monday = trainingWeekMonday(annual.data!.startDate, before + wi, breaks);
            const resolved = resolveWeekDays(schedule.data!, isoDate(monday), [session.focus as SessionFocus]);
            return {
              stream,
              block,
              blockIndex: bi,
              weekIndex: wi,
              weeks: block.weeks.length,
              session,
              day: resolved.days[0],
            };
          }
        }
        before += block.weeks.length;
      }
    }
    return null;
  }, [program.data, annual.data, schedule.data, sessionId]);

  if (!found || !overridesDoc.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black text-ink-400">
        <p>{program.data && annual.data && schedule.data ? 'Session not found.' : 'Loading…'}</p>
        <button type="button" onClick={() => navigate('/week')} className="rounded border border-ink-700 px-3 py-1.5 text-sm">
          Back to the week
        </button>
      </div>
    );
  }

  const { stream, block, blockIndex, weekIndex, weeks, session, day } = found;
  const overrides = overridesDoc.data;
  const cadence = stream.cadence ?? 'phases';
  const container = cadence === 'phases' ? `Phase ${blockIndex + 1}` : (block.theme ?? '');
  const title = (session.name ?? FOCUS_LABEL[session.focus]).toUpperCase();

  const series = session.kind === 'series' ? seriesBlocks(session.timedBlocks) : [];
  const parts = session.kind === 'series' ? circuitParts(session.timedBlocks) : [];
  const circuit = session.kind === 'circuit' ? session.circuit : [];
  const filled = (slots: ExerciseSlot[]) => slots.filter((s) => s.name);
  const scalesFor = (slot: ExerciseSlot) => effectiveScales(overrides, slot).filter((s) => s.name.trim());

  const label = 'text-[9px] font-bold tracking-[0.3em] uppercase';

  return (
    <div className="card-page min-h-screen bg-black py-8" style={{ fontFamily: 'Mulish, sans-serif' }}>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        .card-page .page { width: 210mm; min-height: 297mm; }
        @media print {
          .card-page { background: #fff !important; padding: 0 !important; }
          .card-page .chrome { display: none !important; }
          .card-page .page { box-shadow: none !important; margin: 0 !important; }
          .card-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {!bare && (
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
            onClick={() => navigate('/week')}
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
          >
            Close
          </button>
        </div>
      )}

      <div className="mx-auto flex flex-col items-center">
        <div className="page relative shadow-xl" style={{ backgroundColor: CREAM, color: CHARCOAL }}>
          <div className="flex h-full min-h-[297mm] flex-col px-12 py-11">
            <header className="border-b-2 pb-3" style={{ borderColor: PINE }}>
              <p className={label} style={{ color: PINE }}>
                Teneriffe Athletic Club · Coaching card · {stream.name}
                {block.theme ? ` · ${block.theme}` : ''}
              </p>
              <h1 className="mt-1 text-[30px] leading-tight" style={{ fontFamily: 'Fraunces, serif' }}>
                {day.dayName ?? 'Unscheduled'} <span style={{ color: SAND }}>·</span> {title}
              </h1>
              <p className="mt-1 text-[11.5px] font-semibold" style={{ color: PINE }}>
                {container} · Week {weekIndex + 1} of {weeks}
                {day.date ? ` · ${fmt(new Date(day.date + 'T00:00:00'))}` : ' · no class day on the live timetable'}
              </p>
            </header>

            {session.intent && (
              <div className="mt-4">
                <p className={label} style={{ color: PINE }}>The brief</p>
                <p
                  className="mt-0.5 border-l-4 pl-3 text-[13.5px] leading-snug italic"
                  style={{ borderColor: SAND, fontFamily: 'Fraunces, serif' }}
                >
                  {session.intent}
                </p>
              </div>
            )}

            {/* The work, compact: a coach is scanning this, not reading it. */}
            <div className="mt-4 space-y-3">
              {series.map((blk) => (
                <section key={blk.id}>
                  <div className="flex items-baseline justify-between border-b pb-1" style={{ borderColor: SAND }}>
                    <p className="text-[13px] font-extrabold tracking-[0.06em]" style={{ color: PINE }}>
                      {blk.label.trim().toUpperCase() === 'WU' ? 'WARM UP' : `${blk.label.toUpperCase()} SERIES`}
                    </p>
                    <p className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(32,29,29,0.55)' }}>
                      {blk.minutes} min
                    </p>
                  </div>
                  {blk.note && <p className="mt-1 text-[11px] font-semibold" style={{ color: PINE }}>{blk.note}</p>}
                  <ul className="mt-1">
                    {filled(blk.slots).map((slot, i) => (
                      <li key={slot.id} className="flex gap-2 py-0.5 text-[11.5px] leading-snug">
                        <span className="w-7 shrink-0 font-extrabold" style={{ color: PINE }}>
                          {blk.label.toUpperCase()}{i + 1}
                        </span>
                        <span className="flex-1">
                          <span className="font-bold">{slot.name}</span>
                          {slotDetail(slot) && (
                            <span className="ml-2 font-semibold" style={{ color: PINE }}>{slotDetail(slot)}</span>
                          )}
                          {slot.note && <span className="block" style={{ color: 'rgba(32,29,29,0.7)' }}>{slot.note}</span>}
                          {scalesFor(slot).length > 0 && (
                            <span className="block" style={{ color: 'rgba(32,29,29,0.6)' }}>
                              Scale: {scalesFor(slot).map((s) => s.name).join(' · ')}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {[...circuit, ...parts.flatMap((p) => p.pieces)].map((piece) => (
                <section key={piece.id}>
                  <div className="border-b pb-1" style={{ borderColor: SAND }}>
                    <p className="text-[13px] font-extrabold tracking-[0.06em]" style={{ color: PINE }}>
                      {piece.heading || '·'}
                    </p>
                  </div>
                  {piece.note && <p className="mt-1 text-[11px] font-semibold" style={{ color: PINE }}>{piece.note}</p>}
                  <ul className="mt-1">
                    {piece.lines
                      .filter((l) => l.text.trim())
                      .map((line, li) => (
                        <li key={li} className="py-0.5 text-[11.5px] leading-snug">
                          <span className="font-bold">{line.text}</span>
                          {line.load && (
                            <span className="ml-2 font-semibold" style={{ color: PINE }}>{line.load}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                  {piece.restAfter?.trim() && (
                    <p className="text-[11px] font-semibold" style={{ color: 'rgba(32,29,29,0.6)' }}>{piece.restAfter}</p>
                  )}
                </section>
              ))}
            </div>

            {/* The coach-only half: never on the wall, always on the card. */}
            <div className="mt-auto space-y-3 pt-6">
              {session.note && (
                <div>
                  <p className={label} style={{ color: PINE }}>Coach note</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug">{session.note}</p>
                </div>
              )}
              {(session.coachSections ?? []).map((sec) => (
                <div key={sec.id}>
                  <p className={label} style={{ color: PINE }}>{sec.heading}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug">{sec.text}</p>
                </div>
              ))}
              {session.appDescription && (
                <div>
                  <p className={label} style={{ color: PINE }}>Member app description</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug">{session.appDescription}</p>
                </div>
              )}
              <footer className="flex items-end justify-between border-t pt-2" style={{ borderColor: SAND }}>
                <p className="text-[9.5px]" style={{ color: 'rgba(32,29,29,0.55)' }}>
                  Coaching card. The wall board carries the class-facing half of this session.
                </p>
                <p className="text-[9px] font-semibold tracking-[0.28em] uppercase" style={{ color: 'rgba(32,29,29,0.45)' }}>
                  76 Commercial Road, Teneriffe
                </p>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
