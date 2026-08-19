import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { AnnualPhase, AnnualStream, RaceEvent } from '../../types/documents';

const YEAR_WEEKS = 52;
const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

function addWeeks(iso: string, weeks: number): Date {
  return new Date(new Date(`${iso}T00:00:00`).getTime() + weeks * MS_WEEK);
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** Cumulative start week of each phase in a stream. */
function phaseStarts(stream: AnnualStream): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const p of stream.phases) {
    starts.push(acc);
    acc += p.weeks;
  }
  return starts;
}

/** Shade a stream colour for phase i of n: later phases mix progressively
 *  toward cream, so one lane reads as ordered shades of the same colour. */
function phaseShade(hex: string, i: number, n: number): string {
  const t = n <= 1 ? 0 : (i / (n - 1)) * 0.42;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // cream #F5F3EB
  return `rgb(${mix(r, 245)}, ${mix(g, 243)}, ${mix(b, 235)})`;
}

/**
 * Week-resolution ruler matching Chris's planning sheet: a months row, a
 * week-number row (1..52) and the date of each week's Monday. A week belongs
 * to the month its Monday falls in. The current week is highlighted.
 */
function WeekRuler({ startDate }: { startDate: string }) {
  const mondays = Array.from({ length: YEAR_WEEKS }, (_, i) => addWeeks(startDate, i));
  const spans: { label: string; count: number }[] = [];
  for (const d of mondays) {
    const label = d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    const last = spans[spans.length - 1];
    if (last?.label === label) last.count += 1;
    else spans.push({ label, count: 1 });
  }
  const now = Date.now();
  const isCurrent = (i: number) =>
    now >= mondays[i].getTime() && now < mondays[i].getTime() + MS_WEEK;
  const grid = {
    display: 'grid',
    gridTemplateColumns: `repeat(${YEAR_WEEKS}, minmax(0, 1fr))`,
  } as const;
  const rowLabel =
    'block h-5 text-right text-[9px] leading-5 font-medium tracking-wide text-ink-400 uppercase';

  return (
    <div className="flex items-stretch">
      <div className="w-28 shrink-0 pr-3">
        <span className={rowLabel}>Month</span>
        <span className={rowLabel}>Week</span>
        <span className={rowLabel}>Monday</span>
      </div>
      <div className="min-w-0 flex-1">
        <div style={grid}>
          {spans.map((s, i) => (
            <div
              key={i}
              style={{ gridColumn: `span ${s.count} / span ${s.count}` }}
              className="h-5 overflow-hidden border-l border-ink-300 pl-1 text-[10px] leading-5 font-medium whitespace-nowrap text-ink-500"
            >
              {s.count >= 2 ? s.label : ''}
            </div>
          ))}
        </div>
        <div style={grid}>
          {mondays.map((_, i) => (
            <div
              key={i}
              className={`h-5 border-t border-l border-ink-200 text-center text-[9px] leading-5 tabular-nums ${
                isCurrent(i) ? 'bg-sand-500/50 font-bold text-ink-950' : 'text-ink-500'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div style={grid}>
          {mondays.map((d, i) => (
            <div
              key={i}
              title={d.toLocaleDateString('en-AU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              className={`h-5 border-y border-l border-ink-200 text-center text-[9px] leading-5 tabular-nums ${
                isCurrent(i) ? 'bg-sand-500/50 font-bold text-ink-950' : 'text-ink-700'
              }`}
            >
              {d.getDate()}
            </div>
          ))}
        </div>
      </div>
      {/* Invisible twin of the lanes' add-phase button so columns line up. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="invisible ml-2 shrink-0 self-center rounded-md border border-dashed border-ink-300 px-2 py-1 text-sm font-medium"
      >
        +
      </button>
    </div>
  );
}

/** Week offset of a date from the plan's start Monday (may be out of range). */
function weekOffset(startDate: string, iso: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const d = new Date(`${iso}T00:00:00`).getTime();
  return (d - start) / MS_WEEK;
}

function fmtRange(race: RaceEvent): string {
  const s = new Date(`${race.date}T00:00:00`);
  if (!race.endDate) return fmtShort(s);
  const e = new Date(`${race.endDate}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth();
  return sameMonth
    ? `${s.getDate()}-${e.getDate()} ${e.toLocaleDateString('en-AU', { month: 'short' })}`
    : `${fmtShort(s)} - ${fmtShort(e)}`;
}

/** Race pins drawn over a stream's lane, positioned by week. */
function RaceMarkers({ races, startDate }: { races: RaceEvent[]; startDate: string }) {
  const shown = races
    .map((r) => ({ race: r, off: weekOffset(startDate, r.date) }))
    .filter((x) => x.off >= 0 && x.off < YEAR_WEEKS)
    .sort((a, b) => a.off - b.off);
  if (shown.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {shown.map(({ race, off }) => {
        const left = (off / YEAR_WEEKS) * 100;
        // Flip the label to the left of the pin near the right edge so it
        // never runs off the lane.
        const flip = left > 82;
        return (
          <div key={race.id} className="absolute top-0 bottom-0" style={{ left: `${left}%` }}>
            <div className="h-full w-0.5 bg-sand-500 shadow-[0_0_0_1px_rgba(32,29,29,0.35)]" />
            <span
              className={`absolute top-1 rounded bg-sand-500 px-1.5 py-0.5 text-[10px] leading-tight font-bold whitespace-nowrap text-ink-950 ${
                flip ? 'right-1' : 'left-1'
              }`}
            >
              {race.name.replace(/^HYROX\s+/i, '')}
              <span className="ml-1 font-normal opacity-70">{fmtRange(race)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AnnualPlanTab() {
  const { data, saveState, update, reloadTheirs, keepMine, retry } = useDoc('annual-plan');
  const [filter, setFilter] = useState<'all' | AnnualStream['id']>('all');
  const [selected, setSelected] = useState<{ streamId: string; phaseId: string } | null>(null);

  if (!data) return <p className="py-20 text-center text-sm text-ink-400">Loading annual plan…</p>;

  const streams = data.streams.filter((s) => filter === 'all' || s.id === filter);

  function patchStream(streamId: string, fn: (s: AnnualStream) => AnnualStream) {
    update((d) => ({
      ...d,
      streams: d.streams.map((s) => (s.id === streamId ? fn(s) : s)),
    }));
  }

  function patchPhase(streamId: string, phaseId: string, patch: Partial<AnnualPhase>) {
    patchStream(streamId, (s) => ({
      ...s,
      phases: s.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)),
    }));
  }

  function addPhase(streamId: string) {
    const fresh: AnnualPhase = {
      id: crypto.randomUUID(),
      name: 'New phase',
      focus: '',
      weeks: 4,
    };
    patchStream(streamId, (s) => ({ ...s, phases: [...s.phases, fresh] }));
    setSelected({ streamId, phaseId: fresh.id });
  }

  function deletePhase(streamId: string, phaseId: string) {
    patchStream(streamId, (s) => ({ ...s, phases: s.phases.filter((p) => p.id !== phaseId) }));
    setSelected(null);
  }

  function addRace() {
    const fresh: RaceEvent = {
      id: crypto.randomUUID(),
      name: 'New race',
      date: data!.startDate,
      streamId: 'hyrox',
    };
    update((d) => ({ ...d, races: [...(d.races ?? []), fresh] }));
  }

  function patchRace(raceId: string, patch: Partial<RaceEvent>) {
    update((d) => ({
      ...d,
      races: (d.races ?? []).map((r) => {
        if (r.id !== raceId) return r;
        const next = { ...r, ...patch };
        if (patch.endDate === undefined && 'endDate' in patch) delete next.endDate;
        return next;
      }),
    }));
  }

  function movePhase(streamId: string, phaseId: string, dir: -1 | 1) {
    patchStream(streamId, (s) => {
      const i = s.phases.findIndex((p) => p.id === phaseId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.phases.length) return s;
      const phases = [...s.phases];
      [phases[i], phases[j]] = [phases[j], phases[i]];
      return { ...s, phases };
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl text-ink-950">Annual plan</h2>
          <label className="flex items-center gap-1.5 text-sm text-ink-500">
            Year starts
            <input
              type="date"
              className={field}
              value={data.startDate}
              onChange={(e) => e.target.value && update((d) => ({ ...d, startDate: e.target.value }))}
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-ink-300">
            {(['all', 'strength', 'esd', 'hyrox'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
              >
                {f === 'all' ? 'All' : f === 'esd' ? 'ESD' : f}
              </button>
            ))}
          </div>
          <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} onRetry={retry} />
        </div>
      </div>

      <p className="mb-4 text-[13px] text-ink-500">
        One lane per training stream. Click a phase to edit its focus and length; start dates roll on
        automatically from the year start.
      </p>

      <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <WeekRuler startDate={data.startDate} />

        <div className="mt-3 space-y-6">
          {streams.map((stream) => {
            const starts = phaseStarts(stream);
            const total = stream.phases.reduce((sum, p) => sum + p.weeks, 0);
            return (
              <div key={stream.id}>
                <div className="flex items-stretch">
                  <div className="w-28 shrink-0 pr-3">
                    <span className="text-sm font-semibold text-ink-950">{stream.name}</span>
                    <span
                      className={`block text-[11px] ${total === YEAR_WEEKS ? 'text-ink-400' : 'text-amber-600'}`}
                    >
                      {total} wk{total === YEAR_WEEKS ? '' : ` of ${YEAR_WEEKS}`}
                    </span>
                  </div>
                  <div className="relative h-28 flex-1">
                    <div className="flex h-full overflow-hidden rounded-md">
                      {stream.phases.map((p, i) => {
                        const isSel =
                          selected?.streamId === stream.id && selected.phaseId === p.id;
                        // Short phases (a deload or transition week) can't fit
                        // horizontal text, so their label runs bottom-to-top.
                        const vertical = p.weeks <= 2;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              setSelected(isSel ? null : { streamId: stream.id, phaseId: p.id })
                            }
                            className={`flex min-w-0 leading-tight text-white transition-opacity ${
                              vertical
                                ? 'items-center justify-center px-0 py-2'
                                : 'flex-col justify-center px-2 py-1.5 text-left'
                            } ${isSel ? 'ring-2 ring-ink-950 ring-inset' : 'hover:opacity-90'}`}
                            style={{
                              width: `${(p.weeks / Math.max(total, YEAR_WEEKS)) * 100}%`,
                              backgroundColor: phaseShade(stream.colour, i, stream.phases.length),
                            }}
                            title={`${p.name} · ${fmtShort(addWeeks(data.startDate, starts[i]))} · ${p.weeks} wk${
                              p.focus ? `: ${p.focus}` : ''
                            }`}
                          >
                            {vertical ? (
                              <span
                                className="truncate text-[11px] font-bold"
                                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                              >
                                {p.name}
                              </span>
                            ) : (
                              <>
                                <span className="truncate text-[13px] font-bold">{p.name}</span>
                                <span className="truncate text-[11px] text-white/75">
                                  {fmtShort(addWeeks(data.startDate, starts[i]))} · {p.weeks} wk
                                </span>
                                {p.focus && (
                                  <span className="mt-0.5 line-clamp-3 overflow-hidden text-[10px] leading-snug text-white/60">
                                    {p.focus}
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <RaceMarkers
                      races={(data.races ?? []).filter((r) => r.streamId === stream.id)}
                      startDate={data.startDate}
                    />
                  </div>
                  <button
                    type="button"
                    title="Add a phase to this stream"
                    onClick={() => addPhase(stream.id)}
                    className="ml-2 shrink-0 self-center rounded-md border border-dashed border-ink-300 px-2 py-1 text-sm font-medium text-ink-400 hover:border-accent-600 hover:text-accent-600"
                  >
                    +
                  </button>
                </div>

                {/* Phase editor */}
                {selected?.streamId === stream.id &&
                  (() => {
                    const idx = stream.phases.findIndex((p) => p.id === selected.phaseId);
                    const p = stream.phases[idx];
                    if (!p) return null;
                    const startD = addWeeks(data.startDate, starts[idx]);
                    const endD = addWeeks(data.startDate, starts[idx] + p.weeks);
                    return (
                      <div className="mt-2 ml-28 flex flex-wrap items-end gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2.5">
                        <label className="text-[11px] font-medium text-ink-500">
                          Phase
                          <input
                            className={`${field} mt-0.5 block w-40`}
                            value={p.name}
                            onChange={(e) => patchPhase(stream.id, p.id, { name: e.target.value })}
                          />
                        </label>
                        <label className="min-w-64 flex-1 text-[11px] font-medium text-ink-500">
                          Focus
                          <input
                            className={`${field} mt-0.5 block w-full`}
                            placeholder="What this phase is for"
                            value={p.focus}
                            onChange={(e) => patchPhase(stream.id, p.id, { focus: e.target.value })}
                          />
                        </label>
                        <label className="text-[11px] font-medium text-ink-500">
                          Weeks
                          <input
                            type="number"
                            min={1}
                            max={52}
                            className={`${field} mt-0.5 block w-20 text-center`}
                            value={p.weeks}
                            onChange={(e) =>
                              patchPhase(stream.id, p.id, {
                                weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)),
                              })
                            }
                          />
                        </label>
                        <span className="pb-2 text-[12px] text-ink-500">
                          {fmtShort(startD)} to {fmtShort(endD)}
                        </span>
                        <div className="flex gap-1 pb-1">
                          <button type="button" title="Move earlier" onClick={() => movePhase(stream.id, p.id, -1)} className="rounded border border-ink-300 px-2 py-1 text-sm text-ink-700 hover:bg-ink-100">←</button>
                          <button type="button" title="Move later" onClick={() => movePhase(stream.id, p.id, 1)} className="rounded border border-ink-300 px-2 py-1 text-sm text-ink-700 hover:bg-ink-100">→</button>
                          <button
                            type="button"
                            onClick={() => deletePhase(stream.id, p.id)}
                            className="rounded border border-red-200 px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                        <label className="w-full text-[11px] font-medium text-ink-500">
                          Notes
                          <input
                            className={`${field} mt-0.5 block w-full`}
                            placeholder="Anything the floor coaches should know"
                            value={p.notes ?? ''}
                            onChange={(e) =>
                              patchPhase(stream.id, p.id, { notes: e.target.value || undefined })
                            }
                          />
                        </label>
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Race dates: drawn as pins on their stream's lane */}
      <section className="mt-5 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-ink-950">Race dates</h3>
          <button
            type="button"
            onClick={addRace}
            className="text-[12px] font-medium text-accent-600 hover:underline"
          >
            + Add race
          </button>
        </div>
        {(data.races ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-400">
            No races yet. Add one and it appears as a marker on its lane.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...(data.races ?? [])]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((r) => {
                const off = weekOffset(data.startDate, r.date);
                const inPlan = off >= 0 && off < YEAR_WEEKS;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${field} w-52`}
                      value={r.name}
                      onChange={(e) => patchRace(r.id, { name: e.target.value })}
                    />
                    <input
                      type="date"
                      className={field}
                      value={r.date}
                      onChange={(e) => e.target.value && patchRace(r.id, { date: e.target.value })}
                    />
                    <span className="text-[12px] text-ink-400">to</span>
                    <input
                      type="date"
                      className={field}
                      value={r.endDate ?? ''}
                      onChange={(e) => patchRace(r.id, { endDate: e.target.value || undefined })}
                    />
                    <select
                      className={field}
                      value={r.streamId}
                      onChange={(e) =>
                        patchRace(r.id, { streamId: e.target.value as AnnualStream['id'] })
                      }
                    >
                      {data.streams.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-ink-400">
                      {inPlan ? `week ${Math.floor(off) + 1}` : 'outside this plan year'}
                    </span>
                    <button
                      type="button"
                      title="Remove this race"
                      onClick={() =>
                        update((d) => ({ ...d, races: (d.races ?? []).filter((x) => x.id !== r.id) }))
                      }
                      className="ml-auto rounded px-1.5 py-0.5 text-sm text-ink-300 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
