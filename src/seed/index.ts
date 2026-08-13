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
  ProgramWeek,
  ScheduleDoc,
  Session,
  SessionFocus,
} from '../types/documents.js';

// ---------- Schedule: the real TAC timetable (week of 10 Aug 2026) ----------

// Colours follow TAC/brand.md: pine for ESD, charcoal for Game Day, muted
// supporting hues; red reserved for Hyrox as on the club timetable.
const CT = {
  esd: { id: 'esd', name: 'ESD', colour: '#003030' },
  lbs: { id: 'lbs', name: 'Lower Body Strength', colour: '#5A5A52' },
  ubs: { id: 'ubs', name: 'Upper Body Strength', colour: '#6E7B74' },
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
  };
}

// ---------- Program: empty 3 blocks x 4 weeks x 3 sessions ----------

const FOCUSES: SessionFocus[] = ['lower', 'upper', 'full'];

export function seedProgram(): ProgramDoc {
  const blocks = [1, 2, 3].map((b): ProgramBlock => {
    const weeks = [1, 2, 3, 4].map((w): ProgramWeek => {
      const sessions = FOCUSES.map(
        (focus, s): Session => ({
          id: `b${b}w${w}s${s + 1}`,
          focus,
          timedBlocks: [{ id: `b${b}w${w}s${s + 1}-A`, label: 'A', minutes: 15, slots: [] }],
        }),
      );
      return { id: `b${b}w${w}`, sessions };
    }) as ProgramBlock['weeks'];
    return { id: `block-${b}`, weeks };
  }) as ProgramDoc['blocks'];

  return { name: 'TAC Strength Cycle 1', blocks };
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
    startDate: '2026-08-31', // a Monday; edit to the real plan anchor
    streams: [
      {
        id: 'strength',
        name: 'Strength',
        colour: '#003030',
        phases: [
          phase('Foundation', 'Technique, work capacity, base hypertrophy', 12),
          phase('Deload + retest', 'Light week, movement checks, baseline lifts', 1),
          phase('Build', 'Progressive overload on the main lifts, 5s and 6s', 12),
          phase('Deload + retest', 'Light week, retest key lifts', 1),
          phase('Strength peak', 'Heavy triples and doubles, intensity up, volume down', 12),
          phase('Deload + retest', 'Light week, PB attempts window', 1),
          phase('Consolidate', 'Hold new strength, expand movement library', 12),
          phase('Transition', 'Fun week, variety, no barbell targets', 1),
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
      month: '2026-07',
      classTypeId,
      count,
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
      'A 12-week plan behind every class, not a random daily workout',
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
      { id: 'esd-hyrox', name: 'Group Fitness Room (ESD / Hyrox)', items: [] },
      { id: 'strength', name: 'Gym Floor (Strength)', items: [] },
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
};
