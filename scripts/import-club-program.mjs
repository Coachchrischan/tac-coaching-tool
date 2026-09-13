// Import the club's live TrainHeroic Strength programming into the Programming
// tab, week by week, through the store API on localhost:8127 (revs, history
// snapshots and the git backup all see it).
//
// Why this exists (2026-09-13): the finished microcycles are authored on the
// club's own TrainHeroic account ("Teneriffe Athletic Club Strength", team
// 5074275, program 5109902, org 606475), not on Chris's coach account. Chris's
// coach account (user 834314) is an ATHLETE on that team, so his coach token
// can read what the team assigned him through two coach-app endpoints:
//   GET /2.0/coach/athlete/calendar/extra/{userId}/{y}/{m}/{d}
//       -> the other-team sessions on his calendar for that week: dates,
//          titles and the program-workout id (`id`, NOT `workout_id`)
//   GET /2.0/coach/preview/workoutAndSummary/{programWorkoutId}/{userId}
//       -> the full session: instruction, blocks, exercises, per-set params,
//          cues. Read-only. The team's own program read (/1.0/coach/programs/
//          edit/5109902/...) returns nothing for his account, so this is the
//          only read path without the club's login.
//
// What it writes:
//   program            the target phase weeks get their three sessions
//                      replaced by the TrainHeroic ones (names, sets, reps,
//                      %, tempo, short overflow notes, block notes, a one-line
//                      intent, and the TrainHeroic session instruction as
//                      appDescription). Session and block ids are kept.
//   library-overrides  a coach cue per exercise (the TrainHeroic instruction,
//                      warm-up boilerplate stripped) is ADDED where the
//                      exercise has no cue yet; an existing cue is never
//                      overwritten (reported instead).
//   archive/           a raw snapshot of every fetched session, verbatim, so
//                      nothing in the mapping is lossy.
//
// Usage (dev server on 8127 must be running; token in trainheroic-mcp/config.json):
//   node scripts/import-club-program.mjs --from 2026-09-14 --weeks 1-3 [--phase str2-hyp] [--dry]
//   --from   Monday the phase starts on (week 1 of the phase)
//   --weeks  phase week numbers to import, e.g. 1-3 or 4-6
//   --dry    fetch, map and report, write nothing
//   --refresh-cues  also overwrite an existing cue for the imported exercises
//                   (default: an existing cue is kept and reported)
//
// It is a SYNC from TrainHeroic: re-running overwrites the target weeks in the
// tool with what is live. Edits made in the tool after an import are lost for
// those weeks (they were never on TrainHeroic anyway). Other weeks are untouched.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MCP_DIR = join(root, '..', '..', 'trainheroic-mcp');
const API = 'http://localhost:8127/api/store/';
const ATHLETE_USER_ID = 834314; // Chris's coach account, an athlete on the club team
const CLUB_PROGRAM_ID = 5109902; // "Teneriffe Athletic Club Strength" (club account)
const FOCUSES = ['lower', 'upper', 'full'];

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const DRY = args.includes('--dry');
const FROM = opt('--from');
const WEEKS = opt('--weeks');
const PHASE = opt('--phase', 'str2-hyp');
if (!FROM || !WEEKS) {
  console.error('usage: node scripts/import-club-program.mjs --from YYYY-MM-DD --weeks a-b [--phase id] [--dry]');
  process.exit(1);
}
const [wA, wB] = WEEKS.split('-').map(Number);
const weekNums = [];
for (let w = wA; w <= (wB || wA); w++) weekNums.push(w);
const fromDate = new Date(`${FROM}T00:00:00Z`);
if (fromDate.getUTCDay() !== 1) throw new Error(`--from ${FROM} is not a Monday`);

