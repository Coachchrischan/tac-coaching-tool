// Dev middleware: POST /api/team-push { block, week, monday } pushes one week
// of the program doc onto the TrainHeroic "TAC Strength Class" team calendar
// (program 5071078) as DRAFTS. Publishing is impossible from here by design,
// and enforced: the client is wrapped so any publish-shaped call throws.
// Chris publishes in the coach app.
//
// Recovery model (2026-09-01 roundtable): the token is checked with a cheap
// read BEFORE anything is created, so an expired session fails at step zero
// with its own message. A day that already holds a session is skipped and
// named ("already present") instead of wedging the whole week behind a 409,
// so a push that died mid-week resumes by running it again. If a day fails
// half-built, its partial draft is best-effort deleted before the error is
// surfaced. Only when EVERY target day already has a session does the push
// refuse (409), which is what a genuine double-click looks like.
//
// Circuit parts (the week 3/6/9 challenges) have no exercise slots, so they
// are written into the workout's instruction text instead of being dropped:
// members now see the challenge in their calendar, not just on the wall.
//
// Every successful push is appended to the push-log document, so "what is in
// members' calendars" lives in the tool, not in handover prose.
//
// Session dates come from the LIVE Schedule scenario via lib/classDays.
// The program and schedule documents are read through the same loadDoc path
// as the store (quarantine rules apply) and migrated through lib/programStreams,
// so the push can never see a shape the app itself would not.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type {
  ProgramDoc,
  PushLogDoc,
  ScheduleDoc,
  SessionFocus,
} from '../types/documents.js';
import { resolveWeekDays } from '../lib/classDays.js';
import { circuitParts, seriesBlocks, streamsOf } from '../lib/programStreams.js';
import { buildCue, circuitPartText, mapReps } from '../lib/pushMapping.js';
import { loadDocOnServer, updateDocOnServer } from './storagePlugin.js';

const PROGRAM = 5071078;
// The trainheroic-mcp checkout that owns the TrainHeroic client and token.
// Overridable so a second machine with a different Cowork root still pushes.
const MCP_DIR = process.env.TRAINHEROIC_MCP_DIR ?? 'C:/Users/User/Cowork/trainheroic-mcp';

// Custom exercises created 2026-08-14 for sheet rows with no library match.
const CUSTOM_IDS: Record<string, number> = {
  'hip 90/90s': 8380174,
  'calf stretch in rack w/toe lift': 8380176,
  'db or plate drag through': 8380177,
  'weighted db single leg calf raises': 8380179,
  'hanging scap retracts': 8380180,
  'prone angels': 8380181,
  'db rear delt fly': 8380182,
  'db step back / cossack squat / curtsey lunge / step up etc': 8380183,
  'glute stretch': 8380184,
  'glute bridge w/rotation': 8380185,
};

// The Strength stream's sessions, in the order they are titled. Which day
// each lands on comes from the timetable, not from this list.
// The two-day Full Body split, live from 14 Sept 2026.
const STRENGTH_PLAN: { focus: SessionFocus; title: string }[] = [
  { focus: 'full-a', title: 'Day 1 - Full Body A' },
  { focus: 'full-b', title: 'Day 2 - Full Body B' },
];

function partsOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

interface ThClientLike {
  req(method: string, path: string, body?: unknown): Promise<unknown>;
  createWorkoutForDay(args: {
    programId: number;
    year: number;
    month: number;
    day: number;
    session: number;
  }): Promise<{ id: number; workout_id: number }>;
  setWorkoutTitle(args: {
    id: number;
    workoutId: number;
    programId: number;
    date: string;
    title: string;
  }): Promise<unknown>;
  createBlock(args: { workoutId: number; order: number; title: string }): Promise<{ id: number }>;
  addExercise(args: { workoutSetId: number; order: number; exercise: unknown }): Promise<unknown>;
  removeWorkout(args: { programId: number; workoutDayId: number }): Promise<unknown>;
}

/**
 * Drafts-only as a mechanism, not a convention: any call whose path smells of
 * publishing throws before it leaves this process. The house rule is
 * load-bearing for real athletes' calendars; one assertion makes it an
 * invariant no future edit can walk past by accident.
 */
function guardDraftsOnly(th: ThClientLike): ThClientLike {
  const rawReq = th.req.bind(th);
  th.req = (method: string, path: string, body?: unknown) => {
    if (/publish/i.test(path)) {
      throw new Error(
        'Refusing a publish-shaped TrainHeroic call: sessions are ALWAYS drafts. Chris publishes by hand.',
      );
    }
    return rawReq(method, path, body);
  };
  return th;
}

/** Does an error look like an expired/invalid session token? */
function isAuthError(err: unknown): boolean {
  const e = err as { status?: number; message?: string; body?: string };
  const text = `${e.message ?? ''} ${e.body ?? ''}`;
  return e.status === 401 || e.status === 403 || /401|403|unauthori[sz]ed|forbidden/i.test(text);
}

