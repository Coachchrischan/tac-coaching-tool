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

/** Rank the library against a query. Custom exercises get a small boost so
 *  Chris's own variants surface first on near-ties. */
export function searchLibrary(
  library: LibraryExercise[],
  query: string,
  limit = 8,
): RankedExercise[] {
  if (!query.trim()) return [];
  const ranked: RankedExercise[] = [];
  for (const exercise of library) {
    const s = score(query, exercise.title);
    if (s > MATCH_THRESHOLD) {
      ranked.push({ exercise, score: s + (exercise.custom ? 0.05 : 0) });
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.exercise.title.localeCompare(b.exercise.title));
  return ranked.slice(0, limit);
}
