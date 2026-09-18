// The club's own suggested swaps, straight out of TrainHeroic.
//
// Chris enters a scaled option against an exercise in the TrainHeroic library
// ("Chin Up Negative" swaps to Weighted Chin Up, Banded Chin Up, Strict Chin
// Up). That library is the club account's, not the Coach Chris Chan one, and
// its ids are its own, so a swap cannot be looked up by the tool's library id.
// It is looked up by title, which is what the pull carries verbatim anyway.
//
// `GET /v5/exerciseLibrary/all` returns every exercise with a `swaps` array;
// only the ones he has filled in carry anything.

export interface ThLibraryExercise {
  id?: number;
  title?: string;
  swaps?: { exerciseId?: number; title?: string }[];
}

/** Titles compared the way a coach would: case, spacing and punctuation aside. */
export function normTitle(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9 &/+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Swaps that go UP, not down.
 *
 * TrainHeroic has one list per exercise and does not say which way a swap
 * goes. Most are regressions, so the board calls them a scale; these are
 * progressions and are called a suggested swap instead. A weighted chin up is
 * harder than a chin up negative, and calling it a scale reads wrong on a wall.
 *
 * Keyed by the exercise, then the swap, both normalised. Add a line here when
 * a new swap goes up.
 */
export const HARDER_SWAPS: Record<string, string[]> = {
  'chin up negative': ['weighted chin up', 'strict chin up'],
};

/** Normalised exercise title -> its scaled options, in the order he wrote them. */
export function swapMapFrom(library: ThLibraryExercise[]): Map<string, { name: string; harder?: boolean }[]> {
  const out = new Map<string, { name: string; harder?: boolean }[]>();
  for (const e of library) {
    const title = (e.title ?? '').trim();
    const swaps = (e.swaps ?? []).map((s) => (s.title ?? '').trim()).filter(Boolean);
    if (!title || !swaps.length) continue;
    const harder = HARDER_SWAPS[normTitle(title)] ?? [];
    out.set(
      normTitle(title),
      swaps.map((name) => (harder.includes(normTitle(name)) ? { name, harder: true } : { name })),
    );
  }
  return out;
}
