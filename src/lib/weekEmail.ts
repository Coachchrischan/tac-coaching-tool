// Emailing a week's programming to the coaches who are delivering it.
//
// Nothing is sent from the app. The same rule as the TrainHeroic push applies:
// the tool prepares it, Chris reads it and presses send. So this builds the
// text and hands it to a Gmail compose window with the recipients, subject and
// body already filled in.

import type { ProgramStream, Session } from '../types/documents';
import { circuitToText, lineToText } from './circuit';
import { circuitParts, seriesBlocks, sessionLabel } from './programStreams';

/** One session, written the way a coach would want it in an email. */
function sessionToText(s: Session): string {
  const head = [sessionLabel(s), s.intent ? `\n${s.intent}` : ''].join('');
  if (s.kind === 'circuit') {
    const body = circuitToText(s.circuit, s.note);
    return `${head}\n${body || '(nothing written yet)'}`;
  }
  const series = seriesBlocks(s.timedBlocks)
    .map((tb) => {
      const slots = tb.slots.filter((sl) => sl.name);
      if (!slots.length) return null;
      const lines = slots.map((sl) => {
        const detail = [
          sl.sets && sl.reps ? `${sl.sets} x ${sl.reps}` : sl.reps,
          sl.load ? `${sl.load}kg` : null,
          sl.intensity ? `@ ${sl.intensity}` : null,
          sl.rpe ? `RPE ${sl.rpe}` : null,
          sl.tempo ? `${sl.tempo} tempo` : null,
        ]
          .filter(Boolean)
          .join('  ');
        // The note carries the format (EMOM, each side, hold times); an email
        // without it hands the coach movements with the coaching stripped out.
        const noted = sl.note ? `${detail ? `${detail}  ` : ''}(${sl.note})` : detail;
        return `  ${sl.name}${noted ? `  ${noted}` : ''}`;
      });
      return `${tb.label}${tb.minutes ? ` (${tb.minutes} min)` : ''}\n${lines.join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
  // A strength session can end on a circuit part (the challenge weeks); the
  // wall board shows it, so the email must too.
  const parts = circuitParts(s.timedBlocks)
    .map((part) => {
      const body = circuitToText(part.pieces);
      if (!body.trim()) return null;
      return `${part.label}${part.minutes ? ` (${part.minutes} min)` : ''}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const all = [series, parts].filter(Boolean).join('\n\n');
  return `${head}\n${all || '(nothing written yet)'}${s.note ? `\n\nNote: ${s.note}` : ''}`;
}

export interface WeekEmailInput {
  stream: ProgramStream;
  blockLabel: string;
  weekNumber: number;
  monday: Date | null;
  sessions: Session[];
}

export function weekEmailSubject(i: WeekEmailInput): string {
  const when = i.monday
    ? i.monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })
    : `Week ${i.weekNumber}`;
  return `TAC ${i.stream.name}: week of ${when}`;
}

export function weekEmailBody(i: WeekEmailInput): string {
  const when = i.monday
    ? i.monday.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  return [
    `${i.stream.name} programming`,
    `${i.blockLabel} · Week ${i.weekNumber}${when ? ` · week beginning ${when}` : ''}`,
    '',
    i.sessions.map(sessionToText).join('\n\n---\n\n'),
    '',
    'Loads are in kg. Scaling options are in the tool against each exercise.',
  ].join('\n');
}

// Gmail's compose URL carries the draft in the query string, and browsers and
// Gmail both cap how much of that survives. Past this the body goes to the
// clipboard instead and the compose window opens with a short note.
const URL_BODY_LIMIT = 1800;

export interface ComposeResult {
  url: string;
  /** True when the body was too long for the URL and went to the clipboard. */
  viaClipboard: boolean;
}

export function gmailComposeUrl(to: string[], subject: string, body: string): ComposeResult {
  const viaClipboard = body.length > URL_BODY_LIMIT;
  const useBody = viaClipboard
    ? 'The programming is on your clipboard: paste it here (Ctrl+V) before sending.'
    : body;
  const url =
    'https://mail.google.com/mail/?view=cm&fs=1' +
    `&to=${encodeURIComponent(to.join(','))}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(useBody)}`;
  return { url, viaClipboard };
}

/** Sanity check an address before it goes anywhere near a recipient list. */
export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Only used when a slot's load is present; keeps the formatter honest about
// the kg rule rather than inventing units elsewhere.
export { lineToText };
