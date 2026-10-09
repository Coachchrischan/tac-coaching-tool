// The primer goes, and the strength year gets explained to the members.
//
//   node scripts/oneoff-2026-10-07-drop-primer.mjs
//
// The primer was three weeks of off-app programming before the strength year
// properly began. It was never a block, so it should not be one: it is gone
// from the annual plan and from the programming, and the three weeks it used
// to occupy are now stated plainly as `startsWeek: 3` on the strength stream.
//
// That matters because a stream's dates come from its position counted in
// weeks from the plan start (24 August). Deleting the primer without saying
// the stream starts three weeks in would move every strength date three weeks
// earlier, which is exactly what happened the first time.
//
// It also writes a member-facing description for each block, for the year view
// the class is shown. The planning note in `focus` stays where it is.
//
// Reversible from the document history.

const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';
const PRIMER_PHASE = 'ap-2026-primer';
const PRIMER_BLOCK = 'str2-lead';
const STARTS_WEEK = 3;

/** Phase id -> how the block is explained to someone in the class. */
const MEMBER = {
  'ap-2026-hyp9': [
    'Three days a week, split into lower body, upper body and full body.',
    'We build the main lifts back up with steady weight on the bar and leave a',
    'couple of reps in the tank on every set. Each three-week wave repeats the',
    'same movements so you can see your own numbers move.',
  ].join(' '),
  'ap-2026-str5': [
    'The block that takes us into Christmas. Reps come down, weight goes up, and',
    'we find out what the last few months have built. Three weeks of work, then a',
    'two-week wave to finish and test the big lifts before the break.',
  ].join(' '),
  '2aed6a9c-77ce-4471-9e5c-35075b6ebc50': [
    'One limb at a time. Single-leg and single-arm work, slow tempos and long',
    'holds, which is where you find the side that has been quietly doing less.',
    'Higher reps, lighter loads, and a good place to start if you are new.',
  ].join(' '),
  '16f693f4-5f62-4860-ac99-c968a899edac': [
    'Building muscle. More sets, more reps, more time under tension, with the big',
    'lifts kept in as anchors so strength does not go backwards. Three four-week',
    'waves, each one adding a little more work than the last.',
  ].join(' '),
  'ap-2027-hyp9': [
    'Back to heavier work, now on a full body A and B split. Reps step down',
    'through each wave, nine to seven to five, with a little more weight each',
    'time. The last week of every wave finishes on a challenge.',
  ].join(' '),
  'ap-2027-str5': [
    'The strongest block of the year. Fewer reps, heavier bars, longer rests, and',
    'plenty of practice at the lifts themselves. Two four-week waves to finish',
    'the year on your best numbers.',
  ].join(' '),
};

const env = await (await fetch(`${BASE}/annual-plan`)).json();
const annual = env.data;
const lane = annual.streams.find((s) => s.id === 'strength');
if (!lane) throw new Error('no strength lane in the annual plan');

const hadPrimer = lane.phases.some((p) => p.id === PRIMER_PHASE);
lane.phases = lane.phases.filter((p) => p.id !== PRIMER_PHASE);
lane.startsWeek = STARTS_WEEK;

const described = [];
for (const phase of lane.phases) {
  const text = MEMBER[phase.id];
  if (!text) continue;
  phase.memberDescription = text;
  described.push(phase.name);
}

const aRes = await fetch(`${BASE}/annual-plan`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: annual, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const aBody = await aRes.json();
if (!aRes.ok) throw new Error(`annual-plan save failed ${aRes.status}: ${JSON.stringify(aBody).slice(0, 200)}`);

const pEnv = await (await fetch(`${BASE}/program`)).json();
const program = pEnv.data;
const stream = program.streams.find((s) => s.id === 'strength');
if (!stream) throw new Error('no strength stream in the programming');
const hadBlock = stream.blocks.some((b) => b.id === PRIMER_BLOCK);
stream.blocks = stream.blocks.filter((b) => b.id !== PRIMER_BLOCK);
stream.startsWeek = STARTS_WEEK;

const pRes = await fetch(`${BASE}/program`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: program, baseRev: pEnv.rev, baseUpdatedAt: pEnv.updatedAt }),
});
const pBody = await pRes.json();
if (!pRes.ok) throw new Error(`program save failed ${pRes.status}: ${JSON.stringify(pBody).slice(0, 200)}`);

console.log(`Primer phase ${hadPrimer ? 'removed' : 'already gone'}; spacer block ${hadBlock ? 'removed' : 'already gone'}.`);
console.log(`Strength starts week ${STARTS_WEEK} of the plan, on both documents.`);
console.log(`Member descriptions written for ${described.length} blocks: ${described.join(', ')}.`);
console.log(`annual-plan rev ${env.rev} -> ${aBody.rev}, program rev ${pEnv.rev} -> ${pBody.rev}`);
