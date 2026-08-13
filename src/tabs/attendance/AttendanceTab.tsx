import { useMemo, useState } from 'react';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-accent-600 focus:outline-none';

/** Local yyyy-mm-dd (never toISOString, which shifts AEST dates to UTC). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Snap any date to its week's Monday (ISO). */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return localIso(d);
}

function thisMonday(): string {
  return mondayOf(localIso(new Date()));
}

export function fmtWeek(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

export default function AttendanceTab() {
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const [week, setWeek] = useState(thisMonday());

  const weeks = useMemo(() => {
    if (!attendance.data) return [];
    return [...new Set(attendance.data.entries.map((e) => e.weekStart))].sort().reverse();
  }, [attendance.data]);

  if (!attendance.data || !schedule.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  const classTypes = schedule.data.classTypes;
  const entries = attendance.data.entries;

  function countFor(weekStart: string, classTypeId: string): number | '' {
    const e = entries.find((x) => x.weekStart === weekStart && x.classTypeId === classTypeId);
    return e ? e.count : '';
  }

  function setCount(classTypeId: string, raw: string) {
    const weekStart = week;
    attendance.update((d) => {
      const rest = d.entries.filter(
        (x) => !(x.weekStart === weekStart && x.classTypeId === classTypeId),
      );
      if (raw === '') return { ...d, entries: rest };
      const count = Math.max(0, Number(raw) || 0);
      return {
        ...d,
        entries: [...rest, { id: `${weekStart}:${classTypeId}`, weekStart, classTypeId, count }],
      };
    });
  }

  const weekTotal = classTypes.reduce((sum, ct) => {
    const c = countFor(week, ct.id);
    return sum + (c === '' ? 0 : c);
  }, 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Class numbers</h2>
          <p className="text-[13px] text-ink-500">
            Total attendances per class type for the week. The Home dashboard reads these.
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
            Week starting
            <input
              type="date"
              className={field}
              value={week}
              onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))}
            />
          </label>
          <span className="text-sm text-ink-500">
            Week total: <span className="font-bold text-ink-950">{weekTotal}</span>
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
                value={countFor(week, ct.id)}
                placeholder="0"
                onChange={(e) => setCount(ct.id, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      {weeks.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-ink-200 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  Week
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
              {weeks.map((w) => {
                const total = classTypes.reduce((sum, ct) => {
                  const c = countFor(w, ct.id);
                  return sum + (c === '' ? 0 : c);
                }, 0);
                return (
                  <tr key={w} className={w === week ? 'bg-accent-100/50' : ''}>
                    <td className="border-b border-ink-100 px-3 py-1.5 text-sm font-medium text-ink-950">
                      <button
                        type="button"
                        className="hover:text-accent-600"
                        title="Edit this week"
                        onClick={() => setWeek(w)}
                      >
                        {fmtWeek(w)}
                      </button>
                    </td>
                    {classTypes.map((ct) => (
                      <td
                        key={ct.id}
                        className="border-b border-ink-100 px-2 py-1.5 text-center text-sm text-ink-700"
                      >
                        {countFor(w, ct.id) === '' ? '-' : countFor(w, ct.id)}
                      </td>
                    ))}
                    <td className="border-b border-ink-100 px-2 py-1.5 text-center text-sm font-bold text-ink-950">
                      {total}
                    </td>
                    <td className="border-b border-ink-100 px-2 py-1.5 text-center">
                      <button
                        type="button"
                        title="Delete this week's numbers"
                        onClick={() =>
                          attendance.update((d) => ({
                            ...d,
                            entries: d.entries.filter((e) => e.weekStart !== w),
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