// ---------- store ----------
async function get(id) {
  const r = await fetch(API + id);
  if (!r.ok) throw new Error(`GET ${id}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function put(id, data, env) {
  const r = await fetch(API + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`PUT ${id}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

// ---------- TrainHeroic ----------
const { ThClient } = await import(pathToFileURL(join(MCP_DIR, 'src', 'thClient.js')).href);
const token = JSON.parse(readFileSync(join(MCP_DIR, 'config.json'), 'utf8')).sessionToken;
const th = new ThClient(token);

const iso = (d) => d.toISOString().slice(0, 10);
const mondayOfWeek = (n) => new Date(fromDate.getTime() + (n - 1) * 7 * 86400000);

/** Every club-team session on Chris's athlete calendar across the wanted weeks. */
async function fetchClubSessions() {
  const byId = new Map();
  for (const n of weekNums) {
    const mon = mondayOfWeek(n);
    const list = await th.req(
      'GET',
      `/2.0/coach/athlete/calendar/extra/${ATHLETE_USER_ID}/${mon.getUTCFullYear()}/${mon.getUTCMonth() + 1}/${mon.getUTCDate()}`,
    );
    for (const w of list) if (w.program_id === CLUB_PROGRAM_ID) byId.set(w.id, w);
  }
  const out = [];
  for (const w of [...byId.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const d = new Date(`${w.date}T00:00:00Z`);
    const weekNo = Math.floor((d.getTime() - fromDate.getTime()) / (7 * 86400000)) + 1;
    if (!weekNums.includes(weekNo)) continue;
    const r = await th.req('GET', `/2.0/coach/preview/workoutAndSummary/${w.id}/${ATHLETE_USER_ID}`);
    out.push({ weekNo, extra: w, preview: r.workout_preview });
  }
  return out;
}

// ---------- mapping tables ----------
// TrainHeroic title -> the tool's library id (Chris's TrainHeroic library, the
// one the tool's exercise library, Movement Check and the team push use). The
// club account's own custom exercise ids (8476xxx, 8489xxx) are not in that
// library, so they are matched by name here. null = free text, on purpose.
const LIBRARY_ID = {
  'Banded Lat Activation': null,
  'Hanging Scap Retracts': 1187285, // Hanging Scapula Retracts
  'Medball Thoracic Opener': null,
  'Push Up To Downward Dog': null,
  'Weighted Chin Up': 240, // Weighted Chin Ups (the tool's existing id)
  'Prone Weighted Angels': 2276649, // Weighted Prone Angels
  'Tempo Barbell Bench Press': 686395, // Barbell Bench Press (the tool's existing id)
  'KB Gorilla Row': 8211110,
  'Tricep Push Up': null,
  'DB Rear Delt Fly': 51428, // Bent Over Rear Delt Fly (the cue says bent over)
  'Oblique Crunch': 5947834,
  'Calf Stretch + Toe Lift in Rack': null,
  'Quadruped Hip CARS': null,
  'DB Goblet Squat': 1172, // Goblet Squat
  'Squat Jumps': 597514,
  'Barbell Back Squat': 688272,
  'Depth Jump': 440,
  'Barbell FFE Jefferson Split Squat': 8137642,
  'Single Leg Hamstring Bridge (Off Bench)': 2263920, // Single Leg Hamstring Bridge
  'DB Cyclist Squats (1 & 1/4)': 7784461, // Cyclist Squats - 1 & 1/4
  'Reverse Copenhagen Plank': 7149355,
  'Single Leg Calf Raises (Weighted)': null,
  'Quadruped Glute Stretch': 7372167,
  'Adductor Rock Back Stretch': 7372169, // Adductor Rockback Stretch
  'Glute Bridge w/Rotation': 7804461, // Glute Bridge w/Rotation and Reach
  'Single Leg Arabesque': 7872827, // Bodyweight Single Leg Arabesque
  'Barbell RDL': 597556, // Romanian Deadlift (RDL) (the tool's existing id)
  'Cossack Squat': 651035,
  'Barbell Z-Press': 54656, // Z-Press
  'Inverted Rows (Feet Elevated)': 222, // Feet Elevated Inverted Row
  'Barbell Bicep Curl': 200,
  'DB Skullcrusher': 2529795, // Lying DB Skullcrusher (the tool's existing id)
  'Double Leg Lowers': 8043375, // Double Leg Lower
  'Mechanical Drop Set Plank Challenge': 8043298,
};

// Reps are written per side for these (the tool's "8ea" convention: the rep
// column holds a number, "each side" goes in the push note).
const EACH_SIDE = new Set([
  'Calf Stretch + Toe Lift in Rack',
  'Quadruped Hip CARS',
  'Barbell FFE Jefferson Split Squat',
  'Single Leg Hamstring Bridge (Off Bench)',
  'Reverse Copenhagen Plank',
  'Single Leg Calf Raises (Weighted)',
  'Quadruped Glute Stretch',
  'Adductor Rock Back Stretch',
  'Glute Bridge w/Rotation',
  'Single Leg Arabesque',
  'Cossack Squat',
  'Oblique Crunch',
]);

// Short, stable overflow for the slot note (what the wall needs beside the
// numbers). Week-varying RIR and holds are added automatically from the cue.
const SLOT_TAG = {
  'Quadruped Hip CARS': 'each direction',
  'Calf Stretch + Toe Lift in Rack': '10 sec stretch, 10 sec toes pulled back',
  'KB Gorilla Row': 'alternating arms',
  'Depth Jump': 'off a box or bench',
  'Barbell Back Squat': '9/7/5 wave, working sets only',
  'Barbell RDL': '9/7/5 wave, working sets only',
  'DB Cyclist Squats (1 & 1/4)': 'heels elevated',
  'Tricep Push Up': 'over 15 = plate on back',
  'Prone Weighted Angels': '3x15 clean = go up next week',
  'DB Goblet Squat': '20 to 30% of working weight',
  'Mechanical Drop Set Plank Challenge': 'max time, leaderboard',
};

const WARMUP_BOILERPLATE = /The warm up will typically be 2-3 rounds of these exercises based on a (warm up )?time cap\. Complete as many rounds as you can in the given warm up time\s*/i;

// The library cue is ONE key cue per exercise: it goes on the wall beside
// every slot and into the blurb, so the club's full TrainHeroic instruction
// (kept verbatim in the archive snapshot) is condensed here in their words.
// An exercise not in this table falls back to its first sentence.
const KEY_CUE = {
  'Hanging Scap Retracts': 'Bring your armpits to the floor, elbows straight, hold a second at the top',
  'Medball Thoracic Opener': 'Ball close to your hips, reach back towards the floor, breathe into your chest',
  'Push Up To Downward Dog': 'Push up, then push the floor away and make your spine long',
  'Weighted Chin Up': 'A weight you get 5 with reps to spare; one more set each week',
  'Prone Weighted Angels': 'Biggest circle you can; light plates are enough',
  'Tempo Barbell Bench Press': '4 second lowering, reach your chest to the bar',
  'KB Gorilla Row': 'Push firmly into one bell, row the other, lead with the elbow',
  'Tricep Push Up': 'Elbows tight; above 15 reps, add a plate on your back',
  'DB Rear Delt Fly': 'Bent over, lead with your elbows not your hands',
  'Oblique Crunch': 'Prescribed reps each side, exhale as you crunch',
  'Calf Stretch + Toe Lift in Rack': '10 sec deep stretch with the heel close to the rack, then 10 sec pulling the toes up',
  'Quadruped Hip CARS': 'Move from the hip, not the lower back; the biggest circle you can',
  'DB Goblet Squat': 'Slow and controlled, about 20 to 30% of your working weight',
  'Squat Jumps': 'Smooth, not max effort; get the joints moving',
  'Barbell Back Squat': '9/7/5 wave in 3-week cycles; warm-up sets do not count. Front squat is the swap',
  'Depth Jump': 'Off a box or bench, with or without arms',
  'Barbell FFE Jefferson Split Squat': 'Vertical torso, 2.2.2 tempo; it should feel hard',
  'Single Leg Hamstring Bridge (Off Bench)': 'Pull the heel back towards you to extend the hip; torso in line with the leg at the top',
  'DB Cyclist Squats (1 & 1/4)': 'Heels up on a plate, upright torso; swap it if you feel your knees',
  'Reverse Copenhagen Plank': 'Dead straight line; if 30 sec is easy, plate between the thighs',
  'Single Leg Calf Raises (Weighted)': 'Toes on a plate, full range; the bottom is the important part',
  'Adductor Rock Back Stretch': 'Roll the foot to the outside, tailbone to the roof',
  'Glute Bridge w/Rotation': 'Prescribed reps each side',
  'Single Leg Arabesque': 'Soft knee; torso and back leg move as one see-saw',
  'Barbell RDL': 'Same 9/7/5 wave as the squat; unsure on weight, leave 2 in reserve',
  'Cossack Squat': 'Shift onto the working leg; sit back into the hip and drive the knee forward',
  'Barbell Z-Press': 'Sit on a plate if the hips are tight; DB Z-press is the swap',
  'Inverted Rows (Feet Elevated)': 'Glutes on, elbows to the floor, sternum to the bar',
  'Barbell Bicep Curl': 'High rep finisher, close to failure is fine',
  'DB Skullcrusher': 'Small muscle group, go close to failure',
  'Double Leg Lowers': 'Belly button to the floor, knees bent, arc back up; off a bench if easy',
  'Mechanical Drop Set Plank Challenge': 'Longest time wins; leaderboard and a prize',
};
const REFRESH_CUES = args.includes('--refresh-cues');

// Block instructions go on the wall under the series heading, so the club's
// paragraph is condensed to the one line the room needs. Keyed by the first
// words of the TrainHeroic instruction; anything unmatched is used as written.
const BLOCK_NOTE = [
  [/^E2OM \(Every 2 Minutes on the minute\)/i, 'E2OM in pairs, one on the odd minutes, one on the even. After each chin-up set, do your Prone Angels in the rest.'],
  [/^E3OM \(Every 3 minutes on the minute\) - Start each working set/i, 'E3OM: start each working set on the 3 minutes, time for both partners to do both exercises.'],
  [/^E3OM - Each round should roughly start on the 3 minutes/i, 'E3OM: each round starts on the 3 minutes once both exercises are done.'],
];
function blockNoteFor(instruction) {
  const raw = (instruction || '').trim();
  if (!raw) return '';
  const hit = BLOCK_NOTE.find(([re]) => re.test(raw));
  if (hit) return hit[1];
  return raw.replace(/\s*\n+\s*/g, ' / ').replace(/( \/ )+/g, ' / ').replace(/^ \/ | \/ $/g, '').trim();
}

function paramValues(e, n) {
  const vals = [];
  for (let i = 1; i <= 10; i++) {
    const v = e[`param_${n}_data_${i}`];
    if (v !== null && v !== undefined && v !== '') vals.push(String(v));
  }
  return vals;
}

function mapSlot(e, tbId, i) {
  const name = e.title.trim();
  const p1 = paramValues(e, 1);
  const p2 = paramValues(e, 2);
  const sets = p1.length || p2.length || 1;
  const first = p1[0] ?? '';
  const noteBits = [];
  let reps = '';
  switch (Number(e.param_1_type)) {
    case 3: // reps
    case 24: // native rep range ("10-15")
      reps = first;
      break;
    case 18: // seconds
    case 4: // time
      reps = first ? `${first}sec` : 'max hold';
      break;
    default:
      reps = first;
  }
  if (reps && EACH_SIDE.has(name)) reps = `${reps}${reps.endsWith('sec') ? ' ea' : 'ea'}`;
  const slot = { id: `${tbId}-s${i + 1}`, exerciseId: LIBRARY_ID[name] ?? null, name, sets: String(sets), reps };
  switch (Number(e.param_2_type)) {
    case 2: // percent of max
      if (p2[0]) slot.intensity = `${p2[0]}%`;
      break;
    case 19: // kg
      if (p2[0]) slot.load = `${p2[0]} kg`;
      break;
    case 18: // seconds as the second parameter: a hold on each rep
      if (p2[0] && !/sec/.test(SLOT_TAG[name] ?? '')) noteBits.push(`${p2[0]} sec hold`);
      break;
    default:
      break;
  }
  const cue = e.instruction || '';
  const tempo = cue.match(/Tempo\s+(\d(?:\.\d){2})/i);
  if (tempo) slot.tempo = tempo[1];
  const rir = cue.match(/(\d)\s*RIR/i);
  if (rir) noteBits.push(`${rir[1]} RIR`);
  if (SLOT_TAG[name]) noteBits.push(SLOT_TAG[name]);
  if (noteBits.length) slot.note = noteBits.join(', ');
  return slot;
}

const LABELS = ['WU', 'A', 'B', 'C', 'D', 'E'];
const DEFAULT_MINUTES = { WU: 5, A: 20, B: 15, C: 10, D: 5, E: 5 };

function mapSession(th, existing, sid, focus) {
  const w = th.preview;
  const minutesByLabel = Object.fromEntries((existing?.timedBlocks ?? []).map((tb) => [tb.label, tb.minutes]));
  const timedBlocks = w.workoutSets.map((b, bi) => {
    const label = LABELS[bi];
    const tbId = `${sid}-${label}`;
    const tb = { id: tbId, kind: 'series', label, minutes: minutesByLabel[label] ?? DEFAULT_MINUTES[label] ?? 5, slots: [] };
    const note = blockNoteFor(b.instruction);
    if (note) tb.note = note;
    if (label === 'WU' && !tb.note) tb.note = '2 to 3 rounds in the warm-up time cap';
    tb.slots = b.workoutSetExercises.map((e, i) => mapSlot(e, tbId, i));
    return tb;
  });
  const session = { id: sid, focus, name: w.title, kind: 'series', timedBlocks };
  const intent = intentFor(th);
  if (intent) session.intent = intent;
  if (w.instruction?.trim()) session.appDescription = w.instruction.trim();
  return session;
}

/** One line for the top of the board, written from what the session actually does. */
function intentFor(th) {
  const w = th.preview;
  const main = w.workoutSets[1]?.workoutSetExercises?.[0];
  if (!main) return '';
  const p1 = paramValues(main, 1);
  const p2 = paramValues(main, 2);
  const pct = Number(main.param_2_type) === 2 && p2[0] ? ` at ${p2[0]}%` : '';
  const rir = (main.instruction || '').match(/(\d)\s*RIR/i);
  const wk = th.weekNo;
  const microWeek = ((wk - 1) % 3) + 1;
  const lead = `${main.title} ${p1.length}x${p1[0]}${pct}${rir && !pct ? ` at ${rir[1]} RIR` : ''}`;
  const tail =
    microWeek === 1 ? 'First week of the 3-week micro: set the anchor weights' : microWeek === 2 ? 'Second week of the micro: same movements, more load or reps' : 'Last week of the micro: heaviest week, then the challenge';
  return `${lead}. ${tail}.`;
}

function cueFor(e) {
  const name = e.title.trim();
  if (KEY_CUE[name]) return KEY_CUE[name];
  const full = (e.instruction || '').replace(WARMUP_BOILERPLATE, '').replace(/\s+/g, ' ').trim();
  if (!full) return '';
  const first = full.split(/(?<=[.!?])\s+/)[0];
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}...` : first;
}

// ---------- run ----------
const fetched = await fetchClubSessions();
if (!fetched.length) throw new Error('no club sessions found for those weeks');
console.log(`fetched ${fetched.length} club session(s):`);
for (const f of fetched) console.log(`  W${f.weekNo} ${f.extra.date} ${f.preview.title} (pw ${f.extra.id}, ${f.preview.workoutSets.length} blocks)`);

const focusOf = (title) => (/^upper/i.test(title) ? 'upper' : /^lower/i.test(title) ? 'lower' : /^full/i.test(title) ? 'full' : null);

const envP = await get('program');
const doc = envP.data;
const st = doc.streams.find((s) => s.id === 'strength');
const phase = st.blocks.find((b) => b.id === PHASE);
if (!phase) throw new Error(`phase ${PHASE} not found (have ${st.blocks.map((b) => b.id).join(', ')})`);

const cuesToAdd = {};
const cueConflicts = [];
const envL = await get('library-overrides');
const lib = envL.data;
const keyFor = (slot) => (slot.exerciseId != null ? String(slot.exerciseId) : `name:${slot.name.toLowerCase()}`);

let replaced = 0;
const newWeeks = phase.weeks.map((week, wi) => {
  const weekNo = wi + 1;
  if (!weekNums.includes(weekNo)) return week;
  const ths = fetched.filter((f) => f.weekNo === weekNo);
  if (!ths.length) {
    console.log(`  W${weekNo}: nothing on TrainHeroic, left as is`);
    return week;
  }
  const sessions = FOCUSES.map((focus) => {
    const existing = week.sessions.find((s) => s.focus === focus);
    const th = ths.find((f) => focusOf(f.preview.title) === focus);
    if (!th) {
      console.log(`  W${weekNo} ${focus}: no TrainHeroic session, kept the tool's`);
      return existing;
    }
    const sid = existing?.id ?? `${PHASE}-w${weekNo}-${focus}`;
    const s = mapSession(th, existing, sid, focus);
    replaced++;
    for (const b of th.preview.workoutSets) {
      for (const e of b.workoutSetExercises) {
        const slot = s.timedBlocks.flatMap((tb) => tb.slots).find((x) => x.name === e.title.trim());
        if (!slot) continue;
        const key = keyFor(slot);
        const cue = cueFor(e);
        if (!cue) continue;
        if (lib.cues[key] && lib.cues[key] !== cue && !REFRESH_CUES) {
          if (!cueConflicts.some((c) => c.key === key)) cueConflicts.push({ key, name: slot.name, existing: lib.cues[key] });
        } else if (lib.cues[key] !== cue && !cuesToAdd[key]) {
          cuesToAdd[key] = cue; // first week's wording wins; later weeks differ only by RIR
        }
      }
    }
    return s;
  }).filter(Boolean);
  return { ...week, sessions };
});

