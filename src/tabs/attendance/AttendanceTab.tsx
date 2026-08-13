import { useMemo, useState } from 'react';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-accent-600 focus:outline-none';

/** Current month as 'yyyy-mm' in local time (never toISOString: UTC shifts AEST). */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtMonth(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-AU', {
    month: 'short',
    year: '2-digit',
  });
}

export default function AttendanceTab() {
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const [month, setMonth] = useState(thisMonth());

  const months = useMemo(() => {
    if (!attendance.data) return [];
    return [...new Set(attendance.data.entries.map((e) => e.month))].sort().reverse();
  }, [attendance.data]);

  if (!attendance.data || !schedule.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  const classTypes = schedule.data.classTypes;
  const entries = attendance.data.entries;

  function countFor(m: string, classTypeId: string): number | '' {
    const e = entries.find((x) => x.month === m && x.classTypeId === classTypeId);
    return e ? e.count : '';
  }

  function setCount(classTypeId: string, raw: string) {
    const m = month;
    attendance.update((d) => {
      const rest = d.entries.filter((x) => !(x.month === m && x.classTypeId === classTypeId));
      if (raw === '') return { ...d, entries: rest };
      const count = Math.max(0, Number(raw) || 0);
      return {
        ...d,
        entries: [...rest, { id: `${m}:${classTypeId}`, month: m, classTypeId, count }],
      };
    });
  }

  const monthTotal = classTypes.reduce((sum, ct) => {
    const c = countFor(month, ct.id);
    return sum + (c === '' ? 0 : c);
  }, 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Class numbers</h2>
          <p className="text-[13px] text-ink-500">
            Total attendances per class type for the month. The Home dashboard reads these.
          </p>
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
          <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
            Month
            <input
              type="month"
              className={field}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          <span className="text-sm text-ink-500">
            Month total: <span className="font-bold text-ink-950">{monthTotal}</span>
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
                value={countFor(month, ct.id)}
                placeholder="0"
                onChange={(e) => setCount(ct.id, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      {months.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-ink-200 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  Month
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
              {months.map((m) => {
                const total = classTypes.reduce((sum, ct) => {
                  const c = countFor(m, ct.id);
                  return sum + (c === '' ? 0 : c);
                }, 0);
                return (
                  <tr key={m} className={m === month ? 'bg-accent-100/50' : ''}>
                    <td className="border-b border-ink-100 px-3 py-1.5 text-sm font-medium text-ink-950">
                      <button
                        type="button"
                        className="hover:text-accent-600"
                        title="Edit this month"
                        onClick={() => setMonth(m)}
                      >
                        {fmtMonth(m)}
                      </button>
                    </td>
                    {classTypes.map((ct) => (
                      <td
                        key={ct.id}
                        className="border-b border-ink-100 px-2 py-1.5 text-center text-sm text-ink-700"
                      >
                        {countFor(m, ct.id) === '' ? '-' : countFor(m, ct.id)}
                      </td>
                    ))}
                    <td className="border-b border-ink-100 px-2 py-1.5 text-center text-sm font-bold text-ink-950">
                      {total}
                    </td>
                    <td className="border-b border-ink-100 px-2 py-1.5 text-center">
                      <button
                        type="button"
                        title="Delete this month's numbers"
                        onClick={() =>
                          attendance.update((d) => ({
                            ...d,
                            entries: d.entries.filter((e) => e.month !== m),
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
