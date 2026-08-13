import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { CommunityEvent } from '../../types/documents';

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

// Ready-made event ideas for TAC. Click one to prefill the form above.
const EVENT_IDEAS: { name: string; notes: string }[] = [
  {
    name: 'Hyrox simulation day',
    notes: 'Full 8-station race in pairs, race-day timing, pacing debrief after. Feeds the comp-prep phase.',
  },
  {
    name: 'Members vs coaches Game Day',
    notes: 'Saturday special: teams, leaderboard, forfeit for the losing coaches. Big social pull.',
  },
  {
    name: 'Teneriffe river run + coffee',
    notes: 'Run Club social along the Brisbane River, all paces, finish at a local cafe. Zero barrier to entry.',
  },
  {
    name: 'Bring-a-mate week',
    notes: 'Members bring a friend free to any class all week. The single best membership driver we control.',
  },
  {
    name: 'In-house lifting comp',
    notes: 'Squat, bench, deadlift total. Novice-friendly divisions, PB bell, judges from the coaching team.',
  },
  {
    name: 'Charity workout',
    notes: 'One big team workout with entry by donation (RUOK Day, Movember). Community story for socials.',
  },
  {
    name: 'PB night',
    notes: 'Deload-week testing party at the end of a strength block: music, spotters, someone on the camera.',
  },
  {
    name: 'Recovery + sauna social',
    notes: 'Guided mobility session then saunas and smoothies. Shows off the 24-hour facility to partners.',
  },
  {
    name: 'Fuel for training workshop',
    notes: 'Guest dietitian or physio evening talk with Q&A. Education is part of the product.',
  },
  {
    name: 'Quarterly awards BBQ',
    notes: 'Most consistent, most improved, community spirit. Cheap to run, remembered for months.',
  },
];

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CommunityTab() {
  const { data, saveState, update, reloadTheirs, keepMine, retry } = useDoc('community');
  const [draft, setDraft] = useState({ date: '', name: '', notes: '' });

  if (!data) return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...data.events].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((e) => e.date >= today);
  const past = sorted.filter((e) => e.date < today).reverse();

  function addEvent() {
    if (!draft.date || !draft.name.trim()) return;
    const event: CommunityEvent = {
      id: crypto.randomUUID(),
      date: draft.date,
      name: draft.name.trim(),
      notes: draft.notes.trim() || undefined,
    };
    update((d) => ({ ...d, events: [...d.events, event] }));
    setDraft({ date: '', name: '', notes: '' });
  }

  function EventList({ events, dim }: { events: CommunityEvent[]; dim?: boolean }) {
    return (
      <ul className="divide-y divide-ink-100">
        {events.map((e) => (
          <li key={e.id} className={`flex items-start gap-4 py-3 ${dim ? 'opacity-60' : ''}`}>
            <span className="w-44 shrink-0 text-sm font-semibold text-accent-600">{fmtDate(e.date)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-950">{e.name}</p>
              {e.notes && <p className="mt-0.5 text-[13px] text-ink-500">{e.notes}</p>}
            </div>
            <button
              type="button"
              title="Delete event"
              onClick={() => update((d) => ({ ...d, events: d.events.filter((x) => x.id !== e.id) }))}
              className="rounded px-1.5 py-0.5 text-sm text-ink-300 hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-950">Community events</h2>
        <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} onRetry={retry} />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <input
          type="date"
          className={field}
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <input
          className={`${field} flex-1`}
          placeholder="Event name (e.g. Saturday Game Day special, member BBQ)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && addEvent()}
        />
        <input
          className={`${field} flex-1`}
          placeholder="Notes (optional)"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && addEvent()}
        />
        <button
          type="button"
          onClick={addEvent}
          disabled={!draft.date || !draft.name.trim()}
          className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <section className="mt-4 rounded-xl border border-dashed border-ink-300 bg-white p-4">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
          Ideas for TAC · click one to start planning it
        </h3>
        <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {EVENT_IDEAS.map((idea) => (
            <button
              key={idea.name}
              type="button"
              title={idea.notes}
              onClick={() => {
                setDraft((d) => ({ ...d, name: idea.name, notes: idea.notes }));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="rounded-md border border-ink-200 px-2.5 py-1.5 text-left text-[13px] hover:border-accent-600 hover:bg-accent-100/40"
            >
              <span className="font-medium text-ink-950">{idea.name}</span>
              <span className="block truncate text-[11px] text-ink-500">{idea.notes}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="py-3 text-sm text-ink-400">Nothing planned yet.</p>
        ) : (
          <EventList events={upcoming} />
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Past</h3>
          <EventList events={past} dim />
        </section>
      )}
    </div>
  );
}
