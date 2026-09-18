// Build one week's coaching folder.
//
//   npm run week-pack -- 2026-09-21 [--out "C:/path"] [--name "Week 2 Class Programming"]
//
// Writes a single folder a coach can be handed:
//
//   Week 2 Class Programming/
//     Week 2 - all workouts.txt      every session, strength and conditioning
//     boards/   Mon - Monday Conditioning.png      the TV output, one per class
//     cards/    Mon - Monday Conditioning.pdf      the coaching card, one per class
//     README.txt                                   what is in here and what is missing
//
// The boards and cards are rendered by driving the app's own routes in headless
// Chrome, so there is exactly one definition of what a board looks like. The
// text file is written here, in the same shape as the conditioning pack Chris
// already writes by hand.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { FOCUS_CLASS_TYPE, FOCUS_LABEL, FOCUS_WEEKDAY } from '../src/lib/focusCatalog.ts';
import { isoDate, trainingWeekMonday } from '../src/lib/trainingWeeks.ts';
import { DAY_NAMES } from '../src/lib/classDays.ts';
import { sessionWritten } from '../src/lib/prescription.ts';
import { linesToText, sessionLines } from '../src/lib/sessionText.ts';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';
const APP = BASE.replace(/\/api\/store$/, '');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The club's week, in the order the classes run. Mirrors WeekPackTab. */
const WEEK = [
  { focus: 'cond-mon', streamId: 'esd' },
  { focus: 'upper', streamId: 'strength' },
  { focus: 'cond-wed', streamId: 'esd' },
  { focus: 'lower', streamId: 'strength' },
  { focus: 'cond-fri', streamId: 'esd' },
  { focus: 'full', streamId: 'strength' },
];


// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const mondayArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!mondayArg) {
  console.error('Give the week\'s Monday: npm run week-pack -- 2026-09-21');
  process.exit(1);
}

async function load(id) {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`${id}: ${res.status}. Is the dev server running on ${APP}?`);
  return (await res.json()).data;
}






/**
 * One session as text: the words the wall board shows, and only those.
 *
 * The long coaching explanations live on the coaching card, not here. This
 * file is what gets read off a wall or handed to the designer, so an exercise
 * is its name, its prescription and its scaled options.
 *
 * What a session SAYS is decided once, in src/lib/sessionText.ts, and is the
 * same here, on the board, on the card and in the Word document. Only the
 * heading below and the indentation are this file's.
 */
function sessionText(row, overrides) {
  return [
    '='.repeat(72),
    '',
    `TENERIFFE ATHLETIC CLUB · ${row.streamName.toUpperCase()}`,
    `${row.dayName.toUpperCase()} · ${FOCUS_LABEL[row.focus].toUpperCase()}`,
    `${row.container} · Week ${row.weekIndex + 1} of ${row.weeks} · ${row.dayName} ${row.dateLong}`,
    '',
    linesToText(sessionLines(row.session, overrides, { boardOnly: true })),
  ].join('\n');
}

