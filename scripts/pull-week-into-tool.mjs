// Pull one week of the club's TrainHeroic programming into the tool, exactly
// as written, and attach the scaled options.
//
//   npm run pull-week -- 2026-09-21
//
// Two steps that always belong together:
//
//  1. Copy the sessions in verbatim. Sets, reps, load, tempo and reps-in-
//     reserve come straight off TrainHeroic; Chris's coaching cue becomes the
//     slot note. Nothing is invented and nothing is summarised.
//  2. Attach the swaps. A scaled option hangs off an exercise's library id, so
//     a pulled name with no id matches nothing. Every exercise is matched to
//     the library by title, and where the club's wording differs from the
//     library's an alias says so out loud rather than a fuzzy match guessing.
//
// It prints every exercise with its swaps, and names anything it could not
// match, so a silent miss is not possible.

const BASE = 'http://localhost:8127/api/store';
const APP = 'http://localhost:8127';

const monday = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!monday) {
  console.error("Give the week's Monday: npm run pull-week -- 2026-09-21");
  process.exit(1);
}

/**
 * Club wording -> the library id whose swaps apply, stated outright.
 *
 * This was a fuzzy title match and it was wrong twice: it linked Barbell Bicep
 * Curl to the DB curl, and it silently dropped eight exercises whose club
 * wording differs from the library's. A swap going missing is invisible on the
 * board, so the mapping is explicit and anything not in it is reported.
 */
const LINK = {
  'tempo barbell bench press': 686395,
  'single leg hamstring bridge (off bench)': 2263920,
  'db cyclist squats (1 & 1/4)': 7784461,
  'barbell rdl': 597556,
  'barbell z-press': 54656,
  'inverted rows (feet elevated)': 222,
  'barbell bicep curl': 200,
  'db skullcrusher': 2529795,
  'double leg lowers': 8043375,
  'kb gorilla row': 8211110,
  'barbell back squat': 688272,
  'depth jump': 440,
  'barbell ffe jefferson split squat': 8137642,
  'reverse copenhagen plank': 7149355,
  'oblique crunch': 5947834,
  // The club's TrainHeroic wording is singular where the library is plural,
  // so an exact title match missed it and the chin up lost its swaps.
  'weighted chin up': 240,
  'prone weighted angels': 2276649,
  'cossack squat': 651035,
};

/** Where the swaps are keyed by NAME rather than a library id. */
const NAME_KEYED = {
  'single leg calf raises (weighted)': 'weighted db single leg calf raises',
  'tricep push up': 'tricep push ups',
  'db rear delt fly': 'db rear delt fly',
};

const norm = (s) =>
  String(s).toLowerCase().replace(/[()]/g, ' ').replace(/[^a-z0-9 &/+-]/g, ' ').replace(/\s+/g, ' ').trim();

// The maps are written in the club's own wording, so normalise their keys the
// same way the lookup does. Three exercises lost their swaps to exactly this:
// "Single Leg Hamstring Bridge (Off Bench)" normalises without the brackets.
const LINK_N = new Map(Object.entries(LINK).map(([k, v]) => [norm(k), v]));
const NAME_KEYED_N = new Map(Object.entries(NAME_KEYED).map(([k, v]) => [norm(k), v]));

const pull = await (await fetch(`${APP}/api/th-pull`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ monday }),
})).json();
if (pull.error) throw new Error(pull.error);

const library = await (await fetch(`${APP}/data/exercise-library.json`)).json();
const byTitle = new Map();
for (const e of library) if (!byTitle.has(norm(e.title))) byTitle.set(norm(e.title), e);

const overrides = (await (await fetch(`${BASE}/library-overrides`)).json()).data;
const env = await (await fetch(`${BASE}/program`)).json();
const doc = env.data;

const FOCUS_STREAM = { upper: 'strength', lower: 'strength', full: 'strength' };

const annual = (await (await fetch(`${BASE}/annual-plan`)).json()).data;

