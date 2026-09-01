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
  | 'equipment'
  | 'push-log';

export interface DocEnvelope<T> {
  data: T;
  rev: number;
  updatedAt: string;
  /** Hostname of the machine that wrote this version (two-machine visibility). */
  machine?: string;
  /** On-disk shape version, stamped by scripts/migrate-docs.mjs (currently 2). */
  schemaVersion?: number;
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
  /** Where the week's programming gets emailed. Optional; no email, no send. */
  email?: string;
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
  /** Retired when a newer format went live. Kept so an old week can come back. */
  archived?: boolean;
  /** ISO date it was retired, shown beside its name in the archive. */
  archivedOn?: string;
  blocks: ClassBlock[];
}

export interface ScheduleDoc {
  classTypes: ClassType[];
  coaches: Coach[];
  rooms: Room[];
  scenarios: WeekScenario[];
  /** The scenario on screen in the Schedule tab. Safe to sketch on. */
  activeScenarioId: string;
  /**
   * The club's real timetable: the week members turn up to. The TrainHeroic
   * push, Home's Today panel and the floor-plan class sizes read this one, so
   * sketching a hypothetical week can no longer move the dates members see.
   * Optional because documents written before the split do not have it; see
   * `lib/scenarios.ts` for the fallback.
   */
  liveScenarioId?: string;
}

// ---------- Programming ----------

/**
 * The Hyrox stream runs named TRACKS rather than one undifferentiated class:
 * ROX Strong is strength endurance, ROX Engine is intervals and threshold,
 * ROX Race is compromised running raced solo. `hyrox` stays for sessions
 * written before the tracks existed.
 */
export type SessionFocus =
  | 'lower'
  | 'upper'
  | 'full'
  // The two-day Full Body split that replaced Lower/Upper/Full from 14 Sept
  // 2026: A is squat + upper focus (Tuesday), B is RDL + lower focus
  // (Thursday). The old three stay valid for the archived era.
  | 'full-a'
  | 'full-b'
  | 'esd'
  | 'hyrox'
  | 'rox-strong'
  | 'rox-engine'
  | 'rox-race'
  | 'gameday';

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
  /**
   * Scales for THIS slot only, overriding the exercise-level ones in
   * library-overrides when any is named. A wall ball used three ways in one
   * Hyrox block needs three scalings; exercise-level scales stay the default
   * for the Strength case (same movement, same regression all phase).
   */
  scales?: ScaledOption[];
  /**
   * What the columns cannot hold: which minute of an EMOM this is, or that a
   * machine is the athlete's choice. Per-slot scaling used to squat here as
   * text; it now lives in `scales` above.
   */
  note?: string;
  // showScales (a UI disclosure flag) used to persist here, which meant
  // browsing the tab dirtied the document and the git tree. It is React
  // state now; the stale key is stripped by the one-off migration.
}

interface TimedBlockCommon {
  id: string;
  label: string; // "A", "B", ...
  minutes: number;
  /**
   * How the part is run: "22 min AMRAP in pairs, one works one rests", and
   * what the score is. The slots say what the movements are; this says what
   * to do with them.
   */
  note?: string;
  /**
   * Curation beats compression on a wall board (2026-09-01 roundtable): a
   * part the class does not need on the wall (cooldown, station prep) is
   * hidden from the TV board but stays in the email, CSV and PDF.
   */
  hideFromBoard?: boolean;
}

/** A series: sets and reps against named exercises. The usual strength part. */
export interface SeriesBlock extends TimedBlockCommon {
  kind?: 'series'; // absent on documents written before circuits could sit here
  slots: ExerciseSlot[];
}

/**
 * A circuit piece inside an otherwise sets-and-reps session: a strength day
 * that finishes on a 10 minute AMRAP. Written the same way ESD and Hyrox are,
 * so the same editor and the same board rendering serve both.
 */
export interface CircuitPart extends TimedBlockCommon {
  kind: 'circuit';
  pieces: CircuitBlock[];
}

// A part carries one payload or the other, never both: the same discriminator
// that stopped a session dropping its circuit, one level down.
export type TimedBlock = SeriesBlock | CircuitPart;

