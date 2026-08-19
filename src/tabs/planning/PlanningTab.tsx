import { useState } from 'react';
import { mostUrgent, useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import { streamsOf, withStreamBlocks } from '../../lib/programStreams';

export default function PlanningTab() {
  const planning = useDoc('planning');
  const program = useDoc('program');
  const [todoDraft, setTodoDraft] = useState('');

  if (!planning.data || !program.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  function addTodo() {
    const text = todoDraft.trim();
    if (!text) return;
    planning.update((d) => ({
      ...d,
      todos: [...d.todos, { id: crypto.randomUUID(), text, done: false }],
    }));
    setTodoDraft('');
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink-950">Planning</h2>
        {(() => {
          const urgent = mostUrgent([planning, program]);
          return (
            <SaveBadge
              state={urgent.saveState}
              onReloadTheirs={urgent.reloadTheirs}
              onKeepMine={urgent.keepMine}
              onRetry={urgent.retry}
            />
          );
        })()}
      </div>

      {/* Block themes (edits ProgramDoc directly; same field the Programming tab shows) */}
      <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
          Strength phase themes ({program.data.name})
        </h3>
        <div className="mt-3 space-y-2">
          {streamsOf(program.data)[0].blocks.map((b, i, all) => {
            const first = all.slice(0, i).reduce((n, x) => n + x.weeks.length, 0) + 1;
            const last = first + b.weeks.length - 1;
            return (
            <div key={b.id} className="flex items-center gap-3">
              <span className="w-24 text-sm font-semibold text-ink-950">
                Phase {i + 1}
                <span className="block text-[11px] font-normal text-ink-400">
                  {first === last ? `Week ${first}` : `Weeks ${first}–${last}`}
                </span>
              </span>
              <input
                className="flex-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
                placeholder="Theme (e.g. Foundations, Build, Peak)"
                value={b.theme ?? ''}
                onChange={(e) =>
                  program.update((d) =>
                    withStreamBlocks(
                      d,
                      0,
                      streamsOf(d)[0].blocks.map((x, xi) =>
                        xi === i ? { ...x, theme: e.target.value } : x,
                      ),
                    ),
                  )
                }
              />
            </div>
            );
          })}
        </div>
      </section>

      {/* To-dos */}
      <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">To-dos</h3>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
            placeholder="Add a to-do and press Enter"
            value={todoDraft}
            onChange={(e) => setTodoDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          />
          <button
            type="button"
            onClick={addTodo}
            className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
          >
            Add
          </button>
        </div>
        <ul className="mt-2 divide-y divide-ink-100">
          {planning.data.todos.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 py-2">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  planning.update((d) => ({
                    ...d,
                    todos: d.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                  }))
                }
                className="h-4 w-4 accent-accent-600"
              />
              <span className={`flex-1 text-sm ${t.done ? 'text-ink-400 line-through' : 'text-ink-950'}`}>
                {t.text}
              </span>
              <button
                type="button"
                onClick={() =>
                  planning.update((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== t.id) }))
                }
                className="rounded px-1.5 py-0.5 text-sm text-ink-300 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Free-form notes */}
      <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Notes & links</h3>
        <textarea
          className="mt-2 w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
          rows={12}
          placeholder="Working notes: ideas, links, class mix thinking, attendance observations…"
          value={planning.data.notes}
          onChange={(e) => planning.update((d) => ({ ...d, notes: e.target.value }))}
        />
      </section>
    </div>
  );
}
