// Capture TV boards to PNG files without the browser UI: headless Chrome over
// the DevTools protocol, the /tv/:sessionId page at a 1920x1080 viewport (the
// board scales to exactly 1:1 there), the fixed overlays (control bar, fit
// notice, off-the-wall note) hidden, then a full-frame screenshot. Output is
// the same 1080p frame the page's own Export PNG produces.
//
// Usage (dev server on 8127 running):
//   node scripts/capture-tv.mjs --out <dir> <sessionId> [<sessionId> ...]
// Files are named like the page's export: tac-<focus>-block<n>-week<n>.png.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('no Chrome or Edge found');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : '.';
const sessionIds = args.filter((a, i) => a !== '--out' && i !== outIdx + 1);
if (!sessionIds.length) throw new Error('give at least one session id');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const PORT = 9333;
const W = 1920;
const H = 1080;
const profile = mkdtempSync(join(tmpdir(), 'tac-tv-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('Chrome devtools did not come up');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description));
    return r.result.value;
  }
}

try {
  await waitForDevtools();
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  for (const sid of sessionIds) {
    const url = `http://127.0.0.1:8127/tv/${sid}`;
    cdp.events.length = 0;
    const nav = await cdp.send("Page.navigate", { url });
    if (nav.errorText) console.log(`${sid}: navigate error ${nav.errorText}`);
    // The evaluate below must run in the NEW document: wait for its load event
    // (an immediate evaluate lands in the previous page's context).
    for (let i = 0; i < 100 && !cdp.events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
    // Wait for the board to be in the DOM, fonts to load and every image to finish.
    const ready = await cdp.evaluate(`(async () => {
      const t0 = Date.now();
      let slide = null;
      while (Date.now() - t0 < 20000) {
        slide = document.querySelector('[data-fit-measure]');
        if (slide && !document.body.innerText.includes('Loading…')) break;
        await new Promise(r => setTimeout(r, 200));
      }
      if (!slide) return { title: 'NO BOARD (' + location.href + ')' };
      await document.fonts.ready;
      const imgs = [...document.images];
      await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = r; i.onerror = r; })));
      // Let the fit pass settle (it measures then shrinks type if needed).
      await new Promise(r => setTimeout(r, 1500));
      document.querySelectorAll('div.fixed').forEach(e => { e.style.display = 'none'; });
      const title = document.body.innerText.includes('Session not found') ? 'NOT FOUND' : 'ok';
      return { title, w: innerWidth, h: innerHeight, imgs: imgs.length };
    })()`);
    if (ready.title !== 'ok') {
      console.log(`${sid}: ${ready.title}, skipped`);
      continue;
    }
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
      captureBeyondViewport: false,
    });
    const file = join(OUT, `tac-tv-${sid}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`${sid} -> ${file} (${W}x${H}, viewport ${ready.w}x${ready.h}, ${ready.imgs} images)`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* profile dir may still be locked briefly */
  }
}
