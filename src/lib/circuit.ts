// Reading and writing circuit sessions the way Chris writes them.
//
//   AMRAP in 10 minutes:        <- heading
//   200m Run                    <- movements
//   10 DB Push ups
//
//   Rest 2 minutes              <- rest before the next piece
//
//   0:00-10:00                  <- a timed window is also a heading
//   ...
//   *Both team mates run ...    <- a footnote for the session

import type { CircuitBlock } from '../types/documents';

const HEADING = [
  /^\s*(amrap|emom|e\d+mom|for time|for quality|tabata|every\b)/i,
  /^\s*in\s+\d+\s*(min|minutes|mins)\b/i,
  /^\s*\d+\s*(min|minutes|mins)\b/i,
  /^\s*\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\s*$/, // 0:00-10:00
  /^\s*\d+\s*(x|rounds?)\b/i,
  /:\s*$/, // anything ending in a colon
];

const REST = /^\s*rest\b/i;
const NOTE = /^\s*[*†]/;

export const isHeading = (line: string) => HEADING.some((re) => re.test(line));

/** Parse pasted text into circuit blocks plus a session footnote. */
export function parseCircuit(text: string): { blocks: CircuitBlock[]; note?: string } {
  const blocks: CircuitBlock[] = [];
  const notes: string[] = [];
  let current: CircuitBlock | null = null;

  const push = () => {
    if (current && (current.heading || current.lines.length)) blocks.push(current);
    current = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (NOTE.test(line)) {
      notes.push(line.replace(/^\s*[*†]\s*/, ''));
      continue;
    }
    if (REST.test(line)) {
      // Rest belongs to the piece it follows.
      if (current) current.restAfter = line;
      else if (blocks.length) blocks[blocks.length - 1].restAfter = line;
      continue;
    }
    if (isHeading(line)) {
      push();
      current = { id: crypto.randomUUID(), heading: line.replace(/:\s*$/, ''), lines: [] };
      continue;
    }
    if (!current) current = { id: crypto.randomUUID(), heading: '', lines: [] };
    current.lines.push(line.replace(/^\s*[-*•·]\s*/, ''));
  }
  push();

  return { blocks, note: notes.length ? notes.join('\n') : undefined };
}

/** Render circuit blocks back to the plain text Chris writes. */
export function circuitToText(blocks: CircuitBlock[], note?: string): string {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    if (b.heading) out.push(/[:\d]$/.test(b.heading) ? b.heading : `${b.heading}:`);
    out.push(...b.lines);
    if (b.restAfter) out.push('', b.restAfter);
    if (i < blocks.length - 1) out.push('');
  });
  if (note) out.push('', ...note.split('\n').map((n) => `*${n}`));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- Equipment detection, for building a layout from a session ----------

export interface EquipHint {
  kind: string;
  label: string;
  re: RegExp;
}

// Air runners, the rig and the sled track are fixtures on every layout, so a
// Run or a Sled push needs nothing placed.
export const EQUIP_HINTS: EquipHint[] = [
  { kind: 'rower', label: 'Rower', re: /\brow(?:er|ing)?\b|\bcal(?:orie)?\s*row\b/i },
  { kind: 'ski', label: 'Ski erg', re: /\bski\b/i },
  { kind: 'bike', label: 'C2 Bike', re: /\bbike\b|\bassault\b|\becho\b/i },
  { kind: 'wallball', label: 'Wall ball', re: /\bwall\s?balls?\b/i },
  { kind: 'dumbbell', label: 'Dumbbells', re: /\bdb\b|\bdumbbell/i },
  { kind: 'box', label: 'Box', re: /\bbox\b|\bstep[- ]?up/i },
  { kind: 'band', label: 'Band', re: /\bband/i },
  // A thruster is only a barbell one if it isn't called a DB thruster.
  { kind: 'barbell', label: 'Barbell', re: /\bbarbell\b|\bbb\b|(?<!\bdb )\bthrusters?\b/i },
  { kind: 'bench', label: 'Bench', re: /\bbench\b/i },
  { kind: 'zone', label: 'Sandbags', re: /\bsandbag/i },
  { kind: 'zone', label: 'Skipping ropes', re: /\bskip(s|ping)?\b|\bropes?\b/i },
  { kind: 'zone', label: 'Kettlebells', re: /\bkb\b|\bkettlebell/i },
];

/** Which equipment a block of session text calls for. */
export function equipmentFor(text: string): EquipHint[] {
  const found: EquipHint[] = [];
  for (const hint of EQUIP_HINTS) {
    if (hint.re.test(text) && !found.some((f) => f.kind === hint.kind && f.label === hint.label)) {
      found.push(hint);
    }
  }
  return found;
}
