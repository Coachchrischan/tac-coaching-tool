// What each strength block actually is, in Chris's words, plus the two
// workshops pencilled into the year.
//
//   node scripts/oneoff-2026-10-07-block-descriptions.mjs
//
// The descriptions are what the class reads on the members' year view, so they
// name the lifts rather than the method: a member wants to know they are doing
// pull ups and back squats, not that the block is "volume-led".
//
// Reversible from the document history.

const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';

const MEMBER = {
  'ap-2026-hyp9': [
    'The block we are in. Three days a week, split into lower body, upper body and full body.',
    'The focus is pull up volume and pull up strength, back squats and Romanian deadlifts, with',
    'accessory work around them to cover everything else. Reps stay moderate and you leave a',
    'couple in the tank on every set. Each three-week wave repeats the same movements, so you',
    'can watch your own numbers move rather than guess.',
  ].join(' '),
  'ap-2026-str5': [
    'Into the lower rep ranges. The same lifts, heavier: lower-rep pull ups, back squat and',
    'deadlift work, with more rest between sets so you can actually express the strength the',
    'last few months have built. Three weeks of work, then a two-week wave to finish and test',
    'the big lifts before Christmas.',
  ].join(' '),
  '2aed6a9c-77ce-4471-9e5c-35075b6ebc50': [
    'Setting the foundation for the year. Most people have had time away from the gym over',
    'Christmas, and straight back into heavy strength is the wrong way to come back, so this is',
    'the right time for endurance work. One limb at a time: single-leg and single-arm work, slow',
    'tempos and long holds, with some unusual exercises you will not have done before. Higher',
    'reps, lighter loads, and the block where you find the side that has quietly been doing less.',
    'A good place to start if you are new.',
  ].join(' '),
  '16f693f4-5f62-4860-ac99-c968a899edac': [
    'Building muscle. More sets, more reps, more time under tension, with the big lifts kept in',
    'as anchors so strength does not go backwards. Three four-week waves, each adding a little',
    'more work than the last.',
  ].join(' '),
  'ap-2027-hyp9': [
    'The second time around, on the same lower body, upper body and full body split. Back to',
    'heavier work: reps step down through each wave, nine to seven to five, with a little more',
    'on the bar each time. The last week of every wave finishes on a challenge.',
  ].join(' '),
  'ap-2027-str5': [
    'The strongest block of the year. Fewer reps, heavier bars, longer rests, and plenty of',
    'practice at the lifts themselves. Two four-week waves to finish the year on your best numbers.',
  ].join(' '),
};

/** Pencilled into the year. The Monday of the week each one runs. */
const WORKSHOPS = [
  {
    id: 'ws-handstand-2026-11',
    name: 'Handstand workshop',
    date: '2026-11-02',
    streamId: 'strength',
    tentative: true,
  },
  // Between the two waves of the Strength block: three weeks, then this, then two.
  { id: 'ws-deadlift-2026-12', name: 'Deadlift workshop', date: '2026-12-07', streamId: 'strength' },
];
// The deadlift workshop moved off 30 November; drop the old entry by id.
const RETIRED = ['ws-deadlift-2026-11'];

const env = await (await fetch(`${BASE}/annual-plan`)).json();
const doc = env.data;
const lane = doc.streams.find((s) => s.id === 'strength');
if (!lane) throw new Error('no strength lane');

const written = [];
for (const phase of lane.phases) {
  const text = MEMBER[phase.id];
  if (!text) continue;
  phase.memberDescription = text;
  written.push(phase.name);
}

// Replace by id, so running this twice does not leave two of each.
const keep = (doc.workshops ?? []).filter(
  (w) => !WORKSHOPS.some((n) => n.id === w.id) && !RETIRED.includes(w.id),
);
doc.workshops = [...keep, ...WORKSHOPS].sort((a, b) => a.date.localeCompare(b.date));

const res = await fetch(`${BASE}/annual-plan`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const body = await res.json();
if (!res.ok) throw new Error(`save failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);

console.log(`Descriptions written for ${written.length} blocks: ${written.join(', ')}.`);
for (const w of WORKSHOPS) console.log(`  ${w.date}  ${w.name}${w.tentative ? ' (pencilled in)' : ''}`);
console.log(`annual-plan rev ${env.rev} -> ${body.rev}`);
