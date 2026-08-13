// Fuzzy exercise-name scoring, ported verbatim from
// trainheroic-mcp/src/exerciseLibrary.js so this app resolves names exactly the
// way the TrainHeroic push pipeline does. Keep the two in sync if either changes.

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Equipment qualifiers the coach often prefixes that the library may omit (or vice versa).
const EQUIP = new Set([
  'db', 'dumbbell', 'dumbell', 'bb', 'barbell', 'kb', 'kettlebell',
  'cable', 'machine', 'smith', 'band', 'banded', 'trx', 'ez', 'ezbar',
]);

const singular = (w: string) =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.replace(/s$/, '') : w;

const loose = (s: string) =>
  norm(s)
    .split(' ')
    .filter((w) => w && !EQUIP.has(w))
    .map(singular)
    .join(' ');

const equipOf = (s: string) => norm(s).split(' ').filter((w) => EQUIP.has(w));
const singTokens = (s: string) => norm(s).split(' ').filter(Boolean).map(singular);
const boundaryContains = (t: string, q: string) =>
  Boolean(q && t && (` ${t} `.includes(` ${q} `) || ` ${q} `.includes(` ${t} `)));

export function score(query: string, title: string): number {
  const q = norm(query);
  const t = norm(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (boundaryContains(t, q)) return 0.9;
  const qe = equipOf(query);
  const te = equipOf(title);
  const equipConflict = qe.length > 0 && te.length > 0 && !qe.some((e) => te.includes(e));
  if (!equipConflict) {
    const lq = loose(query);
    const lt = loose(title);
    if (lq && lt) {
      if (lq === lt) return 0.95;
      if (boundaryContains(lt, lq)) return 0.85;
    }
  }
  const qt = new Set(singTokens(query));
  const tt = new Set(singTokens(title));
  if (!qt.size || !tt.size) return 0;
  let hits = 0;
  for (const w of qt) if (tt.has(w)) hits++;
  return hits / Math.max(qt.size, tt.size);
}

export const MATCH_THRESHOLD = 0.34;
