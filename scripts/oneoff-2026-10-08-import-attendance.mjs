// Load the real check-ins from the "TAC Class Attendance" page (weekly Class
// Summary report, data to 3 Oct 2026) and drop the seeded demo rows.
//
//   node scripts/oneoff-2026-10-08-import-attendance.mjs
//
// Five weeks, 31 Aug to 28 Sep, per session. The report's class names map to
// the tool's class types: Conditioning is ESD, Tuesday strength is A, Thursday
// strength is B, Saturday 6am is Full Body Strength. A null is a session that
// was not on the timetable that week (the 7am strength slots and Saturday 6am
// started on 14 Sep). Notes from the report worth keeping in mind:
//  - check-ins were not prompted before 14 Sep, so earlier weeks undercount;
//  - class caps dropped on 14 Sep (Conditioning 25 to 16, gym floor 30 to 20);
//  - Run Club check-ins were not recorded consistently.
//
// Every version is snapshotted by the store, so this is reversible from the
// document history.

const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';
const WEEKS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];

const _ = null;
const REPORT = {
  lbs: [
    ['Tue 5am', 'Ji', [7, 10, 12, 14, 12]],
    ['Tue 6am', 'Ji', [18, 18, 18, 14, 16]],
    ['Tue 7am', 'Ji', [_, _, 10, 15, 15]],
    ['Tue 12pm', 'Ji', [8, 7, 6, 8, 14]],
  ],
  ubs: [
    ['Thu 5am', 'Ji', [10, 11, 15, 13, 17]],
    ['Thu 6am', 'Ji', [17, 14, 15, 18, 19]],
    ['Thu 7am', 'Ji', [_, _, 12, 8, 10]],
    ['Thu 12pm', 'Ji', [8, 1, 9, 5, 6]],
  ],
  fbs: [['Sat 6am', 'Ji', [_, _, 15, 17, 17]]],
  esd: [
    ['Mon 5am', 'Dana', [5, 10, 7, 12, 11]],
    ['Mon 6am', 'Dana', [4, 7, 6, 4, 12]],
    ['Mon 7am', 'Dana', [3, 6, 9, 8, 8]],
    ['Mon 12pm', 'Dana', [4, 4, 4, 5, 4]],
    ['Wed 5am', 'Dana', [4, 5, 6, 7, 13]],
    ['Wed 6am', 'Dana', [5, 10, 11, 11, 11]],
    ['Wed 7am', 'Dana', [6, 3, 5, 8, 10]],
    ['Wed 12pm', 'Dana', [5, 6, 3, 4, 5]],
    ['Fri 5am', 'Dana', [6, 5, 8, 11, 13]],
    ['Fri 6am', 'Dana', [9, 5, 8, 9, 15]],
    ['Fri 7am', 'Dana', [1, 4, 9, 6, 7]],
    ['Fri 12pm', 'Dana', [6, 0, 4, 6, 2]],
  ],
  hyrox: [
    ['Mon 5:15pm', 'Harry', [10, 3, 4, 9, 10]],
    ['Mon 6:15pm', 'Harry', [3, 1, 0, 5, 3]],
    ['Wed 5:15pm', 'Harry', [11, 8, 9, 8, 10]],
    ['Wed 6:15pm', 'Harry', [3, 3, 0, 5, 1]],
    ['Fri 5:15pm', 'Harry', [8, 8, 9, 9, 11]],
  ],
  flow: [['Tue 5pm', 'Stephanie', [7, 9, 10, 8, 11]]],
  yin: [['Tue 6pm', 'Stephanie', [4, 4, 5, 7, 6]]],
  stretch: [
    ['Thu 5pm', 'Anthony', [8, 8, 10, 6, 8]],
    ['Thu 6pm', 'Anthony', [6, 4, 5, 5, 1]],
  ],
  gameday: [['Sat 7:30am', 'Ji', [4, 4, 6, 7, 3]]],
  run: [
    ['Tue 5am', 'Katie', [0, 1, 1, 2, 2]],
    ['Wed 5am', 'Katie', [0, 0, 0, 0, 1]],
  ],
};

const imported = [];
for (const [classTypeId, rows] of Object.entries(REPORT)) {
  WEEKS.forEach((period, i) => {
    const slots = rows
      .filter(([, , counts]) => counts[i] != null)
      .map(([label, coach, counts]) => ({ label, coach, count: counts[i] }));
    if (slots.length === 0) return;
    const count = slots.reduce((s, x) => s + x.count, 0);
    imported.push({ id: `${period}:${classTypeId}`, period, classTypeId, count, slots });
  });
}

// The report's week totals, as a check the transcription is right.
const EXPECT = { '2026-08-31': 190, '2026-09-07': 179, '2026-09-14': 251, '2026-09-21': 274, '2026-09-28': 304 };
for (const [week, total] of Object.entries(EXPECT)) {
  const got = imported.filter((e) => e.period === week).reduce((s, e) => s + e.count, 0);
  if (got !== total) throw new Error(`${week}: ${got} check-ins, report says ${total}`);
}

const env = await (await fetch(`${BASE}/attendance`)).json();
const ids = new Set(imported.map((e) => e.id));
const kept = env.data.entries.filter((e) => !e.seeded && !ids.has(e.id));
const dropped = env.data.entries.filter((e) => e.seeded).length;
const res = await fetch(`${BASE}/attendance`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ data: { ...env.data, entries: [...kept, ...imported] }, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
if (!res.ok) throw new Error(`save failed: ${res.status} ${await res.text()}`);
console.log(`Imported ${imported.length} weekly entries, dropped ${dropped} demo rows, kept ${kept.length}.`);