// ESD, Hyrox and Game Day are written as circuits, not sets and reps: a
// heading ("AMRAP in 10 minutes:", "0:00-10:00"), the movements under it,
// and an optional rest before the next piece.
// One movement in a circuit piece. The load is held apart from the text so a
// sled push or a dumbbell thruster can say what to put on it: written as
// strings because a station is often "24/16" or "2x22.5", not one number.
export interface CircuitLine {
  text: string;
  load?: string;
}

export interface CircuitBlock {
  id: string;
  heading: string;
  lines: CircuitLine[];
  restAfter?: string;
  /** Hidden from the TV board only; see TimedBlockCommon.hideFromBoard. */
  hideFromBoard?: boolean;
}

/** How a session is written. Set on read by `programStreams.migrateSession`. */
export type SessionKind = 'series' | 'circuit';

/** The fields every session carries, whichever way it is written. */
interface SessionCommon {
  id: string;
  focus: SessionFocus;
  name?: string; // optional display name overriding the focus label
  intent?: string; // coach-facing note at the top: the day's intent
  note?: string; // footnote, e.g. how a pairs workout is shared
  blurbOverride?: string; // coach-edited blurb wins over generated
  /**
   * The session as members read it in the booking app: the workout written
   * out plainly, no coaching apparatus. Distinct from `note` (for coaches) and
   * from the blurb (one line of sell), so it is kept as its own field.
   */
  appDescription?: string;
}

/** Strength: series (WU/A/B/C) of exercise slots with sets, reps and load. */
export interface SeriesSession extends SessionCommon {
  kind: 'series';
  timedBlocks: TimedBlock[];
}

/** ESD, Hyrox and Game Day: pieces with a heading and movement lines. */
export interface CircuitSession extends SessionCommon {
  kind: 'circuit';
  circuit: CircuitBlock[];
}

// A session carries one payload or the other, never both. The two used to sit
// on one interface with `circuit` optional, which let any writer spread a
// session and silently drop the circuit. The discriminator makes the compiler
// catch that instead of the coach finding a blank board on the wall.
export type Session = SeriesSession | CircuitSession;

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
  /**
   * The AnnualPhase this phase delivers. Set for phase-cadence streams so the
   * Annual Plan is the one place a phase's name and length are decided; without
   * it the two tabs authored the same structure twice and drifted apart.
   */
  annualPhaseId?: string;
  /**
   * How many weeks a BLOCK is inside this phase. A block is the 3 to 4 week
   * wave the Block view pages through; a three-week wave and a four-week one
   * are both real, so the phase says which it runs. Defaults to 4.
   */
  blockLength?: number;
  weeks: ProgramWeek[];
}

