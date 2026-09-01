// Pure session mutators, extracted from ProgrammingTab (step 2 of the split
// sequence, roundtable 2). Both shipped data-loss bugs lived in exactly this
// class of shape-translation code (the circuit-dropping clone, the series
// edit that mangled finishers), so these live where vitest can hold them.

import type {
  Session,
  SessionFocus,
  SessionKind,
  SeriesBlock,
  TimedBlock,
} from '../types/documents';
import { seriesBlocks } from './programStreams';
import { defaultSeries } from '../seed';

/**
 * Clone a session, carrying whichever payload it actually holds. Growing a
 * phase used to drop circuits here, because the clone was written as if every
 * session were a series. The discriminator now makes that unrepresentable.
 */
export function cloneSession(s: Session): Session {
  const common = {
    id: crypto.randomUUID(),
    focus: s.focus,
    ...(s.name ? { name: s.name } : {}),
    ...(s.note ? { note: s.note } : {}),
    ...(s.intent ? { intent: s.intent } : {}),
  };
  if (s.kind === 'circuit') {
    return {
      ...common,
      kind: 'circuit',
      circuit: s.circuit.map((b) => ({
        id: crypto.randomUUID(),
        heading: b.heading,
        lines: [...b.lines],
        ...(b.restAfter ? { restAfter: b.restAfter } : {}),
      })),
    };
  }
  // Same exercises all phase, blank prescriptions: they progress week to week.
  return {
    ...common,
    kind: 'series',
    timedBlocks: seriesBlocks(s.timedBlocks).map((tb) => ({
      id: crypto.randomUUID(),
      label: tb.label,
      minutes: tb.minutes,
      slots: tb.slots
        .filter((sl) => sl.name)
        .map((sl) => ({ id: crypto.randomUUID(), exerciseId: sl.exerciseId, name: sl.name })),
    })),
  };
}

/** A fresh, empty session written the way its stream is written. */
export function newSession(focus: SessionFocus, kind: SessionKind): Session {
  const id = crypto.randomUUID();
  return kind === 'circuit'
    ? { id, focus, kind: 'circuit', circuit: [] }
    : { id, focus, kind: 'series', timedBlocks: defaultSeries(id) };
}

/**
 * Rewrite a session's SERIES parts, leaving any circuit part exactly as it is.
 * Returning null drops that part. Every sets-and-reps edit goes through here,
 * so a circuit finisher can never be mangled by an edit meant for a series.
 */
export function mapSeries(
  blocks: TimedBlock[],
  fn: (b: SeriesBlock) => TimedBlock | null,
): TimedBlock[] {
  return blocks
    .map((b) => (b.kind === 'circuit' ? b : fn(b)))
    .filter((b): b is TimedBlock => b !== null);
}

/** Does this session hold real programming, in whichever way it is written? */
export function sessionHasContent(s: Session): boolean {
  return s.kind === 'circuit'
    ? s.circuit.some((c) => c.heading.trim() || c.lines.some((l) => l.text.trim()))
    : seriesBlocks(s.timedBlocks).some((tb) => tb.slots.some((sl) => sl.name));
}

/**
 * The next part label: the letter after the last one, skipping letters the
 * session already uses (adding after a deletion used to mint a duplicate,
 * and part labels key real behaviour: WU drives the board's warm-up strip).
 */
export function nextLabel(blocks: TimedBlock[]): string {
  const used = new Set(blocks.map((b) => b.label.toUpperCase()));
  const last = blocks[blocks.length - 1]?.label ?? '';
  let code =
    last.length === 1 && last >= 'A' && last < 'Z'
      ? last.charCodeAt(0) + 1
      : 65 + blocks.length;
  while (used.has(String.fromCharCode(code)) && code <= 90) code++;
  return String.fromCharCode(code);
}
