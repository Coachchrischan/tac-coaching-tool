import { useState } from 'react';
import type { ScheduleDoc, WeekScenario } from '../../types/documents';

const btn =
  'rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100';

export default function ScenarioBar({
  doc,
  onUpdate,
}: {
  doc: ScheduleDoc;
  onUpdate: (fn: (d: ScheduleDoc) => ScheduleDoc) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const active = doc.scenarios.find((s) => s.id === doc.activeScenarioId) ?? doc.scenarios[0];

  function duplicate() {
    const copy: WeekScenario = {
      id: crypto.randomUUID(),
      name: `Copy of ${active.name}`,
      blocks: active.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })),
    };
    onUpdate((d) => ({
      ...d,
      scenarios: [...d.scenarios, copy],
      activeScenarioId: copy.id,
    }));
  }

  function addEmpty() {
    const fresh: WeekScenario = { id: crypto.randomUUID(), name: 'New week', blocks: [] };
    onUpdate((d) => ({
      ...d,
      scenarios: [...d.scenarios, fresh],
      activeScenarioId: fresh.id,
    }));
  }

  function remove() {
    if (doc.scenarios.length <= 1) return;
    if (!window.confirm(`Delete scenario "${active.name}"? This cannot be undone.`)) return;
    onUpdate((d) => {
      const remaining = d.scenarios.filter((s) => s.id !== active.id);
      return { ...d, scenarios: remaining, activeScenarioId: remaining[0].id };
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Week layout</span>
      {renaming ? (
        <input
          autoFocus
          className="rounded-md border border-accent-600 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-950 focus:outline-none"
          value={active.name}
          onChange={(e) =>
            onUpdate((d) => ({
              ...d,
              scenarios: d.scenarios.map((s) =>
                s.id === active.id ? { ...s, name: e.target.value } : s,
              ),
            }))
          }
          onBlur={() => setRenaming(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <select
          className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-950 focus:border-accent-600 focus:outline-none"
          value={active.id}
          onChange={(e) => onUpdate((d) => ({ ...d, activeScenarioId: e.target.value }))}
        >
          {doc.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" className={btn} onClick={() => setRenaming(true)}>
        Rename
      </button>
      <button type="button" className={btn} onClick={duplicate}>
        Duplicate week
      </button>
      <button type="button" className={btn} onClick={addEmpty}>
        New empty week
      </button>
      <button
        type="button"
        className={`${btn} disabled:cursor-not-allowed disabled:opacity-40`}
        disabled={doc.scenarios.length <= 1}
        onClick={remove}
      >
        Delete
      </button>
    </div>
  );
}
