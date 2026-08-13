import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import {
  allMonths,
  allWeeks,
  fmtPeriod,
  monthlyCount,
  weeklyCount,
} from '../../lib/attendancePeriods';

function fmtEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function HomeTab() {
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const community = useDoc('community');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [grain, setGrain] = useState<'monthly' | 'weekly'>('monthly');
  const [periodCount, setPeriodCount] = useState<6 | 12 | 0>(6);

  const chart = useMemo(() => {
    if (!attendance.data || !schedule.data) return null;
    const entries = attendance.data.entries;
    const classTypes = schedule.data.classTypes;

    const periods = grain === 'monthly' ? allMonths(entries) : allWeeks(entries);
    const shown = periodCount === 0 ? periods : periods.slice(-periodCount);

    const groups = shown.map((p) => ({
      period: p,
      bars: classTypes
        .map((ct) => ({
          ct,
          count:
            grain === 'monthly'
              ? monthlyCount(entries, p, ct.id)
              : weeklyCount(entries, p, ct.id),
        }))
        .filter((b): b is { ct: (typeof classTypes)[number]; count: number } => b.count !== null),
    }));

    const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.count)));

    // Popularity: average per month (weekly data rolled up), ranked.
    const months = allMonths(entries);
    const byType = classTypes
      .map((ct) => {
        const counts = months
          .map((m) => monthlyCount(entries, m, ct.id))
          .filter((c): c is number => c !== null);
        const avg = counts.length ? counts.reduce((s, c) => s + c, 0) / counts.length : 0;
        return { ct, avg, monthsRecorded: counts.length };
      })
      .filter((t) => t.monthsRecorded > 0)
      .sort((a, b) => b.avg - a.avg);

    return { groups, max, byType };
  }, [attendance.data, schedule.data, grain, periodCount]);

  if (!attendance.data || !schedule.data || !community.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  const maxAvg = chart && chart.byType.length ? Math.max(...chart.byType.map((t) => t.avg)) : 1;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const upcomingEvents = [...community.data.events]
    .filter((e) => e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink-950">Group class programming</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            The numbers behind the classes. The thinking lives on the{' '}
            <Link to="/ethos" className="font-medium text-accent-600 hover:underline">
              Ethos
            </Link>{' '}
            page.
          </p>
        </div>
        <SaveBadge
          state={mostUrgent([attendance, schedule, community]).saveState}
          onReloadTheirs={attendance.reloadTheirs}
          onKeepMine={attendance.keepMine}
          onRetry={attendance.retry}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Popularity ranking */}
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-ink-950">Class popularity</h3>
            <span className="text-[11px] text-ink-400">avg / month</span>
          </div>
          {!chart || chart.byType.length === 0 ? (
            <p className="mt-4 text-sm text-ink-400">
              No numbers yet. Record a month in{' '}
              <Link to="/attendance" className="font-medium text-accent-600 hover:underline">
                Attendance
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {chart.byType.map((t, i) => (
                <li key={t.ct.id}>
                  <button
                    type="button"
                    title="Highlight this class in the chart"
                    onClick={() => setSelectedTypeId((cur) => (cur === t.ct.id ? null : t.ct.id))}
                    className={`block w-full rounded-md px-1.5 py-1 text-left transition-colors ${
                      selectedTypeId === t.ct.id ? 'bg-accent-100' : 'hover:bg-ink-100/60'
                    }`}
                  >
                    <div className="mb-0.5 flex items-baseline justify-between text-[13px]">
                      <span className="truncate font-medium text-ink-950">
                        {t.ct.name}
                        {i === 0 && (
                          <span className="ml-1.5 rounded bg-accent-600 px-1 py-0.5 text-[9px] font-bold text-white">
                            TOP
                          </span>
                        )}
                        {i === chart.byType.length - 1 && chart.byType.length > 1 && (
                          <span className="ml-1.5 rounded bg-sand-500 px-1 py-0.5 text-[9px] font-bold text-ink-950">
                            LOW
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-ink-950">{t.avg.toFixed(0)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max((t.avg / maxAvg) * 100, 3)}%`,
                          backgroundColor: t.ct.colour,
                        }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Grouped comparison chart */}
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink-950">Classes compared</h3>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded border border-ink-300">
                {(['monthly', 'weekly'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrain(g)}
                    className={`px-2 py-0.5 text-[11px] font-medium capitalize ${
                      grain === g ? 'bg-ink-950 text-white' : 'bg-white text-ink-500'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex overflow-hidden rounded border border-ink-300">
                {([6, 12, 0] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodCount(p)}
                    className={`px-2 py-0.5 text-[11px] font-medium ${
                      periodCount === p ? 'bg-ink-950 text-white' : 'bg-white text-ink-500'
                    }`}
                  >
                    {p === 0 ? 'All' : p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!chart || chart.groups.length === 0 ? (
            <p className="mt-4 text-sm text-ink-400">
              {grain === 'weekly'
                ? 'No weekly numbers recorded yet. Switch Attendance to Weekly to add some, or view Monthly.'
                : 'No numbers yet.'}
            </p>
          ) : (
            <>
              <div className="mt-4 flex items-end justify-around gap-4">
                {chart.groups.map((g) => (
                  <div key={g.period} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex h-44 w-full items-end justify-center gap-[3px]">
                      {g.bars.map((b) => {
                        const dimmed = selectedTypeId !== null && b.ct.id !== selectedTypeId;
                        return (
                          <div
                            key={b.ct.id}
                            className="relative flex h-full max-w-7 min-w-1.5 flex-1 items-end"
                            title={`${b.ct.name}: ${b.count}`}
                          >
                            {selectedTypeId === b.ct.id && (
                              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-ink-950">
                                {b.count}
                              </span>
                            )}
                            <div
                              className="w-full rounded-t transition-opacity"
                              style={{
                                height: `${Math.max((b.count / chart.max) * 100, 2)}%`,
                                backgroundColor: b.ct.colour,
                                opacity: dimmed ? 0.18 : 1,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <span className="truncate text-[10px] font-medium text-ink-500">
                      {fmtPeriod(g.period)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-ink-100 pt-2.5">
                {schedule.data.classTypes.map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => setSelectedTypeId((cur) => (cur === ct.id ? null : ct.id))}
                    className={`flex items-center gap-1 text-[11px] transition-opacity ${
                      selectedTypeId !== null && selectedTypeId !== ct.id
                        ? 'opacity-40'
                        : 'opacity-100'
                    } ${selectedTypeId === ct.id ? 'font-bold text-ink-950' : 'text-ink-500'}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ct.colour }} />
                    {ct.name}
                  </button>
                ))}
                {selectedTypeId && (
                  <button
                    type="button"
                    onClick={() => setSelectedTypeId(null)}
                    className="ml-auto rounded border border-ink-300 px-1.5 text-[10px] font-medium text-ink-500 hover:text-ink-950"
                  >
                    Show all
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Community events strip */}
      <section className="mt-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-ink-950">Upcoming community events</h3>
          <Link to="/community" className="text-[12px] font-medium text-accent-600 hover:underline">
            Plan events →
          </Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">
            Nothing planned yet. The Community tab has ten ready-made ideas for TAC.
          </p>
        ) : (
          <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-20 shrink-0 font-semibold text-accent-600">
                  {fmtEventDate(e.date)}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink-950">{e.name}</span>
                  {e.notes && <span className="block text-[12px] text-ink-500">{e.notes}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
