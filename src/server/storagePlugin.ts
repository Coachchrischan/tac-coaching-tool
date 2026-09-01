// Dev backend for the document store. Implements the same REST contract that
// production (Vercel serverless functions over a hosted DB) will implement later:
//
//   GET  /api/store/:docId          -> 200 { data, rev, updatedAt, machine, currentMachine }
//   PUT  /api/store/:docId          -> 200 envelope
//        body { data, baseRev }        409 { current: envelope } when baseRev is stale
//   GET  /api/store/:docId/history  -> 200 { snapshots: [{ rev, updatedAt, bytes }] }
//   POST /api/store/:docId/restore  -> 200 envelope (body { rev }); the replaced
//        version is snapshotted first, so a restore is always reversible.
//
// Persists to data/<docId>.json at the project root. Atomic writes (tmp + rename).
// Every successful PUT snapshots the version it replaces into data/_history/
// (gitignored, pruned to the newest HISTORY_KEEP per doc) so any bulk edit or
// phase delete can be undone without git archaeology.
//
// Corrupt files are quarantined AND tombstoned: while a *.corrupt-* sibling
// exists the doc refuses to load or save (503) instead of silently reseeding.
// The 2026-09-01 roundtable found the old behaviour (quarantine, then the next
// request hits ENOENT and seeds demo data as rev 1) was the one path where the
// coach's data could be silently REPLACED rather than merely stranded.
//
// Off-machine backup: a debounced git job commits the worktree's data/ to a
// local branch `data-backup-<hostname>` using a temporary index (master and
// the working tree are never touched, so this creates no merge pressure with
// the other machine) and then best-effort pushes that branch. Push failures
// are logged and retried on the next cycle; nothing is fatal.
//
// The UI never knows which backend it is talking to; it only calls src/lib/store.ts.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { seeds } from '../seed/index.js';
import type { DocId } from '../types/documents.js';

const DOC_IDS = new Set<string>([
  'schedule',
  'program',
  'library-overrides',
  'annual-plan',
  'attendance',
  'home',
  'community',
  'planning',
  'layouts',
  'equipment',
  'push-log',
]);

// Programming churns ~10 snapshots per 25 minutes of editing (measured), so a
// flat 50 is a ring buffer of recent keystrokes for that doc. Deeper for the
// documents whose loss hurts; the backup branch covers the coarse timeline.
const HISTORY_KEEP_DEFAULT = 50;
const HISTORY_KEEP: Record<string, number> = { program: 250, schedule: 100 };
/** The on-disk shape version scripts/migrate-docs.mjs writes. */
const CURRENT_SCHEMA_VERSION = 2;
const BACKUP_DEBOUNCE_MS = 5 * 60 * 1000;
const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

interface Envelope {
  data: unknown;
  rev: number;
  updatedAt: string;
  /** hostname of the machine that wrote this version (sync visibility). */
  machine?: string;
  /** On-disk shape version, stamped by scripts/migrate-docs.mjs. Carried forward on every write. */
  schemaVersion?: number;
}

function docPath(root: string, docId: string) {
  return join(root, 'data', `${docId}.json`);
}

function historyDir(root: string, docId: string) {
  return join(root, 'data', '_history', docId);
}

class DocReadError extends Error {}
class DocBlockedError extends Error {}

/** Any quarantined sibling blocks the doc entirely until a human resolves it. */
function quarantineFiles(root: string, docId: string): string[] {
  const dir = join(root, 'data');
  try {
    return readdirSync(dir).filter((f) => f.startsWith(`${docId}.json.corrupt-`));
  } catch {
    return [];
  }
}

/**
 * Read a document server-side through the same quarantine-aware path the
 * store uses. Sibling middleware (the push plugin) must never readFileSync a
 * document raw: it would bypass the corrupt-file tombstone and re-guess the
 * envelope shape.
 */
export function loadDocOnServer(root: string, docId: DocId): Envelope {
  return loadDoc(root, docId);
}

