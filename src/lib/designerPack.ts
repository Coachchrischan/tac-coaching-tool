// The designer pack: everything a session holds, labelled by where it goes.
//
// The marketing agency is redesigning the TV board. What they need is the
// INPUTS, not our layout: every field a session can carry, with a clear mark
// on each one saying whether the wall shows it today or it is coach-only.
// The rules here mirror TvBoard exactly (what it renders, what it skips), so
// the pack never claims a field is on the wall that the board leaves off.
//
// Pure: no DOM, no React, so it is unit-tested and the page only lays it out.

import type {
  CircuitBlock,
  ExerciseSlot,
  LibraryOverridesDoc,
  ProgramDoc,
  ProgramStream,
  ScheduleDoc,
  Session,
  SessionFocus,
  TimedBlock,
} from '../types/documents';
import { FOCUS_LABEL, streamsOf } from './programStreams';
import { cueFor, effectiveScales, scaleSummary } from './prescription';
import { resolveWeekDays } from './classDays';
import { isoDate, trainingWeekMonday } from './trainingWeeks';
import { BOARD_H, BOARD_W, FOCUS_TITLE, isWarmup, slideTitle, slotDetail } from '../tabs/tv/boardRules';

/** Where a piece of text goes: on the TV board, or only to coaches. */
export type Where = 'wall' | 'coach';

export interface PackField {
  label: string;
  text: string;
  where: Where;
  /** One line for the designer: why it is where it is. */
  why: string;
}

export interface PackScale {
  text: string;
  where: Where;
}

export interface PackSlot {
  /** "A1", "B3", or "WU" for a warm-up movement. */
  tag: string;
  name: string;
  sets?: string;
  reps?: string;
  load?: string;
  intensity?: string;
  rpe?: string;
  tempo?: string;
  /** The prescription line exactly as the board composes it. */
  asOnWall: string;
  note?: PackField;
  cue?: PackField;
  scales: PackScale[];
}

export interface PackLine {
  text: string;
  load?: string;
}

export interface PackPiece {
  heading: string;
  lines: PackLine[];
  restAfter?: string;
  onWall: boolean;
  /** The coach flagged it off the wall (cooldown, station prep). */
  hiddenByCoach: boolean;
}

export interface PackPart {
  kind: 'series' | 'circuit';
  label: string;
  minutes: number;
  isWarmup: boolean;
  onWall: boolean;
  hiddenByCoach: boolean;
  note?: PackField;
  slots: PackSlot[];
  pieces: PackPiece[];
}

export interface PackSession {
  id: string;
  weekIndex: number;
  weekMonday: string | null;
  day: string | null;
  date: string | null;
  label: string;
  kind: Session['kind'];
  /** The headline and the right-hand header lines as the board writes them. */
  wallTitle: string;
  wallHeader: string[];
  fields: PackField[];
  parts: PackPart[];
  pieces: PackPiece[];
  footer: PackField[];
}

export interface PackModel {
  club: string;
  generatedAt: string;
  stream: {
    id: string;
    name: string;
    cadence: NonNullable<ProgramStream['cadence']>;
    format: 'series' | 'circuit';
  };
  container: { index: number; label: string; theme: string | null; weeksTotal: number; unit: string };
  window: { index: number; count: number; weekFrom: number; weekTo: number };
  weeks: { index: number; monday: string | null }[];
  sessions: PackSession[];
  unwritten: string[];
  timetable: string;
  board: { width: number; height: number };
  fileBase: string;
  legend: { wall: string; coach: string; scales: string; hidden: string };
}

export interface PackInput {
  doc: ProgramDoc;
  overrides: LibraryOverridesDoc;
  schedule: ScheduleDoc | null;
  annual: { startDate: string; breaks?: { id: string; name: string; start: string; weeks: number }[] } | null;
  streamId: string;
  containerIndex: number;
  windowIndex: number;
  /** The board's footer blurb for a session (needs the exercise library). */
  blurbFor: (s: Session) => string;
  now?: Date;
}

export const BLOCK_LEN_DEFAULT = 4;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

/** Does a session hold anything a coach could run? Same test the overview uses. */
export function sessionWritten(s: Session): boolean {
  if (s.kind === 'circuit') return s.circuit.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()));
  return s.timedBlocks.some((tb) =>
    tb.kind === 'circuit'
      ? tb.pieces.some((p) => p.heading.trim() || p.lines.some((l) => l.text.trim()))
      : tb.slots.some((sl) => sl.name),
  );
}

/** How many block windows a container pages through, and how long each is. */
export function windowsOf(block: { blockLength?: number; weeks: unknown[] }): { length: number; count: number } {
  const length = Math.max(1, Math.min(block.blockLength ?? BLOCK_LEN_DEFAULT, block.weeks.length));
  return { length, count: Math.max(1, Math.ceil(block.weeks.length / length)) };
}

/** What a container is called for a stream: "Phase 2", or its own name. */
export function containerLabel(stream: ProgramStream, index: number): { label: string; unit: string } {
  const cadence = stream.cadence ?? 'phases';
  const unit = cadence === 'months' ? 'Month' : cadence === 'blocks' ? 'Block' : 'Phase';
  const block = stream.blocks[index];
  const label = cadence === 'phases' ? `Phase ${index + 1}` : (block?.theme ?? `${unit} ${index + 1}`);
  return { label, unit };
}

