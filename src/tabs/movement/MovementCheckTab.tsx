import { useMemo, useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { mergedLibrary, patternsFor } from '../../lib/library';
import { streamsOf } from '../../lib/programStreams';
import SaveBadge from '../../components/SaveBadge';
import { PATTERN_LABELS, PATTERNS } from '../../types/documents';
import type { Pattern } from '../../types/documents';

const REGION_TAGS = ['Upper', 'Lower', 'Whole Body', 'Midline'] as const;

const pill = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-ink-950 text-white' : 'bg-white text-ink-500 border border-ink-300 hover:text-ink-950'
  }`;

interface UsedExercise {
  id: number;
  name: string;
  count: number;
  patterns: Pattern[];
  regions: string[];
  inLibrary: boolean;
}

export default function MovementCheckTab() {
  const program = useDoc('program');
  const lib = useDoc('library-overrides');
  const { library } = useLibrary();
  const [bi, setBi] = useState(0);

  const overrides = lib.data;
  // Coverage is judged on the Strength stream: it is where patterns are
  // programmed deliberately. Other streams have their own metrics.
  const phases = program.data ? (streamsOf(program.data)[0]?.blocks ?? []) : [];
  const phaseIndex = Math.min(bi, Math.max(phases.length - 1, 0));

  const analysis = useMemo(() => {
    if (!program.data || !overrides || !library) return null;
    const merged = mergedLibrary(library, overrides);
    const byId = new Map(merged.map((e) => [e.id, e]));
    const target = streamsOf(program.data)[0]?.blocks[phaseIndex];
    if (!target) return null;

    const used = new Map<number | string, UsedExercise>();
    for (const week of target.weeks) {
      for (const session of week.sessions) {
        for (const block of session.timedBlocks) {
          for (const slot of block.slots) {
            if (!slot.name) continue;
            const key = slot.exerciseId ?? `free:${slot.name.toLowerCase()}`;
            const existing = used.get(key);
            if (existing) {
              existing.count += 1;
              continue;
            }
            const ex = slot.exerciseId !== null ? byId.get(slot.exerciseId) : undefined;
            used.set(key, {
              id: slot.exerciseId ?? 0,
              name: ex?.title ?? slot.name,
              count: 1,
              patterns: ex ? patternsFor(ex, overrides) : [],
              regions: ex ? ex.tags.filter((t) => (REGION_TAGS as readonly string[]).includes(t)) : [],
              inLibrary: Boolean(ex),
            });
          }
        }
      }
    }

    const patternCounts = Object.fromEntries(PATTERNS.map((p) => [p, 0])) as Record<Pattern, number>;
    const regionCounts = Object.fromEntries(REGION_TAGS.map((r) => [r, 0])) as Record<string, number>;
    for (const ex of used.values()) {
      for (const p of ex.patterns) patternCounts[p] += ex.count;
      for (const r of ex.regions) regionCounts[r] += ex.count;
    }

    const exercises = [...used.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { exercises, patternCounts, regionCounts };
  }, [program.data, overrides, library, phaseIndex]);

  if (!program.data || !overrides || !library) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  function togglePattern(exerciseId: number, pattern: Pattern, current: Pattern[]) {
    const next = current.includes(pattern)
      ? current.filter((p) => p !== pattern)
      : [...current, pattern];
    lib.update((d) => ({ ...d, patterns: { ...d.patterns, [exerciseId]: next } }));
  }

  const maxCount = analysis ? Math.max(1, ...Object.values(analysis.patternCounts)) : 1;
  const untagged = analysis ? analysis.exercises.filter((e) => e.inLibrary && e.patterns.length === 0) : [];
  const freeText = analysis ? analysis.exercises.filter((e) => !e.inLibrary) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl text-ink-950">Movement check</h2>
          <div className="flex items-center gap-1.5">
            {phases.map((b, i) => (
              <button key={b.id} type="button" className={pill(i === bi)} onClick={() => setBi(i)}>
                Phase {i + 1}
              </button>
            ))}
            <span className="ml-2 text-sm text-ink-500 italic">{phases[phaseIndex]?.theme}</span>
          </div>
        </div>
        <SaveBadge state={lib.saveState} onReloadTheirs={lib.reloadTheirs} onKeepMine={lib.keepMine} onRetry={lib.retry} />
      </div>

      {/* Pattern coverage */}
      <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink-950">Movement pattern coverage</h3>
        <p className="mt-1 text-[13px] text-ink-500">
          Times each pattern appears across every week of this phase (every session, every slot).
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {PATTERNS.map((p) => {
            const count = analysis?.patternCounts[p] ?? 0;
            return (
              <div
                key={p}
                className={`rounded-lg border p-3 ${
                  count === 0 ? 'border-amber-300 bg-amber-50' : 'border-ink-200 bg-ink-50'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-ink-700">{PATTERN_LABELS[p]}</span>
                  <span className={`text-lg font-bold ${count === 0 ? 'text-amber-600' : 'text-ink-950'}`}>
                    {count}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
                  <div
                    className={`h-full rounded-full ${count === 0 ? 'bg-amber-400' : 'bg-accent-600'}`}
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
                {count === 0 && <p className="mt-1.5 text-[11px] text-amber-700">Not covered this block</p>}
              </div>
            );
          })}
        </div>

        {/* Region breakdown */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-ink-200 pt-3">
          {REGION_TAGS.map((r) => (
            <span key={r} className="text-[13px] text-ink-500">
              {r}: <span className="font-semibold text-ink-950">{analysis?.regionCounts[r] ?? 0}</span>
            </span>
          ))}
          <span className="text-[11px] text-ink-400 self-center">
            (body regions, from TrainHeroic tags where present)
          </span>
        </div>
      </section>

      {/* Untagged exercises: the prompt to tag once, reuse forever */}
      {untagged.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold text-amber-900">
            {untagged.length} exercise{untagged.length === 1 ? '' : 's'} in this block ha
            {untagged.length === 1 ? 's' : 've'} no movement pattern yet
          </h3>
          <p className="mt-1 text-[13px] text-amber-800">
            Tag them once here; the tag is saved to the library and reused in every block and future program.
          </p>
        </section>
      )}

      {/* All exercises with tag chips */}
      <section className="mt-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink-950">Exercises in this block</h3>
        {analysis && analysis.exercises.length === 0 && (
          <p className="mt-2 text-sm text-ink-400">Nothing programmed in this block yet.</p>
        )}
        <ul className="mt-3 divide-y divide-ink-100">
          {analysis?.exercises
            .filter((e) => e.inLibrary)
            .map((ex) => (
              <li key={ex.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-56 text-sm font-medium text-ink-950">{ex.name}</span>
                <span className="text-xs text-ink-400">×{ex.count}</span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {PATTERNS.map((p) => {
                    const on = ex.patterns.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePattern(ex.id, p, ex.patterns)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          on
                            ? 'border-accent-600 bg-accent-600 text-white'
                            : 'border-ink-300 text-ink-400 hover:border-ink-500 hover:text-ink-700'
                        }`}
                      >
                        {PATTERN_LABELS[p]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
        </ul>
        {freeText.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-400">
            Free-text entries (not in the library, not counted):{' '}
            {freeText.map((e) => e.name).join(', ')}. Pick them from the library in Programming to
            include them here.
          </p>
        )}
      </section>
    </div>
  );
}
