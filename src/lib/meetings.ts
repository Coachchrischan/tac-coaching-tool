// Coach meetings: the OKR check-in per class. Pure helpers only; the tab owns
// the document. Dates are LOCAL yyyy-mm-dd like the attendance helpers.

import type {
  AttendanceEntry,
  Meeting,
  MeetingKeyResult,
  ScheduleDoc,
} from '../types/documents';
import { localIso, mondayOf, monthlyPerWeek } from './attendancePeriods';
import { liveScenario } from './scenarios';

/** The agenda every class meeting runs through, in order. */
export const MEETING_SECTIONS: { id: string; title: string; prompts: string[]; keywords: string[] }[] = [
  {
    id: 'wins',
    title: 'Check-in and wins',
    prompts: [
      'What has gone well since we last met?',
      'Any member stories or results worth sharing?',
    ],
    keywords: ['win', 'went well', 'shout out', 'pb', 'feedback'],
  },
  {
    id: 'vision',
    title: 'Vision and coach goals',
    prompts: [
      'What should this class be known for in 12 months?',
      'What does each coach want to get out of coaching it (skills, hours, certs)?',
    ],
    keywords: ['vision', 'goal', 'known for', 'long term', 'career', 'cert'],
  },
  {
    id: 'support',
    title: 'Challenges and support needed',
    prompts: [
      'What is hard right now? What is getting in the way?',
      'What do you need from me or the club?',
    ],
    keywords: ['hard', 'difficult', 'struggl', 'need help', 'help with', 'support', 'frustrat', 'blocker'],
  },
  {
    id: 'attendance',
    title: 'Attendance and retention',
    prompts: [
      'Read the chart: what is driving the trend?',
      'Which time slots are full or empty? Who has dropped off?',
    ],
    keywords: ['attendance', 'numbers', 'retention', 'drop off', 'full', 'empty', 'waitlist', 'slot'],
  },
  {
    id: 'programming',
    title: 'Programming',
    prompts: [
      'Is there a program members can follow between classes?',
      'What is coming up in the block, and what needs changing?',
    ],
    keywords: ['program', 'block', 'session', 'workout', 'training plan', 'trainheroic'],
  },
  {
    id: 'marketing',
    title: 'Content and marketing',
    prompts: [
      'What content goes out for the rest of the year, and who makes it?',
      'Which posts, reels or emails are planned per month?',
    ],
    keywords: ['content', 'marketing', 'instagram', 'insta', 'reel', 'post', 'social', 'email', 'video', 'photo'],
  },
  {
    id: 'events',
    title: 'Events',
    prompts: [
      'Which races, sim days, socials or workshops are we running?',
      'Dates, owner and what it needs.',
    ],
    keywords: ['event', 'race', 'comp', 'sim day', 'simulation', 'social', 'workshop', 'melbourne', 'auckland', 'perth', 'challenge'],
  },
  {
    id: 'admin',
    title: 'Class admin',
    prompts: [
      'Are members being checked in every class?',
      'How are no-shows and late cancels being handled?',
    ],
    keywords: ['check in', 'check-in', 'checkin', 'no show', 'no-show', 'noshow', 'cancel', 'admin', 'booking', 'roster'],
  },
  {
    id: 'equipment',
    title: 'Equipment and coaching assistance',
    prompts: [
      'What is broken, missing or short for a full class?',
      'Do we need an assistant coach or floor help at peak times?',
    ],
    keywords: ['equipment', 'sled', 'rower', 'ski', 'erg', 'bike', 'wall ball', 'kettlebell', 'sandbag', 'assistant', 'broken', 'repair'],
  },
];

export const sectionTitle = (id: string) =>
  MEETING_SECTIONS.find((s) => s.id === id)?.title ?? id;

