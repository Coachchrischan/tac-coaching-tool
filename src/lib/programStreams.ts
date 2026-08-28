// Stream helpers for the program document.
//
// The program used to be a single list of phases (`blocks`). It is now one
// list per class type Chris programs (Strength, ESD, Hyrox, Game Day), so
// every read goes through `streamsOf`, which migrates the old shape in
// memory. Writes always produce the new shape.

import type {
  CircuitBlock,
  CircuitLine,
  CircuitPart,
  CircuitSession,
  ProgramBlock,
  ProgramDoc,
  ProgramStream,
  ProgramWeek,
  SeriesBlock,
  Session,
  SessionFocus,
  SessionKind,
  TimedBlock,
} from '../types/documents';

export const STREAM_DEFS: { id: string; name: string; focuses: SessionFocus[] }[] = [
  { id: 'strength', name: 'Strength', focuses: ['lower', 'upper', 'full'] },
  { id: 'esd', name: 'ESD', focuses: ['esd'] },
  // 'hyrox' is last: it is the pre-tracks focus, kept so the August sessions
  // written before the tracks existed still belong to this stream.
  { id: 'hyrox', name: 'Hyrox', focuses: ['rox-strong', 'rox-engine', 'rox-race', 'hyrox'] },
  { id: 'gameday', name: 'Game Day', focuses: ['gameday'] },
];

export const FOCUS_LABEL: Record<SessionFocus, string> = {
  lower: 'Lower',
  upper: 'Upper',
  full: 'Full Body',
  esd: 'ESD',
  hyrox: 'Hyrox',
  'rox-strong': 'ROX Strong',
  'rox-engine': 'ROX Engine',
  'rox-race': 'ROX Race',
  gameday: 'Game Day',
};

export function sessionLabel(s: Session): string {
  return s.name || FOCUS_LABEL[s.focus];
}

/**
 * The sets-and-reps parts of a session. A strength session can also hold a
 * circuit part (a finisher written the ESD way), which has no exercise slots,
 * so everything that walks slots goes through here.
 */
export function seriesBlocks(blocks: TimedBlock[]): SeriesBlock[] {
  return blocks.filter((b): b is SeriesBlock => b.kind !== 'circuit');
}

/** The circuit parts of a session, in order. */
export function circuitParts(blocks: TimedBlock[]): CircuitPart[] {
  return blocks.filter((b): b is CircuitPart => b.kind === 'circuit');
}

/** How a stream's sessions are written. Strength is the only series stream. */
export function formatOf(stream: Pick<ProgramStream, 'id' | 'format'>): SessionKind {
  const format = stream.format ?? (stream.id === 'strength' ? 'strength' : 'circuit');
  return format === 'circuit' ? 'circuit' : 'series';
}

/** A session as it may appear on disk: written before `kind` existed. */
type StoredSession = Omit<Session, 'kind' | 'timedBlocks' | 'circuit'> & {
  kind?: SessionKind;
  timedBlocks?: TimedBlock[];
  circuit?: CircuitBlock[];
};

/**
 * Which way a stored session is written. Documents saved before the
 * discriminator existed carry both fields, so infer from what actually holds
 * content and fall back to the stream's own format for an empty shell.
 */
function inferKind(s: StoredSession, format: SessionKind): SessionKind {
  if (s.kind === 'series' || s.kind === 'circuit') return s.kind;
  const hasCircuit = (s.circuit ?? []).some(
    (c) => c.heading?.trim() || (c.lines ?? []).some((l) => (typeof l === 'string' ? l : l.text).trim()),
  );
  if (hasCircuit) return 'circuit';
  const hasSlots = seriesBlocks(s.timedBlocks ?? []).some((tb) => (tb.slots ?? []).some((sl) => sl.name));
  if (hasSlots) return 'series';
  return format;
}

/**
 * Give a stored session its `kind` and drop the payload it does not use, so a
 * circuit can never ride along inside a session the compiler treats as series.
 * Returns the input untouched when it is already in the right shape, keeping
 * object identity stable for React.
 */
export function migrateSession(stored: Session, format: SessionKind): Session {
  const s = stored as StoredSession;
  const kind = inferKind(s, format);
  if (s.kind === kind) {
    if (kind === 'series' && Array.isArray(s.timedBlocks)) return stored;
    if (kind === 'circuit' && Array.isArray(s.circuit)) {
      const circuit = migrateCircuit(s.circuit);
      return circuit === s.circuit ? stored : { ...(stored as CircuitSession), circuit };
    }
  }
  const { kind: _kind, timedBlocks, circuit, ...common } = s;
  return kind === 'circuit'
    ? { ...common, kind: 'circuit', circuit: migrateCircuit(circuit ?? []) }
    : { ...common, kind: 'series', timedBlocks: timedBlocks ?? [] };
}

/**
 * Circuit lines used to be plain strings, before a station could carry a load.
 * Lift them to `{ text }`, keeping identity when they are already lifted.
 */
function migrateCircuit(blocks: CircuitBlock[]): CircuitBlock[] {
  let changed = false;
  const next = blocks.map((b) => {
    const raw = b.lines as unknown as (string | CircuitLine)[];
    if (!raw.some((l) => typeof l === 'string')) return b;
    changed = true;
    return {
      ...b,
      lines: raw.map((l) => (typeof l === 'string' ? { text: l } : l)),
    };
  });
  return changed ? next : blocks;
}

/** Migrate every session in a stream, preserving identity where nothing moved. */
function migrateStream(stream: ProgramStream): ProgramStream {
  const format = formatOf(stream);
  let streamChanged = false;
  const blocks = stream.blocks.map((block): ProgramBlock => {
    let blockChanged = false;
    const weeks = block.weeks.map((week): ProgramWeek => {
      let weekChanged = false;
      const sessions = week.sessions.map((s) => {
        const next = migrateSession(s, format);
        if (next !== s) weekChanged = true;
        return next;
      });
      if (!weekChanged) return week;
      blockChanged = true;
      return { ...week, sessions };
    });
    if (!blockChanged) return block;
    streamChanged = true;
    return { ...block, weeks };
  });
  return streamChanged ? { ...stream, blocks } : stream;
}

/** Streams for a doc, migrating the pre-streams `blocks` shape in memory. */
export function streamsOf(doc: ProgramDoc): ProgramStream[] {
  const raw: ProgramStream[] = doc.streams?.length
    ? doc.streams
    : doc.blocks?.length
      ? [{ id: 'strength', name: 'Strength', blocks: doc.blocks }]
      : [];
  return raw.map(migrateStream);
}

/** The stream with this id, or the first one (never undefined for a real doc). */
export function streamAt(doc: ProgramDoc, index: number): ProgramStream | undefined {
  const streams = streamsOf(doc);
  return streams[Math.min(Math.max(index, 0), streams.length - 1)];
}

/** Replace one stream's phases, returning a new doc in the streams shape. */
export function withStreamBlocks(
  doc: ProgramDoc,
  streamIndex: number,
  blocks: ProgramStream['blocks'],
): ProgramDoc {
  const streams = streamsOf(doc).map((s, i) => (i === streamIndex ? { ...s, blocks } : s));
  const next: ProgramDoc = { ...doc, streams };
  delete next.blocks; // drop the legacy field once we write
  return next;
}

/** Every phase across every stream, for whole-program readers (CSV, TV). */
export function allBlocks(doc: ProgramDoc) {
  return streamsOf(doc).flatMap((s) => s.blocks.map((b) => ({ stream: s, block: b })));
}
