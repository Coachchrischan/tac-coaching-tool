import type {
  ClassBlock,
  CommunityDoc,
  DocId,
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
      ) as [Session, Session, Session];
      return { id: `b${b}w${w}`, sessions };
    }) as ProgramBlock['weeks'];
    return { id: `block-${b}`, weeks };
  }) as ProgramDoc['blocks'];

  return { name: 'TAC Strength Cycle 1', blocks };
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
  community: seedCommunity,
  planning: seedPlanning,
  layouts: seedLayouts,
  equipment: seedEquipment,
};
