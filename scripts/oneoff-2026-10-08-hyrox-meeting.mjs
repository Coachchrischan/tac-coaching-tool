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
if (env.data.meetings.some((m) => m.classTypeId === 'hyrox' && m.date === DATE)) {
  console.log('The HYROX meeting for 8 Oct is already there. Nothing to do.');
  process.exit(0);
}

const kr = (id, text, start, target, extra = {}) => ({
  id, text, start, target, current: start, confidence: null, ...extra,
});

const meeting = {
  id: 'mtg-hyrox-2026-10-08',
  classTypeId: 'hyrox',
  date: DATE,
  period: 'Q4 2026',
  attendees: 'Chris Chan, Harry Crawford, Jordan',
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
      'Harry: where do you want HYROX at TAC to be by mid 2027?\nJordan: same question.\nPersonal coaching goals for each of you (hours, certs, racing yourselves)?',
    support: 'What are you finding difficult?\nWhat do you need help with, from me or the club?',
    attendance:
      'Data, 5 weeks (31 Aug to 28 Sep), 5 classes a week:\n' +
      '- Strong: Wed 5:15pm 9.2, Fri 5:15pm 9.0, Mon 5:15pm 7.2 a class\n' +
      '- Weak: Mon 6:15pm and Wed 6:15pm, 2.4 a class each\n' +
      "- Harry's check-ins per class: 4.6 before 14 Sep, 7.2 then 7.0 the last two weeks\n" +
      '- No-shows 17% (week of 28 Sep). Mon 6:15pm 5 of 14 bookings over 4 weeks (36%), Fri 5:15pm 4 of 15 that week\n' +
      'To decide: keep, move or merge the 6:15pm classes?',
    programming:
      'Does Jordan already run a HYROX program members can follow?\nIf yes: how do members get it, and can we link it from class?\nIf no: build one off the Block 01 tracks (race format Monday, stations Friday) in TrainHeroic?',
    marketing: 'Content and marketing plan for October to December: what goes out, how often, who films it.',
    events:
      'On the calendar: HYROX Melbourne 9 to 13 Dec 2026, Auckland 4 to 7 Feb 2027.\nIdeas: race sim day, doubles/relay social, open workout for non-members.',
    admin:
      'Every member checked in, every class (only prompted since 14 Sep, so earlier weeks undercount).\nNo-shows: who follows up, and when?',
    equipment: 'Enough sleds, ski ergs, rowers and wall balls for a full class?\nAssistant coach for the 5:15pm classes when 10+ turn up?',
  },
};

const res = await fetch(`${BASE}/meetings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    data: { ...env.data, meetings: [...env.data.meetings, meeting] },
    baseRev: env.rev,
    baseUpdatedAt: env.updatedAt,
  }),
});
if (!res.ok) throw new Error(`save failed: ${res.status} ${await res.text()}`);
console.log('HYROX meeting for 8 Oct 2026 created.');
