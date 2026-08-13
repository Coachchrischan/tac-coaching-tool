import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import { fmtMonth } from '../attendance/AttendanceTab';

export default function HomeTab() {
  const home = useDoc('home');
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const [editing, setEditing] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [period, setPeriod] = useState<6 | 12 | 0>(12); // months shown; 0 = all

  const stats = useMemo(() => {
    if (!attendance.data || !schedule.data) return null;
    const entries = attendance.data.entries;
    const months = [...new Set(entries.map((e) => e.month))].sort();
    const byType = schedule.data.classTypes
      .map((ct) => {
        const counts = entries.filter((e) => e.classTypeId === ct.id);
        const total = counts.reduce((s, e) => s + e.count, 0);
        const avg = counts.length ? total / counts.length : 0;
        return { ct, total, avg, monthsRecorded: counts.length };
      })
      .filter((t) => t.monthsRecorded > 0)
      .sort((a, b) => b.avg - a.avg);
    const monthTotals = months.map((m) => ({
      month: m,
      total: entries.filter((e) => e.month === m).reduce((s, e) => s + e.count, 0),
    }));
    return { byType, monthTotals, months };
  }, [attendance.data, schedule.data]);

  if (!home.data || !attendance.data || !schedule.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  const doc = home.data;
  const maxAvg = stats && stats.byType.length ? Math.max(...stats.byType.map((t) => t.avg)) : 1;

  // Trend series: all classes combined, or the selected class only.
  const selectedType = selectedTypeId
    ? schedule.data.classTypes.find((ct) => ct.id === selectedTypeId)
    : null;
  const entries = attendance.data.entries;
  const trendAll = stats
    ? stats.months.map((m) => ({
        month: m,
        total: selectedTypeId
          ? (entries.find((e) => e.month === m && e.classTypeId === selectedTypeId)?.count ?? 0)
          : (stats.monthTotals.find((t) => t.month === m)?.total ?? 0),
      }))
    : [];
  const recentMonths = period === 0 ? trendAll : trendAll.slice(-period);
  const maxMonthTotal = recentMonths.length ? Math.max(...recentMonths.map((m) => m.total), 1) : 1;
  const trendAvg = recentMonths.length
    ? recentMonths.reduce((s, m) => s + m.total, 0) / recentMonths.length
    : 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink-950">Group class programming</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            The plan, the numbers, and what we are building at TAC.
          </p>
        </div>
        <SaveBadge
          state={mostUrgent([home, attendance, schedule]).saveState}
          onReloadTheirs={home.reloadTheirs}
          onKeepMine={home.keepMine}
          onRetry={home.retry}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- Left: class numbers dashboard ---- */}
        <div className="space-y-5">
          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-ink-950">Class popularity</h3>
              <span className="text-[11px] text-ink-400">average attendances per recorded month</span>
            </div>
            {!stats || stats.byType.length === 0 ? (
              <p className="mt-4 text-sm text-ink-400">
                No numbers yet. Record your first week in{' '}
                <Link to="/attendance" className="font-medium text-accent-600 hover:underline">
                  Attendance
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {stats.byType.map((t, i) => (
                  <li key={t.ct.id}>
                    <button
                      type="button"
                      title="Show this class's week-to-week trend"
                      onClick={() =>
                        setSelectedTypeId((cur) => (cur === t.ct.id ? null : t.ct.id))
                      }
                      className={`block w-full rounded-md px-1.5 py-1 text-left transition-colors ${
                        selectedTypeId === t.ct.id ? 'bg-accent-100' : 'hover:bg-ink-100/60'
                      }`}
                    >
                    <div className="mb-0.5 flex items-baseline justify-between text-[13px]">
                      <span className="font-medium text-ink-950">
                        {t.ct.name}
                        {i === 0 && (
                          <span className="ml-2 rounded bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            MOST POPULAR
                          </span>
                        )}
                        {i === stats.byType.length - 1 && stats.byType.length > 1 && (
                          <span className="ml-2 rounded bg-sand-500 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">
                            NEEDS ATTENTION
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-ink-950">{t.avg.toFixed(0)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
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
            {stats && stats.byType.length > 0 && (
              <p className="mt-3 text-[11px] text-ink-400">
                Click a class to see its week-to-week trend below.
              </p>
            )}
          </section>

          {recentMonths.length > 0 && (
            <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-950">
                  {selectedType && (
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: selectedType.colour }}
                    />
                  )}
                  {selectedType ? `${selectedType.name}, month to month` : 'Monthly attendances'}
                  {selectedType && (
                    <button
                      type="button"
                      onClick={() => setSelectedTypeId(null)}
                      className="rounded border border-ink-300 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 hover:text-ink-950"
                    >
                      All classes
                    </button>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-400">
                    avg {trendAvg.toFixed(0)}/mo
                  </span>
                  <div className="flex overflow-hidden rounded border border-ink-300">
                    {([6, 12, 0] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`px-2 py-0.5 text-[11px] font-medium ${
                          period === p ? 'bg-ink-950 text-white' : 'bg-white text-ink-500'
                        }`}
                      >
                        {p === 0 ? 'All' : `${p} mo`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-end gap-1.5">
                {recentMonths.map((m) => (
                  <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-semibold text-ink-700">{m.total}</span>
                    <div className="relative flex h-24 w-full items-end">
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${Math.max((m.total / maxMonthTotal) * 100, 4)}%`,
                          backgroundColor: selectedType?.colour ?? '#003030',
                        }}
                      />
                    </div>
                    <span className="truncate text-[10px] text-ink-400">{fmtMonth(m.month)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-400">
                {selectedType
                  ? 'Monthly attendances for this class across the selected period.'
                  : 'Total attendances across all classes each month.'}
              </p>
            </section>
          )}
        </div>

        {/* ---- Right: ethos ---- */}
        <section className="rounded-xl bg-ink-950 p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-[0.3em] text-sand-500 uppercase">
              Teneriffe Athletic Club
            </p>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded border border-ink-700 px-2 py-0.5 text-xs font-medium text-ink-300 hover:text-white"
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>

          {editing ? (
            <div className="mt-3 space-y-4">
              <label className="block text-[11px] font-medium tracking-wide text-ink-400 uppercase">
                Ethos
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm leading-relaxed text-white focus:border-accent-500 focus:outline-none"
                  value={doc.ethos}
                  onChange={(e) => home.update((d) => ({ ...d, ethos: e.target.value }))}
                />
              </label>
              <label className="block text-[11px] font-medium tracking-wide text-ink-400 uppercase">
                What we focus on (one per line)
                <textarea
                  rows={5}
                  className="mt-1 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm leading-relaxed text-white focus:border-accent-500 focus:outline-none"
                  value={doc.focusPoints.join('\n')}
                  onChange={(e) =>
                    home.update((d) => ({ ...d, focusPoints: e.target.value.split('\n') }))
                  }
                />
              </label>
              <label className="block text-[11px] font-medium tracking-wide text-ink-400 uppercase">
                What makes it different (one per line)
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm leading-relaxed text-white focus:border-accent-500 focus:outline-none"
                  value={doc.different.join('\n')}
                  onChange={(e) =>
                    home.update((d) => ({ ...d, different: e.target.value.split('\n') }))
                  }
                />
              </label>
            </div>
          ) : (
            <>
              <p className="font-display mt-3 text-[22px] leading-snug text-[#F5F3EB]">
                {doc.ethos}
              </p>

              <h4 className="mt-6 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                What we focus on
              </h4>
              <ul className="mt-2 space-y-1.5">
                {doc.focusPoints
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-200">
                      <span className="mt-0.5 text-accent-500">▸</span>
                      {p}
                    </li>
                  ))}
              </ul>

              <h4 className="mt-6 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                What makes it different
              </h4>
              <ul className="mt-2 space-y-1.5">
                {doc.different
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-200">
                      <span className="mt-0.5 text-sand-500">▸</span>
                      {p}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
