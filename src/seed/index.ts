import type {
  AnnualPlanDoc,
  AttendanceDoc,
  ClassBlock,
  CommunityDoc,
  DocId,
  HomeDoc,
  EquipmentDoc,
  LayoutsDoc,
  LibraryOverridesDoc,
  PlanningDoc,
  ProgramBlock,
  ProgramDoc,
  ProgramStream,
  ProgramWeek,
  ScheduleDoc,
  Session,
  SessionFocus,
  TimedBlock,
} from '../types/documents.js';

// ---------- Schedule: the real TAC timetable (week of 10 Aug 2026) ----------

// Colours follow TAC/brand.md: pine for ESD, charcoal for Game Day, muted
// supporting hues; red reserved for Hyrox as on the club timetable.
const CT = {
  esd: { id: 'esd', name: 'ESD', colour: '#003030' },
  lbs: { id: 'lbs', name: 'Full Body Strength A', colour: '#5A5A52' },
  ubs: { id: 'ubs', name: 'Full Body Strength B', colour: '#6E7B74' },
  run: { id: 'run', name: 'Run Club', colour: '#8A7B66' },
  hyrox: { id: 'hyrox', name: 'Hyrox Training', colour: '#C64545' },
  flow: { id: 'flow', name: 'Flow Yoga', colour: '#7C6FA0' },
  yin: { id: 'yin', name: 'Yin Yoga', colour: '#5B5480' },
  stretch: { id: 'stretch', name: 'StretchFit', colour: '#3E6B8C' },
  gameday: { id: 'gameday', name: 'Game Day', colour: '#292626' },
};

const COACHES = [
  { id: 'ji', name: 'Ji Wallace' },
  { id: 'katie', name: 'Katie Dall' },
  { id: 'madi', name: 'Madi Pearson' },
  { id: 'lynn', name: 'Lynn Fitzgerald' },
  { id: 'stephanie', name: 'Stephanie Chung' },
  { id: 'anthony', name: 'Anthony Lett' },
];

const ROOMS = [
  { id: 'gfr', name: 'Group Fitness Room' },
  { id: 'gym-floor', name: 'Gym Floor' },
  { id: 'run-club', name: 'Run Club' },
];

let n = 0;
function blk(
  day: ClassBlock['day'],
  startMin: number,
  durationMin: number,
  classTypeId: string,
  coachId: string,
  roomId: string,
): ClassBlock {
  n += 1;
  return { id: `blk-${n}`, day, startMin, durationMin, classTypeId, coachId, roomId };
}

