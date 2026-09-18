// One session, as lines. The single definition of what a session says.
//
// A session is written out in four places: the plain text file in the coach's
// folder, the Word document, the A4 coaching card and the wall board. Each of
// those had its own renderer, so the same session could say four slightly
// different things, and did: the text pack and the Word document disagreed
// about whether a warm-up heading is upper case, and the scripts' copies of
// the focus tables had drifted far enough that the Word document could not
// name a conditioning class at all.
//
// This returns a typed list of lines. The caller decides how to draw them:
// indentation for plain text, docx runs for Word, JSX for the pages. What is
// said is decided here; only how it looks is decided there.

import { effectiveScales, cueFor, slotDetail } from './prescription';
import { seriesBlocks } from './programStreams';
import type { CircuitPart, LibraryOverridesDoc, Session, TimedBlock } from '../types/documents';

export type LineStyle =
  /** A section heading: "A SERIES · 20 MIN", "WARM UP · 8 MIN · WITH COACH". */
  | 'heading'
  /** A block-level instruction that belongs under its heading. */
  | 'note'
  /** An exercise or a circuit line: the thing being done. */
  | 'exercise'
  /** The prescription under an exercise. */
  | 'detail'
  /** Secondary text under an exercise: the note, the cue, the scaled options. */
  | 'sub'
  /** A coach-only section heading ("COACH NOTE", "ROTATION"). */
  | 'label'
  /** Prose under a coach-only heading. */
  | 'body'
  /** A blank line, for renderers that keep them. */
  | 'blank';

export interface SessionLine {
  style: LineStyle;
  text: string;
}

export interface SessionTextOptions {
  /**
   * Board words only: the exercise, its prescription and its scaled options.
   * The coaching paragraphs, the coach note, the member description and the
   * footer blurb are left out. This is what goes on a wall and to a designer.
   */
  boardOnly?: boolean;
  /** Headings in upper case ("20 MIN") rather than as written ("20 min"). */
  upperHeadings?: boolean;
  /** Blank lines between sections. Plain text wants them; docx does not. */
  blankLines?: boolean;
  /** The generated footer blurb, when the caller has one to add. */
  blurb?: string;
  /**
   * Include the session intent. The Word document draws it as a pull quote of
   * its own above the work, so it asks for it to be left out here.
   */
  includeIntent?: boolean;
}

const isWarmup = (label: string) => label.trim().toUpperCase() === 'WU';

/** "WARM UP · 8 MIN · WITH COACH" or "A SERIES · 20 min". */
function headingFor(block: TimedBlock, upper: boolean): string {
  const wu = isWarmup(block.label);
  const min = upper ? 'MIN' : 'min';
  const withCoach = upper ? ' · WITH COACH' : ' · with coach';
  const offWall = upper ? ' · OFF THE WALL' : ' · off the wall';
  const name = wu ? 'WARM UP' : `${block.label.toUpperCase()} SERIES`;
  return (
    `${name} · ${block.minutes} ${min}` +
    (wu ? withCoach : '') +
    (block.hideFromBoard ? offWall : '')
  );
}

/** A circuit part's heading: "PART 1 · 18 MIN". */
function partHeading(part: Pick<CircuitPart, 'label' | 'minutes' | 'hideFromBoard'>, upper: boolean): string {
  const min = upper ? 'MIN' : 'min';
  return (
    part.label.toUpperCase() +
    (part.minutes !== undefined ? ` · ${part.minutes} ${min}` : '') +
    (part.hideFromBoard ? (upper ? ' · OFF THE WALL' : ' · off the wall') : '')
  );
}

/**
 * The body of one session: the work, and (unless `boardOnly`) the coach's
 * words that go with it. The heading block above it (club name, day, date) is
 * the caller's, because the card, the board and the folder each head a session
 * differently.
 */
