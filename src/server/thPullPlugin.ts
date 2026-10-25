import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { AnnualPlanDoc, ProgramDoc, ScheduleDoc, SeriesBlock, TimedBlock } from '../types/documents.js';
import { resolveWeekDays } from '../lib/classDays.js';
import { seriesBlocks, streamsOf } from '../lib/programStreams.js';
import { STREAM_DEFS } from '../lib/focusCatalog.js';
import { findWeek } from '../lib/weekIndex.js';
import { teamSessionOn, thToTimedBlocks } from '../lib/thPull.js';
import { normTitle, swapMapFrom, type ThLibraryExercise } from '../lib/thSwaps.js';
import { loadDocOnServer } from './storagePlugin.js';

// POST /api/th-pull { monday } -> what TrainHeroic holds for that week's
// strength days, mapped into tool sessions.
//
// READ ONLY, on purpose. It maps and diffs and hands the result back; the tab
// writes it through the store like every other edit, so a pull cannot bypass
// the rev check, the history snapshots or the backup job. Chris asked for the
// pull to "update the tool's programming", and it does, but the write is his
// click on a diff he has seen, not a side effect of reading.

// Teneriffe Athletic Club Strength, the CLUB team programme (team 5074275,
// group_program 5109902). Not 5071078, which is TAC Strength Class under the
// Coach Chris Chan account and is a different thing entirely.
const PROGRAM = 5109902;
const MCP_DIR = process.env.TRAINHEROIC_MCP_DIR ?? 'C:/Users/User/Cowork/trainheroic-mcp';

// The CLUB's token, kept beside this tool. Chris has two TrainHeroic accounts
// and they must not cross: the MCP server's config.json is the Coach Chris
// Chan account (user 834314) and is none of this tool's business. Set this one
// with `npm run set-token`.
const TAC_TOKEN_FILE = 'tac-trainheroic.json';

/** The strength classes of a week. Conditioning is never in TrainHeroic. */
const STRENGTH_FOCUSES = ['lower', 'upper', 'full'] as const;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** A session's slots as one comparable line per series, for the diff. */
function summarise(blocks: TimedBlock[]): string[] {
  return seriesBlocks(blocks).flatMap((b) =>
    b.slots
      .filter((s) => s.name)
      .map((s) =>
        [
          `${b.label}`,
          s.name,
          [s.sets, s.reps].filter(Boolean).join('x'),
          s.intensity,
          s.rpe ? `RPE${s.rpe}` : '',
          s.tempo,
          s.load,
        ]
          .filter(Boolean)
          .join(' '),
      ),
  );
}

