import type { ExerciseSlot, TimedBlock } from '../types/documents';
import { seriesLabelFor, splitCue } from './thCue';

// Reading a TrainHeroic team session back into a tool session.
//
// This is the exact inverse of the push (`pushMapping.ts` plus the payload the
// push plugin sends), and it is written as an inverse on purpose: the round
// trip is tested against the real push code, so the two cannot drift without a
// test going red.
//
// What the push does to a slot:
//   name      -> title
//   sets      -> param_count / set_num
//   reps      -> param_1_data_1..n, with param_1_type 3 reps / 18 seconds,
//                and anything the rep column cannot hold ("10ea", "8 RIR")
//                moved into the cue by mapReps
//   load      -> param_2_data_1..n when it is a bare number, param_2_type 19
//   %, RPE, tempo, rep note, slot note -> joined into instruction with ' · '
//
// So the load-bearing work here is unpicking that instruction string.

/** TrainHeroic's param type numbers (trainheroic-mcp/src/thClient.js PARAM). */
const SECONDS = 18;
const LOAD_KG = 19;
/**
 * %1RM. The second parameter is a percentage as often as it is a weight, and
 * reading only type 19 silently dropped every percentage in the programme:
 * "Barbell RDL 3 x 9 @ 70%" came through as "3 x 9". Found 2026-09-18 when
 * Chris said the 70% was missing and was right.
 */
const PERCENT = 2;

export interface ThExercise {
  title?: string;
  instruction?: string;
  param_1_type?: number;
  param_2_type?: number;
  param_count?: number;
  set_num?: number;
  /** The block this exercise sits in, added by calendar.sessionDetail. */
  blockTitle?: string;
  [key: string]: unknown;
}

export interface ParsedCue {
  intensity?: string;
  rpe?: string;
  tempo?: string;
  /** The rep prescription the rep column could not hold ("10ea", "8 RIR"). */
  reps?: string;
  note?: string;
}

/** param_1_data_1..10 and friends, in order, blanks dropped. */
export function paramData(e: ThExercise, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const v = e[`${prefix}_${i}`];
    if (v !== undefined && v !== null && String(v).trim() !== '') out.push(String(v).trim());
  }
  return out;
}

/** Does this cue segment read as a rep prescription rather than a note? */
function looksLikeReps(s: string): boolean {
  return /^\d+(\.\d+)?\s*(-|–|to)\s*\d+(\.\d+)?$/.test(s) || /^\d+\s*(ea|reps?|s|sec)$/i.test(s);
}

/**
 * The cue back into the fields it was built from. Everything the push writes
 * is recognisable; anything else is left as the slot note, which is where a
 * coach's own words would have been anyway.
 */
export function parseCue(cue: string | undefined): ParsedCue {
  const out: ParsedCue = {};
  if (!cue?.trim()) return out;
  const notes: string[] = [];

  for (const raw of cue.split('·')) {
    const s = raw.trim();
    if (!s) continue;
    let m;
    if ((m = /^@\s*(.+)$/.exec(s))) out.intensity = m[1].trim();
    else if ((m = /^RPE\s+(.+)$/i.exec(s))) out.rpe = m[1].trim();
    else if ((m = /^(\S+)\s+tempo$/i.exec(s))) out.tempo = m[1].trim();
    // The rep notes mapReps writes, turned back into the rep cell they came from.
    else if (/^each side$/i.test(s)) out.reps = 'ea';
    else if ((m = /^aim\s+(.+)$/i.exec(s))) out.reps = m[1].trim();
    else if ((m = /leaving\s+(\d+)\s+in reserve$/i.exec(s))) out.reps = `${m[1]} RIR`;
    else if (/^as many quality reps as possible$/i.test(s)) out.reps = 'MAX';
    else if (looksLikeReps(s) && out.reps === undefined) out.reps = s;
    else notes.push(s);
  }

  if (notes.length) out.note = notes.join(' · ');
  return out;
}

/** One TrainHeroic exercise as a tool slot. */
export function thExerciseToSlot(e: ThExercise, id: string, options: PullOptions = {}): ExerciseSlot {
  const cue: ParsedCue =
    options.cueStyle === 'coach' ? splitCue(e.instruction as string) : parseCue(e.instruction);
  const repValues = paramData(e, 'param_1_data');
  const loadValues = e.param_2_type === LOAD_KG ? paramData(e, 'param_2_data') : [];
  const percentValues = e.param_2_type === PERCENT ? paramData(e, 'param_2_data') : [];
  const sets = Number(e.param_count ?? e.set_num ?? 0) || repValues.length || 1;

  // The rep cell. A number in TrainHeroic plus "each side" in the cue was
  // "10ea" here; seconds came from "30sec"; an empty cell means the whole
  // prescription was words the column could not hold, and it lives in the cue.
  const first = repValues[0] ?? '';
  const seconds = e.param_1_type === SECONDS;
  let reps = first;
  if (cue.reps === 'ea') {
    reps = first ? (seconds ? `${first}sec ea` : `${first}ea`) : '';
  } else if (cue.reps) {
    // "aim 10+", "1 RIR", "MAX", or a range that never fitted the cell.
    reps = cue.reps;
  } else if (first && seconds) {
    reps = `${first}sec`;
  }

  const slot: ExerciseSlot = {
    id,
    // A team session carries the title only; the library id is not in the
    // calendar payload, so a pulled slot is free text until it is matched.
    exerciseId: null,
    name: (e.title ?? '').trim(),
  };
  if (sets) slot.sets = String(sets);
  if (reps) slot.reps = String(reps);
  if (loadValues.length) slot.load = loadValues[0];
  // The percentage TrainHeroic stores wins over anything read out of the cue.
  if (percentValues.length) slot.intensity = `${percentValues[0]}%`;
  else if (cue.intensity) slot.intensity = cue.intensity;
  if (cue.rpe) slot.rpe = cue.rpe;
  if (cue.tempo) slot.tempo = cue.tempo;
  if (cue.note) slot.note = cue.note;
  return slot;
}

