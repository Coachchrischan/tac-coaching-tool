import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { ServerResponse } from 'node:http';
import type { IncomingMessage } from 'node:http';

// POST /api/week-pack { monday, name? } -> runs scripts/build-week-pack.mjs
//
// The build has to render the app's own /tv and /card routes in headless
// Chrome, which the browser cannot do to itself, so the button in the Week
// Pack tab asks the dev server to do it. The script is the real thing; this is
// only a way to press it from the tab, and it stays runnable from the command
// line on its own.

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

export function weekPackPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'tac-week-pack',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/api/week-pack', (req, res) => {
        void (async () => {
          if (req.method !== 'POST') {
            send(res, 405, { error: 'method not allowed' });
            return;
          }
          let monday: string;
          let name: string | undefined;
          try {
            ({ monday, name } = JSON.parse(await readBody(req)));
          } catch {
            send(res, 400, { error: 'body must be JSON { monday, name? }' });
            return;
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? '')) {
            send(res, 400, { error: 'monday must be YYYY-MM-DD' });
            return;
          }
          // The name becomes a folder name, so it cannot carry a path.
          if (name && /[\\/:*?"<>|]/.test(name)) {
            send(res, 400, { error: 'the folder name cannot contain \\ / : * ? " < > |' });
            return;
          }

          // The loader hook lets the script import the app's own TypeScript libs
          // (focusCatalog, prescription, sessionText) rather than keeping its
          // own drifting copies of them.
          const args = [
            '--import',
            join(root, 'scripts', 'ts-resolve.mjs'),
            join(root, 'scripts', 'build-week-pack.mjs'),
            monday,
          ];
          if (name) args.push('--name', name);

          execFile(
            process.execPath,
            args,
            { cwd: root, maxBuffer: 1 << 26, timeout: 10 * 60_000 },
            (err, stdout, stderr) => {
              const output = `${stdout}${stderr}`.trim();
              if (err) {
                send(res, 500, { error: output || String(err) });
                return;
              }
              // The script prints the folder it wrote on its last non-empty
              // line but one; keep the whole log so the tab can show it.
              const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
              const folder = lines.find((l) => /Class Programming$/.test(l) || /[\\/]weeks[\\/]/.test(l));
              send(res, 200, { ok: true, folder: folder ?? null, output });
            },
          );
        })();
      });
    },
  };
}
