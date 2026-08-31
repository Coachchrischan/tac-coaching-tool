// Dev middleware: POST /api/team-push { block, week, monday } pushes one week
// of the program doc onto the TrainHeroic "TAC Strength Class" team calendar
// (program 5071078) as DRAFTS. Publishing is impossible from here by design.
// Chris publishes in the coach app. Refuses (409) if any target day already
// has a session, so a double-click can't duplicate a week.
//
// Session dates come from the active Schedule scenario, not from a fixed
// Mon/Wed/Fri assumption: the club runs Lower on Tuesday and Upper on Thursday.
//
// TrainHeroic access reuses trainheroic-mcp's client + token (session-token in
// its gitignored config.json). See trainheroic-mcp/API_BLUEPRINT.md, Teams.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { ScheduleDoc, SessionFocus } from '../types/documents.js';
import { resolveWeekDays } from '../lib/classDays.js';

const PROGRAM = 5071078;
const MCP_DIR = 'C:/Users/User/Cowork/trainheroic-mcp';

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

// The Strength stream's three sessions, in the order they are titled. Which
// day each lands on comes from the timetable, not from this list.
// The two-day Full Body split, live from 14 Sept 2026. The old three-day
// entries are gone because their weeks are archived out of the document; a
// week is pushed session-by-focus, so only live focuses belong here.
const STRENGTH_PLAN: { focus: SessionFocus; title: string }[] = [
  { focus: 'full-a', title: 'Day 1 - Full Body A' },
  { focus: 'full-b', title: 'Day 2 - Full Body B' },
];

function partsOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// Chris's ratified rules: rep column numbers only; "each side" / "10+" / RIR /
// holds go in the note. %1RM and RPE also go in the note (no TH percent param).
function mapReps(raw: unknown): { reps: number | string; repUnit?: string; note: string | null } {
  const s = String(raw ?? '').trim();
  if (s === '') return { reps: '', note: null };
  let m;
  if ((m = s.match(/^(\d+)\s*ea$/i))) return { reps: Number(m[1]), note: 'each side' };
  if ((m = s.match(/^(\d+)\s*sec\s*ea$/i))) return { reps: Number(m[1]), repUnit: 'seconds', note: 'each side' };
  if ((m = s.match(/^(\d+)\s*sec$/i))) return { reps: Number(m[1]), repUnit: 'seconds', note: null };
  if ((m = s.match(/^(\d+)\+$/))) return { reps: Number(m[1]), note: `aim ${s}` };
  if ((m = s.match(/^(\d+)\s*RIR$/i))) return { reps: 'MAX', note: `leave ${m[1]} in reserve` };
  if (/^\d+$/.test(s)) return { reps: Number(s), note: null };
  return { reps: '', note: s };
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
            block: number; week: number; monday: string; streamId?: string;
          };
          if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? '')) {
            send(res, 400, { error: 'monday must be YYYY-MM-DD' });
            return;
          }

          const doc = JSON.parse(readFileSync(join(root, 'data', 'program.json'), 'utf8')).data;
          // The document holds one stream per class type; older documents kept
          // a single phase list, so fall back to that as the Strength stream.
          type PushSession = {
            focus: string;
            name?: string;
            // Circuit sessions have no series to push; only Strength maps to a
            // TrainHeroic team, so they are skipped rather than mapped.
            kind?: 'series' | 'circuit';
            timedBlocks?: {
              label: string;
              minutes: number;
              // A part can be a circuit (a challenge finisher) with pieces and
              // no slots at all; the push loop must skip those, not crash.
              kind?: 'series' | 'circuit';
              slots?: {
                name: string;
                exerciseId: number | null;
                sets?: string;
                reps?: string;
                load?: string;
                intensity?: string;
                rpe?: string;
                tempo?: string;
                note?: string;
              }[];
            }[];
          };
          const streams: { id: string; name: string; blocks: { weeks: { sessions: PushSession[] }[] }[] }[] = doc.streams?.length
            ? doc.streams
            : [{ id: 'strength', name: 'Strength', blocks: doc.blocks ?? [] }];
          const stream = streams.find((s) => s.id === (streamId ?? 'strength'));
          if (!stream) {
            send(res, 400, { error: `unknown stream '${streamId}'` });
            return;
          }
          // Only Strength maps to a TrainHeroic team so far.
          if (stream.id !== 'strength') {
            send(res, 400, {
              error: `${stream.name} has no TrainHeroic team mapped yet. Only Strength pushes to "TAC Strength Class".`,
            });
            return;
          }

          const { ThClient } = await import(/* @vite-ignore */ `file:///${MCP_DIR}/src/thClient.js`);
          const token = JSON.parse(readFileSync(join(MCP_DIR, 'config.json'), 'utf8')).sessionToken;
          const th = new ThClient(token);

          const target = stream.blocks[block - 1]?.weeks[week - 1];
          if (!target) {
            send(res, 400, { error: `no phase ${block} week ${week} in ${stream.name}` });
            return;
          }

          // Which day each session runs on comes from the CURRENT FORMAT, the
          // scenario marked live in Schedule, never the one on screen there.
          const schedule: ScheduleDoc = JSON.parse(
            readFileSync(join(root, 'data', 'schedule.json'), 'utf8'),
          ).data;
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

          // Refuse if any target day already holds a session (no duplicates).
          const months = new Map<string, unknown[]>();
          for (const p of plan) {
            const { y, m } = partsOf(p.day.date!);
            const key = `${y}/${m}`;
            if (!months.has(key)) {
              const read = await th.req('GET', `/1.0/coach/programs/edit/${PROGRAM}/${y}/${m}/4`);
              months.set(key, read.programWorkouts ?? []);
            }
          }
          const existing: string[] = [];
          for (const p of plan) {
            const { y, m } = partsOf(p.day.date!);
            const hit = (months.get(`${y}/${m}`) as { date: string; title: string }[]).find(
              (w) => w.date === p.day.date,
            );
            if (hit) existing.push(`${p.day.date} already has "${hit.title}"`);
          }
          if (existing.length) {
            send(res, 409, { error: 'those days already have sessions', existing });
            return;
          }

          const pushed: string[] = [];
          const skipped: string[] = [];
          for (const p of plan) {
            const session = target.sessions.find((s: { focus: string }) => s.focus === p.focus);
            if (!session?.timedBlocks || session.kind === 'circuit') continue;
            const date = p.day.date!;
            const { y, m, d } = partsOf(date);
            const created = await th.createWorkoutForDay({ programId: PROGRAM, year: y, month: m, day: d, session: 0 });
            await th.setWorkoutTitle({
              id: created.id, workoutId: created.workout_id, programId: PROGRAM, date, title: p.title,
            });
            let blockOrder = 0;
            let exCount = 0;
            for (const tb of session.timedBlocks) {
              // A challenge finisher is a CIRCUIT part with pieces, not slots.
              // Touching .slots on it crashed the push mid-week and left the
              // draft half-built; it lives on the wall board, so name it in
              // the report rather than pretending the day was fully pushed.
              if (tb.kind === 'circuit' || !Array.isArray(tb.slots)) {
                skipped.push(`${p.title}: ${tb.label} (a circuit part; it stays on the wall board)`);
                continue;
              }
              const slots = tb.slots.filter((sl: { name: string }) => sl.name);
              // Only create the TrainHeroic block if something in it will
              // actually resolve; otherwise the draft collects empty shells
              // (every session's WU holds only the free-text warm-up line).
              const resolvable = slots.filter(
                (sl: { name: string; exerciseId: number | null }) =>
                  sl.exerciseId ?? CUSTOM_IDS[sl.name.trim().toLowerCase()],
              );
              for (const sl of slots) {
                if (!resolvable.includes(sl)) skipped.push(`${p.title}: ${sl.name}`);
              }
              if (!resolvable.length) continue;
              blockOrder++;
              const thBlock = await th.createBlock({ workoutId: created.workout_id, order: blockOrder, title: tb.label });
              let exOrder = 0;
              for (const sl of resolvable) {
                const exerciseId = sl.exerciseId ?? CUSTOM_IDS[sl.name.trim().toLowerCase()];
                exOrder++;
                const { reps, repUnit, note } = mapReps(sl.reps);
                // The note carries what the columns cannot (EMOM format, each
                // side, the wave instruction); dropping it stripped the
                // coaching out of 135 of the block's 147 slots.
                const cue = [
                  sl.intensity ? `@ ${sl.intensity}` : null,
                  sl.rpe ? `RPE ${sl.rpe}` : null,
                  sl.tempo ? `${sl.tempo} tempo` : null,
                  note,
                  sl.note,
                ]
                  .filter(Boolean)
                  .join(' · ');
                await th.addExercise({
                  workoutSetId: thBlock.id,
                  order: exOrder,
                  exercise: {
                    exerciseId, title: sl.name, cue,
                    sets: Number(sl.sets) || 1, reps, repUnit,
                    loadKg: sl.load && /^\d+(\.\d+)?$/.test(String(sl.load).trim()) ? Number(sl.load) : null,
                  },
                });
                exCount++;
              }
            }
            pushed.push(`${p.title} (${p.day.dayName} ${date}): ${exCount} exercises`);
          }
          send(res, 200, {
            ok: true,
            pushed,
            skipped,
            scenario: resolved.scenarioName,
            missing: resolved.missing,
            note: 'All drafts. Publish stays manual in the coach app.',
          });
        })().catch((err: unknown) => {
          const e = err as { message?: string; body?: string };
          send(res, 500, { error: e.message ?? String(err), detail: e.body });
        });
      });
    },
  };
}