export function thPullPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'tac-th-pull',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/api/th-pull', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            send(res, 405, { error: 'method not allowed' });
            return;
          }
          let monday: string;
          try {
            ({ monday } = JSON.parse(await readBody(req)));
          } catch {
            send(res, 400, { error: 'body must be JSON { monday }' });
            return;
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? '')) {
            send(res, 400, { error: 'monday must be YYYY-MM-DD' });
            return;
          }

          try {
            const program = loadDocOnServer(root, 'program').data as ProgramDoc;
            const schedule = loadDocOnServer(root, 'schedule').data as ScheduleDoc;
            const resolved = resolveWeekDays(schedule, monday, [...STRENGTH_FOCUSES]);

            const { ThClient } = (await import(
              /* @vite-ignore */ `file:///${MCP_DIR}/src/thClient.js`
            )) as { ThClient: new (sessionToken: string) => unknown };
            const { walk } = (await import(
              /* @vite-ignore */ `file:///${MCP_DIR}/src/calendar.js`
            )) as { walk: (o: unknown, out?: Record<string, unknown>[]) => Record<string, unknown>[] };
            const tokenPath = join(root, TAC_TOKEN_FILE);
            if (!existsSync(tokenPath)) {
              send(res, 400, {
                error:
                  'No Teneriffe Athletic Club token saved yet. Run "npm run set-token" in ' +
                  'TAC/coaching-tool and paste the token from the CLUB TrainHeroic login. ' +
                  "The Coach Chris Chan token in trainheroic-mcp is deliberately not used here.",
              });
              return;
            }
            const cfg = JSON.parse(readFileSync(tokenPath, 'utf8')) as { sessionToken: string };
            const client = new ThClient(cfg.sessionToken) as {
              req: (method: string, path: string) => Promise<unknown>;
            };

            /**
             * A day out of the TEAM calendar. The team calendar is a PROGRAM
             * calendar, so it is `/1.0/coach/programs/edit/...`, never the
             * athlete `calendarEdit` path; the athlete path with a program id
             * returns 401 and looks exactly like an expired token.
             *
             * Read three anchors and merge, the way the athlete reads do: a
             * window anchored on a date does not reliably contain that date.
             */
            const readDay = async (y: number, m: number, d: number) => {
              const objects: Record<string, unknown>[] = [];
              for (const delta of [0, 3, -3]) {
                const at = new Date(y, m - 1, d + delta);
                const path = `/1.0/coach/programs/edit/${PROGRAM}/${at.getFullYear()}/${at.getMonth() + 1}/${at.getDate()}`;
                try {
                  objects.push(...walk(await client.req('GET', path), []));
                } catch (e) {
                  if (delta === 0) throw e; // the side anchors are best effort
                }
              }
              return objects;
            };

            // The club's suggested swaps, read once for the whole week. Chris
            // keeps them against the exercise in TrainHeroic, so that is where
            // they are read from rather than re-typed into the tool.
            let swaps = new Map<string, { name: string; harder?: boolean }[]>();
            try {
              const lib = (await client.req('GET', '/v5/exerciseLibrary/all')) as unknown;
              const list = (Array.isArray(lib)
                ? lib
                : (Object.values(lib as Record<string, unknown>).find(Array.isArray) ??
                  [])) as ThLibraryExercise[];
              swaps = swapMapFrom(list);
            } catch {
              // A swap read failing must not lose the week's programming.
              swaps = new Map();
            }

            const annual = loadDocOnServer(root, 'annual-plan').data as AnnualPlanDoc;
            const breaks = annual.breaks ?? [];
            const streams = streamsOf(program);
            const days = [];

            for (let i = 0; i < STRENGTH_FOCUSES.length; i++) {
              const focus = STRENGTH_FOCUSES[i];
              const day = resolved.days[i];
              if (!day.date) {
                days.push({ focus, date: null, skipped: 'no class on the live timetable' });
                continue;
              }
              const [y, m, d] = day.date.split('-').map(Number);

              // The session already in the tool for this week: it supplies the
              // series minutes (TrainHeroic has no such field) and the "mine"
              // half of the diff.
              const streamId = STREAM_DEFS.find((s) => s.focuses.includes(focus))?.id;
              const stream = streams.find((s) => s.id === streamId);
              const ref = stream ? findWeek(stream, annual.startDate, breaks, monday) : null;
              const existing =
                stream && ref
                  ? stream.blocks[ref.blockIndex].weeks[ref.weekIndex].sessions.find(
                      (s) => s.focus === focus,
                    )
                  : undefined;
              const mine: TimedBlock[] =
                existing && existing.kind === 'series' ? existing.timedBlocks : [];
              const sessionId = existing?.id ?? null;

              const detail = teamSessionOn(await readDay(y, m, d), y, m, d);
              if (!detail) {
                days.push({ focus, date: day.date, found: false });
                continue;
              }
              const minutesFor = (label: string) =>
                (mine.find((b) => b.label === label) as SeriesBlock | undefined)?.minutes ??
                (label.toUpperCase() === 'WU' ? 8 : 20);
              const pulled = thToTimedBlocks(detail.blocks, detail.exercises, `th-${focus}-${day.date}`, minutesFor, {
                cueStyle: 'coach',
              });

              // Every slot carries the swaps TrainHeroic holds for it. An
              // exercise with none keeps none: a blank means he has not set
              // one, not that the read missed it.
              for (const b of seriesBlocks(pulled)) {
                for (const slot of b.slots) {
                  const hit = swaps.get(normTitle(slot.name ?? ''));
                  if (hit?.length) slot.scales = hit.map((o) => ({ ...o }));
                }
              }

              days.push({
                focus,
                date: day.date,
                found: true,
                swapCount: seriesBlocks(pulled).reduce(
                  (n, b) => n + b.slots.filter((sl) => sl.scales?.length).length,
                  0,
                ),
                title: detail.session.title,
                sessionId,
                timedBlocks: pulled,
                theirs: summarise(pulled),
                mine: summarise(mine),
              });
            }

            send(res, 200, { ok: true, monday, days });
          } catch (err) {
            const msg = String((err as Error)?.message ?? err);
            const expired = /401|403|expired/i.test(msg);
            send(res, expired ? 401 : 500, {
              error: expired
                ? 'TrainHeroic rejected the session token (it expires every few days). ' +
                  'Refresh it in the coach console at localhost:4317 (Token panel), then pull again. ' +
                  'Nothing in the tool was changed.'
                : msg,
            });
          }
        })();
      });
    },
  };
}