/** Phase 2 starts on its own Monday; this Monday's offset from it, in weeks. */
function weekIndexFor(mondayIso) {
  const phase = doc.streams
    .find((s) => s.id === 'strength')
    .blocks.find((b) => b.id === 'str2-hyp');
  let before = 0;
  for (const b of doc.streams.find((s) => s.id === 'strength').blocks) {
    if (b.id === 'str2-hyp') break;
    before += b.weeks.length;
  }
  const breaks = annual.breaks ?? [];
  for (let i = 0; i < phase.weeks.length; i++) {
    const d = new Date(`${annual.startDate}T00:00:00`);
    let left = before + i;
    for (;;) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const br = breaks.find((b) => b.start === iso);
      if (br) { d.setDate(d.getDate() + 7 * br.weeks); continue; }
      if (left === 0) break;
      left--; d.setDate(d.getDate() + 7);
    }
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (iso === mondayIso) return i;
  }
  return -1;
}
const unmatched = [];
let written = 0;

for (const day of pull.days) {
  if (!day.found || !day.timedBlocks?.length) {
    console.log(`${day.focus.padEnd(6)} ${day.date ?? ''} ${day.skipped ?? 'nothing in TrainHeroic'}`);
    continue;
  }
  // Link each pulled exercise to the library so its swaps apply.
  for (const block of day.timedBlocks) {
    for (const slot of block.slots) {
      // The explicit link first; an exact title match only as a fallback, so
      // a near-miss can never quietly become the wrong exercise.
      const linked = LINK_N.get(norm(slot.name));
      const hit = linked !== undefined ? { id: linked } : byTitle.get(norm(slot.name));
      if (hit) slot.exerciseId = hit.id;

      // TrainHeroic's own suggested swaps are attached by the pull and win.
      // These name-keyed ones are the tool's, kept only as a fallback for an
      // exercise he has not set a swap against in TrainHeroic yet.
      const nameKey = slot.scales ? null : NAME_KEYED_N.get(norm(slot.name));
      if (nameKey) {
        const opts = overrides.scales[`name:${nameKey}`];
        if (opts?.length) slot.scales = opts.map((s) => (typeof s === 'string' ? { name: s } : s));
      }
      if (block.label !== 'WU' && !slot.scales) {
        const has = hit && overrides.scales[String(hit.id)]?.length;
        if (!has) unmatched.push(slot.name);
      }
    }
  }

  const stream = doc.streams.find((s) => s.id === FOCUS_STREAM[day.focus]);
  const phase = stream.blocks.find((b) => b.id === 'str2-hyp');
  // Which week of the phase this Monday is. This was hardcoded to week 2 and
  // would have written any other week's sessions into week 2's slot.
  const week = phase.weeks[weekIndexFor(monday)];
  if (!week) throw new Error(`${monday} is not a week of Phase 2`);
  const existing = week.sessions.find((s) => s.focus === day.focus);
  const session = {
    id: existing?.id ?? `th-${day.focus}-${monday}`,
    focus: day.focus,
    kind: 'series',
    intent: `${day.title}. Teneriffe Athletic Club Strength, ${day.date}. Pulled from TrainHeroic.`,
    timedBlocks: day.timedBlocks,
  };
  week.sessions = existing
    ? week.sessions.map((s) => (s.focus === day.focus ? session : s))
    : [...week.sessions, session];
  written++;
}

const res = await fetch(`${BASE}/program`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const body = await res.json();
if (!res.ok) throw new Error(`save failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
console.log(`\nwrote ${written} sessions. program rev ${env.rev} -> ${body.rev}\n`);

const swapsFor = (slot) => {
  if (slot.scales) return slot.scales.map((s) => s.name).filter(Boolean);
  const byId = slot.exerciseId != null && overrides.scales[String(slot.exerciseId)];
  if (byId?.length) return byId.map((s) => s.name).filter(Boolean);
  const byName = overrides.scales[`name:${String(slot.name).toLowerCase()}`];
  return byName?.length ? byName.map((s) => s.name).filter(Boolean) : [];
};

for (const day of pull.days) {
  if (!day.found) continue;
  console.log(`${day.title}  (${day.date})`);
  for (const block of day.timedBlocks) {
    for (const slot of block.slots) {
      const rx = [slot.sets && slot.reps ? `${slot.sets} x ${slot.reps}` : slot.reps, slot.intensity, slot.load, slot.rpe, slot.tempo]
        .filter(Boolean).join('  ');
      const sw = swapsFor(slot);
      console.log(`   ${block.label.padEnd(3)} ${slot.name.padEnd(38)} ${rx.padEnd(26)} ${sw.length ? 'swaps: ' + sw.join(' / ') : ''}`);
    }
  }
}
if (unmatched.length) console.log(`\nno scaled options for:\n  ${[...new Set(unmatched)].join('\n  ')}`);
