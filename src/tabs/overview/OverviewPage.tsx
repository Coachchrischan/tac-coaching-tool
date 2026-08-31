import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useDoc } from '../../lib/useDoc';
import { FOCUS_LABEL, sessionLabel, seriesBlocks, streamsOf } from '../../lib/programStreams';
import { resolveWeekDays } from '../../lib/classDays';
import { isoDate, todayIso, trainingWeekMonday } from '../../lib/trainingWeeks';
import type { ProgramBlock, ProgramStream, Session, SessionFocus } from '../../types/documents';

// The block overview: one TAC-branded PDF a coach can be sent, covering the
// current block of every stream. Data-driven from the live documents, so it is
// never a stale copy of the programming: the summary lines are the session
// intents the coach would see in the app.
//
// A4 portrait at 96dpi. Same export pipeline as the TV board (toSvg then a
// manual canvas, because toPng's decode() hangs in background tabs).
const PW = 794;
const PH = 1123;

const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';
const PINE = '#003030';

/** Does a session hold anything a coach could run? */
function sessionWritten(s: Session): boolean {
  if (s.kind === 'circuit') return s.circuit.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()));
  return s.timedBlocks.some((tb) =>
    tb.kind === 'circuit' ? tb.pieces.some((p) => p.heading.trim() || p.lines.some((l) => l.text.trim())) : tb.slots.some((sl) => sl.name),
  );
}

function blockWritten(b: ProgramBlock): number {
  return b.weeks.reduce((n, w) => n + w.sessions.filter(sessionWritten).length, 0);
}

/**
 * The block worth showing a coach: the one containing today if it still has
 * written work from today's week on, otherwise the next block with content,
 * otherwise whatever exists.
 */
function pickBlock(stream: ProgramStream, startDate: string, breaks: { id: string; name: string; start: string; weeks: number }[]) {
  const today = todayIso();
  let before = 0;
  const spans = stream.blocks.map((b) => {
    const first = trainingWeekMonday(startDate, before, breaks);
    const weekStarts = b.weeks.map((_, i) => trainingWeekMonday(startDate, before + i, breaks));
    before += b.weeks.length;
    return { block: b, first, weekStarts };
  });
  const current = spans.findIndex((s, i) => {
    const next = spans[i + 1];
    return isoDate(s.first) <= today && (!next || today < isoDate(next.first));
  });
  const from = current >= 0 ? current : 0;
  for (let i = from; i < spans.length; i++) {
    const s = spans[i];
    // Written work in a week not yet finished?
    const live = s.block.weeks.some((w, wi) => {
      const end = new Date(s.weekStarts[wi]);
      end.setDate(end.getDate() + 6);
      return isoDate(end) >= today && w.sessions.some(sessionWritten);
    });
    if (live) return s;
  }
  return spans.find((s) => blockWritten(s.block) > 0) ?? spans[0];
}

/** One coach-readable line for a session: its intent, else its first heading. */
function summaryLine(s: Session): string {
  if (s.intent) return s.intent;
  if (s.kind === 'circuit') {
    const heads = s.circuit.map((c) => c.heading.trim()).filter(Boolean);
    return heads.join(' then ');
  }
  const first = seriesBlocks(s.timedBlocks).flatMap((tb) => tb.slots).find((sl) => sl.name);
  return first ? `Leads with ${first.name}` : '';
}

const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

