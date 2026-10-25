import type { CircuitBlock, CircuitSession, SessionFocus } from '../types/documents';

// Parsing the conditioning programming pack back into sessions.
//
// The conditioning programme is written outside this app, in
// `TAC/programming/`, and comes out as one plain-text pack per microcycle.
// Chris wanted to get a whole microcycle into the tool without retyping it, so
// this reads that pack's exact shape:
//
//   ========================================================================
//   TENERIFFE ATHLETIC CLUB · CONDITIONING · PHASE 1 · MIXED MODAL
//   WEEK 1 · MONDAY
//   Phase 1 · Week 1 of 12 · Monday 14 September
//
//   SESSION INTENT
//     Threshold. Two parts: an erg metre target ...
//
//   WARM UP · 8 MIN · WITH COACH
//     Rower or Ski easy, under your Base pace
//         3 min
//
//   PART 1 · 18 MIN CAP · CHOOSE A METRE TARGET
//     One machine each: rowers 1-8 ... (how the piece is run)
//     Rower
//         Base 2,300m (2:35-2:45) · Build 2,700m · Push 3,100m
//
// Indentation carries the structure: column 0 is a section, two spaces is a
// movement or a piece of instruction, six spaces is that movement's lanes and
// its scaled option. Nothing else in the pack is load-bearing, so a hand-typed
// session in the same shape parses too.
//
// Sections that are the workout become circuit parts. The ones that are not
// (ROTATION, SET-UP, a covering coach's version) are kept as coach sections:
// they never reach the wall, but the coaching card needs them.

/** Headings whose body is the session's prose, not a list of movements. */
const PROSE_SECTIONS: Record<string, 'intent' | 'note' | 'appDescription' | 'blurb'> = {
  'SESSION INTENT': 'intent',
  'COACH NOTE': 'note',
  'MEMBER APP DESCRIPTION': 'appDescription',
  'FOOTER BLURB': 'blurb',
};

/** A section heading that starts the actual work. */
function isWorkHeading(heading: string): boolean {
  return /^(WARM[ -]?UP|PART\b|BLOCK\b|FINISHER|COOL[ -]?DOWN)/i.test(heading);
}

const DAY_FOCUS: Record<string, SessionFocus> = {
  MONDAY: 'cond-mon',
  WEDNESDAY: 'cond-wed',
  FRIDAY: 'cond-fri',
  SATURDAY: 'gameday',
};

export interface ParsedSession {
  /** Which class this is, worked out from the day in the heading. */
  focus: SessionFocus | null;
  dayName: string | null;
  weekNumber: number | null;
  /** How the class is grouped, where the heading says: "Pairs", "Trios". */
  variant: string | null;
  /** The pack's own heading for the session, e.g. "WEEK 1 · MONDAY". */
  heading: string;
  session: CircuitSession;
  /** Anything the parse could not place, shown beside the session. */
  warnings: string[];
}

interface Section {
  heading: string;
  body: string[];
}

const DASH = /^={6,}\s*$/;

/**
 * "WEEK 1 · MONDAY", or "WEEK 1 · SATURDAY · PAIRS" where the day carries how
 * the class is grouped. The day has to be a real weekday and the line has to
 * end there: the cover's contents list starts "Week 1: w/c 14 September ·
 * Mixed Modal (Mon)", which a looser match read as a thirteenth session.
 */
const SESSION_HEADING = /^WEEK\s+(\d+)\s*[·|-]\s*([A-Za-z]+)(?:\s*[·|-]\s*(.+?))?\s*$/i;

const WEEKDAYS = new Set([
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
]);

function sessionHeading(line: string): { week: number; day: string; variant: string | null } | null {
  const m = SESSION_HEADING.exec(line);
  if (!m) return null;
  const day = m[2].toUpperCase();
  if (!WEEKDAYS.has(day)) return null;
  return { week: parseInt(m[1], 10), day, variant: m[3]?.trim() || null };
}

/** Indent depth in spaces, tabs counted as two. */
function indentOf(line: string): number {
  const m = /^[ \t]*/.exec(line)![0];
  return m.replace(/\t/g, '  ').length;
}

function splitSections(lines: string[]): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      if (current) current.body.push('');
      continue;
    }
    if (indentOf(line) === 0) {
      current = { heading: line.trim(), body: [] };
      out.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return out;
}

