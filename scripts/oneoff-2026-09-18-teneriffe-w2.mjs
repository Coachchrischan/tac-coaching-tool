// Week 2 of TENERIFFE ATHLETIC CLUB STRENGTH, read off the TrainHeroic coach
// app on 2026-09-18 and saved into the tool.
//
// Read from the page rather than the API: that programming lives under Chris's
// second TrainHeroic account (coach 2914642), and the token the MCP server
// holds is his personal one (834314), which the API answers with an empty
// list. The screen was the only place both accounts agree.
//
// Verbatim from the coach app. A1..A4 is his warm-up block, so it lands on the
// tool's WU series; B, C and D become A, B and C.

const BASE = 'http://localhost:8127/api/store/program';
const MONDAY = '2026-09-21';

/** "3 x 7 @ 75%" -> the tool's columns. */
function parse(line) {
  const m = /^(\d+)\s*x\s*([^@]+?)(?:\s*@\s*(.+))?$/i.exec(line.trim());
  if (!m) throw new Error(`cannot read prescription "${line}"`);
  const [, sets, repsRaw, at] = m;
  const slot = { sets, reps: repsRaw.trim().replace(/^(\d+)s$/, '$1sec') };
  if (at) {
    const a = at.trim();
    if (/%$/.test(a)) slot.intensity = a;
    else if (/kg$/i.test(a)) slot.load = a.replace(/kg$/i, '');
    // "5s" beside a stretch is a hold, which is a tempo note here, not a rep.
    else slot.tempo = a;
  }
  return slot;
}

const SESSIONS = [
  {
    focus: 'upper',
    date: '2026-09-22',
    thTitle: 'Upper - W2D1',
    blocks: {
      WU: [
        ['Banded Lat Activation', '2 x 6 @ 5s'],
        ['Hanging Scap Retracts', '2 x 10 @ 1s'],
        ['Medball Thoracic Opener', '2 x 10 @ 5kg'],
        ['Push Up To Downward Dog', '2 x 10'],
      ],
      A: [
        ['Chin Up Negative', '4 x 6 @ 5s'],
        ['Prone Weighted Angels', '3 x 10-15'],
      ],
      B: [
        ['Tempo Barbell Bench Press', '3 x 6'],
        ['KB Gorilla Row', '3 x 10'],
      ],
      C: [
        ['Tricep Push Up', '3 x 10-15'],
        ['DB Rear Delt Fly', '3 x 12-15'],
        ['Oblique Crunch', '3 x 9'],
      ],
    },
  },
  {
    focus: 'lower',
    date: '2026-09-24',
    thTitle: 'Lower - W2D2',
    blocks: {
      WU: [
        ['Calf Stretch + Toe Lift in Rack', '2 x 3 @ 10s'],
        ['Quadruped Hip CARS', '2 x 3'],
        ['DB Goblet Squat', '2 x 8'],
        ['Squat Jumps', '2 x 30s'],
      ],
      A: [
        ['Barbell Back Squat', '3 x 7 @ 75%'],
        ['Depth Jump', '3 x 5'],
      ],
      B: [
        ['Barbell FFE Jefferson Split Squat', '3 x 10'],
        ['Single Leg Hamstring Bridge (Off Bench)', '3 x 12'],
      ],
      C: [
        ['DB Cyclist Squats (1 & 1/4)', '3 x 10'],
        ['Reverse Copenhagen Plank', '3 x 35s'],
        ['Single Leg Calf Raises (Weighted)', '3 x 10'],
      ],
    },
  },
  {
    focus: 'full',
    date: '2026-09-26',
    thTitle: 'Full Body - W2D3',
    blocks: {
      WU: [
        ['Quadruped Glute Stretch', '2 x 30s'],
        ['Adductor Rock Back Stretch', '2 x 10 @ 3s'],
        ['Glute Bridge w/Rotation', '2 x 10'],
        ['Single Leg Arabesque', '2 x 10'],
      ],
      A: [
        ['Barbell RDL', '3 x 7 @ 75%'],
        ['Cossack Squat', '3 x 10'],
      ],
      B: [
        ['Barbell Z-Press', '3 x 8'],
        ['Inverted Rows (Feet Elevated)', '3 x 12'],
      ],
      C: [
        ['Barbell Bicep Curl', '3 x 15'],
        ['DB Skullcrusher', '3 x 15'],
        ['Double Leg Lowers', '3 x 11'],
      ],
    },
  },
];

const MINUTES = { WU: 8, A: 20, B: 15, C: 12 };

const env = await (await fetch(BASE)).json();
const doc = env.data;
const stream = doc.streams.find((s) => s.id === 'strength');
const phase = stream.blocks.find((b) => b.id === 'str2-hyp');
if (!phase) throw new Error('Phase 2 (str2-hyp) not found');

// Phase 2 starts the week of 14 Sept, so 21 Sept is its second week.
const weekIndex = 1;
const week = phase.weeks[weekIndex];
if (!week) throw new Error('week 2 of Phase 2 not found');

let wrote = 0;
for (const s of SESSIONS) {
  const id = `th-w2-${s.focus}`;
  const timedBlocks = Object.entries(s.blocks).map(([label, rows]) => ({
    id: `${id}-${label}`,
    kind: 'series',
    label,
    minutes: MINUTES[label],
    slots: rows.map(([name, rx], i) => ({
      id: `${id}-${label}-${i}`,
      exerciseId: null,
      name,
      ...parse(rx),
    })),
  }));

  const session = {
    id,
    focus: s.focus,
    kind: 'series',
    intent: `${s.thTitle}. Teneriffe Athletic Club Strength, week 2, ${s.date}. Read from TrainHeroic.`,
    timedBlocks,
  };

  const existing = week.sessions.find((x) => x.focus === s.focus);
  if (existing) week.sessions = week.sessions.map((x) => (x.focus === s.focus ? { ...session, id: existing.id } : x));
  else week.sessions.push(session);
  wrote += timedBlocks.reduce((n, b) => n + b.slots.length, 0);
  console.log(`${s.date}  ${s.thTitle.padEnd(18)} -> focus "${s.focus}", ${timedBlocks.reduce((n, b) => n + b.slots.length, 0)} exercises`);
}

const res = await fetch(BASE, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const body = await res.json();
if (!res.ok) throw new Error(`save failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
console.log(`\nSaved ${wrote} exercises into Phase 2 week 2 (w/c ${MONDAY}). program rev ${env.rev} -> ${body.rev}`);
