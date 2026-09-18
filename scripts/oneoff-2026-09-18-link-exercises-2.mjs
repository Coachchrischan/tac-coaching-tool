// Second pass: link every week 2 exercise to the identity its swaps hang off.
//
// The first pass matched on normalised titles and was too loose in one place
// (Barbell Bicep Curl matched the DB curl) and too tight in a dozen others.
// Chris's swaps are keyed by TrainHeroic library id, so this maps each pulled
// name to that id EXPLICITLY and prints the library's own title beside it, so
// a wrong link is visible rather than silent.
//
// Where the swaps are keyed by name rather than id, the options are copied
// onto the slot itself, which the model supports and which leaves the
// exercise's own name alone.

const BASE = 'http://localhost:8127/api/store';

/** pulled name -> the library id whose swaps apply. */
const LINK = {
  'Tempo Barbell Bench Press': 686395,
  'Single Leg Hamstring Bridge (Off Bench)': 2263920,
  'DB Cyclist Squats (1 & 1/4)': 7784461,
  'Barbell RDL': 597556,
  'Barbell Z-Press': 54656,
  'Inverted Rows (Feet Elevated)': 222,
  'Barbell Bicep Curl': 200,
  'DB Skullcrusher': 2529795,
  'Double Leg Lowers': 8043375,
};

/** pulled name -> the name key its swaps are stored under. */
const LINK_BY_NAME = {
  'Single Leg Calf Raises (Weighted)': 'weighted db single leg calf raises',
  'Tricep Push Up': 'tricep push ups',
};

/** Linked in pass one but to the wrong exercise. */
const UNLINK = { 'Barbell Bicep Curl': 183 };

const library = await (await fetch('http://localhost:8127/data/exercise-library.json')).json();
const titleOf = new Map(library.map((e) => [e.id, e.title]));

const overrides = (await (await fetch(`${BASE}/library-overrides`)).json()).data;
const env = await (await fetch(`${BASE}/program`)).json();
const doc = env.data;
const week = doc.streams.find((s) => s.id === 'strength').blocks.find((b) => b.id === 'str2-hyp').weeks[1];

let fixed = 0;
for (const session of week.sessions) {
  if (session.kind !== 'series') continue;
  for (const block of session.timedBlocks) {
    for (const slot of block.slots ?? []) {
      if (UNLINK[slot.name] === slot.exerciseId) slot.exerciseId = null;

      const id = LINK[slot.name];
      if (id !== undefined) {
        slot.exerciseId = id;
        fixed++;
        continue;
      }
      const nameKey = LINK_BY_NAME[slot.name];
      if (nameKey) {
        const opts = overrides.scales[`name:${nameKey}`];
        if (opts?.length) {
          slot.scales = opts.map((s) => (typeof s === 'string' ? { name: s } : s));
          fixed++;
        }
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
if (!res.ok) throw new Error(`save failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
console.log(`adjusted ${fixed} exercises. program rev ${env.rev} -> ${body.rev}\n`);

const swapsFor = (slot) => {
  if (slot.scales) return slot.scales.map((s) => s.name).filter(Boolean);
  const byId = slot.exerciseId !== null && overrides.scales[String(slot.exerciseId)];
  if (byId?.length) return byId.map((s) => s.name).filter(Boolean);
  const byName = overrides.scales[`name:${slot.name.toLowerCase()}`];
  return byName?.length ? byName.map((s) => s.name).filter(Boolean) : [];
};

let withSwaps = 0, without = [];
for (const session of week.sessions) {
  if (session.kind !== 'series') continue;
  console.log(session.focus.toUpperCase());
  for (const block of session.timedBlocks) {
    for (const slot of block.slots ?? []) {
      const sw = swapsFor(slot);
      const lib = slot.exerciseId !== null ? titleOf.get(slot.exerciseId) : null;
      const mismatch = lib && lib.toLowerCase() !== slot.name.toLowerCase() ? `  [library: ${lib}]` : '';
      if (sw.length) withSwaps++; else if (block.label !== 'WU') without.push(slot.name);
      console.log(`   ${slot.name.padEnd(42)} ${sw.length ? 'swaps: ' + sw.join(' / ') : '-'}${mismatch}`);
    }
  }
}
console.log(`\n${withSwaps} exercises now carry swaps.`);
if (without.length) console.log(`no swaps on the working sets:\n  ${[...new Set(without)].join('\n  ')}`);