const nextProgram = {
  ...doc,
  streams: doc.streams.map((s) => (s.id === 'strength' ? { ...s, blocks: s.blocks.map((b) => (b.id === PHASE ? { ...b, weeks: newWeeks } : b)) } : s)),
};

// Report.
console.log(`\n${replaced} session(s) mapped into phase ${PHASE}:`);
for (const week of newWeeks) {
  const wn = phase.weeks.indexOf(phase.weeks.find((w) => w.id === week.id)) + 1;
  if (!weekNums.includes(wn)) continue;
  for (const s of week.sessions) {
    console.log(`  W${wn} ${s.focus} "${s.name}"${s.intent ? `  intent: ${s.intent}` : ''}`);
    for (const tb of s.timedBlocks) {
      console.log(`     ${tb.label} ${tb.minutes} min${tb.note ? `  [${tb.note}]` : ''}`);
      for (const sl of tb.slots)
        console.log(
          `        ${sl.name}${sl.exerciseId == null ? ' (free text)' : ''}  ${sl.sets}x${sl.reps}${sl.intensity ? ` @ ${sl.intensity}` : ''}${sl.load ? ` ${sl.load}` : ''}${sl.tempo ? ` tempo ${sl.tempo}` : ''}${sl.note ? `  [${sl.note}]` : ''}`,
        );
    }
  }
}
console.log(`\ncues to add: ${Object.keys(cuesToAdd).length}; conflicts (kept the tool's): ${cueConflicts.length}`);
for (const c of cueConflicts) console.log(`  ${c.name} (${c.key}) already has: ${c.existing.slice(0, 80)}`);