function prose(body: string[]): string {
  return body
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * One work section into a circuit part. Leading instruction becomes the
 * part's note; everything after is a movement, with its indented lanes and
 * scaled option joined into the load.
 */
function parseWork(heading: string, body: string[], id: string): CircuitBlock {
  const noteLines: string[] = [];
  const lines: CircuitBlock['lines'] = [];
  let seenMovement = false;

  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    if (!raw.trim()) continue;
    if (indentOf(raw) >= 4) continue; // a detail line, consumed with its movement
    const text = raw.trim();

    // Everything indented deeper, up to the next movement, is this one's detail.
    const detail: string[] = [];
    for (let j = i + 1; j < body.length; j++) {
      if (!body[j].trim()) continue;
      if (indentOf(body[j]) < 4) break;
      detail.push(body[j].trim());
    }

    // Instruction before the first movement is how the piece is run, not a
    // movement. Prose only: a short label like "E3MOM off the erg:" sits
    // between movements and has to keep its place in the list.
    if (!seenMovement && detail.length === 0 && (text.length > 60 || text.endsWith('.'))) {
      noteLines.push(text);
      continue;
    }

    seenMovement = true;
    lines.push({ text, ...(detail.length ? { load: detail.join(' · ') } : {}) });
  }

  return {
    id,
    heading,
    ...(noteLines.length ? { note: noteLines.join(' ') } : {}),
    lines,
  };
}

function parseOne(chunk: string[], index: number, idPrefix: string): ParsedSession | null {
  const sections = splitSections(chunk);
  if (sections.length === 0) return null;

  // A chunk without a session heading is the pack's cover or its rule checks.
  const headingLine = sections.find((s) => sessionHeading(s.heading));
  if (!headingLine) return null;

  const head = sessionHeading(headingLine.heading)!;
  const weekNumber = head.week;
  const dayName = head.day;
  const variant = head.variant;
  const focus = DAY_FOCUS[dayName] ?? null;

  const warnings: string[] = [];
  if (!focus) {
    warnings.push(
      dayName
        ? `No conditioning class runs on ${dayName.toLowerCase()}, so this session has no day yet.`
        : 'Could not tell which day this session is for.',
    );
  }

  const id = `${idPrefix}-${index + 1}`;
  const session: CircuitSession = { id, focus: focus ?? 'cond-mon', kind: 'circuit', circuit: [] };
  const coachSections: NonNullable<CircuitSession['coachSections']> = [];
  let part = 0;

  for (const section of sections) {
    if (section === headingLine) continue;
    // The pack's own top matter: the club line and the "Phase 1 · Week 1 of
    // 12" line carry nothing the session does not already have.
    if (/^TENERIFFE ATHLETIC CLUB/i.test(section.heading)) continue;
    if (/^Phase\s+\d/i.test(section.heading)) continue;

    const prosePlace = PROSE_SECTIONS[section.heading.toUpperCase()];
    if (prosePlace) {
      const text = prose(section.body);
      if (!text) continue;
      if (prosePlace === 'intent') session.intent = text;
      else if (prosePlace === 'note') session.note = text;
      else if (prosePlace === 'appDescription') session.appDescription = text;
      else session.blurbOverride = text;
      continue;
    }

    if (isWorkHeading(section.heading)) {
      const block = parseWork(section.heading, section.body, `${id}-p${++part}`);
      if (block.lines.length > 0 || block.note) session.circuit.push(block);
      else warnings.push(`"${section.heading}" had nothing under it.`);
      continue;
    }

    // Not the workout and not prose the session model holds: keep it for the
    // coaching card rather than dropping it.
    const text = prose(section.body);
    if (text) {
      coachSections.push({ id: `${id}-c${coachSections.length + 1}`, heading: section.heading, text });
    }
  }

  if (coachSections.length) session.coachSections = coachSections;
  if (session.circuit.length === 0) warnings.push('No warm-up or parts were found in this session.');

  return { focus, dayName, weekNumber, variant, heading: headingLine.heading, session, warnings };
}

/**
 * Every session in a pasted pack, in the order they appear. Pasting one
 * session works too: the separator is optional.
 */
export function parseConditioningPaste(text: string, idPrefix = 'cond'): ParsedSession[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chunks: string[][] = [[]];
  for (const line of lines) {
    if (DASH.test(line)) chunks.push([]);
    else chunks[chunks.length - 1].push(line);
  }
  return chunks
    .map((chunk, i) => parseOne(chunk, i, idPrefix))
    .filter((s): s is ParsedSession => s !== null);
}