export function seedSchedule(): ScheduleDoc {
  n = 0;
  const blocks: ClassBlock[] = [
    // Monday
    blk(0, 5 * 60, 60, 'esd', 'ji', 'gfr'),
    blk(0, 6 * 60, 60, 'esd', 'ji', 'gfr'),
    blk(0, 7 * 60, 60, 'esd', 'ji', 'gfr'),
    blk(0, 12 * 60, 60, 'esd', 'madi', 'gfr'),
    blk(0, 17 * 60 + 15, 60, 'hyrox', 'ji', 'gfr'),
    blk(0, 18 * 60 + 15, 60, 'hyrox', 'ji', 'gfr'),
    // Tuesday
    blk(1, 5 * 60, 60, 'lbs', 'ji', 'gym-floor'),
    blk(1, 5 * 60, 60, 'run', 'katie', 'run-club'),
    blk(1, 6 * 60, 60, 'lbs', 'ji', 'gym-floor'),
    blk(1, 12 * 60, 60, 'lbs', 'ji', 'gym-floor'),
    blk(1, 17 * 60, 45, 'flow', 'stephanie', 'gfr'),
    blk(1, 18 * 60, 60, 'yin', 'stephanie', 'gfr'),
    // Wednesday
    blk(2, 5 * 60, 60, 'run', 'katie', 'run-club'),
    // Thursday
    blk(3, 5 * 60, 60, 'ubs', 'ji', 'gym-floor'),
    blk(3, 6 * 60, 60, 'ubs', 'ji', 'gym-floor'),
    blk(3, 12 * 60, 60, 'ubs', 'ji', 'gym-floor'),
    blk(3, 17 * 60, 55, 'stretch', 'anthony', 'gfr'),
    blk(3, 18 * 60, 55, 'stretch', 'anthony', 'gfr'),
    // Friday
    blk(4, 5 * 60, 60, 'esd', 'ji', 'gfr'),
    blk(4, 6 * 60, 60, 'esd', 'ji', 'gfr'),
    blk(4, 7 * 60, 60, 'esd', 'ji', 'gfr'),
    blk(4, 12 * 60, 60, 'esd', 'lynn', 'gfr'),
    blk(4, 17 * 60 + 15, 60, 'hyrox', 'ji', 'gfr'),
    // Saturday
    blk(5, 7 * 60 + 30, 60, 'gameday', 'ji', 'gfr'),
  ];

  return {
    classTypes: Object.values(CT),
    coaches: COACHES,
    rooms: ROOMS,
    scenarios: [{ id: 'current', name: 'Current timetable', blocks }],
    activeScenarioId: 'current',
    // A fresh document has one week and it is the real one, so the live
    // pointer is set from the start rather than left to the fallback.
    liveScenarioId: 'current',
  };
}

// ---------- Program: the 2026/27 pre-Christmas macrocycle shape ----------

const FOCUSES: SessionFocus[] = ['lower', 'upper', 'full'];

// Every session starts with a Warm Up (WU) series plus A, B, C series.
export function defaultSeries(prefix: string): TimedBlock[] {
  return [
    { id: `${prefix}-WU`, label: 'WU', minutes: 5, slots: [] },
    { id: `${prefix}-A`, label: 'A', minutes: 15, slots: [] },
    { id: `${prefix}-B`, label: 'B', minutes: 12, slots: [] },
    { id: `${prefix}-C`, label: 'C', minutes: 10, slots: [] },
  ];
}

// Phase lengths follow PROGRAMMING-PLAN.md (10/1/6); all editable in-app.
const SEED_BLOCKS: { theme: string; weeks: number }[] = [
  { theme: 'Strength-Hypertrophy', weeks: 10 },
  { theme: 'Deload / skills', weeks: 1 },
  { theme: 'Strength', weeks: 6 },
];

// One programming stream per class type. Strength is written as series of
// sets and reps; ESD, Hyrox and Game Day are written as circuits.
const SEED_STREAMS: {
  id: string;
  name: string;
  format: ProgramStream['format'];
  focuses: SessionFocus[];
}[] = [
  { id: 'strength', name: 'Strength', format: 'strength', focuses: FOCUSES },
  { id: 'esd', name: 'ESD', format: 'circuit', focuses: ['esd'] },
  { id: 'hyrox', name: 'Hyrox', format: 'strength', focuses: ['rox-strong', 'rox-race'] },
  { id: 'gameday', name: 'Game Day', format: 'circuit', focuses: ['gameday'] },
];

export function seedProgram(): ProgramDoc {
  const streams = SEED_STREAMS.map(({ id, name, format, focuses }): ProgramStream => ({
    id,
    name,
    format,
    blocks: SEED_BLOCKS.map(({ theme, weeks }, bIdx): ProgramBlock => {
      const b = bIdx + 1;
      return {
        id: `${id}-block-${b}`,
        theme,
        weeks: Array.from({ length: weeks }, (_, wIdx): ProgramWeek => {
          const w = wIdx + 1;
          const sessions = focuses.map((focus, s): Session => {
            const sid = `${id}-b${b}w${w}s${s + 1}`;
            return format === 'circuit'
              ? { id: sid, focus, kind: 'circuit', circuit: [] }
              : { id: sid, focus, kind: 'series', timedBlocks: defaultSeries(sid) };
          });
          return { id: `${id}-b${b}w${w}`, sessions };
        }),
      };
    }),
  }));

  return { name: 'TAC Programming 2026/27', streams };
}

