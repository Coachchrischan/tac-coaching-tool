import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import { localIso } from '../../lib/attendancePeriods';
import {
  MEETING_SECTIONS,
  attendanceWindow,
  autoValue,
  krProgress,
  meetingsFor,
  newAction,
  newKeyResult,
  newMeeting,
  newObjective,
  previousMeeting,
  sectionTitle,
  sortDump,
  type AttendanceWindow,
} from '../../lib/meetings';
import type { Meeting, MeetingKeyResult, MeetingObjective } from '../../types/documents';

// Coach meetings: one OKR check-in per class, reusable meeting to meeting.
// The page doubles as the printout (Print / PDF), so the screen-only controls
// carry print:hidden and the notes grow to fit rather than scroll.

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-accent-600 focus:outline-none';
const cell =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-950 hover:border-ink-200 focus:border-accent-600 focus:bg-white focus:outline-none';

function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', opts);
}

const one = (n: number | null) => (n == null ? '–' : (Math.round(n * 10) / 10).toString());

/** A textarea that grows with its content, so nothing hides in print. */
function Notes({
  value,
  onChange,
  placeholder,
  minRows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const rows = Math.max(minRows, value.split('\n').length + 1);
  return (
    <textarea
      className={`${field} w-full resize-y leading-relaxed`}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function numIn(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function MeetingsTab() {
  const meetingsDoc = useDoc('meetings');
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const [params, setParams] = useSearchParams();
  const [newDate, setNewDate] = useState(localIso(new Date()));
  const [dumpMsg, setDumpMsg] = useState('');

  if (!meetingsDoc.data || !attendance.data || !schedule.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  const classTypes = schedule.data.classTypes;
  const all = meetingsDoc.data.meetings;
  const classId = params.get('class') ?? all[0]?.classTypeId ?? 'hyrox';
  const list = meetingsFor(all, classId);
  const meeting = list.find((m) => m.id === params.get('m')) ?? list[0];
  const prev = meeting ? previousMeeting(all, meeting) : undefined;
  const className = classTypes.find((c) => c.id === classId)?.name ?? classId;

  const pick = (cls: string, m?: string) => {
    const next: Record<string, string> = { class: cls };
    if (m) next.m = m;
    setParams(next);
  };

  function patch(fn: (m: Meeting) => Meeting) {
    if (!meeting) return;
    meetingsDoc.update((d) => ({
      ...d,
      meetings: d.meetings.map((m) => (m.id === meeting.id ? fn(m) : m)),
    }));
  }

  function startMeeting() {
    const before = meetingsFor(all, classId).find((m) => m.date <= newDate);
    const m = newMeeting(classId, newDate, before);
    meetingsDoc.update((d) => ({ ...d, meetings: [...d.meetings, m] }));
    pick(classId, m.id);
  }

  function deleteMeeting() {
    if (!meeting) return;
    if (!window.confirm(`Delete the ${className} meeting on ${fmtDate(meeting.date)}? Its notes go with it.`)) return;
    meetingsDoc.update((d) => ({ ...d, meetings: d.meetings.filter((m) => m.id !== meeting.id) }));
    pick(classId);
  }

  const win = meeting
    ? attendanceWindow(attendance.data.entries, schedule.data, classId, meeting.date)
    : null;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl text-ink-950">Coach meetings</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            One OKR check-in per class. Each new meeting brings forward the objectives and open
            actions from last time, shows last time's notes beside each topic, and reads attendance
            for the eight weeks before the meeting.
          </p>
        </div>
        <SaveBadge
          state={meetingsDoc.saveState}
          conflictInfo={meetingsDoc.conflictInfo}
          onReloadTheirs={meetingsDoc.reloadTheirs}
          onKeepMine={meetingsDoc.keepMine}
          onRetry={meetingsDoc.retry}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white p-3 print:hidden">
        <select className={field} value={classId} onChange={(e) => pick(e.target.value)}>
          {classTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {meetingsFor(all, c.id).length ? ` (${meetingsFor(all, c.id).length})` : ''}
            </option>
          ))}
        </select>
        {list.length > 0 && (
          <select
            className={field}
            value={meeting?.id}
            onChange={(e) => pick(classId, e.target.value)}
          >
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {fmtDate(m.date)} · {m.period}
              </option>
            ))}
          </select>
        )}
        <span className="mx-1 h-6 w-px bg-ink-200" />
        <input
          type="date"
          className={field}
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <button
          type="button"
          onClick={startMeeting}
          className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700"
        >
          New {className} meeting
        </button>
        <div className="flex-1" />
        {meeting && (
          <>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={deleteMeeting}
              className="rounded-md px-2 py-1.5 text-sm text-ink-400 hover:text-red-700"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {!meeting || !win ? (
        <p className="rounded-lg border border-dashed border-ink-300 bg-white px-6 py-12 text-center text-sm text-ink-500">
          No {className} meetings yet. Pick a date above and start one.
        </p>
      ) : (
        <article className="space-y-6">
          <MeetingHeader meeting={meeting} className={className} prev={prev} patch={patch} />
          <Snapshot win={win} />
          <Objectives meeting={meeting} prev={prev} win={win} patch={patch} />
          <Actions meeting={meeting} patch={patch} />

          <section>
            <SectionHead n={4} title="Agenda" sub="Notes for each topic. Last meeting's notes sit underneath for reference." />
            <div className="grid gap-4 md:grid-cols-2 print:grid-cols-1">
              {MEETING_SECTIONS.map((s) => (
                <div key={s.id} className="break-inside-avoid rounded-lg border border-ink-200 bg-white p-4">
                  <h3 className="mb-1 text-[13px] font-bold tracking-wide text-accent-600 uppercase">
                    {s.title}
                  </h3>
                  <ul className="mb-2 list-disc pl-4 text-[12px] text-ink-500">
                    {s.prompts.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <Notes
                    value={meeting.notes[s.id] ?? ''}
                    onChange={(v) => patch((m) => ({ ...m, notes: { ...m.notes, [s.id]: v } }))}
                  />
                  {prev?.notes[s.id] && (
                    <details className="mt-2 text-[12px] text-ink-500 print:hidden">
                      <summary className="cursor-pointer">Last time ({fmtDate(prev.date)})</summary>
                      <p className="mt-1 whitespace-pre-wrap rounded bg-ink-50 p-2">{prev.notes[s.id]}</p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 print:grid-cols-1">
            <div className="rounded-lg border border-ink-200 bg-white p-4 print:hidden">
              <h3 className="mb-1 text-[13px] font-bold tracking-wide text-accent-600 uppercase">
                Brain dump
              </h3>
              <p className="mb-2 text-[12px] text-ink-500">
                Type anything, one point per line. Start a line with a topic (<code>events:</code>,{' '}
                <code>marketing:</code>, <code>admin:</code>…) or just write it, then sort: lines
                that mention a topic move into it, the rest stay here.
              </p>
              <Notes
                value={meeting.dump}
                onChange={(v) => patch((m) => ({ ...m, dump: v }))}
                minRows={5}
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={!meeting.dump.trim()}
                  onClick={() => {
                    const r = sortDump(meeting.dump, meeting.notes);
                    patch((m) => ({ ...m, notes: r.notes, dump: r.leftover }));
                    setDumpMsg(
                      `${r.moved} line${r.moved === 1 ? '' : 's'} sorted` +
                        (r.leftover ? ', the rest need a home' : ''),
                    );
                  }}
                  className="rounded-md border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-40"
                >
                  Sort into topics
                </button>
                <span className="text-[12px] text-ink-500">{dumpMsg}</span>
              </div>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <h3 className="mb-2 text-[13px] font-bold tracking-wide text-accent-600 uppercase">
                Decisions
              </h3>
              <Notes
                value={meeting.decisions}
                onChange={(v) => patch((m) => ({ ...m, decisions: v }))}
                placeholder="What we agreed, so nobody has to remember it."
                minRows={5}
              />
            </div>
          </section>
        </article>
      )}
    </div>
  );
}

function SectionHead({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div className="mb-3 flex break-after-avoid items-baseline gap-3 border-b-2 border-accent-600 pb-1.5">
      <span className="font-display text-lg text-sand-600">{String(n).padStart(2, '0')}</span>
      <h2 className="font-display text-xl text-ink-950">{title}</h2>
      {sub && <span className="text-[12px] text-ink-500">{sub}</span>}
    </div>
  );
}

function MeetingHeader({
  meeting,
  className,
  prev,
  patch,
}: {
  meeting: Meeting;
  className: string;
  prev?: Meeting;
  patch: (fn: (m: Meeting) => Meeting) => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-5 rounded-lg bg-accent-600 px-6 py-5 text-white print:rounded-none">
      <img src="/brand/tac-landscape-white.png" alt="Teneriffe Athletic Club" className="h-12 w-auto" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-sand-500 uppercase">
          Teneriffe Athletic Club · Coach meeting · {meeting.period}
        </p>
        <h1 className="font-display text-3xl leading-tight">{className}</h1>
        <p className="mt-0.5 text-sm text-white/80">
          {fmtDate(meeting.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {prev ? ` · follows ${fmtDate(prev.date)}` : ' · first meeting'}
        </p>
      </div>
      <label className="w-full text-[12px] text-white/80 sm:w-72 print:w-60">
        Attendees
        <input
          className="mt-1 w-full rounded-md border border-white/30 bg-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none"
          value={meeting.attendees}
          placeholder="Who is in the room"
          onChange={(e) => patch((m) => ({ ...m, attendees: e.target.value }))}
        />
      </label>
    </header>
  );
}

// ---------- 01 Attendance snapshot ----------

function Snapshot({ win }: { win: AttendanceWindow }) {
  const full = win.weeks.filter((w) => !w.partWeek);
  const recorded = full.filter((w) => w.count != null);
  const part = win.weeks.find((w) => w.partWeek);
  const change =
    win.avgWeek != null && win.prevAvgWeek != null && win.prevAvgWeek > 0
      ? (win.avgWeek - win.prevAvgWeek) / win.prevAvgWeek
      : null;
  const first = full[0].monday;
  const last = full[full.length - 1].monday;
  return (
    <section className="break-inside-avoid">
      <SectionHead
        n={1}
        title="Attendance snapshot"
        sub={`Weeks of ${fmtDate(first, { day: 'numeric', month: 'short' })} to ${fmtDate(last, { day: 'numeric', month: 'short' })}${part ? ', plus this week so far' : ''}`}
      />
      {win.seeded && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          ⚠ Demo data in this window. Do not quote these numbers.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
        <Tile label="Check-ins per week" value={one(win.avgWeek)} note={`${recorded.length} of 8 weeks recorded`} />
        <Tile label="Check-ins per class" value={one(win.avgSession)} note={`${win.sessionsPerWeek} classes a week`} />
        <Tile
          label="vs the 8 weeks before"
          value={change == null ? '–' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`}
          note={change == null ? 'No earlier data yet' : `was ${one(win.prevAvgWeek)} a week`}
        />
        <Tile
          label="Latest week"
          value={one(recorded.at(-1)?.count ?? null)}
          note={recorded.length ? `week of ${fmtDate(recorded.at(-1)!.monday, { day: 'numeric', month: 'short' })}` : 'Nothing recorded'}
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[3fr_2fr] print:grid-cols-[3fr_2fr]">
        <WeekBars win={win} />
        <SlotTable win={win} />
      </div>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
      <div className="text-[12px] text-ink-500">{label}</div>
      <div className="font-display text-3xl text-ink-950">{value}</div>
      <div className="text-[12px] text-ink-400">{note}</div>
    </div>
  );
}

function WeekBars({ win }: { win: AttendanceWindow }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const pad = { l: 30, r: 8, t: 16, b: 26 };
  const max = Math.max(5, ...win.weeks.map((w) => w.count ?? 0));
  const step = (W - pad.l - pad.r) / win.weeks.length;
  const bw = Math.min(44, step - 10);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3">
      <div className="mb-1 text-[13px] font-semibold text-ink-800">Check-ins per week</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Check-ins per week, last eight weeks">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eae7dc" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8a867c">
              {t}
            </text>
          </g>
        ))}
        {win.weeks.map((w, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const label = new Date(`${w.monday}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
          return (
            <g key={w.monday} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
              {w.count == null ? (
                <text x={x + bw / 2} y={H - pad.b - 6} textAnchor="middle" fontSize="10" fill="#bbb8ac">
                  no data
                </text>
              ) : (
                <path
                  d={barPath(x, y(w.count), bw, H - pad.b)}
                  fill={w.estimated ? '#c5a683' : '#003030'}
                  fillOpacity={w.partWeek ? 0.45 : 1}
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )}
              {w.count != null && (hover === i || i === win.weeks.length - 1 || hover == null) && (
                <text x={x + bw / 2} y={y(w.count) - 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#292626">
                  {w.count}
                  {w.estimated ? '*' : ''}
                </text>
              )}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#5a5a52">
                {w.partWeek ? 'so far' : label}
              </text>
            </g>
          );
        })}
      </svg>
      {win.weeks.some((w) => w.estimated) && (
        <p className="text-[11px] text-ink-400">* estimated from a monthly total</p>
      )}
    </div>
  );
}

/** A bar with 4px rounded top corners anchored to the baseline. */
function barPath(x: number, top: number, w: number, base: number) {
  const r = Math.min(4, (base - top) / 2, w / 2);
  if (base - top <= 0) return '';
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

function SlotTable({ win }: { win: AttendanceWindow }) {
  if (win.slots.length === 0) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-3 text-[13px] text-ink-500">
        No per-session numbers for these weeks. Loading the weekly Class Summary report fills this in.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3">
      <div className="mb-1 text-[13px] font-semibold text-ink-800">By session</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-ink-500">
            <th className="py-1 font-medium">Session</th>
            <th className="py-1 font-medium">Weeks, oldest first</th>
            <th className="py-1 text-right font-medium">Avg</th>
          </tr>
        </thead>
        <tbody>
          {win.slots.map((s) => {
            const low = s.avg < 5;
            return (
              <tr key={s.label} className="border-t border-ink-100">
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <b>{s.label}</b> {s.coach && <span className="text-ink-400">{s.coach}</span>}
                </td>
                <td className="py-1.5 text-ink-500 tabular-nums">{s.counts.join(' · ')}</td>
                <td className="py-1.5 text-right font-bold tabular-nums whitespace-nowrap">
                  {low && (
                    <span className="mr-1.5 rounded bg-red-50 px-1 py-0.5 text-[10px] font-semibold text-red-800">
                      ▼ low
                    </span>
                  )}
                  {one(s.avg)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- 02 Objectives and key results ----------

function Objectives({
  meeting,
  prev,
  win,
  patch,
}: {
  meeting: Meeting;
  prev?: Meeting;
  win: AttendanceWindow;
  patch: (fn: (m: Meeting) => Meeting) => void;
}) {
  const [section, setSection] = useState(MEETING_SECTIONS[3].id);
  const setObj = (id: string, fn: (o: MeetingObjective) => MeetingObjective) =>
    patch((m) => ({ ...m, objectives: m.objectives.map((o) => (o.id === id ? fn(o) : o)) }));
  const setKr = (oid: string, kid: string, fn: (k: MeetingKeyResult) => MeetingKeyResult) =>
    setObj(oid, (o) => ({ ...o, keyResults: o.keyResults.map((k) => (k.id === kid ? fn(k) : k)) }));
  const prevKr = (kid: string) =>
    prev?.objectives.flatMap((o) => o.keyResults).find((k) => k.id === kid);

  return (
    <section>
      <SectionHead
        n={2}
        title={`Objectives and key results · ${meeting.period}`}
        sub="1 to 3 objectives, 2 to 4 measurable results each. 70% of a stretch target is a good quarter."
      />
      <div className="space-y-3">
        {meeting.objectives.length === 0 && (
          <p className="rounded-lg border border-dashed border-ink-300 bg-white px-4 py-6 text-center text-sm text-ink-500">
            No objectives yet. An objective is where you want the class to be; key results are the
            numbers that prove it.
          </p>
        )}
        {meeting.objectives.map((o, oi) => (
          <div key={o.id} className="break-inside-avoid rounded-lg border border-ink-200 bg-white p-4">
            <div className="mb-2 flex items-start gap-2">
              <span className="font-display mt-1 text-lg text-sand-600">O{oi + 1}</span>
              <div className="flex-1">
                <input
                  className={`${cell} font-display !text-lg`}
                  value={o.text}
                  placeholder="Objective: where do we want this class to be?"
                  onChange={(e) => setObj(o.id, (x) => ({ ...x, text: e.target.value }))}
                />
                <div className="mt-0.5 px-1.5 text-[11px] font-semibold tracking-wide text-accent-500 uppercase">
                  {sectionTitle(o.sectionId)}
                </div>
              </div>
              <button
                type="button"
                className="text-[12px] text-ink-400 hover:text-red-700 print:hidden"
                onClick={() => patch((m) => ({ ...m, objectives: m.objectives.filter((x) => x.id !== o.id) }))}
              >
                Remove
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-ink-500">
                  <th className="w-[40%] px-1.5 font-medium">Key result</th>
                  <th className="px-1.5 text-right font-medium">Start</th>
                  <th className="px-1.5 text-right font-medium">Now</th>
                  <th className="px-1.5 text-right font-medium">Target</th>
                  <th className="px-1.5 font-medium">Progress</th>
                  <th className="px-1.5 text-right font-medium" title="How sure are we of hitting it, 1 to 10">
                    Confidence
                  </th>
                  <th className="print:hidden" />
                </tr>
              </thead>
              <tbody>
                {o.keyResults.map((k) => {
                  const live = k.auto ? autoValue(k, win) : null;
                  const current = k.auto ? live : k.current;
                  const p = krProgress({ ...k, current });
                  const before = prevKr(k.id);
                  return (
                    <tr key={k.id} className="border-t border-ink-100 align-top">
                      <td className="px-0.5 py-1">
                        <input
                          className={cell}
                          value={k.text}
                          placeholder="Measurable result"
                          onChange={(e) => setKr(o.id, k.id, (x) => ({ ...x, text: e.target.value }))}
                        />
                        <select
                          className="ml-1.5 mt-0.5 rounded border-0 bg-transparent text-[11px] text-ink-400 print:hidden"
                          value={k.auto ?? ''}
                          onChange={(e) =>
                            setKr(o.id, k.id, (x) => ({
                              ...x,
                              auto: (e.target.value || undefined) as MeetingKeyResult['auto'],
                            }))
                          }
                        >
                          <option value="">typed in</option>
                          <option value="avg-week">auto: check-ins per week</option>
                          <option value="avg-session">auto: check-ins per class</option>
                        </select>
                      </td>
                      <NumCell value={k.start} onChange={(v) => setKr(o.id, k.id, (x) => ({ ...x, start: v }))} />
                      {k.auto ? (
                        <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums" title="From attendance">
                          {one(live)}
                        </td>
                      ) : (
                        <NumCell value={k.current} onChange={(v) => setKr(o.id, k.id, (x) => ({ ...x, current: v }))} />
                      )}
                      <NumCell value={k.target} onChange={(v) => setKr(o.id, k.id, (x) => ({ ...x, target: v }))} />
                      <td className="px-1.5 py-2">
                        <div className="h-2 w-full min-w-20 rounded-full bg-ink-100">
                          {p != null && (
                            <div className="h-2 rounded-full bg-accent-600" style={{ width: `${Math.max(4, p * 100)}%` }} />
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-500">
                          {p == null ? 'needs start, now and target' : `${Math.round(p * 100)}%`}
                          {before && before.current != null && !k.auto && ` · last time ${before.current}`}
                        </div>
                      </td>
                      <NumCell
                        value={k.confidence}
                        onChange={(v) =>
                          setKr(o.id, k.id, (x) => ({ ...x, confidence: v == null ? null : Math.max(1, Math.min(10, v)) }))
                        }
                        suffix="/10"
                      />
                      <td className="py-1 print:hidden">
                        <button
                          type="button"
                          className="px-1 text-ink-300 hover:text-red-700"
                          title="Remove key result"
                          onClick={() =>
                            setObj(o.id, (x) => ({ ...x, keyResults: x.keyResults.filter((y) => y.id !== k.id) }))
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              className="mt-1 px-1.5 text-[12px] font-medium text-accent-600 hover:underline print:hidden"
              onClick={() => setObj(o.id, (x) => ({ ...x, keyResults: [...x.keyResults, newKeyResult()] }))}
            >
              + key result
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 print:hidden">
          <select className={field} value={section} onChange={(e) => setSection(e.target.value)}>
            {MEETING_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
            onClick={() => patch((m) => ({ ...m, objectives: [...m.objectives, newObjective(section)] }))}
          >
            + objective
          </button>
        </div>
      </div>
    </section>
  );
}

function NumCell({
  value,
  onChange,
  suffix,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  return (
    <td className="w-20 px-0.5 py-1">
      <div className="flex items-center">
        <input
          inputMode="decimal"
          className={`${cell} text-right tabular-nums`}
          value={value ?? ''}
          placeholder="–"
          onChange={(e) => onChange(numIn(e.target.value))}
        />
        {suffix && value != null && <span className="text-[11px] text-ink-400">{suffix}</span>}
      </div>
    </td>
  );
}

// ---------- 03 Actions ----------

function Actions({ meeting, patch }: { meeting: Meeting; patch: (fn: (m: Meeting) => Meeting) => void }) {
  const set = (id: string, fn: (a: Meeting['actions'][number]) => Meeting['actions'][number]) =>
    patch((m) => ({ ...m, actions: m.actions.map((a) => (a.id === id ? fn(a) : a)) }));
  const open = meeting.actions.filter((a) => !a.done).length;
  return (
    <section className="break-inside-avoid">
      <SectionHead
        n={3}
        title="Actions"
        sub={`${open} open. Unfinished actions carry into the next meeting.`}
      />
      <div className="rounded-lg border border-ink-200 bg-white p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-ink-500">
              <th className="w-8" />
              <th className="px-1.5 font-medium">Action</th>
              <th className="w-36 px-1.5 font-medium">Owner</th>
              <th className="w-36 px-1.5 font-medium">Due</th>
              <th className="w-24 px-1.5 font-medium">Raised</th>
              <th className="w-6 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {meeting.actions.map((a) => {
              const carried = a.raised !== meeting.date;
              return (
                <tr key={a.id} className="border-t border-ink-100">
                  <td className="py-1 text-center">
                    <input
                      type="checkbox"
                      checked={a.done}
                      onChange={(e) => set(a.id, (x) => ({ ...x, done: e.target.checked }))}
                      className="h-4 w-4 accent-[#003030]"
                    />
                  </td>
                  <td className="px-0.5 py-1">
                    <input
                      className={`${cell} ${a.done ? 'text-ink-400 line-through' : ''}`}
                      value={a.text}
                      placeholder="What needs doing"
                      onChange={(e) => set(a.id, (x) => ({ ...x, text: e.target.value }))}
                    />
                  </td>
                  <td className="px-0.5 py-1">
                    <input
                      className={cell}
                      value={a.owner}
                      placeholder="Who"
                      onChange={(e) => set(a.id, (x) => ({ ...x, owner: e.target.value }))}
                    />
                  </td>
                  <td className="px-0.5 py-1">
                    <input
                      type="date"
                      className={cell}
                      value={a.due ?? ''}
                      onChange={(e) => set(a.id, (x) => ({ ...x, due: e.target.value || undefined }))}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-[12px] whitespace-nowrap text-ink-500">
                    {carried ? (
                      <span className="rounded bg-sand-100 px-1.5 py-0.5 text-ink-800" title="Carried from an earlier meeting">
                        {fmtDate(a.raised, { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      'today'
                    )}
                  </td>
                  <td className="print:hidden">
                    <button
                      type="button"
                      className="px-1 text-ink-300 hover:text-red-700"
                      title="Remove action"
                      onClick={() => patch((m) => ({ ...m, actions: m.actions.filter((x) => x.id !== a.id) }))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          className="mt-1 px-1.5 text-[12px] font-medium text-accent-600 hover:underline print:hidden"
          onClick={() => patch((m) => ({ ...m, actions: [...m.actions, newAction(m.date)] }))}
        >
          + action
        </button>
      </div>
    </section>
  );
}