export interface ThBlock {
  id: number;
  title?: string;
  order?: number;
}

/** Any object out of a walked TrainHeroic response. */
type ThObject = Record<string, unknown>;

/**
 * One day's session out of a walked TEAM calendar response.
 *
 * The team calendar is a PROGRAM calendar: `GET /1.0/coach/programs/edit/
 * {program_id}/{y}/{m}/{d}`, not the athlete `calendarEdit` path. Reading it
 * with the athlete endpoint and a program id is a 401, which reads exactly
 * like an expired token and cost an afternoon.
 *
 * The nesting differs from the athlete response but the objects inside are
 * the same, so the objects are identified by their own fields rather than by
 * where they sit: a session has a workout_id and a title, a block has an
 * order and a type and no param_1_type, an exercise has a param_1_type.
 */
export function teamSessionOn(
  objects: ThObject[],
  y: number,
  m: number,
  d: number,
  titleIncludes?: string,
): { session: ThObject & { title: string }; blocks: ThBlock[]; exercises: ThExercise[] } | null {
  const dedupe = <T extends ThObject>(list: T[]): T[] => {
    const seen = new Set<unknown>();
    return list.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  };

  const sessions = dedupe(
    objects.filter(
      (o) =>
        o.workout_id !== undefined &&
        typeof o.title === 'string' &&
        o.title &&
        o.program_type !== undefined &&
        Number(o.day) === d &&
        Number(o.month) === m &&
        Number(o.year) === y,
    ),
  ) as (ThObject & { title: string })[];

  const session = titleIncludes
    ? sessions.find((s) => s.title.toLowerCase().includes(titleIncludes.toLowerCase()))
    : sessions[0];
  if (!session) return null;

  const blocks = dedupe(
    objects.filter(
      (o) =>
        o.workout_id === session.workout_id &&
        o.id !== undefined &&
        o.order !== undefined &&
        o.type !== undefined &&
        o.param_1_type === undefined,
    ),
  ).sort((a, b) => Number(a.order) - Number(b.order)) as unknown as ThBlock[];

  const byBlock = new Map(blocks.map((b) => [b.id, b]));
  const exercises = dedupe(
    objects.filter((o) => o.param_1_type !== undefined && byBlock.has(Number(o.set_id))),
  )
    .sort(
      (a, b) => Number(a.set_id) - Number(b.set_id) || Number(a.order) - Number(b.order),
    )
    .map((e) => ({ ...e, blockTitle: byBlock.get(Number(e.set_id))?.title })) as ThExercise[];

  return { session, blocks, exercises };
}

/**
 * A session's blocks and exercises as the tool's timed blocks. Block titles
 * come back exactly as the push wrote them (the series label), and the
 * minutes are not in TrainHeroic at all, so they are carried over from the
 * session already in the tool where there is one.
 */

export interface PullOptions {
  /**
   * Whose cue this is. 'push' means the tool wrote it and it can be read back
   * field by field. 'coach' means Chris wrote it in TrainHeroic as prose, so
   * only the tempo and the reps-in-reserve are lifted out and the rest stays
   * as his note. Reading a coach's cue with the push parser shreds it.
   */
  cueStyle?: 'push' | 'coach';
}

export function thToTimedBlocks(
  blocks: ThBlock[],
  exercises: ThExercise[],
  idPrefix: string,
  minutesFor: (label: string) => number,
  options: PullOptions = {},
): TimedBlock[] {
  let workIndex = 0;
  return [...blocks]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((b, bi) => {
      const raw = (b.title ?? `B${bi + 1}`).trim();
      const label = seriesLabelFor(raw, workIndex);
      if (label !== 'WU') workIndex++;
      const slots = exercises
        .filter((e) => e.set_id === b.id)
        .map((e, ei) => thExerciseToSlot(e, `${idPrefix}-${bi}-${ei}`, options))
        .filter((s) => s.name);
      return {
        id: `${idPrefix}-${bi}`,
        kind: 'series' as const,
        label,
        minutes: minutesFor(label),
        slots,
      };
    })
    .filter((b) => b.slots.length > 0);
}