export default function OverviewPage() {
  const navigate = useNavigate();
  const program = useDoc('program');
  const annual = useDoc('annual-plan');
  const schedule = useDoc('schedule');
  const pagesRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const model = useMemo(() => {
    if (!program.data || !annual.data || !schedule.data) return null;
    const startDate = annual.data.startDate;
    const breaks = annual.data.breaks ?? [];
    const streams = streamsOf(program.data).map((stream) => {
      const picked = pickBlock(stream, startDate, breaks);
      const lane = annual.data!.streams.find((l) => l.id === stream.id);
      const phase = lane?.phases.find((p) => p.id === picked.block.annualPhaseId);
      // Which day each focus runs, off the live timetable.
      const focuses = [...new Set(picked.block.weeks.flatMap((w) => w.sessions.map((s) => s.focus)))];
      const resolved = resolveWeekDays(schedule.data!, isoDate(picked.first), focuses as SessionFocus[]);
      const dayOf = new Map(resolved.days.map((d) => [d.focus, d.dayName]));
      const last = picked.weekStarts[picked.weekStarts.length - 1];
      return {
        stream,
        block: picked.block,
        weekStarts: picked.weekStarts,
        from: picked.first,
        to: last,
        focusLine: phase?.focus ?? '',
        written: blockWritten(picked.block),
        total: picked.block.weeks.reduce((n, w) => n + w.sessions.length, 0),
        dayOf,
      };
    });
    return { streams, generated: new Date() };
  }, [program.data, annual.data, schedule.data]);

  if (!model) {
    return <div className="flex min-h-screen items-center justify-center bg-black text-ink-400">Loading…</div>;
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const pages = Array.from(pagesRef.current!.querySelectorAll<HTMLElement>('[data-page]'));
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [PW, PH] });
      for (let i = 0; i < pages.length; i++) {
        const svgUrl = await toSvg(pages[i], { width: PW, height: PH, style: { transform: 'none' } });
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('page render failed'));
          img.src = svgUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = PW * 2; // 2x for crisp print
        canvas.height = PH * 2;
        canvas.getContext('2d')!.drawImage(img, 0, 0, PW * 2, PH * 2);
        if (i > 0) pdf.addPage([PW, PH], 'portrait');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, PW, PH);
      }
      pdf.save(`tac-block-overview-${todayIso()}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const { streams } = model;
  const span = {
    from: streams.reduce((min, s) => (s.from < min ? s.from : min), streams[0].from),
    to: streams.reduce((max, s) => (s.to > max ? s.to : max), streams[0].to),
  };

  const page = 'relative mx-auto shrink-0 overflow-hidden shadow-xl';

  return (
    <div className="min-h-screen bg-black py-8" style={{ fontFamily: 'Mulish, sans-serif' }}>
      <div className="fixed top-4 right-4 z-10 flex gap-2">
        <button
          type="button"
          disabled={exporting}
          onClick={exportPdf}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/programming')}
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
        >
          Close
        </button>
      </div>

      <div ref={pagesRef} className="flex flex-col items-center gap-8">
        {/* Cover */}
        <div data-page className={page} style={{ width: PW, height: PH, backgroundColor: CHARCOAL }}>
          <div className="flex h-full flex-col px-14 py-16">
            <p className="text-[13px] font-bold tracking-[0.45em]" style={{ color: SAND }}>
              TENERIFFE ATHLETIC CLUB
            </p>
            <h1 className="mt-6 text-[54px] leading-[1.05]" style={{ fontFamily: 'Fraunces, serif', color: CREAM }}>
              Block overview
            </h1>
            <p className="mt-2 text-[17px] font-semibold" style={{ color: SAND }}>
              {fmt(span.from)} to week of {fmt(span.to)}
            </p>
            <div className="mt-12 space-y-6">
              {streams.map(({ stream, block, from, to, written, total }) => (
                <div key={stream.id} className="border-l-4 pl-5" style={{ borderColor: SAND }}>
                  <p className="text-[20px] font-bold" style={{ fontFamily: 'Fraunces, serif', color: CREAM }}>
                    {stream.name}
                    <span className="ml-3 text-[15px] font-semibold" style={{ color: SAND }}>
                      {block.theme ?? ''}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-white/60">
                    {fmt(from)} to week of {fmt(to)} · {block.weeks.length} weeks · {written} of {total} sessions written
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-auto">
              <p className="text-[15px] italic" style={{ fontFamily: 'Fraunces, serif', color: SAND }}>
                Train better, live better.
              </p>
              <p className="mt-2 text-[11px] font-semibold tracking-[0.28em] text-white/35 uppercase">
                76 Commercial Road, Teneriffe · prepared {fmt(model.generated)} · for coaches
              </p>
            </div>
          </div>
        </div>

        {/* One page per stream */}
        {streams.map(({ stream, block, weekStarts, focusLine, dayOf }) => (
          <div key={stream.id} data-page className={page} style={{ width: PW, height: PH, backgroundColor: CREAM }}>
            <div className="flex h-full flex-col px-12 py-12">
              <header className="border-b-2 pb-4" style={{ borderColor: PINE }}>
                <p className="text-[10px] font-bold tracking-[0.4em] uppercase" style={{ color: PINE }}>
                  Teneriffe Athletic Club · Block overview
                </p>
                <h2 className="mt-1 text-[32px]" style={{ fontFamily: 'Fraunces, serif', color: CHARCOAL }}>
                  {stream.name}
                  {block.theme ? <span style={{ color: PINE }}> · {block.theme}</span> : null}
                </h2>
                <p className="mt-1 text-[12px] font-semibold" style={{ color: PINE }}>
                  {fmt(weekStarts[0])} to week of {fmt(weekStarts[weekStarts.length - 1])}
                  {[...dayOf.entries()]
                    .filter(([, d]) => d)
                    .map(([f, d]) => ` · ${FOCUS_LABEL[f as SessionFocus]}: ${d}s`)
                    .join('')}
                </p>
                {focusLine && (
                  <p className="mt-2 text-[13px] leading-snug italic" style={{ color: CHARCOAL }}>
                    {focusLine}
                  </p>
                )}
              </header>

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-hidden">
                {block.weeks.map((week, wi) => {
                  const sessions = week.sessions.filter(sessionWritten);
                  return (
                    <div key={week.id} className="flex gap-3 border-b border-black/10 pb-2">
                      <div className="w-20 shrink-0 pt-0.5">
                        <p className="text-[13px] font-extrabold" style={{ color: PINE }}>
                          W{wi + 1}
                        </p>
                        <p className="text-[11px] font-semibold text-black/45">{fmt(weekStarts[wi])}</p>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        {sessions.length === 0 ? (
                          <p className="text-[12px] text-black/40 italic">
                            {week.sessions[0]?.intent ?? 'Not written yet'}
                          </p>
                        ) : (
                          sessions.map((s) => (
                            <p key={s.id} className="text-[12px] leading-snug" style={{ color: CHARCOAL }}>
                              <span className="font-bold" style={{ color: PINE }}>
                                {sessionLabel(s)}
                                {dayOf.get(s.focus) ? ` (${dayOf.get(s.focus)?.slice(0, 3)})` : ''}
                                {': '}
                              </span>
                              {summaryLine(s)}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <footer className="mt-3 border-t pt-3" style={{ borderColor: SAND }}>
                <p className="text-[10.5px] leading-snug text-black/55">
                  Full sessions, loads, cues and scaled options live in the coaching tool under Programming; the wall
                  boards come from each session's TV output. Nothing in this overview is published to members.
                </p>
              </footer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
