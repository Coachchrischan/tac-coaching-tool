// One-off content pass, 2026-09-01, approved by Chris from the roundtable:
//   16: real warm-ups for Day A and Day B across all nine weeks (coach's
//       circuit placeholder replaced; authored by the review team, Chris ok'd)
//   17: farmers carry fills the empty Day B micro 3 accessory slot (weeks
//       7 to 9), tagged carry so Movement Check goes green for a reason
//   40: the front squat option is RPE-primary, not the back squat's wave
//   34: week 1 and week 7 carry member-facing anchor-capture lines
// Runs through the store API on localhost:8127 so revs, history snapshots and
// the backup job all see the change.

const BASE = 'http://localhost:8127/api/store/program';

const env = await (await fetch(BASE)).json();
const doc = env.data;
const stream = doc.streams.find((s) => s.id === 'strength');
const phase = stream.blocks[1]; // Strength-Hypertrophy, 9 weeks

const WU_A = (sid) => [
  { id: `${sid}-wu1`, exerciseId: null, name: 'Bike or Row', note: '2 minutes easy, building every 30 seconds' },
  { id: `${sid}-wu2`, exerciseId: null, name: "World's Greatest Stretch", sets: '1', reps: '5', note: 'each side, slow' },
  { id: `${sid}-wu3`, exerciseId: null, name: 'Air Squat + Jump-and-Stick', sets: '1', reps: '10', note: 'then 5 jump-and-stick landings, quiet feet' },
  { id: `${sid}-wu4`, exerciseId: null, name: 'Band Pull-Apart', sets: '1', reps: '15' },
];
const WU_B = (sid) => [
  { id: `${sid}-wu1`, exerciseId: null, name: 'Ski or Row', note: '2 minutes easy, building every 30 seconds' },
  { id: `${sid}-wu2`, exerciseId: null, name: 'Glute Bridge', sets: '1', reps: '12', note: '2 second squeeze at the top' },
  { id: `${sid}-wu3`, exerciseId: null, name: 'Unloaded RDL to Reach', sets: '1', reps: '10', note: 'empty bar or PVC, slow hinge, feel the hamstrings' },
  { id: `${sid}-wu4`, exerciseId: null, name: 'Dead Bug', sets: '1', reps: '10', note: 'each side, slow exhale' },
];
const WU_NOTE = "Then 2 to 3 builder sets on the day's first lift before the working sets.";

const ANCHOR_W1 =
  'Week 1 is discovery: find a weight that fits the reps and RPE, and record your top working weights. They anchor the rest of the block.';
const ANCHOR_W7 =
  'Bench calibration this week: record your top set of 7. Weeks 8 and 9 build on that number.';

let wuCount = 0;
let carryCount = 0;
let squatNotes = 0;

phase.weeks.forEach((week, wi) => {
  for (const sess of week.sessions) {
    if (sess.kind !== 'series') continue;
    const isA = sess.focus === 'full-a';

    // 16: warm-ups
    const wu = sess.timedBlocks.find((tb) => tb.kind !== 'circuit' && tb.label === 'WU');
    if (wu) {
      wu.slots = (isA ? WU_A : WU_B)(sess.id);
      wu.note = WU_NOTE;
      wuCount++;
    }

    // 40: front squat option is not the back squat's percentage wave
    if (isA) {
      const a = sess.timedBlocks.find((tb) => tb.kind !== 'circuit' && tb.label === 'A');
      const squat = a?.slots.find((sl) => /squat/i.test(sl.name) && !/jump/i.test(sl.name));
      if (squat?.note?.includes('Or front squat, same wave')) {
        squat.note = squat.note.replace(
          'Or front squat, same wave.',
          'Front squat option: same reps, RPE-primary, roughly 7.5 to 10 per cent down on the back squat number.',
        );
        squatNotes++;
      }
    }

    // 17: farmers carry into the empty Day B micro 3 accessory slot
    if (!isA && wi >= 6) {
      const c = sess.timedBlocks.find((tb) => tb.kind !== 'circuit' && tb.label === 'C');
      if (c && !c.slots.some((sl) => /carry/i.test(sl.name))) {
        c.slots.push({
          id: `${sess.id}-c-carry`,
          exerciseId: null,
          name: 'Farmers Carry',
          sets: '3',
          rpe: '7-8',
          note: '40m per set, heavy but posture stays tall; suitcase carry (one side at a time) as the scale',
        });
        carryCount++;
      }
    }

    // 34: member-facing anchor lines
    if (wi === 0) {
      sess.appDescription = sess.appDescription?.trim()
        ? `${sess.appDescription.trim()}\n${ANCHOR_W1}`
        : ANCHOR_W1;
    }
    if (wi === 6 && isA) {
      sess.appDescription = sess.appDescription?.trim()
        ? `${sess.appDescription.trim()}\n${ANCHOR_W7}`
        : ANCHOR_W7;
    }
  }
});

const put = await fetch(BASE, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev }),
});
const result = await put.json();
if (!put.ok) throw new Error(JSON.stringify(result));
console.log(
  `saved rev ${result.rev}: ${wuCount} warm-ups written, ${carryCount} carries added, ${squatNotes} squat notes updated`,
);

// Tag the new movements so Movement Check counts them.
const LO = 'http://localhost:8127/api/store/library-overrides';
const loEnv = await (await fetch(LO)).json();
const lo = loEnv.data;
lo.patterns['name:farmers carry'] = ['carry'];
lo.patterns['name:glute bridge'] = ['hinge'];
lo.patterns['name:dead bug'] = ['core-rotation'];
lo.patterns['name:air squat + jump-and-stick'] = ['squat'];
lo.patterns['name:unloaded rdl to reach'] = ['hinge'];
lo.patterns['name:band pull-apart'] = ['h-pull'];
const loPut = await fetch(LO, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: lo, baseRev: loEnv.rev }),
});
if (!loPut.ok) throw new Error(JSON.stringify(await loPut.json()));
console.log('library-overrides: warm-up and carry patterns tagged');
