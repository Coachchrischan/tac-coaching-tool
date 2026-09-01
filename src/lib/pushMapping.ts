// Pure mapping from a prescription cell to what TrainHeroic can hold.
// Extracted from the push plugin so it is testable: both prior push bugs were
// shape bugs in exactly this kind of translation code.
//
// Chris's ratified rules: the rep column holds numbers only; "each side",
// "10+", RIR and holds go in the note. %1RM and RPE also go in the note
// (TrainHeroic has no percent parameter).

export interface MappedReps {
  reps: number | string;
  repUnit?: string;
  note: string | null;
}

export function mapReps(raw: unknown): MappedReps {
  const s = String(raw ?? '').trim();
  if (s === '') return { reps: '', note: null };
  let m;
  if ((m = s.match(/^(\d+)\s*ea$/i))) return { reps: Number(m[1]), note: 'each side' };
  if ((m = s.match(/^(\d+)\s*sec\s*ea$/i)))
    return { reps: Number(m[1]), repUnit: 'seconds', note: 'each side' };
  if ((m = s.match(/^(\d+)\s*sec$/i))) return { reps: Number(m[1]), repUnit: 'seconds', note: null };
  if ((m = s.match(/^(\d+)\+$/))) return { reps: Number(m[1]), note: `aim ${s}` };
  // "MAX" in the reps field is the most misread prescription in a commercial
  // gym (2026-09-01 roundtable), so RIR work keeps an empty reps field and
  // says what to do in plain words instead.
  if ((m = s.match(/^(\d+)\s*RIR$/i)))
    return { reps: '', note: `as many quality reps as you can, leaving ${m[1]} in reserve` };
  // Bare MAX in a member's app reads as "1RM weight" as often as "max reps".
  if (/^MAX$/i.test(s)) return { reps: '', note: 'as many quality reps as possible' };
  if (/^\d+$/.test(s)) return { reps: Number(s), note: null };
  return { reps: '', note: s };
}

export interface CueSource {
  intensity?: string;
  rpe?: string;
  tempo?: string;
  note?: string;
}

/**
 * The exercise cue: everything the columns cannot hold (percentage, RPE,
 * tempo, the rep note, the slot note). Percentages stay first: members test
 * in the two primer weeks, so the % is computable (Chris, 2026-09-01).
 */
export function buildCue(slot: CueSource, repNote: string | null): string {
  return [
    slot.intensity ? `@ ${slot.intensity}` : null,
    slot.rpe ? `RPE ${slot.rpe}` : null,
    slot.tempo ? `${slot.tempo} tempo` : null,
    repNote,
    slot.note,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A circuit part written out as plain text, for the TrainHeroic workout
 * instruction: members were never seeing the week 3/6/9 challenges because
 * circuit parts have no exercise slots and were skipped outright.
 */
export function circuitPartText(part: {
  label: string;
  note?: string;
  pieces: { heading: string; lines: { text: string; load?: string }[]; restAfter?: string }[];
}): string {
  const lines: string[] = [];
  lines.push(part.note ? `${part.label}: ${part.note}` : part.label);
  for (const piece of part.pieces) {
    if (piece.heading.trim()) lines.push(piece.heading.trim());
    for (const l of piece.lines) {
      const text = l.load ? `${l.text} @ ${l.load}` : l.text;
      if (text.trim()) lines.push(`- ${text.trim()}`);
    }
    if (piece.restAfter?.trim()) lines.push(`Rest: ${piece.restAfter.trim()}`);
  }
  return lines.join('\n');
}
