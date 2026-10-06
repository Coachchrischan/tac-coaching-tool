// Link the exercises pulled from TrainHeroic to the library, so the scaled
// options Chris already wrote attach to them.
//
// A scaled option hangs off an exercise's IDENTITY: its TrainHeroic library id,
// or its lowercased name for free text. The week 2 sessions came off the coach
// app's screen, which carries the title and nothing else, so every slot landed
// as free text and matched none of the id-keyed scales. The swaps were never
// missing, just unattached.
//
// Matching is by normalised title against the generated library, with the
// handful of deliberate aliases below for the names that differ between the
// club sheet and the library ("Single Leg Calf Raises (Weighted)" is the
// library's "Weighted DB Single Leg Calf Raises").

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8127/api/store';

/** Where the club's wording and the library's differ. */
const ALIASES = {
  'single leg calf raises (weighted)': 'weighted db single leg calf raises',
  'db cyclist squats (1 & 1/4)': 'cyclist squat finisher (1 &1/4)',
  'single leg hamstring bridge (off bench)': 'single leg hamstring bridge',
  'inverted rows (feet elevated)': 'feet elevated inverted row',
  'tricep push up': 'tricep push ups',
  'db skullcrusher': 'db skullcrushers',
  'barbell bicep curl': 'db bicep curls',
  'prone weighted angels': 'weighted prone angels',
  'barbell rdl': 'barbell rdl (e3om)',
  'barbell z-press': 'z-press',
};

const norm = (s) =>
  String(s).toLowerCase().replace(/[()]/g, ' ').replace(/[^a-z0-9 &/+]/g, ' ').replace(/\s+/g, ' ').trim();

const library = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'exercise-library.json'), 'utf8'));
const byTitle = new Map();
for (const e of library) {
  const k = norm(e.title);
  if (!byTitle.has(k)) byTitle.set(k, e);
}

const overrides = (await (await fetch(`${BASE}/library-overrides`)).json()).data;
const scaleFor = (id, name) => {
  const byId = id !== null && overrides.scales[String(id)];
  if (byId?.length) return byId.map((s) => s.name).filter(Boolean);
  const byName = overrides.scales[`name:${String(name).trim().toLowerCase()}`];
  return byName?.length ? byName.map((s) => s.name).filter(Boolean) : [];
};

const env = await (await fetch(`${BASE}/program`)).json();
const doc = env.data;
const phase = doc.streams.find((s) => s.id === 'strength').blocks.find((b) => b.id === 'str2-hyp');
const week = phase.weeks[1];

let linked = 0, already = 0, unmatched = [];
for (const session of week.sessions) {
  if (session.kind !== 'series') continue;
  for (const block of session.timedBlocks) {
    for (const slot of block.slots ?? []) {
      if (slot.exerciseId !== null) { already++; continue; }
      const key = norm(ALIASES[norm(slot.name)] ?? slot.name);
      const hit = byTitle.get(key);
      if (hit) {
        slot.exerciseId = hit.id;
        linked++;
      } else {
        unmatched.push(slot.name);
      }
    }
  }
}

const res = await fetch(`${BASE}/program`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const body = await res.json();
if (!res.ok) throw new Error(`save failed ${res.status}`);

console.log(`linked ${linked} exercises to the library, ${already} already linked, ${unmatched.length} unmatched`);
console.log(`program rev ${env.rev} -> ${body.rev}\n`);

for (const session of week.sessions) {
  if (session.kind !== 'series') continue;
  console.log(session.focus.toUpperCase());
  for (const block of session.timedBlocks) {
    for (const slot of block.slots ?? []) {
      const sc = scaleFor(slot.exerciseId, slot.name);
      console.log(
        `   ${slot.exerciseId === null ? '  free text' : String(slot.exerciseId).padStart(11)}  ${slot.name.padEnd(42)} ${sc.length ? 'swaps: ' + sc.join(' / ') : ''}`,
      );
    }
  }
}
if (unmatched.length) console.log('\nno library match (still free text):\n  ' + [...new Set(unmatched)].join('\n  '));
