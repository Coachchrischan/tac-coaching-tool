// A coach meeting as an editable Word document, from the command line. The
// Word doc button on the Meetings tab does the same through the dev server.
// Reads data/*.json directly, so the dev server does not need to be running.
//
//   npm run meeting-docx -- <classTypeId> [yyyy-mm-dd] [out.docx]
//   npm run meeting-docx -- hyrox                 (latest HYROX meeting)
//   npm run meeting-docx -- hyrox 2026-10-08
//
// Default output: meeting-docs/<date> <class> coach meeting.docx

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMeetingDocx, meetingDocxName, pngSize } from '../src/server/meetingDocx.ts';
import { meetingsFor } from '../src/lib/meetings.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [classId = 'hyrox', date = '', outArg = ''] = process.argv.slice(2);
const load = (name) => JSON.parse(readFileSync(join(ROOT, 'data', `${name}.json`), 'utf8')).data;

const meetings = load('meetings');
const list = meetingsFor(meetings.meetings, classId);
const meeting = date ? list.find((m) => m.date === date) : list[0];
if (!meeting) {
  console.error(`No ${classId} meeting${date ? ` on ${date}` : ''}. Have: ${list.map((m) => m.date).join(', ') || 'none'}`);
  process.exit(1);
}
const schedule = load('schedule');
const className = schedule.classTypes.find((c) => c.id === classId)?.name ?? classId;
const logoPath = join(ROOT, 'public', 'brand', 'tac-landscape-white.png');
const logoData = existsSync(logoPath) ? readFileSync(logoPath) : null;

const buf = await buildMeetingDocx({
  meeting,
  meetings,
  attendance: load('attendance'),
  schedule,
  logo: logoData ? { data: logoData, ...pngSize(logoData) } : undefined,
});
const out = outArg ? resolve(outArg) : join(ROOT, 'meeting-docs', meetingDocxName(meeting, className));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`Wrote ${out}`);