// ---------- Annual plan: a sensible starting year, fully editable ----------

let ap = 0;
function phase(name: string, focus: string, weeks: number) {
  ap += 1;
  return { id: `ap-${ap}`, name, focus, weeks };
}

export function seedAnnualPlan(): AnnualPlanDoc {
  ap = 0;
  return {
    startDate: '2026-08-24', // a Monday; the ratified 2026/27 plan anchor
    // AU/NZ HYROX calendar for the 2026/27 season, checked against the
    // published race listings 2026-08-20. Editable in-app as dates firm up.
    // Weeks the club runs no classes. Phase lengths are TRAINING weeks, so
    // every lane and every Programming week date steps over these.
    breaks: [
      { id: 'break-christmas-2026', name: 'Christmas break', start: '2026-12-21', weeks: 2 },
    ],
    races: [
      { id: 'hx-perth-2026', name: 'HYROX Perth', date: '2026-08-21', endDate: '2026-08-23', streamId: 'hyrox' },
      { id: 'hx-melbourne-2026', name: 'HYROX Melbourne', date: '2026-12-09', endDate: '2026-12-13', streamId: 'hyrox' },
      { id: 'hx-auckland-2027', name: 'HYROX Auckland', date: '2027-02-04', endDate: '2027-02-07', streamId: 'hyrox' },
      { id: 'hx-brisbane-2027', name: 'HYROX Brisbane', date: '2027-03-31', endDate: '2027-04-04', streamId: 'hyrox' },
    ],
    streams: [
      {
        id: 'strength',
        name: 'Strength',
        colour: '#003030',
        // Mirrors PROGRAMMING-PLAN.md (the 2026-08-14 handover).
        phases: [
          phase('Strength-Hypertrophy', 'Wave loading 9/7/5, W1 3RM top-set testing, W7 deload', 10),
          phase('Deload / skills', 'Deload + workshops prepping the strength block', 1),
          phase('Strength', 'Mini waves 7-5-3 then 5-3-1, Christmas-week retest', 6),
          // The Christmas shutdown is not a phase: it is a club-wide break
          // (see `breaks` below), so every stream's dates step over it.
          phase('Unilateral muscle-endurance', 'W1 testing; single-limb, tempo, TUT, asymmetric holds', 4),
          phase('Hypertrophy', 'Aesthetic focus, anchor strength lifts retained', 12),
          phase('Strength-Hypertrophy (cycle 2)', 'Back into the wave-loading cycle', 10),
          phase('Deload / skills 2', 'Deload + skills workshops', 1),
          phase('Strength (cycle 2)', 'Mini waves 7-5-3 then 5-3-1, retest to close', 6),
        ],
      },
      {
        id: 'esd',
        name: 'ESD',
        colour: '#3E6B8C',
        phases: [
          phase('Aerobic base', 'Zone 2 volume, machine efficiency, long intervals', 10),
          phase('Threshold', 'Sustained pace work, cruise intervals', 8),
          phase('Max aerobic power', 'Shorter, harder repeats, VO2 focus', 6),
          phase('Mixed modal', 'Combinations, race-pace pieces, transitions', 8),
          phase('Aerobic maintenance', 'Hold the engine, deload the intensity', 10),
          phase('Re-base', 'Back to zone 2 volume before the next build', 10),
        ],
      },
      {
        id: 'hyrox',
        name: 'Hyrox',
        colour: '#C64545',
        phases: [
          phase('Off-season GPP', 'General strength and engine, technique on the eight stations', 10),
          phase('Strength-endurance build', 'Compromised running, station volume', 10),
          phase('Race prep', 'Race simulations, pacing, transitions', 8),
          phase('Comp + taper', 'Sharpen, taper, race window', 4),
          phase('Recover', 'Down week, review the race', 2),
          phase('Build 2', 'Second build off the race learnings', 10),
          phase('Race prep 2', 'Simulations for the second race window', 6),
          phase('Comp 2', 'Race window two', 2),
        ],
      },
    ],
  };
}