function pieceOf(c: CircuitBlock, partHidden: boolean): PackPiece {
  const lines = c.lines.filter((l) => l.text.trim()).map((l) => ({ text: l.text, load: l.load || undefined }));
  const hasContent = Boolean(c.heading.trim()) || lines.length > 0;
  const hidden = Boolean(c.hideFromBoard) || partHidden;
  return {
    heading: c.heading,
    lines,
    restAfter: c.restAfter?.trim() || undefined,
    onWall: hasContent && !hidden,
    hiddenByCoach: hidden,
  };
}

function slotOf(
  slot: ExerciseSlot,
  tag: string,
  warmup: boolean,
  partOnWall: boolean,
  overrides: LibraryOverridesDoc,
): PackSlot {
  const cue = cueFor(overrides, slot);
  const scales = effectiveScales(overrides, slot).filter((s) => s.name.trim());
  // The warm-up strip shows the movement, its prescription and the cue only:
  // no slot note and no scales. The series columns show all of them.
  const inColumn = partOnWall && !warmup;
  return {
    tag,
    name: slot.name,
    sets: slot.sets || undefined,
    reps: slot.reps || undefined,
    load: slot.load || undefined,
    intensity: slot.intensity || undefined,
    rpe: slot.rpe || undefined,
    tempo: slot.tempo || undefined,
    asOnWall: slotDetail(slot),
    note: slot.note?.trim()
      ? {
          label: 'Slot note',
          text: slot.note,
          where: inColumn ? 'wall' : 'coach',
          why: warmup
            ? 'The warm-up strip shows name, prescription and cue only.'
            : partOnWall
              ? 'Printed under the movement in sand.'
              : 'The whole part is off the wall.',
        }
      : undefined,
    cue: cue
      ? {
          label: 'Cue',
          text: cue,
          where: partOnWall ? 'wall' : 'coach',
          why: partOnWall ? 'Printed in italics under the prescription.' : 'The whole part is off the wall.',
        }
      : undefined,
    scales: scales.map((s) => ({ text: scaleSummary(s), where: inColumn ? 'wall' : 'coach' })),
  };
}

function partOf(tb: TimedBlock, overrides: LibraryOverridesDoc): PackPart {
  const hidden = Boolean(tb.hideFromBoard);
  const warmup = isWarmup(tb);
  if (tb.kind === 'circuit') {
    const pieces = tb.pieces.map((p) => pieceOf(p, hidden));
    const onWall = !hidden && pieces.some((p) => p.onWall);
    return {
      kind: 'circuit',
      label: tb.label,
      minutes: tb.minutes,
      isWarmup: false,
      onWall,
      hiddenByCoach: hidden,
      slots: [],
      pieces,
    };
  }
  const filled = tb.slots.filter((s) => s.name);
  const onWall = !hidden && filled.length > 0;
  const tag = (i: number) => (warmup ? 'WU' : `${tb.label.toUpperCase()}${i + 1}`);
  return {
    kind: 'series',
    label: tb.label,
    minutes: tb.minutes,
    isWarmup: warmup,
    onWall,
    hiddenByCoach: hidden,
    // The board writes a part note under the series heading; the warm-up
    // strip has no room for one, so there it stays with the coach.
    note: tb.note?.trim()
      ? {
          label: 'Part note',
          text: tb.note,
          where: onWall && !warmup ? 'wall' : 'coach',
          why: warmup
            ? 'The warm-up strip does not print a part note.'
            : onWall
              ? 'Printed under the series heading: how the part is run.'
              : 'The whole part is off the wall.',
        }
      : undefined,
    slots: filled.map((s, i) => slotOf(s, tag(i), warmup, onWall, overrides)),
    pieces: [],
  };
}

