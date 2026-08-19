// All persisted document shapes. One document per tab (plus library-overrides)
// so concurrent edits on different tabs never collide.

export type DocId =
  | 'schedule'
  | 'program'
  | 'library-overrides'
  | 'annual-plan'
  | 'attendance'
  | 'home'
  | 'community'
  | 'planning'
  | 'layouts'
  | 'equipment';

export interface DocEnvelope<T> {
  data: T;
  rev: number;
  updatedAt: string;
}

// ---------- Schedule ----------

export interface ClassType {
  id: string;
  name: string;
  colour: string; // hex, block background
}

export interface Coach {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface ClassBlock {
  id: string;
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon..Sun
  startMin: number; // minutes from midnight, snapped to 15
  durationMin: number; // 5-min steps
  classTypeId: string;
  coachId: string | null;
  roomId: string | null;
}

export interface WeekScenario {
  id: string;
  name: string;
  note?: string;
  blocks: ClassBlock[];
}

export interface ScheduleDoc {
  classTypes: ClassType[];
  coaches: Coach[];
  rooms: Room[];
  scenarios: WeekScenario[];
  activeScenarioId: string;
}

// ---------- Programming ----------

export type SessionFocus = 'lower' | 'upper' | 'full' | 'esd' | 'hyrox' | 'gameday';

export interface ExerciseSlot {
  id: string;
  exerciseId: number | null; // TrainHeroic library id; null = free text
  name: string;
  sets?: string;
  reps?: string;
  load?: string;
  intensity?: string;
  rpe?: string;
  tempo?: string;
  showScales?: boolean;
}

export interface TimedBlock {
  id: string;
  label: string; // "A", "B", ...
  minutes: number;
  slots: ExerciseSlot[];
}

export interface Session {
  id: string;
  focus: SessionFocus;
  name?: string; // optional display name overriding the focus label
  intent?: string; // coach-facing note at the top: the day's intent
  timedBlocks: TimedBlock[];
  blurbOverride?: string; // coach-edited blurb wins over generated
}

export interface ProgramWeek {
  id: string;
  sessions: Session[]; // any mix of strength/ESD/Hyrox sessions, coach-defined
}

// Blocks are variable length (the 2026/27 plan runs 10/1/6 weeks) and the
// block list itself grows as the macrocycle does. Grids and exports iterate;
// nothing may assume 3 blocks or 4 weeks.
export interface ProgramBlock {
  id: string;
  theme?: string;
  weeks: ProgramWeek[];
}

// Each class type Chris programs is its own stream, with its own phases.
// Stream ids match the annual-plan lanes where they overlap.
export interface ProgramStream {
  id: string; // 'strength' | 'esd' | 'hyrox' | 'gameday', extensible
  name: string;
  blocks: ProgramBlock[]; // phases (variable length: 10/1/6...)
}

export interface ProgramDoc {
  name: string;
  streams: ProgramStream[];
  /** @deprecated pre-streams shape; migrated to streams[0] on read. */
  blocks?: ProgramBlock[];
}

// ---------- Library overrides (coach layer over the generated library) ----------

export const PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'h-push',
  'v-push',
  'h-pull',
  'v-pull',
  'carry',
  'core-rotation',
] as const;

export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<Pattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge / single leg',
  'h-push': 'Horizontal push',
  'v-push': 'Vertical push',
  'h-pull': 'Horizontal pull',
  'v-pull': 'Vertical pull',
  carry: 'Carry',
  'core-rotation': 'Core / rotation',
};

export interface CustomExercise {
  id: number; // negative ids, never collide with TrainHeroic ids
  title: string;
  patterns: Pattern[];
}

export interface LibraryOverridesDoc {
  patterns: Record<number, Pattern[]>; // exerciseId -> coach-tagged patterns (wins over guess)
  scales: Record<number, string[]>; // exerciseId -> up to 2 scaled options
  cues: Record<number, string>; // key cue per exercise, feeds the session blurb
  customExercises: CustomExercise[];
}

// ---------- Annual plan ----------
// One lane per training stream (Strength classes, ESD, Hyrox), each a sequence
// of phases against a 52-week year anchored at startDate. Phase start dates are
// computed from cumulative weeks, never stored.

export interface AnnualPhase {
  id: string;
  name: string; // e.g. "Foundation", "Race prep", "Deload + retest"
  focus: string; // the training intent of the phase
  weeks: number;
  notes?: string;
}

export interface AnnualStream {
  id: 'strength' | 'esd' | 'hyrox';
  name: string;
  colour: string;
  phases: AnnualPhase[];
}

// A dated race/competition marker drawn on its stream's lane. Multi-day
// events carry an endDate; single-day ones omit it.
export interface RaceEvent {
  id: string;
  name: string;
  date: string; // ISO yyyy-mm-dd, first day
  endDate?: string; // ISO yyyy-mm-dd, last day
  streamId: AnnualStream['id'];
}

export interface AnnualPlanDoc {
  startDate: string; // ISO yyyy-mm-dd, a Monday; anchors every computed date
  streams: AnnualStream[];
  races?: RaceEvent[];
}

// ---------- Attendance + home dashboard ----------

// period is either a month ('yyyy-mm') or a week starting Monday ('yyyy-mm-dd').
// Weekly entries roll up into their month for monthly views.
export interface AttendanceEntry {
  id: string;
  period: string;
  classTypeId: string; // references ScheduleDoc.classTypes
  count: number; // total attendances for that class type in the period
}

export interface AttendanceDoc {
  entries: AttendanceEntry[];
}

// The coach's ethos panel on the home page. All editable in-app.
export interface HomeDoc {
  ethos: string;
  focusPoints: string[];
  different: string[];
}

// ---------- Light tabs ----------

export interface CommunityEvent {
  id: string;
  date: string; // ISO yyyy-mm-dd
  name: string;
  notes?: string;
}

export interface CommunityDoc {
  events: CommunityEvent[];
}

// Block themes live on ProgramDoc.blocks[].theme (single source of truth);
// the Planning tab edits them there. This doc holds the free-form workspace.
export interface PlanningDoc {
  notes: string;
  todos: { id: string; text: string; done: boolean }[];
}

export interface LayoutItem {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colour?: string;
}

export interface LayoutRoom {
  id: 'esd-hyrox' | 'strength';
  name: string;
  items: LayoutItem[];
}

export interface LayoutsDoc {
  rooms: LayoutRoom[];
}

export interface EquipmentItem {
  id: string;
  name: string;
  count: number; // real number, cross-check ready
  notes?: string;
}

export interface EquipmentDoc {
  items: EquipmentItem[];
}

// Maps DocId to its document type, used by the store for typing.
export interface DocTypes {
  schedule: ScheduleDoc;
  program: ProgramDoc;
  'library-overrides': LibraryOverridesDoc;
  'annual-plan': AnnualPlanDoc;
  attendance: AttendanceDoc;
  home: HomeDoc;
  community: CommunityDoc;
  planning: PlanningDoc;
  layouts: LayoutsDoc;
  equipment: EquipmentDoc;
}
