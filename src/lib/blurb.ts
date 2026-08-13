// Deterministic session blurb: the day's focuses and key cues for the main
// exercises, generated from the session's contents. No LLM involved.

import type { LibraryOverridesDoc, Pattern, Session } from '../types/documents';
import type { LibraryExercise } from './library';
import { patternsFor } from './library';

const PATTERN_PHRASE: Record<Pattern, string> = {
  squat: 'squatting',
  hinge: 'hinging',
  lunge: 'single-leg work',
  'h-push': 'horizontal pressing',
  'v-push': 'overhead pressing',
  'h-pull': 'horizontal pulling',
  'v-pull': 'vertical pulling',
  carry: 'loaded carries',
  'core-rotation': 'core and rotation work',
};

const PATTERN_CUE: Record<Pattern, string> = {
  squat: 'brace before you sit, drive the whole foot through the floor',
  hinge: 'set your brace, push the hips back, finish tall through the hips',
  lunge: 'own the front foot, control the knee line, drive up without wobbling',
  'h-push': 'shoulder blades set, lower with control, press through a full lockout',
  'v-push': 'ribs down, brace tight, finish with biceps by the ears',
  'h-pull': 'lead with the elbows, squeeze the blades together, no shrugging',
  'v-pull': 'start from a dead hang, pull the elbows down, chest to the bar line',
  carry: 'stand tall, ribs stacked over hips, walk like nothing is heavy',
  'core-rotation': 'move slow, own the position, breathe without losing the brace',
};

const FOCUS_TITLE: Record<Session['focus'], string> = {
  lower: 'Lower body day',
  upper: 'Upper body day',
  full: 'Full body day',
  esd: 'ESD day',
  hyrox: 'Hyrox day',
};

export function generateBlurb(
  session: Session,
  library: LibraryExercise[],
  overrides: LibraryOverridesDoc,
): string {
  const byId = new Map(library.map((e) => [e.id, e]));

  // Weight patterns by position: A-block exercises define the day.
  const weights = new Map<Pattern, number>();
  session.timedBlocks.forEach((block, blockIndex) => {
    const weight = Math.max(3 - blockIndex, 1);
    for (const slot of block.slots) {
      const ex = slot.exerciseId !== null ? byId.get(slot.exerciseId) : undefined;
      if (!ex) continue;
      for (const p of patternsFor(ex, overrides)) {
        weights.set(p, (weights.get(p) ?? 0) + weight);
      }
    }
  });

  const topPatterns = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => PATTERN_PHRASE[p]);

  const sentences: string[] = [];

  if (topPatterns.length === 0) {
    sentences.push(`${FOCUS_TITLE[session.focus]}.`);
  } else if (topPatterns.length === 1) {
    sentences.push(`${FOCUS_TITLE[session.focus]} built around ${topPatterns[0]}.`);
  } else {
    const last = topPatterns[topPatterns.length - 1];
    const rest = topPatterns.slice(0, -1).join(', ');
    sentences.push(`${FOCUS_TITLE[session.focus]} built around ${rest} and ${last}.`);
  }

  // One cue line per main (A-block) exercise: coach cue wins, generic per-pattern cue else.
  const mainSlots = session.timedBlocks[0]?.slots ?? [];
  for (const slot of mainSlots) {
    if (!slot.name) continue;
    const ex = slot.exerciseId !== null ? byId.get(slot.exerciseId) : undefined;
    const coachCue = ex ? overrides.cues[ex.id] : undefined;
    if (coachCue) {
      sentences.push(`${slot.name}: ${coachCue}`);
      continue;
    }
    const patterns = ex ? patternsFor(ex, overrides) : [];
    if (patterns.length > 0) {
      sentences.push(`${slot.name}: ${PATTERN_CUE[patterns[0]]}.`);
    }
  }

  // Structure line from the timed blocks.
  const withMinutes = session.timedBlocks.filter((b) => b.minutes > 0);
  if (withMinutes.length > 0) {
    const parts = withMinutes.map((b) => `${b.minutes} min ${b.label} series`);
    sentences.push(
      `${withMinutes.length} timed ${withMinutes.length === 1 ? 'block' : 'blocks'}: ${parts.join(', ')}.`,
    );
  }

  return sentences.join(' ');
}
