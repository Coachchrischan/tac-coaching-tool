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

const HISTORY_KEEP = 50;
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
        `Restore it (rename back over ${docId}.json after fixing, or use the history ` +
        `snapshots in data/_history/${docId}/) then delete the .corrupt file to unblock.`,
    );
  }
  let raw: string;
  try {
    raw = readFileSync(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
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
    try {
      renameSync(target, quarantine);
    } catch {
      /* keep the original in place if even the rename fails */
    }
    throw new DocReadError(
      `document '${docId}' is corrupt (${String(err)}); moved to ${quarantine}. ` +
        `Not reseeded, and the document is now blocked until the .corrupt file is resolved.`,
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
    const files = readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));
    while (files.length > HISTORY_KEEP) {
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
      { cwd: root, env: { ...process.env, ...env }, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || String(err)));
        else resolve(stdout.trim());
      },
    );
  });
}

let backupRunning = false;

async function runDataBackup(root: string) {
  if (backupRunning) return;
  backupRunning = true;
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
    try {
      await git(root, ['push', 'origin', `${branch}:${branch}`]);
      console.log(`[tac-backup] pushed ${branch} (${commit.slice(0, 8)})`);
    } catch (err) {
      console.error(
        `[tac-backup] local backup committed to ${branch} but the push failed ` +
          `(will retry next cycle): ${String(err)}`,
      );
    }
  } catch (err) {
    console.error(`[tac-backup] backup failed: ${String(err)}`);
  } finally {
    rmSync(tmpIndex, { force: true });
    backupRunning = false;
  }
}

export function storagePlugin(): Plugin {
  let root = process.cwd();
  let backupTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleBackup = () => {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => void runDataBackup(root), BACKUP_DEBOUNCE_MS);
  };
  return {
    name: 'tac-storage',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      const hourly = setInterval(() => void runDataBackup(root), BACKUP_INTERVAL_MS);
      server.httpServer?.on('close', () => {
        clearInterval(hourly);
        clearTimeout(backupTimer);
      });

      server.middlewares.use('/api/store', (req, res) => {
        void (async () => {
          const parts = (req.url ?? '').replace(/^\//, '').split('?')[0].split('/');
          const docId = parts[0];
          const action = parts[1];
          if (!DOC_IDS.has(docId)) {
            send(res, 404, { error: `unknown document '${docId}'` });
            return;
          }
          const id = docId as DocId;

          if (req.method === 'GET' && action === 'history') {
            send(res, 200, { snapshots: listHistory(root, id) });
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
            const current = loadDoc(root, id);
            snapshotDoc(root, id, current); // a restore is always reversible
            const next: Envelope = {
              data: snapshot.data,
              rev: current.rev + 1,
              updatedAt: new Date().toISOString(),
              machine: hostname(),
              schemaVersion: current.schemaVersion,
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
            let parsed: { data?: unknown; baseRev?: number };
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
            if (parsed.baseRev !== current.rev) {
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
      });
    },
  };
}
