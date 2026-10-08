// Open the first HYROX coach meeting (Thu 8 Oct 2026) with a drafted agenda.
//
//   node scripts/oneoff-2026-10-08-hyrox-meeting.mjs
//
// Numbers come from the TAC Class Attendance page (data to 3 Oct). The
// objectives are drafts for the coaches to agree, change or bin in the room;
// targets left blank are theirs to set.

const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';
const DATE = '2026-10-08';

const env = await (await fetch(`${BASE}/meetings`)).json();
// Re-running replaces the drafted fields of an existing 8 Oct meeting (the
// draft was corrected on the day: Jordan coaches Wednesday and writes the
// program, Harry coaches Monday and Friday). Typed notes are kept where the
// draft has nothing for that topic.
const existing = env.data.meetings.find((m) => m.classTypeId === 'hyrox' && m.date === DATE);

const kr = (id, text, start, target, extra = {}) => ({
  id, text, start, target, current: start, confidence: null, ...extra,
});

const meeting = {
  id: 'mtg-hyrox-2026-10-08',
  classTypeId: 'hyrox',
  date: DATE,
  period: 'Q4 2026',
  attendees: 'Chris Chan, Harry Crawford (Mon, Fri), Jordan Lambert (Wed, programming)',
  dump: '',
  decisions: '',
  actions: [],
  objectives: [
    {
      id: 'obj-hyrox-full',
      text: 'Make HYROX the go-to race-prep class in Teneriffe',
      sectionId: 'attendance',
      keyResults: [
        kr('kr-hyrox-per-class', 'Check-ins per class', 6, 9, { auto: 'avg-session', current: null }),
        kr('kr-hyrox-615', 'Mon and Wed 6:15pm average 5+ (or are merged)', 2.4, 5),
        kr('kr-hyrox-noshow', 'No-show rate under 10%', 17, 10),
      ],
    },
    {
      id: 'obj-hyrox-race',
      text: 'Get a TAC crew race-ready for HYROX Melbourne (9 to 13 Dec)',
      sectionId: 'events',
      keyResults: [
        kr('kr-hyrox-entries', 'TAC members entered in Melbourne', 0, null),
        kr('kr-hyrox-sims', 'Race simulation days run before Melbourne', 0, 2),
      ],
    },
    {
      id: 'obj-hyrox-content',
      text: 'Show what HYROX at TAC looks like, every week',
      sectionId: 'marketing',
      keyResults: [kr('kr-hyrox-posts', 'HYROX posts or reels a week', 0, 2)],
    },
  ],
  notes: {
    wins: '',
    vision:
      'Harry and Jordan: where do you each want HYROX at TAC to be by mid 2027?\nPersonal coaching goals for each of you (hours, certs, racing yourselves)?\nHow do the two of you split the class and the programming going forward?',
    support: 'What are you finding difficult?\nWhat do you need help with, from me or the club?',
    attendance:
      'Data, 5 weeks (31 Aug to 28 Sep), 5 classes a week:\n' +
      '- Harry (Mon, Fri): Mon 5:15pm 7.2, Mon 6:15pm 2.4, Fri 5:15pm 9.0 a class (6.1 overall)\n' +
      '- Jordan (Wed): Wed 5:15pm 9.2, Wed 6:15pm 2.4 a class (5.8 overall)\n' +
      '- The 5:15pm classes carry it; both 6:15pm classes average 2.4\n' +
      '- Whole class: 6.0 a class over the 5 weeks, 7.0 the week of 28 Sep\n' +
      '- No-shows 17% (week of 28 Sep). Mon 6:15pm 5 of 14 bookings over 4 weeks (36%), Fri 5:15pm 4 of 15 that week\n' +
      'To decide: keep, move or merge the 6:15pm classes?',
    programming:
      'Jordan writes the HYROX program. What is the plan for the rest of the block, and up to Melbourne?\nIs there a version members can follow outside class (race prep plan)? If yes, how do they get it; if no, do we build one in TrainHeroic?\nHow does Harry get the sessions in time to coach Monday and Friday?',
    marketing: 'Content and marketing plan for October to December: what goes out, how often, who films it.',
    events:
      'On the calendar: HYROX Melbourne 9 to 13 Dec 2026, Auckland 4 to 7 Feb 2027.\nIdeas: race sim day, doubles/relay social, open workout for non-members.',
    admin:
      'Every member checked in, every class (only prompted since 14 Sep, so earlier weeks undercount).\nNo-shows: who follows up, and when?',
    equipment: 'Enough sleds, ski ergs, rowers and wall balls for a full class?\nAssistant coach for the 5:15pm classes when 10+ turn up?',
  },
};

const merged = existing
  ? {
      ...existing,
      attendees: meeting.attendees,
      notes: { ...existing.notes, ...Object.fromEntries(Object.entries(meeting.notes).filter(([, v]) => v)) },
    }
  : meeting;
const res = await fetch(`${BASE}/meetings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    data: {
      ...env.data,
      meetings: existing
        ? env.data.meetings.map((m) => (m.id === existing.id ? merged : m))
        : [...env.data.meetings, meeting],
    },
    baseRev: env.rev,
    baseUpdatedAt: env.updatedAt,
  }),
});
if (!res.ok) throw new Error(`save failed: ${res.status} ${await res.text()}`);
console.log(existing ? 'HYROX meeting for 8 Oct 2026 updated.' : 'HYROX meeting for 8 Oct 2026 created.');