export function sessionLines(
  session: Session,
  overrides: LibraryOverridesDoc,
  options: SessionTextOptions = {},
): SessionLine[] {
  const {
    boardOnly = false,
    upperHeadings = true,
    blankLines = true,
    includeIntent = true,
    blurb,
  } = options;
  const out: SessionLine[] = [];
  const push = (style: LineStyle, text: string) => out.push({ style, text });
  const gap = () => {
    if (blankLines) push('blank', '');
  };

  if (session.intent && !boardOnly && includeIntent) {
    push('label', 'SESSION INTENT');
    push('body', session.intent);
    gap();
  }

  if (session.kind === 'series') {
    for (const block of session.timedBlocks) {
      if (block.kind === 'circuit') {
        const pieces = block.pieces.filter(
          (p) => p.heading?.trim() || p.lines.some((l) => l.text?.trim()),
        );
        if (!pieces.length) continue;
        push('heading', partHeading(block, upperHeadings));
        if (block.note) push('note', block.note);
        for (const piece of pieces) {
          if (piece.heading?.trim()) push('exercise', piece.heading);
          for (const line of piece.lines.filter((l) => l.text?.trim())) {
            push('exercise', line.text);
            if (line.load) push('detail', line.load);
          }
          if (piece.restAfter?.trim()) push('sub', piece.restAfter);
        }
        gap();
        continue;
      }

      const slots = block.slots.filter((s) => s.name);
      if (!slots.length) continue;
      const wu = isWarmup(block.label);
      push('heading', headingFor(block, upperHeadings));
      if (block.note) push('note', block.note);
      slots.forEach((slot, i) => {
        push('exercise', `${wu ? '' : `${block.label.toUpperCase()}${i + 1}  `}${slot.name}`);
        const detail = slotDetail(slot);
        if (detail) push('detail', detail);
        if (slot.note && !boardOnly) push('sub', `Note: ${slot.note}`);
        if (!boardOnly) {
          const cue = cueFor(overrides, slot);
          if (cue) push('sub', `Cue: ${cue}`);
        }
        const scales = effectiveScales(overrides, slot);
        if (scales.length) push('sub', scaleLine(scales));
      });
      gap();
    }
  } else {
    for (const piece of session.circuit) {
      if (!piece.heading?.trim() && !piece.lines.some((l) => l.text?.trim())) continue;
      push('heading', piece.heading || 'PIECE');
      if (piece.note) push('note', piece.note);
      for (const line of piece.lines.filter((l) => l.text?.trim())) {
        push('exercise', line.text);
        if (line.load) push('detail', line.load);
      }
      if (piece.restAfter?.trim()) push('sub', piece.restAfter);
      gap();
    }
  }

  if (boardOnly) return out;

  if (session.note) {
    push('label', 'COACH NOTE');
    push('body', session.note);
    gap();
  }
  for (const section of session.coachSections ?? []) {
    push('label', section.heading.toUpperCase());
    push('body', section.text);
    gap();
  }
  if (session.appDescription) {
    push('label', 'MEMBER APP DESCRIPTION');
    push('body', session.appDescription);
    gap();
  }
  const footer = session.blurbOverride ?? blurb;
  if (footer) {
    push('label', 'FOOTER BLURB');
    push('body', footer);
    gap();
  }
  return out;
}

/**
 * The scaled-options line.
 *
 * "Scale" is the label, because most swaps are a regression. Where Chris has
 * marked one as harder (a weighted chin up under a chin up negative) it says
 * so, since calling a progression a scale reads wrong on a wall.
 */
export function scaleLine(scales: { name: string; harder?: boolean }[]): string {
  const allHarder = scales.every((s) => s.harder);
  const names = scales
    .map((s) => (s.harder && !allHarder ? `${s.name} (suggested swap)` : s.name))
    .join(' · ');
  return `${allHarder ? 'Suggested swap' : 'Scale'}: ${names}`;
}

/** The lines as plain text, indentation carrying the shape. */
export function linesToText(lines: SessionLine[]): string {
  return lines
    .map(({ style, text }) => {
      switch (style) {
        case 'heading':
        case 'label':
          return text;
        case 'note':
        case 'exercise':
        case 'body':
          return `  ${text}`;
        case 'detail':
        case 'sub':
          return `      ${text}`;
        default:
          return '';
      }
    })
    .join('\n');
}

export { seriesBlocks };