/** OKR period label for a date, e.g. 'Q4 2026'. */
export function quarterOf(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localIso(d);
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/** Meetings for one class, newest first. */
export function meetingsFor(meetings: Meeting[], classTypeId: string): Meeting[] {
  return meetings
    .filter((m) => m.classTypeId === classTypeId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** The meeting for the same class that came before this one, if any. */
export function previousMeeting(meetings: Meeting[], m: Meeting): Meeting | undefined {
  return meetingsFor(meetings, m.classTypeId).find(
    (x) => x.id !== m.id && (x.date < m.date || (x.date === m.date && x.id < m.id)),
  );
}

/**
 * A new meeting for a class. Objectives and their key results carry forward
 * with their ids (so a KR can be traced meeting to meeting); open actions
 * carry forward, done ones stay behind as the record. Notes start empty:
 * last time's notes are shown beside them, not copied into them.
 */
export function newMeeting(classTypeId: string, date: string, prev?: Meeting): Meeting {
  return {
    id: uid('mtg'),
    classTypeId,
    date,
    period: quarterOf(date),
    attendees: prev?.attendees ?? '',
    notes: {},
    objectives: prev
      ? prev.objectives.map((o) => ({ ...o, keyResults: o.keyResults.map((k) => ({ ...k })) }))
      : [],
    actions: prev ? prev.actions.filter((a) => !a.done).map((a) => ({ ...a })) : [],
    decisions: '',
    dump: '',
  };
}

export function newObjective(sectionId: string): Meeting['objectives'][number] {
  return { id: uid('obj'), text: '', sectionId, keyResults: [newKeyResult()] };
}

export function newKeyResult(): MeetingKeyResult {
  return { id: uid('kr'), text: '', start: null, target: null, current: null, confidence: null };
}

export function newAction(raised: string): Meeting['actions'][number] {
  return { id: uid('act'), text: '', owner: '', done: false, raised };
}

/** 0..1 progress from start to target, or null while any of the three is missing. */
export function krProgress(kr: Pick<MeetingKeyResult, 'start' | 'target' | 'current'>): number | null {
  const { start, target, current } = kr;
  if (start == null || target == null || current == null || target === start) return null;
  return Math.max(0, Math.min(1, (current - start) / (target - start)));
}

// ---------- Attendance window ----------

export interface WeekPoint {
  monday: string;
  count: number | null;
  /** True when the number is a month's per-week average, not a recorded week. */
  estimated: boolean;
  /** The meeting's own week: shown when entered, never averaged (it is part done). */
  partWeek?: boolean;
}

export interface AttendanceWindow {
  weeks: WeekPoint[];
  /** Mean of the recorded weeks in the window, null when none are. */
  avgWeek: number | null;
  /** Same for the eight weeks before the window. */
  prevAvgWeek: number | null;
  /** Classes per week on the live timetable. */
  sessionsPerWeek: number;
  avgSession: number | null;
  /** Any number in the window came from seeded demo rows. */
  seeded: boolean;
  /** Per-session averages across the window's weeks, timetable order. */
  slots: SlotSummary[];
}

export interface SlotSummary {
  label: string;
  coach?: string;
  /** Check-ins per week this session ran, oldest first. */
  counts: number[];
  avg: number;
}

const WINDOW_WEEKS = 8;

function weekPoint(entries: AttendanceEntry[], monday: string, classTypeId: string): WeekPoint {
  const direct = entries.find((e) => e.period === monday && e.classTypeId === classTypeId);
  if (direct) return { monday, count: direct.count, estimated: false };
  const perWeek = monthlyPerWeek(entries, monday.slice(0, 7), classTypeId);
  const monthOnly = entries.some(
    (e) => e.period === monday.slice(0, 7) && e.classTypeId === classTypeId,
  );
  if (monthOnly && perWeek != null) return { monday, count: Math.round(perWeek), estimated: true };
  return { monday, count: null, estimated: false };
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/**
 * The eight full weeks before the meeting's week (averaged), the eight before
 * those (for the comparison), and the meeting's own week appended when it has
 * numbers, so the chart runs up to the day.
 */
export function attendanceWindow(
  entries: AttendanceEntry[],
  schedule: ScheduleDoc | null,
  classTypeId: string,
  meetingDate: string,
): AttendanceWindow {
  const firstMonday = addDays(mondayOf(meetingDate), -7 * WINDOW_WEEKS);
  const mondays = (from: string) =>
    Array.from({ length: WINDOW_WEEKS }, (_, i) => addDays(from, i * 7));
  const weeks = mondays(firstMonday).map((m) => weekPoint(entries, m, classTypeId));
  const thisWeek = entries.find(
    (e) => e.period === mondayOf(meetingDate) && e.classTypeId === classTypeId,
  );
  const shown: WeekPoint[] = thisWeek
    ? [...weeks, { monday: thisWeek.period, count: thisWeek.count, estimated: false, partWeek: true }]
    : weeks;
  const prev = mondays(addDays(firstMonday, -7 * WINDOW_WEEKS)).map((m) =>
    weekPoint(entries, m, classTypeId),
  );
  // Sessions per week: what actually ran (report slots) beats the timetable.
  const windowEntries = weeks
    .map((w) => entries.find((e) => e.period === w.monday && e.classTypeId === classTypeId))
    .filter((e): e is AttendanceEntry => !!e);
  const withSlots = windowEntries.filter((e) => e.slots?.length);
  const sessionsPerWeek = withSlots.length
    ? Math.round(withSlots.reduce((s, e) => s + e.slots!.length, 0) / withSlots.length)
    : schedule
      ? (liveScenario(schedule)?.blocks.filter((b) => b.classTypeId === classTypeId).length ?? 0)
      : 0;
  const slotMap = new Map<string, SlotSummary>();
  for (const e of withSlots) {
    for (const sl of e.slots!) {
      const cur = slotMap.get(sl.label) ?? { label: sl.label, coach: sl.coach, counts: [], avg: 0 };
      cur.counts.push(sl.count);
      slotMap.set(sl.label, cur);
    }
  }
  const slots = [...slotMap.values()].map((x) => ({ ...x, avg: mean(x.counts) ?? 0 }));
  const avgWeek = mean(weeks.map((w) => w.count));
  const inWindow = new Set(weeks.flatMap((w) => [w.monday, w.monday.slice(0, 7)]));
  return {
    weeks: shown,
    avgWeek,
    prevAvgWeek: mean(prev.map((w) => w.count)),
    sessionsPerWeek,
    avgSession:
      withSlots.length > 0
        ? withSlots.reduce((s, e) => s + e.count, 0) /
          withSlots.reduce((s, e) => s + e.slots!.length, 0)
        : avgWeek != null && sessionsPerWeek > 0
          ? avgWeek / sessionsPerWeek
          : null,
    slots,
    seeded: entries.some(
      (e) => e.seeded && e.classTypeId === classTypeId && inWindow.has(e.period),
    ),
  };
}

/** The live value for an auto KR, rounded to one decimal. */
export function autoValue(kr: MeetingKeyResult, w: AttendanceWindow): number | null {
  const v = kr.auto === 'avg-week' ? w.avgWeek : kr.auto === 'avg-session' ? w.avgSession : null;
  return v == null ? null : Math.round(v * 10) / 10;
}

// ---------- Brain dump ----------

/** Keyword at the start of a word, so 'race' finds 'races' but not 'embrace'. */
const startsWord = (text: string, k: string) =>
  new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);

/**
 * Sort free-typed lines into sections. A line starting 'events:' (any section
 * id or title word) goes there; otherwise the first section whose keywords it
 * mentions. Anything unmatched stays in the dump for a human to place.
 */
export function sortDump(
  dump: string,
  notes: Record<string, string>,
): { notes: Record<string, string>; leftover: string; moved: number } {
  const out = { ...notes };
  const leftover: string[] = [];
  let moved = 0;
  for (const raw of dump.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    let target: string | undefined;
    let text = line;
    const prefix = /^([a-z ]{3,30}):\s*(.+)$/i.exec(line);
    if (prefix) {
      const p = prefix[1].toLowerCase().trim();
      const hit = MEETING_SECTIONS.find(
        (s) => s.id === p || s.title.toLowerCase().split(/\W+/).includes(p),
      );
      if (hit) {
        target = hit.id;
        text = prefix[2];
      }
    }
    target ??= MEETING_SECTIONS.find((s) => s.keywords.some((k) => startsWord(lower, k)))?.id;
    if (!target) {
      leftover.push(raw);
      continue;
    }
    const bullet = /^[-*•]/.test(text) ? text : `- ${text}`;
    out[target] = out[target] ? `${out[target].replace(/\s+$/, '')}\n${bullet}` : bullet;
    moved += 1;
  }
  return { notes: out, leftover: leftover.join('\n'), moved };
}
