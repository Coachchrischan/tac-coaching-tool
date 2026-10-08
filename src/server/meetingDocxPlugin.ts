import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { AttendanceDoc, MeetingsDoc, ScheduleDoc } from '../types/documents.js';
import { buildMeetingDocx, meetingDocxName, pngSize } from './meetingDocx.js';

// GET /api/meeting-docx/:meetingId -> the meeting as a .docx download.
//
// Reads the store documents from data/ as saved, so the Word doc button waits
// for the tab's autosave before asking. scripts/meeting-docx.mjs does the same
// from the command line.

export function meetingDocxPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'tac-meeting-docx',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/api/meeting-docx', (req, res) => {
        void (async () => {
          try {
            const id = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0]);
            const load = <T,>(name: string): T =>
              JSON.parse(readFileSync(join(root, 'data', `${name}.json`), 'utf8')).data as T;
            const meetings = load<MeetingsDoc>('meetings');
            const meeting = meetings.meetings.find((m) => m.id === id);
            if (!meeting) {
              res.statusCode = 404;
              res.end('No such meeting');
              return;
            }
            const schedule = load<ScheduleDoc>('schedule');
            const logoPath = join(root, 'public', 'brand', 'tac-landscape-white.png');
            const logoData = existsSync(logoPath) ? readFileSync(logoPath) : null;
            const buf = await buildMeetingDocx({
              meeting,
              meetings,
              attendance: load<AttendanceDoc>('attendance'),
              schedule,
              logo: logoData ? { data: logoData, ...pngSize(logoData) } : undefined,
            });
            const className = schedule.classTypes.find((c) => c.id === meeting.classTypeId)?.name ?? meeting.classTypeId;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${meetingDocxName(meeting, className)}"`);
            res.end(buf);
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        })();
      });
    },
  };
}