// Each class type Chris programs is its own stream, with its own phases.
// Stream ids match the annual-plan lanes where they overlap.
export interface ProgramStream {
  id: string; // 'strength' | 'esd' | 'hyrox' | 'gameday', extensible
  name: string;
  format?: 'strength' | 'circuit'; // how its sessions are written; default strength
  /**
   * How the stream is organised in time. Strength runs the periodised phases of
   * the annual plan. ESD and Game Day are programmed month to month, so their
   * blocks[] are calendar months and the UI calls them months. Hyrox runs
   * four-week BLOCKS, each setting a signature session in its first week and
   * retesting it unchanged in its fourth, so a month container would split the
   * set from the retest.
   */
  cadence?: 'phases' | 'months' | 'blocks';
  blocks: ProgramBlock[]; // phases or months (variable length)
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

/** A scaled option: what to do instead, and how much of it. */
export interface ScaledOption {
  name: string;
  /**
   * TrainHeroic library id, set when the scale was picked from the library
   * rather than typed. It is what hangs the demo video off a scale, the same
   * way `ExerciseSlot.exerciseId` does for the movement it replaces. Absent on
   * scales written before scales could be picked; those fall back to matching
   * on name.
   */
  exerciseId?: number | null;
  sets?: string;
  reps?: string;
  load?: string;
  intensity?: string;
  rpe?: string;
  tempo?: string;
}

export interface LibraryOverridesDoc {
  /**
   * Exercise key -> coach-tagged patterns (wins over the guess). Keyed the
   * same way as `scales`: the TrainHeroic id for a library exercise,
   * `name:<lower-case name>` for free text, so the eleven free-text exercises
   * in the live block stopped being invisible to Movement Check. Numeric JSON
   * keys are strings already, so nothing needed migrating. See `scaleKey`.
   */
  patterns: Record<string, Pattern[]>;
  /**
   * Exercise key -> up to 2 scaled options. Each carries its own prescription,
   * because a scale is rarely the same sets and reps as the movement it
   * replaces. Older documents hold plain strings and are lifted on read.
   *
   * The key is the TrainHeroic exercise id for a library exercise and
   * `name:<lower-case name>` for one written as free text, which is why it is
   * a string. See `scaleKey` in lib/prescription.ts. Numeric keys serialise as
   * strings in JSON already, so nothing needed migrating.
   */
  scales: Record<string, (ScaledOption | string)[]>;
  /** Key cue per exercise, feeds the blurb and the board. Keyed like scales. */
  cues: Record<string, string>;
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

// A week the club runs no classes at all: the Christmas shutdown, a public
// holiday week. It belongs to the club, not to one stream, so every stream's
// week dating steps over it. Without this, every date after the shutdown runs
// as many weeks early as the shutdown is long.
export interface BreakWindow {
  id: string;
  name: string; // "Christmas break"
  start: string; // ISO yyyy-mm-dd, the Monday of the first week off
  weeks: number;
}

export interface AnnualPlanDoc {
  startDate: string; // ISO yyyy-mm-dd, a Monday; anchors every computed date
  streams: AnnualStream[];
  races?: RaceEvent[];
  /** Club-wide shutdowns. Phase lengths are TRAINING weeks; these sit between. */
  breaks?: BreakWindow[];
}

// ---------- Attendance + home dashboard ----------

// period is either a month ('yyyy-mm') or a week starting Monday ('yyyy-mm-dd').
// Weekly entries roll up into their month for monthly views.
export interface AttendanceEntry {
  id: string;
  period: string;
  classTypeId: string; // references ScheduleDoc.classTypes
  count: number; // total attendances for that class type in the period
  /**
   * True for the invented demo rows the tool seeded. Home banners every chart
   * while any survive: numbers that look real but are not would otherwise
   * reach the owners (2026-09-01 roundtable).
   */
  seeded?: boolean;
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

// A captured note: paste a meeting summary in and it lands here, dated.
export interface PlanningNote {
  id: string;
  date: string; // ISO yyyy-mm-dd, when it was captured
  title: string;
  text: string;
}

// Phase themes live on ProgramDoc streams[].blocks[].theme (single source of
// truth); the Planning tab edits them there. This doc holds the workspace.
export interface PlanningDoc {
  notes: string;
  noteEntries?: PlanningNote[];
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
  kind?: string; // equipment type from roomModel; absent = free zone label
  count?: number; // draw a row of N of this item
  gap?: number; // spacing between repeats
  dir?: 'row' | 'col'; // repeat across the floor or down it (default row)
  station?: number; // station number badge for circuit maps
}

// One layout per class type, since each runs a different floor plan even
// when two share a room. Ids match the programming streams.
export interface LayoutRoom {
  id: string; // 'strength' | 'esd' | 'hyrox' | 'gameday'
  name: string;
  room?: string; // which physical room it runs in
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

// ---------------------------------------------------------------------------
// Push log: what has actually been sent to TrainHeroic, so push state lives in
// the tool instead of in handover prose and Chris's memory. Appended by the
// push endpoint; read by Programming's week pills and push dialogue.
// ---------------------------------------------------------------------------

export interface PushLogEntry {
  id: string;
  /** ISO timestamp of the push. */
  at: string;
  streamId: string;
  /** 1-based phase and week indices as the push endpoint receives them. */
  block: number;
  week: number;
  monday: string;
  /** ISO dates drafts were created on in this run. */
  dates: string[];
  pushed: string[];
  skipped: string[];
}

export interface PushLogDoc {
  entries: PushLogEntry[];
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
  'push-log': PushLogDoc;
}
