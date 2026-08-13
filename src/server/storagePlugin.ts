// Dev backend for the document store. Implements the same REST contract that
// production (Vercel serverless functions over a hosted DB) will implement later:
//
//   GET /api/store/:docId          -> 200 { data, rev, updatedAt }   (auto-seeds if missing)
//   PUT /api/store/:docId          -> 200 { data, rev, updatedAt }
//       body { data, baseRev }        409 { current: envelope } when baseRev is stale
//
// Persists to data/<docId>.json at the project root. Atomic writes (tmp + rename).
// The UI never knows which backend it is talking to; it only calls src/lib/store.ts.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
]);

interface Envelope {
  data: unknown;
  rev: number;
  updatedAt: string;
}

function docPath(root: string, docId: string) {
  return join(root, 'data', `${docId}.json`);
}

class DocReadError extends Error {}

// Seed ONLY when the file does not exist. Any other failure (unreadable file,
// corrupt JSON) must never be overwritten with the seed: quarantine the file
// and fail the request so the coach's data survives for manual recovery.
function loadDoc(root: string, docId: DocId): Envelope {
  const target = docPath(root, docId);
  let raw: string;
  try {
    raw = readFileSync(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const env: Envelope = {
        data: seeds[docId](),
        rev: 1,
        updatedAt: new Date().toISOString(),
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
      `document '${docId}' is corrupt (${String(err)}); moved to ${quarantine}. Not reseeded.`,
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

export function storagePlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'tac-storage',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/api/store', (req, res) => {
        void (async () => {
          const docId = (req.url ?? '').replace(/^\//, '').split('?')[0];
          if (!DOC_IDS.has(docId)) {
            send(res, 404, { error: `unknown document '${docId}'` });
            return;
          }
          const id = docId as DocId;

          if (req.method === 'GET') {
            send(res, 200, loadDoc(root, id));
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
            };
            writeDoc(root, id, next);
            send(res, 200, next);
            return;
          }

          send(res, 405, { error: 'method not allowed' });
        })().catch((err: unknown) => {
          send(res, 500, { error: String(err) });
        });
      });
    },
  };
}