async function chrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error(`Chrome not found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

async function capture(bin, url, mode, outFile) {
  const common = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--virtual-time-budget=20000',
  ];
  const extra = mode === 'png'
    ? ['--window-size=1920,1080', `--screenshot=${outFile}`]
    : ['--run-all-compositor-stages-before-draw', '--no-pdf-header-footer', `--print-to-pdf=${outFile}`];
  await run(bin, [...common, ...extra, url], { maxBuffer: 1 << 26 });
}

// ---------------------------------------------------------------------------

const [program, overrides, annual, schedule] = await Promise.all([
  load('program'), load('library-overrides'), load('annual-plan'), load('schedule'),
]);
const breaks = annual.breaks ?? [];
const live = schedule.scenarios.find((s) => s.id === schedule.liveScenarioId);
if (!live) throw new Error('No live timetable scenario');

// Which week of the plan this Monday is, and therefore its number.
let weekNumber = null;
for (let i = 0; i < 80; i++) {
  if (isoDate(trainingWeekMonday(annual.startDate, i, breaks)) === mondayArg) { weekNumber = i + 1; break; }
}
if (weekNumber === null) throw new Error(`${mondayArg} is not a training-week Monday of the plan starting ${annual.startDate}`);

const rows = [];
const missing = [];
for (const entry of WEEK) {
  const stream = (program.streams ?? []).find((s) => s.id === entry.streamId);
  const label = FOCUS_LABEL[entry.focus];
  if (!stream) { missing.push(`${label}: no ${entry.streamId} stream`); continue; }

  // Where this Monday sits in the stream.
  let ref = null, before = 0;
  for (let bi = 0; bi < stream.blocks.length && !ref; bi++) {
    for (let wi = 0; wi < stream.blocks[bi].weeks.length; wi++) {
      if (isoDate(trainingWeekMonday(annual.startDate, before + wi, breaks)) === mondayArg) {
        ref = { bi, wi, weeks: stream.blocks[bi].weeks.length };
        break;
      }
    }
    before += stream.blocks[bi].weeks.length;
  }
  if (!ref) { missing.push(`${label}: this week is outside the ${stream.name} plan`); continue; }

  const block = stream.blocks[ref.bi];
  const session = block.weeks[ref.wi].sessions.find((s) => s.focus === entry.focus);
  if (!sessionWritten(session)) { missing.push(`${label}: not written`); continue; }

  // Which weekday it runs, from the live timetable.
  const classType = FOCUS_CLASS_TYPE[entry.focus];
  const days = [...new Set(live.blocks.filter((b) => b.classTypeId === classType).map((b) => b.day))].sort((a, b) => a - b);
  const fixed = FOCUS_WEEKDAY[entry.focus];
  const dayIndex = fixed !== undefined ? (days.includes(fixed) ? fixed : null) : (days[0] ?? null);
  if (dayIndex === null) { missing.push(`${label}: no ${classType} class on the live timetable`); continue; }

  const date = new Date(`${mondayArg}T00:00:00`);
  date.setDate(date.getDate() + dayIndex);
  rows.push({
    ...entry,
    session,
    streamName: stream.name,
    container: (stream.cadence ?? 'phases') === 'phases' ? `Phase ${ref.bi + 1}` : (block.theme ?? ''),
    weekIndex: ref.wi,
    weeks: ref.weeks,
    dayIndex,
    dayName: DAY_NAMES[dayIndex],
    dateLong: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    fileStem: `${SHORT[dayIndex]} - ${label}`,
  });
}
rows.sort((a, b) => a.dayIndex - b.dayIndex);

const folderName = flag('name') ?? `Week ${weekNumber} Class Programming`;
// A folder Chris names "Week 2 Class Programming" must not hold a file called
// "Week 4 - all workouts.txt": his numbering wins over the plan's inside the
// pack as well as on it.
const weekLabel = /^Week\s+\S+/i.exec(folderName)?.[0] ?? `Week ${weekNumber}`;
const outRoot = resolve(flag('out') ?? join(ROOT, '..', 'programming', 'weeks'));
const dir = join(outRoot, folderName);
if (existsSync(dir)) rmSync(dir, { recursive: true });
mkdirSync(join(dir, 'boards'), { recursive: true });
mkdirSync(join(dir, 'cards'), { recursive: true });

// 1. The text file: everything, in one place, easy to copy out of.
const monday = new Date(`${mondayArg}T00:00:00`);
const header = [
  'TENERIFFE ATHLETIC CLUB',
  folderName.toUpperCase(),
  `Week beginning ${monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  '',
  `${rows.length} class${rows.length === 1 ? '' : 'es'}: ${rows.map((r) => `${SHORT[r.dayIndex]} ${FOCUS_LABEL[r.focus]}`).join(' · ')}`,
  '',
  ...(missing.length ? ['NOT IN THIS PACK', ...missing.map((m) => `  ${m}`), ''] : []),
  'Train better, live better.',
  '76 COMMERCIAL ROAD, TENERIFFE',
  '',
].join('\n');
const textFile = join(dir, `${weekLabel} - all workouts.txt`);
writeFileSync(textFile, `${header}\n${rows.map((r) => sessionText(r, overrides)).join('\n')}\n`, 'utf8');

// 2. The boards and the cards, rendered from the app's own routes.
const bin = await chrome();
for (const row of rows) {
  await capture(bin, `${APP}/tv/${row.session.id}?bare=1`, 'png', join(dir, 'boards', `${row.fileStem}.png`));
  await capture(bin, `${APP}/card/${row.session.id}?bare=1`, 'pdf', join(dir, 'cards', `${row.fileStem}.pdf`));
  console.log(`  ${row.fileStem}`);
}

// 3. A note in the folder saying what it is, so it stands alone once sent on.
writeFileSync(
  join(dir, 'README.txt'),
  [
    `${folderName}`,
    `Week beginning ${monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}. Built ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    '',
    `${weekLabel} - all workouts.txt   every class this week as plain text, to copy out of.`,
    'boards/                              the TV output for each class, 1920x1080.',
    'cards/                               one coaching card per class, A4, for the floor.',
    '',
    'Classes in this pack:',
    ...rows.map((r) => `  ${r.dayName} · ${FOCUS_LABEL[r.focus]} (${r.streamName})`),
    ...(missing.length ? ['', 'Not in this pack:', ...missing.map((m) => `  ${m}`)] : []),
  ].join('\n'),
  'utf8',
);

console.log(`\n${folderName}: ${rows.length} class${rows.length === 1 ? '' : 'es'}, ${missing.length} missing`);
console.log(dir);
if (missing.length) console.log(missing.map((m) => `  missing: ${m}`).join('\n'));
