// One-off content pass, 2026-09-10, on Chris's call:
//   Phase 2 (Strength-Hypertrophy, 9 weeks from 14 Sept) becomes the three-day
//   Lower / Upper / Full Body split from the club sheet, tab
//   "Phase 1 - Upper / Lower / Full Body". The sheet holds microcycle 1 only
//   (exercises, scales, warm-ups, week 1 prescription), so:
//     - weeks 1 to 3 are written, week 1's prescription repeated across all
//       three (Chris's choice: "repeat week 1 as written");
//     - weeks 4 to 9 are left EMPTY for Chris to write when ready;
//     - the two-day Full Body A/B block it replaces is archived first, live
//       state (rev at run time), into archive/strength-full-body-ab-2026-09.json
//       together with the scales it hung off library-overrides.
//   Scaled options from the sheet replace the exercise-level scales for every
//   exercise the sheet lists (an empty pair in the sheet means "no regression
//   needed", so that exercise ends with no scales). Existing scale entries
//   whose name matches keep their prescription detail.
//   Days come from the live timetable (lbs Tue, ubs Thu, fbs Fri), not the
//   sheet's Day 1/2/3 numbering.
// Runs through the store API on localhost:8127 so revs, history snapshots and
// the backup job all see the change. Idempotent: refuses to run twice.

import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8127/api/store';
const ARCHIVE = join(ROOT, 'archive', 'strength-full-body-ab-2026-09.json');
const TODAY = '2026-09-10';

const dry = process.argv.includes('--dry');

