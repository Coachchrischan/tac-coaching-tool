// The facts every board reader shares: the slide size, how a session is
// titled, how a prescription is written on one line, and which part is the
// warm-up. TvBoard renders by these; the designer pack labels by them; the
// two can never disagree because there is one copy.
//
// The focus headline and the prescription line are not defined here: the
// focus catalog owns every focus fact (FOCUS_BOARD_TITLE) and prescription.ts
// owns the one-line prescription (slotDetail), so the board, the coaching
// card, the text pack and the designer pack all read the same definitions.
// This file re-exports them under the names the board readers use.

import type { Session, TimedBlock } from '../../types/documents';
import { FOCUS_BOARD_TITLE } from '../../lib/focusCatalog';

export { slotDetail } from '../../lib/prescription';

/** The board is authored at 1080p; exports can rasterise it larger. */
export const BOARD_W = 1920;
export const BOARD_H = 1080;

/** The board's headline per focus, uppercased. Derived from the catalog. */
export const FOCUS_TITLE = FOCUS_BOARD_TITLE;

export function slideTitle(session: Session): string {
  return (session.name ?? FOCUS_TITLE[session.focus]).toUpperCase();
}

export const isWarmup = (b: TimedBlock) => b.label.trim().toUpperCase() === 'WU';
