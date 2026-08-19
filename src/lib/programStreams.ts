// Stream helpers for the program document.
//
// The program used to be a single list of phases (`blocks`). It is now one
// list per class type Chris programs (Strength, ESD, Hyrox, Game Day), so
// every read goes through `streamsOf`, which migrates the old shape in
// memory. Writes always produce the new shape.

import type { ProgramDoc, ProgramStream, Session, SessionFocus } from '../types/documents';

export const STREAM_DEFS: { id: string; name: string; focuses: SessionFocus[] }[] = [
  { id: 'strength', name: 'Strength', focuses: ['lower', 'upper', 'full'] },
  { id: 'esd', name: 'ESD', focuses: ['esd'] },
  { id: 'hyrox', name: 'Hyrox', focuses: ['hyrox'] },
  { id: 'gameday', name: 'Game Day', focuses: ['gameday'] },
];

export const FOCUS_LABEL: Record<SessionFocus, string> = {
  lower: 'Lower',
  upper: 'Upper',
  full: 'Full Body',
  esd: 'ESD',
  hyrox: 'Hyrox',
  gameday: 'Game Day',
};

export function sessionLabel(s: Session): string {
  return s.name || FOCUS_LABEL[s.focus];
}

/** Streams for a doc, migrating the pre-streams `blocks` shape in memory. */
export function streamsOf(doc: ProgramDoc): ProgramStream[] {
  if (doc.streams?.length) return doc.streams;
  if (doc.blocks?.length) {
    return [{ id: 'strength', name: 'Strength', blocks: doc.blocks }];
  }
  return [];
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
