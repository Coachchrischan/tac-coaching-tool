// The facts every board reader shares: the slide size, how a session is
// titled, how a prescription is written on one line, and which part is the
// warm-up. TvBoard renders by these; the designer pack labels by them; the
// two can never disagree because there is one copy.

import type { ExerciseSlot, Session, TimedBlock } from '../../types/documents';

/** The board is authored at 1080p; exports can rasterise it larger. */
export const BOARD_W = 1920;
export const BOARD_H = 1080;

export const FOCUS_TITLE: Record<Session['focus'], string> = {
  lower: 'LOWER BODY',
  upper: 'UPPER BODY',
  full: 'FULL BODY',
  'full-a': 'FULL BODY A',
  'full-b': 'FULL BODY B',
  esd: 'ESD',
  hyrox: 'HYROX',
  'rox-strong': 'ROX STRONG',
  'rox-engine': 'ROX ENGINE',
  'rox-race': 'ROX RACE',
  gameday: 'GAME DAY',
};

export function slideTitle(session: Session): string {
  return (session.name ?? FOCUS_TITLE[session.focus]).toUpperCase();
}

/** The prescription as the board prints it under the movement. */
export function slotDetail(slot: ExerciseSlot): string {
  // A sets count with no reps ("1") is coach bookkeeping, not a prescription;
  // leave it off the screen.
  return [
    slot.sets && slot.reps ? `${slot.sets} × ${slot.reps}` : slot.reps,
    slot.load,
    slot.intensity ? `@ ${slot.intensity}` : undefined,
    slot.rpe ? `RPE ${slot.rpe}` : undefined,
    slot.tempo ? `${slot.tempo} tempo` : undefined,
  ]
    .filter(Boolean)
    .join('   |   ');
}

export const isWarmup = (b: TimedBlock) => b.label.trim().toUpperCase() === 'WU';