async function load(id) {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`load ${id}: ${res.status}`);
  return res.json();
}
async function save(id, data, env) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`save ${id}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

// ---------- the sheet, transcribed ----------
// [name, exerciseId | null, sets, reps, { intensity | rpe | tempo }, [scale names]]
const ex = (name, exerciseId, sets, reps, extra = {}, scales = []) => ({
  name,
  exerciseId,
  sets,
  reps,
  extra,
  scales,
});
const wu = (name, exerciseId = null, sets, reps) => ({ name, exerciseId, sets, reps, extra: {}, scales: [] });

const DAYS = {
  lower: {
    intent: 'Lower body.',
    WU: [
      wu('Calf Stretch in Rack w/Toe Lift', null, '1'),
      wu('Hip CARS', null, '1'),
      wu('Goblet Squat', 1172),
      wu('Squat Jumps', 597514),
    ],
    A: [
      ex('Barbell Back Squats', 688272, '3', '9', { intensity: '70%' }, ['Barbell Box Squat', 'DB Goblet Squat']),
      ex('DB or Plate Drag Through', null, '3', '10ea', {}, ['Shoulder Taps', 'Tall Plank']),
      ex('Depth Jump', 440, '3', '5', {}, ['Counter Movement Jump', 'Single Leg Tall to Short']),
    ],
    B: [
      ex('Barbell Jefferson Split Squat (FFE)', 8137642, '3', '8ea', { rpe: '7' }, ['DB FFE Split Squat', 'DB Split Squat']),
      ex('Single Leg Hamstring Bridge (Off Box)', 2263920, '3', '10ea', {}, ['Single Leg Hamstring Bridge', 'Double Leg Hamstring Bridge']),
    ],
    C: [
      ex('Cyclist Squat Finisher (1 &1/4)', 7784461, '3', '10+', {}, ['Single Leg Wall Sit', 'Wall Sit']),
      ex('Weighted DB Single Leg Calf Raises', null, '3', '12ea', {}, ['Single Leg Calf Raises', 'Double Leg Calf Raises']),
      ex('Reverse Copenhagen Plank', 7149355, '3', '10ea', {}, ['Side Plank', 'Knee Side Plank']),
    ],
  },
  upper: {
    intent: 'Upper body.',
    WU: [
      wu('Banded Lat Activation', null, '1', '10'),
      wu('Hanging Scap Retracts', null),
      wu('Medball Thoracic Opener', null, '1', '10'),
      wu('Push Up to Downward Dog', null),
    ],
    A: [
      ex('Weighted Chin Up', 240, '3', '5', { rpe: '7' }, ['Chin Up', 'Chin Up Negative']),
      ex('Prone Angels', null, '3', '12', {}, []),
    ],
    B: [
      // The sheet names it Tempo but gives no tempo; 30X1 is the tempo Chris
      // ratified for this exact exercise in the A/B micro 1 (2026-08-31).
      ex('Tempo Barbell Bench Press', 686395, '3', '7', { intensity: '75%', tempo: '30X1' }, ['Barbell Floor Press', 'DB Floor Press']),
      ex('KB Gorilla Row / Single Arm DB Row', 8211110, '3', '10ea', {}, ['Banded Row']),
    ],
    C: [
      ex('Tricep Push Ups', null, '3', '1RIR', {}, ['Knee Push Ups']),
      ex('DB Rear Delt Fly', null, '3', '15', {}, ['Band Pull Aparts']),
      ex('Oblique Crunch', 5947834, '3', '10ea', {}, ['Table Top Hold']),
    ],
  },
  full: {
    intent: 'Full body.',
    WU: [
      wu('Quadruped Glute Stretch', 7372167, '1', '30sec ea'),
      wu('Adductor Rock Backs', null),
      wu('Glute Bridge w/Rotation', null),
      wu('Single Leg Arabesque', 7872827, '1', '10ea'),
    ],
    A: [
      ex('Barbell RDL (E3OM)', 597556, '3', '5', { intensity: '80%' }, ['DB RDL', 'Single Leg Arabesque']),
      ex('Cossack Squat', 651035, '3', '10ea', {}, []),
    ],
    B: [
      ex('Barbell Z-Press', 54656, '3', '8', { rpe: '7' }, ['DB Z-Press']),
      ex('Inverted Rows - Feet Elevated', 222, '3', '10', {}, ['Inverted Rows', 'Banded Row']),
    ],
    C: [
      ex('Barbell Bicep Curls', 200, '3', '20', {}, ['DB Bicep Curl', 'Banded Bicep Curl']),
      ex('DB Skullcrushers', 2529795, '3', '15', {}, ['Overhead DB Tricep Extension']),
      ex('Double Leg Lowers', 8043375, '3', '10', {}, ['Deadbug Taps', 'Deadbug Hold']),
    ],
  },
};

// Session order in the week follows the live timetable: Lower Tue, Upper Thu,
// Full Body Fri.
const FOCUS_ORDER = ['lower', 'upper', 'full'];
const FOCUS_CODE = { lower: 'l', upper: 'u', full: 'f' };
const MINUTES = { WU: 5, A: 15, B: 12, C: 10 };

// Movement patterns for the compounds the sheet adds that the overrides do
// not tag yet (Movement Check reads these). Accessories stay untagged, as
// before, where no pattern honestly fits.
const NEW_PATTERNS = {
  597556: ['hinge'], // Barbell RDL
  651035: ['lunge'], // Cossack Squat
  222: ['h-pull'], // Feet Elevated Inverted Row
  8211110: ['h-pull'], // Gorilla / single arm row
  7784461: ['squat'], // Cyclist squat
  5947834: ['core-rotation'], // Oblique crunch
  1172: ['squat'], // Goblet squat (WU)
  597514: ['squat'], // Squat jumps (WU)
};

const ANCHOR_W1 =
  'Week 1 is discovery: find a weight that fits the reps and RPE, and record your top working weights. They anchor the rest of the block.';

function scaleKey(exerciseId, name) {
  return exerciseId !== null ? String(exerciseId) : `name:${name.trim().toLowerCase()}`;
}

function slot(sid, label, i, e) {
  const s = { id: `${sid}-${label.toLowerCase()}${i}`, exerciseId: e.exerciseId, name: e.name };
  if (e.sets) s.sets = e.sets;
  if (e.reps) s.reps = e.reps;
  Object.assign(s, e.extra);
  return s;
}

function session(weekIdx, focus) {
  const w = weekIdx + 1;
  const sid = `str2-hyp-w${w}${FOCUS_CODE[focus]}`;
  const day = DAYS[focus];
  const written = weekIdx < 3;
  const micro = Math.floor(weekIdx / 3) + 1;
  const wk = (weekIdx % 3) + 1;
  const s = {
    id: sid,
    focus,
    intent: written
      ? `${day.intent} Micro 1 of 3, week ${wk}${wk === 1 ? '' : ' (same prescription as week 1 until adjusted)'}.`
      : `${day.intent} Micro ${micro} of 3, week ${wk}. Not written yet.`,
    kind: 'series',
    timedBlocks: ['WU', 'A', 'B', 'C'].map((label) => ({
      id: `${sid}-${label}`,
      kind: 'series',
      label,
      minutes: MINUTES[label],
      slots: written ? day[label].map((e, i) => slot(sid, label, i, e)) : [],
    })),
  };
  if (written && wk === 1) s.appDescription = ANCHOR_W1;
  return s;
}

// ---------- run ----------
const programEnv = await load('program');
const program = programEnv.data;
const stream = program.streams.find((s) => s.id === 'strength');
const phaseIdx = stream.blocks.findIndex((b) => b.id === 'str2-hyp');
if (phaseIdx < 0) throw new Error('str2-hyp phase not found');
const old = stream.blocks[phaseIdx];
if (old.weeks.some((w) => w.sessions.some((s) => s.focus === 'lower'))) {
  throw new Error('str2-hyp already holds the three-day split; refusing to run twice');
}

const overridesEnv = await load('library-overrides');
const overrides = overridesEnv.data;

// 1. Archive the live A/B block and the scales it used.
if (existsSync(ARCHIVE)) throw new Error(`${ARCHIVE} already exists`);
const usedKeys = new Set();
for (const w of old.weeks)
  for (const s of w.sessions)
    for (const tb of s.timedBlocks ?? [])
      for (const sl of tb.slots ?? []) usedKeys.add(scaleKey(sl.exerciseId, sl.name));
const archive = {
  archivedOn: TODAY,
  why:
    'Chris replaced the two-day Full Body A/B Phase 2 (club decision 2026-08-31) with the three-day Lower / Upper / Full Body split from the club sheet, microcycle 1 only, on 2026-09-10. Archived live at program rev ' +
    programEnv.rev +
    '. Restore by putting `block` back at streams[strength].blocks[1] and `scales` into library-overrides (or ask Claude).',
  block: old,
  scales: Object.fromEntries(Object.entries(overrides.scales).filter(([k]) => usedKeys.has(k))),
};

// 2. Build the new block: same id, theme, annual link and 3-week block length.
const weeks = old.weeks.map((w, i) => ({
  id: w.id,
  sessions: FOCUS_ORDER.map((focus) => session(i, focus)),
}));
const next = { ...old, weeks };

// 3. Scales and patterns.
let scalesSet = 0;
let scalesCleared = 0;
for (const day of Object.values(DAYS)) {
  for (const label of ['A', 'B', 'C']) {
    for (const e of day[label]) {
      const key = scaleKey(e.exerciseId, e.name);
      if (e.scales.length === 0) {
        if (overrides.scales[key]) scalesCleared++;
        delete overrides.scales[key];
        continue;
      }
      const existing = (overrides.scales[key] ?? []).map((s) => (typeof s === 'string' ? { name: s } : s));
      overrides.scales[key] = e.scales.map((name) => {
        const match = existing.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
        return match ? { ...match, name } : { name };
      });
      scalesSet++;
    }
  }
}
for (const [k, v] of Object.entries(NEW_PATTERNS)) {
  if (!overrides.patterns[k] || overrides.patterns[k].length === 0) overrides.patterns[k] = v;
}

const slots = next.weeks.flatMap((w) => w.sessions.flatMap((s) => s.timedBlocks.flatMap((tb) => tb.slots))).length;
console.log(`archive: ${old.weeks.length} weeks, ${Object.keys(archive.scales).length} scale keys`);
console.log(`new block: 9 weeks x 3 sessions, ${slots} slots (weeks 1 to 3), weeks 4 to 9 empty`);
console.log(`scales: ${scalesSet} exercises set, ${scalesCleared} cleared`);
const unresolved = new Set();
for (const day of Object.values(DAYS))
  for (const label of ['WU', 'A', 'B', 'C'])
    for (const e of day[label]) if (e.exerciseId === null) unresolved.add(e.name);
console.log(`free-text (no TrainHeroic id): ${[...unresolved].join('; ')}`);

if (dry) {
  console.log('dry run, nothing written');
  process.exit(0);
}

writeFileSync(ARCHIVE, JSON.stringify(archive, null, 2), 'utf8');
stream.blocks[phaseIdx] = next;
const p2 = await save('program', program, programEnv);
const o2 = await save('library-overrides', overrides, overridesEnv);
console.log(`program rev ${programEnv.rev} -> ${p2.rev}; library-overrides rev ${overridesEnv.rev} -> ${o2.rev}`);
console.log(`archived to ${ARCHIVE}`);
