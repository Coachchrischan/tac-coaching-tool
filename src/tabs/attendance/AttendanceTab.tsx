import { useMemo, useState } from 'react';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import {
  fmtPeriod,
  isMonth,
  mondayOf,
  thisMonday,
  thisMonth,
} from '../../lib/attendancePeriods';

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-accent-600 focus:outline-none';

export default function AttendanceTab() {
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const [mode, setMode] = useState<'monthly' | 'weekly'>('monthly');
  const [month, setMonth] = useState(thisMonth());
  const [week, setWeek] = useState(thisMonday());

  const period = mode === 'monthly' ? month : week;

  const periods = useMemo(() => {
    if (!attendance.data) return [];
    return [...new Set(attendance.data.entries.map((e) => e.period))].sort().reverse();
  }, [attendance.data]);

  if (!attendance.data || !schedule.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  const classTypes = schedule.data.classTypes;
  const entries = attendance.data.entries;

  function countFor(p: string, classTypeId: string): number | '' {
    const e = entries.find((x) => x.period === p && x.classTypeId === classTypeId);
    return e ? e.count : '';
  }

  function setCount(classTypeId: string, raw: string) {
    const p = period;
    attendance.update((d) => {
      const rest = d.entries.filter((x) => !(x.period === p && x.classTypeId === classTypeId));
      if (raw === '') return { ...d, entries: rest };
      const count = Math.max(0, Number(raw) || 0);
      return {
        ...d,
        entries: [...rest, { id: `${p}:${classTypeId}`, period: p, classTypeId, count }],
      };
    });
  }

  const periodTotal = classTypes.reduce((sum, ct) => {
    const c = countFor(period, ct.id);
    return sum + (c === '' ? 0 : c);
  }, 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink-950">Class numbers</h2>
          <p className="text-[13px] text-ink-500">
            Record totals per class type, monthly or weekly. Weekly numbers roll up into their month
            on the Home dashboard.
          </p>
          {attendance.data?.entries.some((e) => e.seeded) && (
            <button
              type="button"
              className="mt-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-100"
              title="The seeded demo rows keep Home's charts populated but the numbers are invented"
              onClick={() => {
                const n = attendance.data?.entries.filter((e) => e.seeded).length ?? 0;
                if (
                  window.confirm(
                    `Delete the ${n} seeded demo attendance entries? Real entries you have typed stay. ` +
                      `Home's charts will be empty until real counts go in.`,
                  )
                ) {
                  attendance.update((d) => ({
                    ...d,
                    entries: d.entries.filter((e) => !e.seeded),
                  }));
                }
              }}
            >
              Delete the seeded demo entries
            </button>
          )}
        </div>
        <SaveBadge
          state={mostUrgent([attendance, schedule]).saveState}
          onReloadTheirs={attendance.reloadTheirs}
          onKeepMine={attendance.keepMine}
          onRetry={attendance.retry}
        />
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-ink-300">
            {(['monthly', 'weekly'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  mode === m ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === 'monthly' ? (
            <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
              Month
              <input
                type="month"
                className={field}
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
              Week starting
              <input
                type="date"
                className={field}
                value={week}
                onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))}
              />
            </label>
          )}
          <span className="text-sm text-ink-500">
            Total: <span className="font-bold text-ink-950">{periodTotal}</span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {classTypes.map((ct) => (
            <label key={ct.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: ct.colour }}
                />
                <span className="truncate font-medium text-ink-950">{ct.name}</span>
              </span>
              <input
                type="number"
                min={0}
                className={`${field} w-20 text-center`}
                value={countFor(period, ct.id)}
                placeholder="0"
                onChange={(e) => setCount(ct.id, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      {periods.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-ink-200 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  Period
                </th>
                {classTypes.map((ct) => (
                  <th
                    key={ct.id}
                    className="border-b border-ink-200 px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-ink-500 uppercase"
                  >
                    {ct.name.split(' ')[0]}
                  </th>
                ))}
                <th className="border-b border-ink-200 px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  Total
                </th>
                <th className="w-8 border-b border-ink-200" />
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const total = classTypes.reduce((sum, ct) => {
                  const c = countFor(p, ct.id);
                  return sum + (c === '' ? 0 : c);
                }, 0);
                return (
                  <tr key={p} className={p === period ? 'bg-accent-100/50' : ''}>
                    <td className="border-b border-ink-100 px-3 py-1.5 text-sm font-medium text-ink-950">
                      <button
                        type="button"
                        className="hover:text-accent-600"
                        title="Edit this period"
                        onClick={() => {
                          if (isMonth(p)) {
                            setMode('monthly');
                            setMonth(p);
                          } else {
                            setMode('weekly');
                            setWeek(p);
                          }
                        }}
                      >
                        {fmtPeriod(p)}
                      </button>
                    </td>
                    {classTypes.map((ct) => (
                      <td
                        key={ct.id}
                        className="border-b border-ink-100 px-2 py-1.5 text-center text-sm text-ink-700"
                      >
                        {countFor(p, ct.id) === '' ? '-' : countFor(p, ct.id)}
                      </td>
                    ))}
                    <td className="border-b border-ink-100 px-2 py-1.5 text-center text-sm font-bold text-ink-950">
                      {total}
                    </td>
                    <td className="border-b border-ink-100 px-2 py-1.5 text-center">
                      <button
                        type="button"
                        title="Delete this period's numbers"
                        onClick={() =>
                          attendance.update((d) => ({
                            ...d,
                            entries: d.entries.filter((e) => e.period !== p),
                          }))
                        }
                        className="rounded px-1 text-sm text-ink-300 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
