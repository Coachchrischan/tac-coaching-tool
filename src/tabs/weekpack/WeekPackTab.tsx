import { useMemo, useState } from 'react';
import { sessionWritten } from '../../lib/prescription';
import { useNavigate } from 'react-router-dom';
import { useDoc } from '../../lib/useDoc';
import {
  FOCUS_LABEL,
  STREAM_DEFS,
  focusDef,
} from '../../lib/focusCatalog';
import { streamsOf, withStreamBlocks } from '../../lib/programStreams';
import { resolveWeekDays } from '../../lib/classDays';
import { isoDate, todayIso, trainingWeekMonday } from '../../lib/trainingWeeks';
import { findWeek, mondayOf, streamWeeks } from '../../lib/weekIndex';
import { parseConditioningPaste, type ParsedSession } from '../../lib/conditioningPaste';
import type { ProgramDoc, Session, SessionFocus, TimedBlock } from '../../types/documents';

// The Week Pack tab: one week of the club's programming, seen whole, and the
// one button that turns it into a folder for the coaches.
//
// The week Chris runs is six classes across four streams, and until now no
// screen showed them together: Programming shows one stream at a time, Home
// shows the live week's readiness. This tab is the week itself, in day order,
// and the place a whole microcycle of conditioning gets typed in at once.

/** The club's week, in the order the classes run. */
const WEEK: { focus: SessionFocus; streamId: string }[] = [
  { focus: 'cond-mon', streamId: 'esd' },
  { focus: 'upper', streamId: 'strength' },
  { focus: 'cond-wed', streamId: 'esd' },
  { focus: 'lower', streamId: 'strength' },
  { focus: 'cond-fri', streamId: 'esd' },
  { focus: 'full', streamId: 'strength' },
  { focus: 'gameday', streamId: 'gameday' },
];

/** One strength day as /api/th-pull reports it. */
interface PullDay {
  focus: SessionFocus;
  date: string | null;
  found?: boolean;
  skipped?: string;
  title?: string;
  sessionId?: string | null;
  timedBlocks?: TimedBlock[];
  theirs?: string[];
  mine?: string[];
}

const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const fmtLong = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