/**
 * Append-style server-side update for sibling middleware (the push plugin
 * writes the push log through the same load/snapshot/write path the store
 * uses, so revs and history stay consistent).
 */
export function updateDocOnServer(
  root: string,
  docId: DocId,
  mutate: (data: unknown) => unknown,
): void {
  const current = loadDoc(root, docId);
  const next: Envelope = {
    data: mutate(current.data),
    rev: current.rev + 1,
    updatedAt: new Date().toISOString(),
    machine: hostname(),
    schemaVersion: current.schemaVersion,
  };
  snapshotDoc(root, docId, current);
  writeDoc(root, docId, next);
}

// Seed ONLY when the file does not exist AND no quarantined copy of it does.
// Any other failure (unreadable file, corrupt JSON) must never be overwritten
// with the seed: quarantine the file and fail every request, loudly, so the
// coach's data survives for manual recovery.
function loadDoc(root: string, docId: DocId): Envelope {
  const target = docPath(root, docId);
  const blocked = quarantineFiles(root, docId);
  if (blocked.length > 0) {
    throw new DocBlockedError(
      `document '${docId}' is blocked: a quarantined copy exists (${blocked.join(', ')}). ` +
        `Recover it from the Data safety panel on Home (restore a snapshot; the corrupt ` +
        `file is archived automatically), or by hand: fix and rename the .corrupt file ` +
        `back over ${docId}.json.`,
    );
  }
  let raw: string;
  try {
    raw = readFileSync(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // A missing FILE is not a missing DOCUMENT. If history snapshots exist,
      // this doc has lived here before, and seeding demo data over its grave
      // is the same silent-loss hole the corrupt-tombstone closed (2026-09-01
      // second panel, three brains independently). Seed only on a true first
      // run for this document.
      const dir = historyDir(root, docId);
      const hasHistory =
        existsSync(dir) && readdirSync(dir).some((f) => /^\d+\.json$/.test(f));
      if (hasHistory) {
        throw new DocBlockedError(
          `document '${docId}' is missing but its history exists ` +
            `(data/_history/${docId}/). Refusing to seed over it: restore a ` +
            `snapshot from the Data safety panel on Home, or copy one back to ` +
            `data/${docId}.json by hand.`,
        );
      }
      const env: Envelope = {
        data: seeds[docId](),
        rev: 1,
        updatedAt: new Date().toISOString(),
        machine: hostname(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      writeDoc(root, docId, env);
      return env;
    }
    throw new DocReadError(`cannot read ${docId}: ${String(err)}`);
  }
  try {
    const env = JSON.parse(raw) as Envelope;
    if (typeof env.rev !== 'number' || env.data === undefined) {
      throw new Error('missing rev/data');
    }
    return env;
  } catch (err) {
    const quarantine = `${target}.corrupt-${Date.now()}`;
    let quarantined = true;
    try {
      renameSync(target, quarantine);
    } catch {
      quarantined = false; // keep the original in place if even the rename fails
    }
    throw new DocReadError(
      `document '${docId}' is corrupt (${String(err)}); ` +
        (quarantined
          ? `moved to ${quarantine}. `
          : `the quarantine rename ALSO failed (file locked?), the corrupt file is still at ${target}. `) +
        `Not reseeded. Recover it from the Data safety panel on Home.`,
    );
  }
}

function writeDoc(root: string, docId: string, env: Envelope) {
  mkdirSync(join(root, 'data'), { recursive: true });
  const target = docPath(root, docId);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(env, null, 2), 'utf8');
  renameSync(tmp, target);
}

/** Snapshot an envelope into data/_history/<docId>/<rev>.json and prune. */
function snapshotDoc(root: string, docId: string, env: Envelope) {
  try {
    const dir = historyDir(root, docId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${env.rev}.json`), JSON.stringify(env, null, 2), 'utf8');
    const keep = HISTORY_KEEP[docId] ?? HISTORY_KEEP_DEFAULT;
    const files = readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));
    while (files.length > keep) {
      const oldest = files.shift();
      if (oldest) rmSync(join(dir, oldest), { force: true });
    }
  } catch (err) {
    // History must never break a save; log and carry on.
    console.error(`[tac-storage] history snapshot failed for ${docId}: ${String(err)}`);
  }
}

function listHistory(root: string, docId: string) {
  const dir = historyDir(root, docId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => {
      const rev = parseInt(f);
      try {
        const env = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Envelope;
        return { rev, updatedAt: env.updatedAt, bytes: statSync(join(dir, f)).size };
      } catch {
        return { rev, updatedAt: '', bytes: 0 };
      }
    })
    .sort((a, b) => b.rev - a.rev);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Off-machine backup: commit data/ to refs/heads/data-backup-<hostname> using
// a temporary index, then push that branch. Master and the worktree are never
// touched, so this cannot create merge pressure between machines.
// ---------------------------------------------------------------------------

function git(root: string, args: string[], env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: root,
        // GIT_TERMINAL_PROMPT=0: a credential prompt would otherwise hang the
        // subprocess forever, and with it every future backup (backupRunning
        // never clears). The timeout is the second belt on the same trousers.
        env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: '0' },
        windowsHide: true,
        timeout: 60 * 1000,
      },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || String(err)));
        else resolve(stdout.trim());
      },
    );
  });
}

/** Safety-net health, surfaced via GET /api/store/_status: nets that fail
 *  silently are false comfort (2026-09-01 second panel, five brains). */
const backupStatus = {
  lastAttemptAt: null as string | null,
  lastCommitAt: null as string | null,
  lastPushAt: null as string | null,
  lastError: null as string | null,
};

let backupRunning = false;
let backupRunningSince = 0;

async function runDataBackup(root: string) {
  if (backupRunning) {
    console.error(
      `[tac-backup] skipped: a backup has been running for ` +
        `${Math.round((Date.now() - backupRunningSince) / 1000)}s (wedged?)`,
    );
    return;
  }
  backupRunning = true;
  backupRunningSince = Date.now();
  backupStatus.lastAttemptAt = new Date().toISOString();
  const branch = `data-backup-${hostname()}`;
  const tmpIndex = join(root, '.git', `backup-index-${process.pid}`);
  const idx = { GIT_INDEX_FILE: tmpIndex };
  try {
    // Build a tree of HEAD with the worktree's current data/ layered on top.
    // Plain `add` respects .gitignore, so _history/, *.tmp and *.corrupt-*
    // stay out of the backup branch (the branch's commits ARE the history).
    await git(root, ['read-tree', 'HEAD'], idx);
    await git(root, ['add', 'data'], idx);
    const tree = await git(root, ['write-tree'], idx);

    let parent = '';
    try {
      parent = await git(root, ['rev-parse', '--verify', `refs/heads/${branch}`]);
    } catch {
      parent = await git(root, ['rev-parse', 'HEAD']);
    }
    const parentTree = await git(root, ['rev-parse', `${parent}^{tree}`]);
    if (parentTree === tree) return; // nothing changed since the last backup

    const commit = await git(root, [
      'commit-tree',
      tree,
      '-p',
      parent,
      '-m',
      `data backup ${new Date().toISOString()} (${hostname()})`,
    ]);
    await git(root, ['update-ref', `refs/heads/${branch}`, commit]);
    backupStatus.lastCommitAt = new Date().toISOString();
    try {
      await git(root, ['push', 'origin', `${branch}:${branch}`]);
      backupStatus.lastPushAt = new Date().toISOString();
      backupStatus.lastError = null;
      console.log(`[tac-backup] pushed ${branch} (${commit.slice(0, 8)})`);
    } catch (err) {
      backupStatus.lastError = `push failed: ${String(err)}`;
      console.error(
        `[tac-backup] local backup committed to ${branch} but the push failed ` +
          `(will retry next cycle): ${String(err)}`,
      );
    }
  } catch (err) {
    backupStatus.lastError = String(err);
    console.error(`[tac-backup] backup failed: ${String(err)}`);
  } finally {
    rmSync(tmpIndex, { force: true });
    backupRunning = false;
  }
}

/** How many local master commits are not on origin (off-machine code lag). */
async function masterLag(root: string): Promise<number | null> {
  try {
    return parseInt(await git(root, ['rev-list', '--count', 'origin/master..master']), 10);
  } catch {
    return null;
  }
}

export function storagePlugin(): Plugin {
  let root = process.cwd();
  let backupTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleBackup = () => {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => void runDataBackup(root), BACKUP_DEBOUNCE_MS);
  };
  const startBackupLoop = (httpServer: { on: (ev: string, fn: () => void) => void } | null) => {
    // Sweep temp indexes orphaned by killed processes (the Launchpad
    // refresh kills node without ceremony).
    try {
      for (const f of readdirSync(join(root, '.git')).filter((x) =>
        x.startsWith('backup-index-'),
      )) {
        rmSync(join(root, '.git', f), { force: true });
      }
    } catch {
      /* not a git checkout: backups will fail loudly on their own */
    }
    const hourly = setInterval(() => void runDataBackup(root), BACKUP_INTERVAL_MS);
    // Startup kick: the debounce resets on every save and dev-server
    // restarts drop pending timers, so an active editing session could
    // otherwise defer the backup indefinitely. A fresh server always takes
    // one shortly after boot (no-op when nothing changed).
    const kick = setTimeout(() => void runDataBackup(root), 90 * 1000);
    httpServer?.on('close', () => {
      clearInterval(hourly);
      clearTimeout(backupTimer);
      clearTimeout(kick);
      // A shutdown inside the debounce window must not strand the latest
      // saves on local disk only (second panel): take one final backup.
      void runDataBackup(root);
    });
  };

  const handler = (req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          const parts = (req.url ?? '').replace(/^\//, '').split('?')[0].split('/');
          const docId = parts[0];
          const action = parts[1];

          // Safety-net health: every net that can fail silently is listed
          // here so the Data safety panel can show it instead of hiding it
          // in a console nobody watches.
          if (req.method === 'GET' && docId === '_status') {
            const quarantines = readdirSync(join(root, 'data')).filter((f) =>
              f.includes('.json.corrupt-'),
            );
            send(res, 200, {
              backup: backupStatus,
              quarantines,
              masterLag: await masterLag(root),
              machine: hostname(),
            });
            return;
          }

          if (!DOC_IDS.has(docId)) {
            send(res, 404, { error: `unknown document '${docId}'` });
            return;
          }
          const id = docId as DocId;

          if (req.method === 'GET' && action === 'history') {
            send(res, 200, { snapshots: listHistory(root, id) });
            return;
          }

          // Envelope metadata without the payload: the banners check every
          // doc's writing machine without downloading 300KB of programming.
          if (req.method === 'GET' && action === 'meta') {
            const env = loadDoc(root, id);
            send(res, 200, {
              rev: env.rev,
              updatedAt: env.updatedAt,
              machine: env.machine,
              schemaVersion: env.schemaVersion,
              currentMachine: hostname(),
            });
            return;
          }

          if (req.method === 'POST' && action === 'restore') {
            let parsed: { rev?: number };
            try {
              parsed = JSON.parse(await readBody(req));
            } catch {
              send(res, 400, { error: 'invalid JSON body' });
              return;
            }
            if (typeof parsed.rev !== 'number') {
              send(res, 400, { error: 'body must be { rev: number }' });
              return;
            }
            const file = join(historyDir(root, id), `${parsed.rev}.json`);
            if (!existsSync(file)) {
              send(res, 404, { error: `no snapshot at rev ${parsed.rev}` });
              return;
            }
            const snapshot = JSON.parse(readFileSync(file, 'utf8')) as Envelope;
            // Restore must WORK on a blocked document: the tombstone exists
            // for corruption, and restore is the cure, so the two must
            // compose (found by four brains of the second panel). Archive
            // the quarantined file into the history folder and proceed.
            let current: Envelope | null = null;
            try {
              current = loadDoc(root, id);
            } catch (err) {
              if (!(err instanceof DocBlockedError)) throw err;
              for (const q of quarantineFiles(root, id)) {
                const dest = join(historyDir(root, id), `resolved-${q}`);
                mkdirSync(historyDir(root, id), { recursive: true });
                renameSync(join(root, 'data', q), dest);
                console.log(`[tac-storage] archived quarantined ${q} to _history during restore`);
              }
              try {
                current = loadDoc(root, id); // ENOENT path may seed or block
              } catch {
                current = null; // nothing readable to snapshot; restore anyway
              }
            }
            if (current) snapshotDoc(root, id, current); // a restore is always reversible
            const next: Envelope = {
              data: snapshot.data,
              rev: (current?.rev ?? snapshot.rev) + 1,
              updatedAt: new Date().toISOString(),
              machine: hostname(),
              // The snapshot's own shape version, never the current doc's:
              // stamping v2 onto pre-migration data would lie to any future
              // version gate.
              schemaVersion: snapshot.schemaVersion,
            };
            writeDoc(root, id, next);
            scheduleBackup();
            send(res, 200, next);
            return;
          }

          if (action) {
            send(res, 404, { error: `unknown action '${action}'` });
            return;
          }

          if (req.method === 'GET') {
            const env = loadDoc(root, id);
            send(res, 200, { ...env, currentMachine: hostname() });
            return;
          }

          if (req.method === 'PUT') {
            let parsed: { data?: unknown; baseRev?: number; baseUpdatedAt?: string };
            try {
              parsed = JSON.parse(await readBody(req));
            } catch {
              send(res, 400, { error: 'invalid JSON body' });
              return;
            }
            if (
              parsed.data === undefined ||
              parsed.data === null ||
              typeof parsed.data !== 'object' ||
              typeof parsed.baseRev !== 'number'
            ) {
              send(res, 400, { error: 'body must be { data: object, baseRev: number }' });
              return;
            }
            const current = loadDoc(root, id);
            // Rev numbers are not unique across two machines: both count up
            // independently between syncs, so equal-count divergence passes a
            // rev-only check and silently overwrites a just-pulled file. The
            // updatedAt stamp disambiguates (second panel, write-identity).
            if (
              parsed.baseRev !== current.rev ||
              (typeof parsed.baseUpdatedAt === 'string' &&
                parsed.baseUpdatedAt !== current.updatedAt)
            ) {
              send(res, 409, { current });
              return;
            }
            const next: Envelope = {
              data: parsed.data,
              rev: current.rev + 1,
              updatedAt: new Date().toISOString(),
              machine: hostname(),
              schemaVersion: current.schemaVersion,
            };
            snapshotDoc(root, id, current);
            writeDoc(root, id, next);
            scheduleBackup();
            send(res, 200, next);
            return;
          }

          send(res, 405, { error: 'method not allowed' });
        })().catch((err: unknown) => {
          const status = err instanceof DocBlockedError ? 503 : 500;
          send(res, status, { error: String(err) });
        });
  };

  return {
    name: 'tac-storage',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      startBackupLoop(server.httpServer);
      server.middlewares.use('/api/store', handler);
    },
    // `vite preview` (and any static-ish launch) must serve the same store:
    // a build that looks like the app but has no backend was an operational
    // footgun for a non-developer owner (second panel).
    configurePreviewServer(server) {
      startBackupLoop(server.httpServer);
      server.middlewares.use('/api/store', handler);
    },
  };
}
