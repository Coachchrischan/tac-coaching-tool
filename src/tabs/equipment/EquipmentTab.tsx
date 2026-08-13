import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { EquipmentItem } from '../../types/documents';

const field =
  'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none';

export default function EquipmentTab() {
  const { data, saveState, update, reloadTheirs, keepMine, retry } = useDoc('equipment');
  const [draft, setDraft] = useState({ name: '', count: '' });

  if (!data) return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;

  function addItem() {
    const name = draft.name.trim();
    const count = Number(draft.count);
    if (!name || !Number.isFinite(count) || count < 0) return;
    const item: EquipmentItem = { id: crypto.randomUUID(), name, count };
    update((d) => ({ ...d, items: [...d.items, item] }));
    setDraft({ name: '', count: '' });
  }

  function patch(id: string, patchObj: Partial<EquipmentItem>) {
    update((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, ...patchObj } : i)),
    }));
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Equipment inventory</h2>
          <p className="text-[13px] text-ink-500">
            Counts are real numbers, ready for a future programming-vs-availability check.
          </p>
        </div>
        <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} onRetry={retry} />
      </div>

      <div className="flex items-end gap-2 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <input
          className={`${field} flex-1`}
          placeholder="Item (e.g. Barbells)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <input
          type="number"
          min={0}
          className={`${field} w-24 text-center`}
          placeholder="Count"
          value={draft.count}
          onChange={(e) => setDraft({ ...draft, count: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!draft.name.trim() || draft.count === ''}
          className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <table className="mt-4 w-full rounded-xl border border-ink-200 bg-white shadow-sm">
        <thead>
          <tr className="border-b border-ink-200">
            <th className="px-4 py-2.5 text-left text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Item
            </th>
            <th className="w-28 px-2 py-2.5 text-center text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Count
            </th>
            <th className="px-2 py-2.5 text-left text-[11px] font-medium tracking-wide text-ink-500 uppercase">
              Notes
            </th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {data.items.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-1.5">
                <input
                  className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-ink-950 hover:border-ink-300 focus:border-accent-600 focus:outline-none"
                  value={item.name}
                  onChange={(e) => patch(item.id, { name: e.target.value })}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-md border border-ink-300 bg-white px-1.5 py-1 text-center text-sm font-semibold text-ink-950 focus:border-accent-600 focus:outline-none"
                  value={item.count}
                  onChange={(e) => patch(item.id, { count: Math.max(0, Number(e.target.value) || 0) })}
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-500 hover:border-ink-300 focus:border-accent-600 focus:text-ink-950 focus:outline-none"
                  placeholder="-"
                  value={item.notes ?? ''}
                  onChange={(e) => patch(item.id, { notes: e.target.value || undefined })}
                />
              </td>
              <td className="px-2 py-1.5 text-center">
                <button
                  type="button"
                  title="Delete item"
                  onClick={() => update((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }))}
                  className="rounded px-1.5 py-0.5 text-sm text-ink-300 hover:text-red-600"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
