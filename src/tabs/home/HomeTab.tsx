import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import {
  allMonths,
  allWeeks,
  fmtPeriod,
  isPartRecorded,
  monthlyPerWeek,
  weeklyCount,
} from '../../lib/attendancePeriods';

/** Which programming stream delivers a timetable class, where one does. */
const STREAM_FOR_CLASS: Record<string, string> = {
  lbs: 'strength',
  ubs: 'strength',
  fbs: 'strength',
  esd: 'esd',
  hyrox: 'hyrox',
  gameday: 'gameday',
};

const fmtTime = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
};

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

    // A month is shown as an average WEEK. Raw monthly totals are not
    // comparable: months hold four or five weeks and the current one is still
    // running, so a flat class reads as a steep decline.
    const groups = shown.map((p) => ({
      period: p,
      partRecorded: grain === 'monthly' && isPartRecorded(p),
      bars: classTypes
        .map((ct) => ({
          ct,
          count:
            grain === 'monthly'
              ? monthlyPerWeek(entries, p, ct.id)
              : weeklyCount(entries, p, ct.id),
        }))
        .filter((b): b is { ct: (typeof classTypes)[number]; count: number } => b.count !== null),
    }));

    const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.count)));

    // How many times each class type runs in the active timetable. Without
    // this the ranking measures how OFTEN a class runs, not how full it is:
    // ESD runs nine times a week, Game Day once.
    const scenario =
      schedule.data.scenarios.find((s) => s.id === schedule.data!.activeScenarioId) ??
      schedule.data.scenarios[0];
    const runsPerWeek = new Map<string, number>();
    for (const b of scenario?.blocks ?? []) {
      runsPerWeek.set(b.classTypeId, (runsPerWeek.get(b.classTypeId) ?? 0) + 1);
    }

    // Popularity is heads in ONE class: the average week's attendance divided
    // by how many of that class run in a week.
    const months = allMonths(entries);
    const byType = classTypes
      .map((ct) => {
        const perWeek = months
          .map((m) => monthlyPerWeek(entries, m, ct.id))
          .filter((c): c is number => c !== null);
        const weekAvg = perWeek.length ? perWeek.reduce((s, c) => s + c, 0) / perWeek.length : 0;
        const runs = runsPerWeek.get(ct.id) ?? 0;
        return {
          ct,
          weekAvg,
          runs,
          // No class on the timetable means there is nothing to divide by, so
          // the week's total is the honest figure to show.
          avg: runs > 0 ? weekAvg / runs : weekAvg,
          monthsRecorded: perWeek.length,
        };
      })
      .filter((t) => t.monthsRecorded > 0)
      .sort((a, b) => b.avg - a.avg);

    return { groups, max, byType };
  }, [attendance.data, schedule.data, grain, periodCount]);

  if (!attendance.data || !schedule.data || !community.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  // What is on today. The tab used to open on last quarter's numbers and never
  // on the class about to run, so a second coach had to be told where to look.
  const now = new Date();
  const todayIndex = (now.getDay() + 6) % 7; // Mon = 0, matching ClassBlock.day
  const activeScenario =
    schedule.data.scenarios.find((s) => s.id === schedule.data!.activeScenarioId) ??
    schedule.data.scenarios[0];
  const nameOf = (list: { id: string; name: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.name ?? null;
  const todayClasses = (activeScenario?.blocks ?? [])
    .filter((b) => b.day === todayIndex)
    .sort((a, b) => a.startMin - b.startMin)
    .map((b) => {
      const ct = schedule.data!.classTypes.find((c) => c.id === b.classTypeId);
      return {
        ...b,
        className: ct?.name ?? b.classTypeId,
        colour: ct?.colour ?? '#5A5A52',
        coach: nameOf(schedule.data!.coaches, b.coachId),
        room: nameOf(schedule.data!.rooms, b.roomId),
        streamId: STREAM_FOR_CLASS[b.classTypeId] ?? null,
        nowOn: now.getHours() * 60 + now.getMinutes() >= b.startMin &&
          now.getHours() * 60 + now.getMinutes() < b.startMin + b.durationMin,
      };
    });

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

      {/* Today: the first thing a coach opening this needs */}
      <section className="mb-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink-950">
            On today
            <span className="ml-2 font-normal text-ink-500">
              {now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </h3>
          <Link to="/schedule" className="text-[12px] font-medium text-accent-600 hover:underline">
            Full timetable
          </Link>
        </div>

        {todayClasses.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">
            No classes on the timetable today. Enjoy it.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100">
            {todayClasses.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-16 shrink-0 text-[13px] font-semibold text-ink-950 tabular-nums">
                  {fmtTime(c.startMin)}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.colour }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-[13px] text-ink-950">
                  <span className="font-medium">{c.className}</span>
                  {c.nowOn && (
                    <span className="ml-2 rounded bg-accent-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                      On now
                    </span>
                  )}
                  <span className="block text-[12px] text-ink-500">
                    {[c.coach, c.room].filter(Boolean).join(' · ') || 'No coach assigned'}
                  </span>
                </span>
                <span className="flex shrink-0 gap-3 text-[12px]">
                  {c.streamId ? (
                    <>
                      <Link
                        to="/programming"
                        className="font-medium text-accent-600 hover:underline"
                        title="Open the programming for this class"
                      >
                        Session
                      </Link>
                      <Link
                        to="/layouts"
                        className="font-medium text-accent-600 hover:underline"
                        title="Open the floor plan for this class"
                      >
                        Floor
                      </Link>
                    </>
                  ) : (
                    <span className="text-ink-300" title="This class is not programmed in the tool">
                      not programmed here
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Popularity ranking */}
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-ink-950">Class popularity</h3>
            <span className="text-[11px] text-ink-500">avg heads in a class</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">
            An average week's attendance divided by how many of that class run each week, so a class
            that runs nine times is not ranked above one that runs once.
          </p>
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
                    title="See this class against itself, week by week or month by month"
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
                      <span
                        className="font-bold text-ink-950 tabular-nums"
                        title={
                          t.runs > 0
                            ? `${t.weekAvg.toFixed(0)} a week across ${t.runs} class${t.runs === 1 ? '' : 'es'}`
                            : 'Not on the active timetable, so this is the whole week'
                        }
                      >
                        {t.avg.toFixed(0)}
                        {t.runs > 0 && (
                          <span className="ml-1 font-normal text-ink-500">x{t.runs}</span>
                        )}
                      </span>
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
            {selectedTypeId !== null ? (
            /* Drill-down: one class against itself, period by period */
            (() => {
              const ct = schedule.data!.classTypes.find((c) => c.id === selectedTypeId);
              const single = chart.groups.map((g) => ({
                period: g.period,
                partRecorded: g.partRecorded,
                count: g.bars.find((b) => b.ct.id === selectedTypeId)?.count ?? null,
              }));
              const counts = single.map((s) => s.count).filter((c): c is number => c !== null);
              const singleMax = Math.max(1, ...counts);
              return (
                <>
                  <p className="mt-3 text-[12px] font-medium text-ink-500">
                    <span className="font-bold text-ink-950">{ct?.name}</span>{' '}
                    {grain === 'weekly' ? 'week by week' : 'month by month'} — click another class
                    below to switch, or Show all for the comparison.
                  </p>
                  <div className="mt-3 flex items-end justify-around gap-2">
                    {single.map((s) => (
                      <div key={s.period} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div className="relative flex h-44 w-full max-w-16 items-end">
                          {s.count !== null && (
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[11px] font-bold text-ink-950">
                              {s.count.toFixed(0)}
                            </span>
                          )}
                          {s.count === null ? (
                            <div
                              className="w-full rounded-t border border-dashed border-ink-200"
                              style={{ height: '8%' }}
                              title="Not recorded"
                            />
                          ) : (
                            <div
                              className="w-full rounded-t"
                              style={{
                                height: `${Math.max((s.count / singleMax) * 100, 2)}%`,
                                backgroundColor: ct?.colour,
                              }}
                              title={`${fmtPeriod(s.period)}: ${s.count.toFixed(0)}${s.partRecorded ? ' (month still running)' : ''}`}
                            />
                          )}
                        </div>
                        <span className="truncate text-[10px] font-medium text-ink-500">
                          {fmtPeriod(s.period)}
                          {s.partRecorded && <span className="text-ink-400"> so far</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()
            ) : (
              <>
              {/* Same-height caption as the drill-down view so the chart
                  doesn't jump when a class is selected. */}
              <p className="mt-3 text-[12px] font-medium text-ink-500">
                All classes side by side — click one to see it against itself.
              </p>
              <div className="mt-3 flex items-end justify-around gap-4">
                {chart.groups.map((g) => (
                  <div key={g.period} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex h-44 w-full items-end justify-center gap-[3px]">
                      {g.bars.map((b) => (
                        <div
                          key={b.ct.id}
                          className="relative flex h-full max-w-7 min-w-1.5 flex-1 items-end"
                          title={`${b.ct.name}: ${b.count}`}
                        >
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${Math.max((b.count / chart.max) * 100, 2)}%`,
                              backgroundColor: b.ct.colour,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <span className="truncate text-[10px] font-medium text-ink-500">
                      {fmtPeriod(g.period)}
                      {g.partRecorded && (
                        <span className="text-ink-400" title="This month is still running">
                          {' '}
                          so far
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              </>
            )}
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