export default function WeekPackTab() {
  const navigate = useNavigate();
  const program = useDoc('program');
  const annual = useDoc('annual-plan');
  const schedule = useDoc('schedule');

  const [paste, setPaste] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [packName, setPackName] = useState('');
  const [building, setBuilding] = useState(false);
  const [packMsg, setPackMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pull, setPull] = useState<PullDay[] | null>(null);
  const [pullErr, setPullErr] = useState<string | null>(null);

  const startDate = annual.data?.startDate ?? '2026-08-24';
  const breaks = useMemo(() => annual.data?.breaks ?? [], [annual.data]);

  // The week on screen. Defaults to the one containing today.
  const [monday, setMonday] = useState<string | null>(null);
  const currentMonday = monday ?? mondayOf(todayIso(), startDate, breaks);

  /** Every Monday the plan runs, so the picker cannot land off the grid. */
  const mondays = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 60; i++) out.push(isoDate(trainingWeekMonday(startDate, i, breaks)));
    return out;
  }, [startDate, breaks]);

  const model = useMemo(() => {
    if (!program.data || !schedule.data) return null;
    const streams = streamsOf(program.data);
    const resolved = resolveWeekDays(schedule.data, currentMonday, WEEK.map((w) => w.focus));

    const rows = WEEK.map((entry, i) => {
      const stream = streams.find((s) => s.id === entry.streamId);
      const ref = stream ? findWeek(stream, startDate, breaks, currentMonday) : null;
      const week = stream && ref ? stream.blocks[ref.blockIndex].weeks[ref.weekIndex] : null;
      const session = week?.sessions.find((s) => s.focus === entry.focus);
      const day = resolved.days[i];
      return {
        ...entry,
        streamName: STREAM_DEFS.find((s) => s.id === entry.streamId)?.name ?? entry.streamId,
        label: FOCUS_LABEL[entry.focus],
        day,
        ref,
        session,
        written: sessionWritten(session),
      };
    });
    return { rows, written: rows.filter((r) => r.written).length };
  }, [program.data, schedule.data, currentMonday, startDate, breaks]);

  const parsed = useMemo(() => (paste.trim() ? parseConditioningPaste(paste, 'paste') : []), [paste]);

  /**
   * Put the parsed sessions into the program document, each in the calendar
   * week its pack week maps onto: the first pack week lands on the week on
   * screen, the second on the next one, and so on. A session replaces the one
   * already carrying that focus, so importing twice is not additive.
   */
  function importParsed() {
    if (!program.data || parsed.length === 0) return;
    const weekNumbers = [...new Set(parsed.map((p) => p.weekNumber ?? 1))].sort((a, b) => a - b);
    const firstWeek = weekNumbers[0];

    let placed = 0;
    const skipped: string[] = [];

    program.update((doc: ProgramDoc) => {
      let next = doc;
      for (const item of parsed) {
        const focus = item.focus;
        if (!focus) {
          skipped.push(`${item.heading}: no class runs that day`);
          continue;
        }
        const streamId = STREAM_DEFS.find((s) => s.focuses.includes(focus))?.id;
        const streams = streamsOf(next);
        const streamIndex = streams.findIndex((s) => s.id === streamId);
        if (streamIndex < 0) {
          skipped.push(`${item.heading}: no ${streamId} stream`);
          continue;
        }
        const stream = streams[streamIndex];

        // Pack week 1 goes to the week on screen; week 2 to the one after it.
        const offset = (item.weekNumber ?? firstWeek) - firstWeek;
        const all = streamWeeks(stream, startDate, breaks);
        const start = all.findIndex((w) => isoDate(w.monday) === currentMonday);
        const target = start < 0 ? null : all[start + offset];
        if (!target) {
          skipped.push(`${item.heading}: that week is outside the ${stream.name} plan`);
          continue;
        }

        const blocks = stream.blocks.map((b, bi) =>
          bi !== target.blockIndex
            ? b
            : {
                ...b,
                weeks: b.weeks.map((w, wi) => {
                  if (wi !== target.weekIndex) return w;
                  // Keep the session's own id stable where one already exists,
                  // so the TV board's address does not change under the coach.
                  const existing = w.sessions.find((s) => s.focus === focus);
                  const session = { ...item.session, id: existing?.id ?? item.session.id };
                  const sessions = existing
                    ? w.sessions.map((s) => (s.focus === focus ? session : s))
                    : [...w.sessions, session];
                  return { ...w, sessions };
                }),
              },
        );
        next = withStreamBlocks(next, streamIndex, blocks);
        placed++;
      }
      return next;
    });

    setImportMsg(
      [
        `${placed} session${placed === 1 ? '' : 's'} imported from ${weekNumbers.length} week${weekNumbers.length === 1 ? '' : 's'}, starting the week of ${fmt(new Date(currentMonday + 'T00:00:00'))}.`,
        ...skipped.map((s) => `Skipped ${s}.`),
      ].join(' '),
    );
    setPaste('');
  }

  /**
   * Build the folder. The dev server does the work: it renders the app's own
   * board and card routes in headless Chrome, which the browser cannot do to
   * itself. Everything unwritten is named in the result rather than skipped
   * quietly.
   */
  async function buildPack() {
    setBuilding(true);
    setPackMsg(null);
    try {
      const res = await fetch('/api/week-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monday: currentMonday, name: packName.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPackMsg({ ok: false, text: body.error ?? `Build failed (${res.status})` });
        return;
      }
      setPackMsg({ ok: true, text: body.output || 'Built.' });
    } catch (err) {
      setPackMsg({ ok: false, text: String(err) });
    } finally {
      setBuilding(false);
    }
  }

  /** Read TrainHeroic for this week. Reads only; nothing is written yet. */
  async function pullFromTrainHeroic() {
    setPulling(true);
    setPullErr(null);
    setPull(null);
    try {
      const res = await fetch('/api/th-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monday: currentMonday }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPullErr(body.error ?? `Pull failed (${res.status})`);
        return;
      }
      setPull(body.days as PullDay[]);
    } catch (err) {
      setPullErr(String(err));
    } finally {
      setPulling(false);
    }
  }

  /** Write what TrainHeroic returned into the programming, his click. */
  function applyPull() {
    if (!pull) return;
    const applied: string[] = [];
    program.update((doc: ProgramDoc) => {
      let next = doc;
      for (const day of pull) {
        if (!day.found || !day.timedBlocks?.length) continue;
        const streamId = STREAM_DEFS.find((s) => s.focuses.includes(day.focus))?.id;
        const streams = streamsOf(next);
        const streamIndex = streams.findIndex((s) => s.id === streamId);
        if (streamIndex < 0) continue;
        const stream = streams[streamIndex];
        const ref = findWeek(stream, startDate, breaks, currentMonday);
        if (!ref) continue;

        const blocks = stream.blocks.map((b, bi) =>
          bi !== ref.blockIndex
            ? b
            : {
                ...b,
                weeks: b.weeks.map((w, wi) => {
                  if (wi !== ref.weekIndex) return w;
                  const existing = w.sessions.find((s) => s.focus === day.focus);
                  // Keep everything the wall and the card carry that
                  // TrainHeroic does not hold: the intent, the coach note,
                  // the member description. Only the work is replaced.
                  const session: Session =
                    existing && existing.kind === 'series'
                      ? { ...existing, timedBlocks: day.timedBlocks! }
                      : {
                          id: existing?.id ?? `th-${day.focus}-${currentMonday}`,
                          focus: day.focus,
                          kind: 'series',
                          timedBlocks: day.timedBlocks!,
                        };
                  const sessions = existing
                    ? w.sessions.map((s) => (s.focus === day.focus ? session : s))
                    : [...w.sessions, session];
                  return { ...w, sessions };
                }),
              },
        );
        next = withStreamBlocks(next, streamIndex, blocks);
        applied.push(FOCUS_LABEL[day.focus]);
      }
      return next;
    });
    setPullErr(null);
    setPull(null);
    setImportMsg(
      applied.length
        ? `Updated ${applied.join(', ')} from TrainHeroic. The intent, coach note and member description were kept.`
        : 'Nothing to update.',
    );
  }

  if (!model) return <p className="text-ink-500">Loading…</p>;

  const mondayIndex = mondays.indexOf(currentMonday);
  const weekDate = new Date(currentMonday + 'T00:00:00');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">Week pack</h2>
          <p className="mt-1 text-sm text-ink-500">
            The club's week in one place, and the folder the coaches get: every board, a coaching
            card each, and the whole week as text.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={mondayIndex <= 0}
            onClick={() => setMonday(mondays[mondayIndex - 1])}
            className="rounded-md border border-ink-200 px-2.5 py-1.5 text-sm disabled:opacity-40"
          >
            ‹
          </button>
          <span className="min-w-[13rem] text-center text-sm font-semibold">
            Week of {fmtLong(weekDate)}
          </span>
          <button
            type="button"
            disabled={mondayIndex < 0 || mondayIndex >= mondays.length - 1}
            onClick={() => setMonday(mondays[mondayIndex + 1])}
            className="rounded-md border border-ink-200 px-2.5 py-1.5 text-sm disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-bold tracking-[0.18em] text-ink-500 uppercase">
            <tr>
              <th className="px-4 py-2.5">Day</th>
              <th className="px-4 py-2.5">Class</th>
              <th className="px-4 py-2.5">Stream</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.focus} className="border-b border-ink-100 last:border-0">
                <td className="px-4 py-2.5 font-semibold">
                  {row.day.dayName ?? '—'}
                  {row.day.date && (
                    <span className="ml-2 font-normal text-ink-400">
                      {fmt(new Date(row.day.date + 'T00:00:00'))}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">{row.label}</td>
                <td className="px-4 py-2.5 text-ink-500">{row.streamName}</td>
                <td className="px-4 py-2.5">
                  {!row.day.dayName ? (
                    <span className="text-amber-700">
                      No {focusDef(row.focus).classTypeId} class on the timetable
                    </span>
                  ) : !row.ref ? (
                    <span className="text-amber-700">This week is outside the {row.streamName} plan</span>
                  ) : row.written ? (
                    <span className="text-accent-600">Written</span>
                  ) : (
                    <span className="text-ink-400">Not written</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {row.session && row.written && (
                    <button
                      type="button"
                      onClick={() => navigate(`/tv/${row.session!.id}`)}
                      className="rounded-md border border-ink-200 px-2 py-1 text-xs font-medium hover:bg-ink-50"
                    >
                      TV board
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-ink-100 px-4 py-2.5 text-xs text-ink-500">
          {model.written} of {model.rows.length} classes written this week.
        </p>
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg">Pull strength from TrainHeroic</h3>
            <p className="mt-1 text-sm text-ink-500">
              Reads the team calendar for this week's strength days and shows what is there against
              what the tool holds. Nothing is written until you say so.
            </p>
          </div>
          <button
            type="button"
            disabled={pulling}
            onClick={pullFromTrainHeroic}
            className="rounded-md border border-ink-200 px-3 py-2 text-sm font-medium hover:bg-ink-50 disabled:opacity-40"
          >
            {pulling ? 'Reading…' : 'Pull from TrainHeroic'}
          </button>
        </div>

        {pullErr && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {pullErr}
          </p>
        )}

        {pull && (
          <div className="mt-3 space-y-3">
            {pull.map((day) => (
              <div key={day.focus} className="rounded-lg border border-ink-200 p-3">
                <p className="text-sm font-semibold">
                  {FOCUS_LABEL[day.focus]}
                  {day.date && <span className="ml-2 font-normal text-ink-400">{day.date}</span>}
                </p>
                {day.skipped && <p className="text-sm text-ink-400">{day.skipped}</p>}
                {day.found === false && (
                  <p className="text-sm text-ink-400">Nothing in TrainHeroic on that day.</p>
                )}
                {day.found && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.18em] text-ink-500 uppercase">
                        In the tool
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-700">
                        {day.mine?.length ? (
                          day.mine.map((l, i) => <li key={i}>{l}</li>)
                        ) : (
                          <li className="text-ink-400">nothing written</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.18em] text-ink-500 uppercase">
                        In TrainHeroic
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-700">
                        {day.theirs?.map((l, i) => (
                          <li
                            key={i}
                            className={day.mine?.includes(l) ? '' : 'font-semibold text-accent-600'}
                          >
                            {l}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {pull.some((d) => d.found) && (
              <button
                type="button"
                onClick={applyPull}
                className="rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-ink-50"
              >
                Update the programming from TrainHeroic
              </button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-5">
        <h3 className="font-display text-lg">Build the folder</h3>
        <p className="mt-1 text-sm text-ink-500">
          One folder for the coaches: every board as a picture, a coaching card each, and the whole
          week as text. It writes into <code>TAC/programming/weeks/</code>. Anything not written
          yet is named in the folder rather than left out quietly.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            placeholder={`Week ${mondayIndex + 1} Class Programming`}
            className="min-w-[18rem] flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={building || model.written === 0}
            onClick={buildPack}
            className="rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-ink-50 disabled:opacity-40"
          >
            {building ? 'Building…' : 'Build the pack'}
          </button>
        </div>
        {model.written === 0 && (
          <p className="mt-2 text-sm text-amber-700">Nothing is written this week yet.</p>
        )}
        {packMsg && (
          <pre
            className={`mt-3 overflow-x-auto rounded-lg border p-3 text-xs ${
              packMsg.ok ? 'border-ink-200 bg-ink-50 text-ink-700' : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            {packMsg.text}
          </pre>
        )}
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-5">
        <h3 className="font-display text-lg">Paste conditioning</h3>
        <p className="mt-1 text-sm text-ink-500">
          Paste a session or a whole microcycle from the conditioning pack. Week 1 of what you paste
          lands on the week above, week 2 on the one after it. Importing again replaces, it does not
          double up.
        </p>
        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setImportMsg(null);
          }}
          rows={7}
          placeholder={'WEEK 1 · MONDAY\n\nSESSION INTENT\n  ...\n\nWARM UP · 8 MIN · WITH COACH\n  Rower easy\n      3 min'}
          className="mt-3 w-full rounded-lg border border-ink-200 p-3 font-mono text-xs"
        />

        {parsed.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">
              {parsed.length} session{parsed.length === 1 ? '' : 's'} found
            </p>
            <ul className="space-y-1 text-sm">
              {parsed.map((p: ParsedSession, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-ink-700">
                  <span className="font-semibold">{p.heading}</span>
                  <span className="text-ink-400">
                    {p.focus ? FOCUS_LABEL[p.focus] : 'no class that day'} ·{' '}
                    {p.session.circuit.length} part{p.session.circuit.length === 1 ? '' : 's'}
                  </span>
                  {p.variant && <span className="text-ink-400">{p.variant}</span>}
                  {p.warnings.map((w, wi) => (
                    <span key={wi} className="text-amber-700">
                      {w}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={importParsed}
              className="mt-2 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-ink-50"
            >
              Import {parsed.length} session{parsed.length === 1 ? '' : 's'}
            </button>
          </div>
        )}

        {importMsg && <p className="mt-3 text-sm text-accent-600">{importMsg}</p>}
      </section>
    </div>
  );
}
