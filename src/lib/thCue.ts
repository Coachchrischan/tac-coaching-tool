// Turning the club's TrainHeroic blocks and cues into the tool's shape.
//
// TrainHeroic gives a block a free-text title and an order, and hangs one long
// coaching cue off each exercise. The tool has fixed series (WU / A / B / C)
// and separate columns for tempo and reps-in-reserve. This is the translation.

/**
 * The club writes its session as "Prep" then three "Strength/Power" blocks in
 * order. The warm-up is matched by name, because it is the one block whose
 * meaning is in its title; the rest take their letter from their position, so
 * a session with four working blocks would run A, B, C, D without any change
 * here.
 */
export function seriesLabelFor(title: string, workIndex: number): string {
  // "WU" is what the tool's own push writes, "Prep" is what the club writes.
  if (/^(wu\b|prep|warm[ -]?up|mobility|activation)/i.test(String(title).trim())) return 'WU';
  return String.fromCharCode('A'.charCodeAt(0) + workIndex);
}

export interface SplitCue {
  tempo?: string;
  rpe?: string;
  note?: string;
}

/**
 * One coaching cue, split into the columns the tool has.
 *
 * TrainHeroic has no field for tempo or for reps-in-reserve, so Chris writes
 * both into the cue ("Tempo 4.1.1 (4second negatives)", "1RIR (1 rep in
 * reserve)"). Reading them out means the board and the card can print them
 * where they belong instead of burying them in a paragraph, and the rest of
 * the cue stays as the note, which is where his coaching actually lives.
 */
export function splitCue(cue: string | undefined): SplitCue {
  const text = String(cue ?? '')
    .replace(/\r/g, '')
    .trim();
  if (!text) return {};

  const out: SplitCue = {};
  const tempo = /tempo\s+(\d[\d.]*)/i.exec(text);
  if (tempo) out.tempo = tempo[1];
  // Reps in reserve stays as Chris writes it, "1RIR", and shares the RPE
  // column because they answer the same question. It must NOT pick up the
  // "RPE " prefix on the way out: the wall said "RPE 1RIR", which is wrong.
  // `slotDetail` prefixes a bare number only.
  const rir = /(\d+)\s*RIR\b/i.exec(text);
  if (rir) out.rpe = `${rir[1]}RIR`;

  // His cues are paragraphed. A blank line becomes a separator so the sense
  // survives on one line; single breaks are just wrapping.
  const note = text
    .replace(/\n{2,}/g, ' · ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (note) out.note = note;
  return out;
}