export function buildDesignerPack(input: PackInput): PackModel | null {
  const { doc, overrides, schedule, annual, blurbFor } = input;
  const stream = streamsOf(doc).find((s) => s.id === input.streamId);
  if (!stream || stream.blocks.length === 0) return null;
  const ci = Math.min(Math.max(0, input.containerIndex), stream.blocks.length - 1);
  const block = stream.blocks[ci];
  const cadence = stream.cadence ?? 'phases';
  const format: 'series' | 'circuit' = stream.format === 'circuit' || stream.id !== 'strength' ? 'circuit' : 'series';
  const { length: blockLen, count: windows } = windowsOf(block);
  const wi = Math.min(Math.max(0, input.windowIndex), windows - 1);
  const weekFrom = wi * blockLen;
  const weekTo = Math.min(block.weeks.length, weekFrom + blockLen) - 1;
  const { label, unit } = containerLabel(stream, ci);

  const weeksBefore = stream.blocks.slice(0, ci).reduce((n, b) => n + b.weeks.length, 0);
  const breaks = annual?.breaks ?? [];
  const mondayOf = (w: number): Date | null =>
    annual ? trainingWeekMonday(annual.startDate, weeksBefore + w, breaks) : null;

  const sessions: PackSession[] = [];
  const unwritten: string[] = [];
  let timetable = 'no timetable';
  for (let w = weekFrom; w <= weekTo; w++) {
    const week = block.weeks[w];
    const monday = mondayOf(w);
    const focuses = [...new Set(week.sessions.map((s) => s.focus))] as SessionFocus[];
    const resolved = schedule && monday ? resolveWeekDays(schedule, isoDate(monday), focuses) : null;
    if (resolved) timetable = resolved.scenarioName;
    const dayOf = new Map(resolved?.days.map((d) => [d.focus, d]) ?? []);
    // Sessions in the order the week runs them, off the live timetable.
    const ordered = week.sessions
      .map((s, i) => ({ s, i, day: dayOf.get(s.focus)?.dayIndex ?? null }))
      .sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.i - b.i);
    for (const { s } of ordered) {
      const labelText = s.name || FOCUS_LABEL[s.focus];
      if (!sessionWritten(s)) {
        unwritten.push(`Week ${w + 1} · ${labelText}`);
        continue;
      }
      const d = dayOf.get(s.focus);
      const isCircuit = s.kind === 'circuit';
      const wallTitle = isCircuit
        ? `${FOCUS_TITLE[s.focus]} · ${s.name ?? `Week ${w + 1}`}`
        : `Week ${w + 1} · ${slideTitle(s)}`;
      const positionLine = `${cadence === 'phases' ? `Phase ${ci + 1}` : (block.theme ?? '')} · Week ${w + 1} of ${block.weeks.length}`;
      const wallHeader = isCircuit
        ? [`WEEK ${w + 1}`, positionLine]
        : [...(block.theme ? [block.theme.toUpperCase()] : []), positionLine];

      const fields: PackField[] = [];
      if (s.intent?.trim())
        fields.push({
          label: 'Session intent',
          text: s.intent,
          where: 'wall',
          why: 'Printed in italics under the headline. It is written for the class, so keep it in the room voice.',
        });
      if (s.note?.trim())
        fields.push({
          label: 'Session note',
          text: s.note,
          where: isCircuit ? 'wall' : 'coach',
          why: isCircuit
            ? 'A circuit board prints it as a sand panel under the pieces (how pairs share the work).'
            : 'A strength board does not print it; it goes in the coach email and the block PDF.',
        });
      if (s.appDescription?.trim())
        fields.push({
          label: 'Members app description',
          text: s.appDescription,
          where: 'coach',
          why: 'Written for the booking app, never for the wall.',
        });
      const blurb = blurbFor(s);
      const footer: PackField[] = [];
      if (blurb.trim())
        footer.push({
          label: s.blurbOverride ? 'Footer blurb (coach-edited)' : 'Footer blurb (generated)',
          text: blurb,
          where: isCircuit ? 'coach' : 'wall',
          why: isCircuit ? 'Circuit boards leave the footer blank.' : 'One line of sell along the bottom of the board.',
        });
      footer.push({
        label: 'Address',
        text: '76 Commercial Road, Teneriffe',
        where: 'wall',
        why: 'Fixed footer text on every board.',
      });

      sessions.push({
        id: s.id,
        weekIndex: w,
        weekMonday: monday ? isoDate(monday) : null,
        day: d?.dayName ?? null,
        date: d?.date ?? null,
        label: labelText,
        kind: s.kind,
        wallTitle,
        wallHeader,
        fields,
        parts: isCircuit ? [] : s.timedBlocks.map((tb) => partOf(tb, overrides)),
        pieces: isCircuit ? s.circuit.map((c) => pieceOf(c, false)) : [],
        footer,
      });
    }
  }

  const containerSlug = cadence === 'phases' ? `phase${ci + 1}` : slug(block.theme ?? `${unit}${ci + 1}`);
  return {
    club: 'Teneriffe Athletic Club',
    generatedAt: (input.now ?? new Date()).toISOString(),
    stream: { id: stream.id, name: stream.name, cadence, format },
    container: { index: ci, label, theme: block.theme ?? null, weeksTotal: block.weeks.length, unit },
    window: { index: wi, count: windows, weekFrom, weekTo },
    weeks: Array.from({ length: weekTo - weekFrom + 1 }, (_, i) => {
      const m = mondayOf(weekFrom + i);
      return { index: weekFrom + i, monday: m ? isoDate(m) : null };
    }),
    sessions,
    unwritten,
    timetable,
    board: { width: BOARD_W, height: BOARD_H },
    fileBase: `TAC-designer-pack-${stream.id}-${containerSlug}-block${wi + 1}`,
    legend: {
      wall: 'ON THE WALL: the current TV board prints this text today.',
      coach: 'COACH ONLY: never shown on the wall. Included so the designer knows the field exists; it stays off the board.',
      scales:
        'Scaled options are on the wall as "Scale: ..." lines under the movement, in every block all year. Design for them.',
      hidden:
        'OFF THE WALL (coach flag): the coach hid this part from the board because the session ran too long. It still reaches the coach email and the block PDF.',
    },
  };
}