// Raw snapshot, verbatim, so the mapping is never the only copy.
const snapDir = join(root, 'archive', 'th-club-program');
const snapPath = join(snapDir, `${FROM}-w${wA}-${wB || wA}.json`);
if (!DRY) {
  if (!existsSync(snapDir)) mkdirSync(snapDir, { recursive: true });
  writeFileSync(
    snapPath,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        source: { programId: CLUB_PROGRAM_ID, athleteUserId: ATHLETE_USER_ID, phase: PHASE, from: FROM, weeks: weekNums },
        sessions: fetched,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nsnapshot: ${snapPath}`);
}

if (DRY) {
  console.log('\n--dry: nothing written');
} else {
// Sanity: ids unique.
const ids = new Set();
for (const s of nextProgram.streams) for (const b of s.blocks) for (const w of b.weeks) for (const x of w.sessions) {
  if (ids.has(x.id)) throw new Error(`duplicate session id ${x.id}`);
  ids.add(x.id);
}

const resP = await put('program', nextProgram, envP);
console.log(`program: rev ${envP.rev} -> ${resP.rev}`);

if (Object.keys(cuesToAdd).length) {
  const resL = await put('library-overrides', { ...lib, cues: { ...lib.cues, ...cuesToAdd } }, envL);
  console.log(`library-overrides: rev ${envL.rev} -> ${resL.rev}; ${Object.keys(cuesToAdd).length} cue(s) added`);
}
}
