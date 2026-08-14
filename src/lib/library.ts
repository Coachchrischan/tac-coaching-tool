import type { LibraryOverridesDoc, Pattern } from '../types/documents';
import { MATCH_THRESHOLD, score } from './fuzzy';

export interface LibraryExercise {
  id: number;
  title: string;
  custom: boolean; // Chris's own TrainHeroic exercises, or app-added (negative id)
  tags: string[];
  patternGuess: Pattern[];
  videoUrl?: string; // same demo video as TrainHeroic, where available
}

let cached: LibraryExercise[] | null = null;
let pending: Promise<LibraryExercise[]> | null = null;

/** Load the generated library JSON once per session (static fetch, ~260KB). */
export function loadLibrary(): Promise<LibraryExercise[]> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch('/data/exercise-library.json')
      .then((r) => {
        if (!r.ok) throw new Error(`library fetch failed (${r.status})`);
        return r.json() as Promise<LibraryExercise[]>;
      })
      .then((lib) => {
        cached = lib;
        return lib;
      })
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Generated library + the coach's app-added custom exercises. */
export function mergedLibrary(
  base: LibraryExercise[],
  overrides: LibraryOverridesDoc,
): LibraryExercise[] {
  const custom = overrides.customExercises.map(
    (c): LibraryExercise => ({
      id: c.id,
      title: c.title,
      custom: true,
      tags: [],
      patternGuess: c.patterns,
    }),
  );
  return custom.length ? [...base, ...custom] : base;
}

/** Effective movement patterns for an exercise: coach tag wins over the guess. */
export function patternsFor(
  exercise: LibraryExercise,
  overrides: LibraryOverridesDoc,
): Pattern[] {
  return overrides.patterns[exercise.id] ?? exercise.patternGuess;
}

export interface RankedExercise {
  exercise: LibraryExercise;
  score: number;
}

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const singular = (w: string) =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.replace(/s$/, '') : w;
const tokens = (s: string) => norm(s).split(' ').filter(Boolean).map(singular);

/** Fraction of query words present as whole words in the title. This is what
 *  lets "barbell squat" rank "Barbell Back Squat" (both words) above "Air Squat"
 *  (one word), instead of every squat exercise tying and sorting alphabetically. */
function coverage(query: string, title: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const t = new Set(tokens(title));
  let hit = 0;
  for (const w of q) if (t.has(w)) hit += 1;
  return hit / q.length;
}

/** Rank the library against a query. Ties on the fuzzy score are broken by how
 *  many query words the title actually contains, then by shorter title (the base
 *  exercise beats an obscure variation), then alphabetically. Custom exercises
 *  get a small boost so Chris's own variants surface first on near-ties. */
export function searchLibrary(
  library: LibraryExercise[],
  query: string,
  limit = 12,
): RankedExercise[] {
  if (!query.trim()) return [];
  const ranked: (RankedExercise & { cover: number })[] = [];
  for (const exercise of library) {
    const s = score(query, exercise.title);
    if (s > MATCH_THRESHOLD) {
      ranked.push({
        exercise,
        score: s + (exercise.custom ? 0.05 : 0),
        cover: coverage(query, exercise.title),
      });
    }
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.cover - a.cover ||
      a.exercise.title.length - b.exercise.title.length ||
      a.exercise.title.localeCompare(b.exercise.title),
  );
  return ranked.slice(0, limit).map(({ exercise, score: sc }) => ({ exercise, score: sc }));
}
