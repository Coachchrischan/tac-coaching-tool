// One-off write-back migration (2026-09-01 roundtable finding 27).
//
// The app migrates legacy shapes on every read (streamsOf, migrateSession,
// scaleOptions). With exactly one document instance in existence, running the
// migrations once against the files and committing lets most readers see one
// on-disk shape. The read-path compat code is deliberately KEPT until both
// machines are confirmed in sync; after that it can be deleted.
//
// What this does:
//   program.json          legacy blocks -> streams; every session gets its
//                         kind and drops the payload it does not use; circuit
//                         lines lifted to { text }; stale showScales keys
//                         stripped from slots.
//   library-overrides.json  plain-string scales lifted to { name }.
//   every doc             envelope stamped schemaVersion 2, rev bumped,
//                         previous version snapshotted to data/_history/.
//
// Run with: node scripts/migrate-docs.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const SCHEMA_VERSION = 2;

function load(name) {
  return JSON.parse(readFileSync(join(root, 'data', `${name}.json`), 'utf8'));
}

function save(name, env, migratedData) {
  const dir = join(root, 'data', '_history', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${env.rev}.json`), JSON.stringify(env, null, 2), 'utf8');
  const next = {
    data: migratedData,
    rev: env.rev + 1,
    updatedAt: new Date().toISOString(),
    machine: hostname(),
    schemaVersion: SCHEMA_VERSION,
  };
  writeFileSync(join(root, 'data', `${name}.json`), JSON.stringify(next, null, 2), 'utf8');
  console.log(`${name}: rev ${env.rev} -> ${next.rev}, schemaVersion ${SCHEMA_VERSION}`);
}

function migrateSession(s, format) {
  const hasCircuit = (s.circuit ?? []).some(
    (c) => c.heading?.trim() || (c.lines ?? []).some((l) => (typeof l === 'string' ? l : l.text).trim()),
  );
  const hasSlots = (s.timedBlocks ?? []).some(
    (tb) => tb.kind !== 'circuit' && (tb.slots ?? []).some((sl) => sl.name),
  );
  const kind = s.kind === 'series' || s.kind === 'circuit' ? s.kind : hasCircuit ? 'circuit' : hasSlots ? 'series' : format;
  const { kind: _k, timedBlocks, circuit, ...common } = s;
  if (kind === 'circuit') {
    return {
      ...common,
      kind,
      circuit: (circuit ?? []).map((b) => ({
        ...b,
        lines: (b.lines ?? []).map((l) => (typeof l === 'string' ? { text: l } : l)),
      })),
    };
  }
  return {
    ...common,
    kind,
    timedBlocks: (timedBlocks ?? []).map((tb) => {
      if (tb.kind === 'circuit') return tb;
      const { slots, ...rest } = tb;
      return {
        ...rest,
        kind: tb.kind,
        slots: (slots ?? []).map((sl) => {
          const { showScales: _s, ...cleanSlot } = sl;
          return cleanSlot;
        }),
      };
    }),
  };
}

// ---- program ----
{
  const env = load('program');
  const doc = env.data;
  const rawStreams = doc.streams?.length
    ? doc.streams
    : doc.blocks?.length
      ? [{ id: 'strength', name: 'Strength', blocks: doc.blocks }]
      : [];
  const streams = rawStreams.map((stream) => {
    const format = (stream.format ?? (stream.id === 'strength' ? 'strength' : 'circuit')) === 'circuit' ? 'circuit' : 'series';
    return {
      ...stream,
      blocks: stream.blocks.map((block) => ({
        ...block,
        weeks: block.weeks.map((week) => ({
          ...week,
          sessions: week.sessions.map((s) => migrateSession(s, format)),
        })),
      })),
    };
  });
  const { blocks: _legacy, ...rest } = doc;
  save('program', env, { ...rest, streams });
}

// ---- library-overrides ----
{
  const env = load('library-overrides');
  const doc = env.data;
  const scales = Object.fromEntries(
    Object.entries(doc.scales ?? {}).map(([k, list]) => [
      k,
      (list ?? []).map((s) => (typeof s === 'string' ? { name: s } : s)),
    ]),
  );
  save('library-overrides', env, { ...doc, scales });
}

// ---- stamp everything else ----
for (const name of ['schedule', 'annual-plan', 'attendance', 'home', 'community', 'planning', 'layouts', 'equipment', 'push-log']) {
  if (!existsSync(join(root, 'data', `${name}.json`))) continue;
  const env = load(name);
  if (env.schemaVersion === SCHEMA_VERSION) continue;
  save(name, env, env.data);
}

console.log('done');