// ---------- Attendance + home ----------

// July 2026 mock numbers so the dashboard demonstrates itself; overwrite or
// delete them as real months are recorded.
export function seedAttendance(): AttendanceDoc {
  const july: Record<string, number> = {
    esd: 290,
    hyrox: 180,
    lbs: 150,
    ubs: 132,
    stretch: 92,
    gameday: 76,
    run: 60,
    flow: 52,
    yin: 38,
  };
  return {
    entries: Object.entries(july).map(([classTypeId, count]) => ({
      id: `2026-07:${classTypeId}`,
      period: '2026-07',
      classTypeId,
      count,
      seeded: true,
    })),
  };
}

// A starting draft in Chris's voice; every word editable in-app.
export function seedHome(): HomeDoc {
  return {
    ethos:
      'Group training at TAC is coached, not supervised. Every class runs off one plan: strength that builds block on block, engines developed with intent, and standards we can actually measure. Train better, live better.',
    focusPoints: [
      'Progressive overload you can see: every block builds on the last',
      'Movement quality before load, every time',
      'Every pattern, every week: squat, hinge, push, pull, carry',
      'The engine is trained, not trashed: ESD with a plan',
      'Scale the exercise, never the standard',
    ],
    different: [
      'A periodised block plan behind every class, not a random daily workout',
      'Timed series, so sessions run to the clock in every room',
      'One movement library, one standard, the same cues from every coach',
      'The TV cards show the why, not just the what',
    ],
  };
}

// ---------- The rest ----------

export function seedLibraryOverrides(): LibraryOverridesDoc {
  return { patterns: {}, scales: {}, cues: {}, customExercises: [] };
}

export function seedCommunity(): CommunityDoc {
  return { events: [] };
}

export function seedPlanning(): PlanningDoc {
  return { notes: '', todos: [] };
}

export function seedLayouts(): LayoutsDoc {
  return {
    rooms: [
      { id: 'strength', name: 'Strength', room: 'Gym Floor', items: [] },
      { id: 'esd', name: 'ESD', room: 'Group Fitness Room', items: [] },
      { id: 'hyrox', name: 'Hyrox', room: 'Group Fitness Room', items: [] },
      { id: 'gameday', name: 'Game Day', room: 'Group Fitness Room', items: [] },
    ],
  };
}

export function seedEquipment(): EquipmentDoc {
  return {
    items: [
      { id: 'eq-1', name: 'Barbells', count: 10 },
      { id: 'eq-2', name: 'Plates 20kg (pairs)', count: 10 },
      { id: 'eq-3', name: 'Dumbbell pairs', count: 12 },
      { id: 'eq-4', name: 'Kettlebells', count: 12 },
      { id: 'eq-5', name: 'Rowers', count: 8 },
      { id: 'eq-6', name: 'Ski ergs', count: 4 },
      { id: 'eq-7', name: 'Assault bikes', count: 6 },
      { id: 'eq-8', name: 'Sleds', count: 4 },
      { id: 'eq-9', name: 'Wall balls', count: 12 },
      { id: 'eq-10', name: 'Boxes', count: 8 },
    ],
  };
}

export const seeds: Record<DocId, () => unknown> = {
  schedule: seedSchedule,
  program: seedProgram,
  'library-overrides': seedLibraryOverrides,
  'annual-plan': seedAnnualPlan,
  attendance: seedAttendance,
  home: seedHome,
  community: seedCommunity,
  planning: seedPlanning,
  layouts: seedLayouts,
  equipment: seedEquipment,
  'push-log': () => ({ entries: [] }),
};
