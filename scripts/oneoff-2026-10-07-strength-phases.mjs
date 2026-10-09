// The strength year, as Chris set it on 2026-10-07.
//
//   node scripts/oneoff-2026-10-07-strength-phases.mjs
//
// Two things at once, because they are one decision:
//  1. The April 2027 primer goes. The club does not need a second intro week
//     a year in, so the 2027 cycle starts straight into the work.
//  2. Every strength phase states its microcycles, so the showcase can draw
//     them and nobody has to infer a wave length from a block setting.
//
// The weeks the primer gave up go into the two 2027 phases: the
// strength-hypertrophy block grows to 10 weeks and the strength block that
// follows it to 8.
//
// Reversible from the document history if any of it is wrong.

const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';

/** Phase id -> what it should be. Microcycles must sum to the week count. */
const PLAN = {
  'ap-2026-hyp9': { weeks: 9, microcycles: [3, 3, 3] },
  'ap-2026-str5': { weeks: 5, microcycles: [3, 2] },
  '2aed6a9c-77ce-4471-9e5c-35075b6ebc50': { weeks: 4, microcycles: [4] },
  '16f693f4-5f62-4860-ac99-c968a899edac': { weeks: 12, microcycles: [4, 4, 4] },
  'ap-2027-hyp9': { weeks: 10, microcycles: [4, 4, 2] },
  'ap-2027-str5': { weeks: 8, microcycles: [4, 4] },
};
const REMOVE = ['ap-2027-primer'];

const env = await (await fetch(`${BASE}/annual-plan`)).json();
const doc = env.data;
const stream = doc.streams.find((s) => s.id === 'strength');
if (!stream) throw new Error('no strength lane in the annual plan');

const before = stream.phases.length;
stream.phases = stream.phases.filter((p) => !REMOVE.includes(p.id));
const removed = before - stream.phases.length;

const touched = [];
for (const phase of stream.phases) {
  const want = PLAN[phase.id];
  if (!want) continue;
  const sum = want.microcycles.reduce((n, w) => n + w, 0);
  if (sum !== want.weeks) {
    throw new Error(`${phase.name}: microcycles ${want.microcycles.join('+')} do not sum to ${want.weeks}`);
  }
  const was = phase.weeks;
  phase.weeks = want.weeks;
  phase.microcycles = want.microcycles;
  touched.push(
    `${phase.name}: ${was === want.weeks ? `${want.weeks} weeks` : `${was} -> ${want.weeks} weeks`}` +
      `, micros ${want.microcycles.join(' + ')}`,
  );
}

const res = await fetch(`${BASE}/annual-plan`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const body = await res.json();
if (!res.ok) throw new Error(`save failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);

console.log(`${removed} phase removed (${REMOVE.join(', ')}).`);
for (const line of touched) console.log(`  ${line}`);
console.log(`\nStrength lane is now ${stream.phases.length} phases, ${stream.phases.reduce((n, p) => n + p.weeks, 0)} training weeks.`);
console.log(`annual-plan rev ${env.rev} -> ${body.rev}`);
