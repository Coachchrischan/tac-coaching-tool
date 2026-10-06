import type { AnnualPlanDoc, ProgramStream, Session, SessionFocus } from '../types/documents';
import { isoDate, trainingWeekMonday } from './trainingWeeks';

// Finding a calendar week inside a stream.
//
// A stream's weeks are a flat run of TRAINING weeks split across its blocks,
// and a training week is only a date once the club's shutdowns are stepped
// over. Every tab that works a week at a time (the pack, the import, the push)
// needs the same answer: for this Monday, which block and which week is it?

export interface WeekRef {
  blockIndex: number;
  weekIndex: number;
  /** The week's position in the stream, counting from zero across blocks. */
  streamIndex: number;
  monday: Date;
}

export interface BreakSpec {
  id: string;
  name: string;
  start: string;
  weeks: number;
}

/** Every week of a stream with the Monday it falls on. */
export function streamWeeks(stream: ProgramStream, startDate: string, breaks: BreakSpec[]): WeekRef[] {
  const out: WeekRef[] = [];
  let streamIndex = 0;
  stream.blocks.forEach((block, blockIndex) => {
    block.weeks.forEach((_, weekIndex) => {
      out.push({
        blockIndex,
        weekIndex,
        streamIndex,
        monday: trainingWeekMonday(startDate, streamIndex, breaks),
      });
      streamIndex++;
    });
  });
  return out;
}

/** The week of a stream that falls on this Monday, or null if none does. */
export function findWeek(
  stream: ProgramStream,
  startDate: string,
  breaks: BreakSpec[],
  mondayIso: string,
): WeekRef | null {
  return streamWeeks(stream, startDate, breaks).find((w) => isoDate(w.monday) === mondayIso) ?? null;
}

/** The Monday of the training week that contains a date, from the plan's grid. */
export function mondayOf(dateIso: string, startDate: string, breaks: BreakSpec[], span = 80): string {
  let best = startDate;
  for (let i = 0; i < span; i++) {
    const monday = isoDate(trainingWeekMonday(startDate, i, breaks));
    if (monday > dateIso) break;
    best = monday;
  }
  return best;
}

export function planBreaks(annual: AnnualPlanDoc | null): BreakSpec[] {
  return annual?.breaks ?? [];
}

/** The session of a week carrying this focus, if it has been written. */
export function sessionFor(sessions: Session[], focus: SessionFocus): Session | undefined {
  return sessions.find((s) => s.focus === focus);
}
