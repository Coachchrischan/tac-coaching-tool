// The week-readiness strip: for the live training week, per stream, what is
// written, what is pushed, which sessions land on which day, and which
// bookable classes nothing feeds - plus a 20-second weekly attendance
// capture. Home led with charts of invented numbers; a solo operator's first
// question is "is this week ready?" (roundtable 2, both product seats).

import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { AttendanceEntry, ScheduleDoc } from '../../types/documents';
import type { StreamWeekReadiness } from '../../lib/weekReadiness';
import { thisMonday, weeklyCount } from '../../lib/attendancePeriods';
import { liveScenario } from '../../lib/scenarios';

const fmtShort = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

export default function ThisWeekPanel({
  readiness,
  unfedNames,
  schedule,
  entries,
  onSaveCount,
}: {
  readiness: StreamWeekReadiness[];
  unfedNames: string[];
  schedule: ScheduleDoc;
  entries: AttendanceEntry[];
  onSaveCount: (classTypeId: string, count: number | null) => void;
}) {
  const monday = readiness.find((r) => r.monday)?.monday ?? null;
  const [countsOpen, setCountsOpen] = useState(false);
  const week = thisMonday();
  const live = liveScenario(schedule);
  const liveTypes = [...new Set((live?.blocks ?? []).map((b) => b.classTypeId))]
    .map((id) => schedule.classTypes.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <section className="mb-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-950">
          This week
          {monday && (
            <span className="ml-2 font-normal text-ink-500">week of {fmtShort(monday)}</span>
          )}
        </h3>
        <Link to="/programming" className="text-[12px] font-medium text-accent-600 hover:underline">
          Open Programming
        </Link>
      </div>

      {unfedNames.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900">
          ⚠ Bookable but not programmed this week: <strong>{unfedNames.join(', ')}</strong>.
          Whatever runs there is improvised.
        </p>
      )}

      {monday === null ? (
        <p className="mt-3 text-sm text-ink-500">
          No training week contains today (before the year starts, or a club shutdown week).
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {readiness.map((r) => {
            const ready = r.total > 0 && r.written === r.total;
            return (
              <li key={r.streamId} className="rounded-lg border border-ink-200 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink-950">{r.streamName}</span>
                  <span
                    className={`text-[11px] font-bold ${
                      r.total === 0
                        ? 'text-ink-300'
                        : ready
                          ? 'text-accent-700'
                          : 'text-amber-600'
                    }`}
                  >
                    {r.total === 0 ? 'no week here' : `${r.written}/${r.total} written`}
                  </span>
                </div>
                {r.containerLabel && (
                  <p className="mt-0.5 text-[11px] text-ink-400">{r.containerLabel}</p>
                )}
                <ul className="mt-1.5 space-y-0.5">
                  {r.sessions.map((s) => (
                    <li key={s.id} className="flex items-center gap-1.5 text-[12px]">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          s.parked ? 'bg-ink-200' : s.hasContent ? 'bg-accent-600' : 'bg-amber-400'
                        }`}
                        aria-hidden="true"
                      />
                      {s.hasContent ? (
                        <Link
                          to={`/tv/${s.id}`}
                          className="truncate text-ink-700 hover:text-accent-700 hover:underline"
                          title="Open the wall board"
                        >
                          {s.label}
                        </Link>
                      ) : (
                        <span className="truncate text-ink-500">{s.label}</span>
                      )}
                      <span className="ml-auto shrink-0 text-ink-400">
                        {s.parked
                          ? 'parked'
                          : s.date
                            ? new Date(`${s.date}T00:00:00`).toLocaleDateString('en-AU', {
                                weekday: 'short',
                              })
                            : 'no class'}
                        {!s.parked && !s.hasContent && ' · unwritten'}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.streamId === 'strength' && (
                  <p className="mt-1.5 text-[11px]">
                    {r.lastPush ? (
                      <span className="text-accent-700">
                        Pushed to TrainHeroic{' '}
                        {new Date(r.lastPush.at).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        (drafts)
                      </span>
                    ) : (
                      <span className="text-amber-600">Not pushed to TrainHeroic yet</span>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* The 20-second capture: without it, Home's charts stay demo or stale.
          One number per class for this week; typed here, it lands as a normal
          weekly attendance entry. */}
      <div className="mt-3 border-t border-ink-100 pt-2">
        <button
          type="button"
          onClick={() => setCountsOpen((o) => !o)}
          className="text-[12px] font-medium text-accent-600 hover:underline"
        >
          {countsOpen ? 'Hide' : 'Enter'} this week's class numbers
        </button>
        {countsOpen && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {liveTypes.map((ct) => (
              <label key={ct.id} className="text-[11px] font-medium text-ink-500">
                {ct.name}
                <input
                  type="number"
                  min={0}
                  className="mt-0.5 block w-20 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
                  defaultValue={weeklyCount(entries, week, ct.id) ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    onSaveCount(ct.id, v === '' ? null : Math.max(0, Number(v) || 0));
                  }}
                />
              </label>
            ))}
            <p className="w-full text-[11px] text-ink-400">
              Total attendances per class for the week of {fmtShort(week)}. Saved as you leave
              each box; these are the real numbers that replace the demo picture.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