/** Set the workout-level instruction text (same payload shape as setWorkoutTitle). */
async function setWorkoutInstruction(
  th: ThClientLike,
  args: { id: number; workoutId: number; date: string; title: string; instruction: string },
) {
  const [y, m, d] = args.date.split('-').map(Number);
  await th.req('PUT', `/3.0/coach/workout/${args.workoutId}`, {
    id: args.id,
    date: args.date,
    day: d,
    deleted: null,
    group_team_subscription_id: null,
    program_title: '',
    team_title: '',
    instruction: args.instruction,
    month: m,
    program_id: PROGRAM,
    published: null,
    session: 0,
    timeline_day: 0,
    title: args.title,
    type: null,
    program_type: 5,
    workout_id: args.workoutId,
    year: y,
    date_rescheduled: null,
    sets: [],
    setKeys: [],
  });
}

export function teamPushPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'tac-team-push',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/api/team-push', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            send(res, 405, { error: 'method not allowed' });
            return;
          }
          const { block, week, monday, streamId } = JSON.parse(await readBody(req)) as {
            block: number;
            week: number;
            monday: string;
            streamId?: string;
          };
          if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? '')) {
            send(res, 400, { error: 'monday must be YYYY-MM-DD' });
            return;
          }

          // Through the same loader and migrations as the app, never a raw
          // readFileSync of a shape this file then has to guess at.
          const doc = loadDocOnServer(root, 'program').data as ProgramDoc;
          const stream = streamsOf(doc).find((s) => s.id === (streamId ?? 'strength'));
          if (!stream) {
            send(res, 400, { error: `unknown stream '${streamId}'` });
            return;
          }
          if (stream.id !== 'strength') {
            send(res, 400, {
              error: `${stream.name} has no TrainHeroic team mapped yet. Only Strength pushes to "TAC Strength Class".`,
            });
            return;
          }

          const { ThClient } = (await import(
            /* @vite-ignore */ `file:///${MCP_DIR}/src/thClient.js`
          )) as { ThClient: new (token: string) => ThClientLike };
          const token = (
            JSON.parse(readFileSync(join(MCP_DIR, 'config.json'), 'utf8')) as {
              sessionToken: string;
            }
          ).sessionToken;
          const th = guardDraftsOnly(new ThClient(token));

          const target = stream.blocks[block - 1]?.weeks[week - 1];
          if (!target) {
            send(res, 400, { error: `no phase ${block} week ${week} in ${stream.name}` });
            return;
          }

          // Which day each session runs on comes from the CURRENT FORMAT, the
          // scenario marked live in Schedule, never the one on screen there.
          const schedule = loadDocOnServer(root, 'schedule').data as ScheduleDoc;
          const resolved = resolveWeekDays(
            schedule,
            monday,
            STRENGTH_PLAN.map((p) => p.focus),
          );
          const plan = STRENGTH_PLAN.map((p, i) => ({ ...p, day: resolved.days[i] })).filter(
            (p) => p.day.date !== null,
          );
          if (plan.length === 0) {
            send(res, 400, {
              error: `no class in the current format, "${resolved.scenarioName}", runs any of these sessions, so there is no day to push them to`,
            });
            return;
          }

          // Read the target months first. This doubles as the token pre-flight:
          // an expired session fails HERE, before anything is created.
          const months = new Map<string, { date: string; title: string }[]>();
          try {
            for (const p of plan) {
              const { y, m } = partsOf(p.day.date!);
              const key = `${y}/${m}`;
              if (!months.has(key)) {
                const read = (await th.req(
                  'GET',
                  `/1.0/coach/programs/edit/${PROGRAM}/${y}/${m}/4`,
                )) as { programWorkouts?: { date: string; title: string }[] };
                months.set(key, read.programWorkouts ?? []);
              }
            }
          } catch (err) {
            if (isAuthError(err)) {
              send(res, 401, {
                error:
                  'TrainHeroic session token expired or invalid. Refresh it via the coach ' +
                  'console (localhost:4317, Token panel) or trainheroic-mcp/config.json, ' +
                  'then push again. Nothing was created.',
              });
              return;
            }
            throw err;
          }

          // A day that already holds a session resumes past it rather than
          // wedging the week; only a fully-present week is a duplicate push.
          const alreadyPresent: string[] = [];
          const toPush = plan.filter((p) => {
            const { y, m } = partsOf(p.day.date!);
            const hit = months.get(`${y}/${m}`)!.find((w) => w.date === p.day.date);
            if (hit) alreadyPresent.push(`${p.day.date} already has "${hit.title}" (left as is)`);
            return !hit;
          });
          if (toPush.length === 0) {
            send(res, 409, {
              error: 'every target day already has a session; nothing to push',
              existing: alreadyPresent,
            });
            return;
          }

          const pushed: string[] = [];
          const skipped: string[] = [];
          const dates: string[] = [];
          for (const p of toPush) {
            const session = target.sessions.find((s) => s.focus === p.focus);
            if (!session || session.kind === 'circuit') continue;
            const date = p.day.date!;
            const { y, m, d } = partsOf(date);
            const created = await th.createWorkoutForDay({
              programId: PROGRAM,
              year: y,
              month: m,
              day: d,
              session: 0,
            });
            try {
              await th.setWorkoutTitle({
                id: created.id,
                workoutId: created.workout_id,
                programId: PROGRAM,
                date,
                title: p.title,
              });
              let blockOrder = 0;
              let exCount = 0;
              for (const tb of seriesBlocks(session.timedBlocks)) {
                const slots = tb.slots.filter((sl) => sl.name);
                // Only create the TrainHeroic block if something in it will
                // actually resolve; otherwise the draft collects empty shells.
                const resolvable = slots.filter(
                  (sl) => sl.exerciseId ?? CUSTOM_IDS[sl.name.trim().toLowerCase()],
                );
                for (const sl of slots) {
                  if (!resolvable.includes(sl)) skipped.push(`${p.title}: ${sl.name}`);
                }
                if (!resolvable.length) continue;
                blockOrder++;
                const thBlock = await th.createBlock({
                  workoutId: created.workout_id,
                  order: blockOrder,
                  title: tb.label,
                });
                let exOrder = 0;
                for (const sl of resolvable) {
                  const exerciseId = sl.exerciseId ?? CUSTOM_IDS[sl.name.trim().toLowerCase()];
                  exOrder++;
                  const { reps, repUnit, note } = mapReps(sl.reps);
                  // The cue carries what the columns cannot (EMOM format, each
                  // side, the wave instruction); dropping it stripped the
                  // coaching out of 135 of the block's 147 slots.
                  const cue = buildCue(sl, note);
                  await th.addExercise({
                    workoutSetId: thBlock.id,
                    order: exOrder,
                    exercise: {
                      exerciseId,
                      title: sl.name,
                      cue,
                      sets: Number(sl.sets) || 1,
                      reps,
                      repUnit,
                      loadKg:
                        sl.load && /^\d+(\.\d+)?$/.test(String(sl.load).trim())
                          ? Number(sl.load)
                          : null,
                    },
                  });
                  exCount++;
                }
              }
              // Challenges and other circuit parts go into the workout's
              // instruction text so members actually see them.
              const circuits = circuitParts(session.timedBlocks);
              if (circuits.length) {
                const instruction = circuits.map(circuitPartText).join('\n\n');
                await setWorkoutInstruction(th, {
                  id: created.id,
                  workoutId: created.workout_id,
                  date,
                  title: p.title,
                  instruction,
                });
              }
              pushed.push(
                `${p.title} (${p.day.dayName} ${date}): ${exCount} exercises` +
                  (circuits.length ? ` + ${circuits.length} circuit part(s) as instructions` : ''),
              );
              dates.push(date);
            } catch (err) {
              // Best-effort: delete the half-built draft so a retry resumes
              // cleanly instead of finding a broken day it refuses to touch.
              try {
                await th.removeWorkout({ programId: PROGRAM, workoutDayId: created.id });
                skipped.push(`${p.title} (${date}): failed mid-build; partial draft deleted`);
              } catch {
                skipped.push(
                  `${p.title} (${date}): failed mid-build AND cleanup failed; delete the draft in TrainHeroic before retrying this day`,
                );
              }
              throw err;
            }
          }

          // The push log is the tool's memory of what members' calendars hold.
          try {
            updateDocOnServer(root, 'push-log', (data) => {
              const log = data as PushLogDoc;
              return {
                entries: [
                  ...(log.entries ?? []),
                  {
                    id: `push-${Date.now()}`,
                    at: new Date().toISOString(),
                    streamId: stream.id,
                    block,
                    week,
                    monday,
                    dates,
                    pushed,
                    skipped,
                  },
                ],
              };
            });
          } catch (err) {
            console.error(`[tac-push] push succeeded but logging it failed: ${String(err)}`);
          }

          send(res, 200, {
            ok: true,
            pushed,
            skipped,
            alreadyPresent,
            scenario: resolved.scenarioName,
            missing: resolved.missing,
            note: 'All drafts. Publish stays manual in the coach app.',
          });
        })().catch((err: unknown) => {
          if (isAuthError(err)) {
            send(res, 401, {
              error:
                'TrainHeroic session token expired or invalid mid-push. Refresh it via the ' +
                'coach console (localhost:4317) and push this week again; completed days ' +
                'will be skipped as already present.',
            });
            return;
          }
          const e = err as { message?: string; body?: string };
          send(res, 500, { error: e.message ?? String(err), detail: e.body });
        });
      });
    },
  };
}
