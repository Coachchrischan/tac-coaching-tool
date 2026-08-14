import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';

export default function EthosTab() {
  const home = useDoc('home');
  const [editing, setEditing] = useState(false);

  if (!home.data) return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  const doc = home.data;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink-950">Ethos</h2>
        <div className="flex items-center gap-3">
          <SaveBadge
            state={home.saveState}
            onReloadTheirs={home.reloadTheirs}
            onKeepMine={home.keepMine}
            onRetry={home.retry}
          />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      <section className="rounded-xl bg-ink-950 p-8">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-sand-500 uppercase">
          Teneriffe Athletic Club · Group class programming
        </p>

        {editing ? (
          <div className="mt-4 space-y-4">
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
                rows={6}
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
                rows={5}
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
            <p className="font-display mt-4 text-[26px] leading-snug text-[#F5F3EB]">{doc.ethos}</p>

            <h4 className="mt-8 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
              What we focus on
            </h4>
            <ul className="mt-2.5 space-y-2">
              {doc.focusPoints
                .filter((p) => p.trim())
                .map((p, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-200">
                    <span className="mt-0.5 text-accent-500">▸</span>
                    {p}
                  </li>
                ))}
            </ul>

            <h4 className="mt-8 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
              What makes it different
            </h4>
            <ul className="mt-2.5 space-y-2">
              {doc.different
                .filter((p) => p.trim())
                .map((p, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-200">
                    <span className="mt-0.5 text-sand-500">▸</span>
                    {p}
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
