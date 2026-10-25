// Finish a week's folder: fold the conditioning in beside the strength.
//
//   npm run week-folder -- 2026-09-21 --name "Week 2 Class Programming"
//
// `week-pack` builds the strength and game day half out of the tool. The
// conditioning boards are designed outside the tool, so this step brings them
// in and leaves ONE folder holding the whole week:
//
//   boards/   every TV output, strength and conditioning
//   cards/    a coach's brief for every single class
//   Week N - all workouts.docx   every class in one Word document
//
// The conditioning text lives in ../programming/weeks/_conditioning/week-N.txt,
// sessions separated by a rule of = signs. The boards are matched by weekday
// from --boards (a folder of PNGs named "<Weekday> ... Week N ....png").

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Document, HeadingLevel, Packer, Paragraph, TextRun, PageBreak, BorderStyle } from 'docx';

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEEKS = join(ROOT, '..', 'programming', 'weeks');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const monday = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!monday) {
  console.error("Give the week's Monday: npm run week-folder -- 2026-09-21");
  process.exit(1);
}
const folder = flag('name');
if (!folder) {
  console.error('Give the folder: --name "Week 2 Class Programming"');
  process.exit(1);
}
const out = resolve(flag('out') ?? join(WEEKS, folder));
if (!existsSync(out)) {
  console.error(`${out} does not exist. Run week-pack first.`);
  process.exit(1);
}

const weekNo = /Week (\d+)/.exec(folder)?.[1] ?? '';
const condFile = flag('conditioning') ?? join(WEEKS, '_conditioning', `week-${weekNo}.txt`);
// The boards Chris designs live beside their text, one folder per week, named
// by weekday: _conditioning/boards/week-2/Monday.png. They were read straight
// out of Downloads at first, which meant the folder only rebuilt correctly on
// the machine that happened to have the exports sitting there.
const boardsFrom = flag('boards') ?? join(WEEKS, '_conditioning', 'boards', `week-${weekNo}`);

// ---------- the conditioning sessions ----------
if (!existsSync(condFile)) {
  console.error(`No conditioning text at ${condFile}`);
  process.exit(1);
}
const sessions = readFileSync(condFile, 'utf8')
  .split(/^=+$/m)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((text) => {
    const lines = text.split('\n');
    const dayName = lines[0].split(' \u00b7 ')[0].trim();
    return { dayName, title: lines[0], meta: lines[1] ?? '', text, lines };
  });

mkdirSync(join(out, 'boards'), { recursive: true });
mkdirSync(join(out, 'cards'), { recursive: true });

// Board and card files read as names, not shouting, so the conditioning half
// of the folder matches the strength half: "Mon - Monday Conditioning.png".
const titleCase = (t) => t.replace(/\S+/g, (w) => w[0] + w.slice(1).toLowerCase());
const labelOf = (s) => titleCase(s.title.split(' \u00b7 ').slice(1).join(' \u00b7 ')) || 'Conditioning';
const dayIndexOf = (s) => DAYS.findIndex((d) => d.toLowerCase() === s.dayName.toLowerCase());

// ---------- the boards ----------
const pool = existsSync(boardsFrom) ? readdirSync(boardsFrom).filter((f) => /\.png$/i.test(f)) : [];
const copied = [];
const noBoard = [];
for (const s of sessions) {
  // The newest export naming that day and this week wins, so a re-export lands
  // without anyone renaming anything.
  const hit = pool.filter((f) => new RegExp(`\\b${s.dayName}\\b`, 'i').test(f)).sort().pop();
  if (!hit) {
    noBoard.push(`${s.dayName}: no board found in ${boardsFrom}`);
    continue;
  }
  const name = `${SHORT[dayIndexOf(s)]} - ${labelOf(s)}.png`;
  copyFileSync(join(boardsFrom, hit), join(out, 'boards', name));
  copied.push(name);
}

// ---------- a coach's brief per conditioning class ----------
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((c) => existsSync(c));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function briefHtml(s) {
  const body = s.lines
    .slice(2)
    .map((l) => {
      if (!l.trim()) return '<div class="gap"></div>';
      const indent = l.match(/^ */)[0].length;
      if (indent === 0) return `<h2>${esc(l.trim())}</h2>`;
      return `<p class="i${indent <= 2 ? 2 : 4}">${esc(l.trim())}</p>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(s.title)}</title><style>
@page { size: A4; margin: 14mm; }
body { font-family: Mulish, "Segoe UI", sans-serif; color: #201D1D; font-size: 10.5pt; line-height: 1.35; }
h1 { font-family: Fraunces, Georgia, serif; font-size: 22pt; margin: 0 0 2mm; font-weight: 600; }
.meta { color: #003030; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; font-size: 8.5pt;
  border-bottom: 2px solid #003030; padding-bottom: 2mm; margin-bottom: 4mm; }
h2 { color: #003030; font-size: 10pt; letter-spacing: .06em; margin: 4mm 0 1mm;
  border-bottom: 1px solid #DEC5AE; padding-bottom: 1mm; }
p { margin: 0 0 .8mm; white-space: pre-wrap; }
.i2 { padding-left: 4mm; }
.i4 { padding-left: 10mm; color: #3A3634; }
.gap { height: 1.5mm; }
footer { margin-top: 6mm; border-top: 1px solid #DEC5AE; padding-top: 2mm; font-size: 8pt; color: #5A5654; }
</style><h1>${esc(labelOf(s))}</h1>
<div class="meta">${esc(s.meta)}</div>
${body}
<footer>Teneriffe Athletic Club \u00b7 76 Commercial Road, Teneriffe \u00b7 coach's brief</footer>`;
}

const briefs = [];
for (const s of sessions) {
  const stem = `${SHORT[dayIndexOf(s)]} - ${labelOf(s)}`;
  const html = join(out, 'cards', `.${stem}.html`);
  writeFileSync(html, briefHtml(s), 'utf8');
  if (!CHROME) continue;
  await exec(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--virtual-time-budget=8000',
      '--run-all-compositor-stages-before-draw',
      '--no-pdf-header-footer',
      `--print-to-pdf=${join(out, 'cards', `${stem}.pdf`)}`,
      `file:///${html.replace(/\\/g, '/')}`,
    ],
    { maxBuffer: 1 << 26 },
  );
  briefs.push(`${stem}.pdf`);
}

// ---------- one Word document for the whole week ----------
// The strength half is already written as text by week-pack; the conditioning
// half is the file above. Both are plain text whose indentation carries the
// shape, so one reader handles both and the two cannot drift apart in style.
const packTxt = readdirSync(out).find((f) => /all workouts\.txt$/i.test(f));
const strengthBlocks = packTxt
  ? readFileSync(join(out, packTxt), 'utf8')
      .split(/^=+$/m)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(1) // the pack's own cover page; this document has its own
  : [];

const dayOf = (block) => {
  const first = block.split('\n')[0].toUpperCase();
  const i = DAYS.findIndex((d) => first.startsWith(d.toUpperCase()));
  return i < 0 ? 9 : i;
};
const all = [...strengthBlocks, ...sessions.map((s) => s.text)].sort((a, b) => dayOf(a) - dayOf(b));

const PINE = '003030';
const SAND = 'DEC5AE';
const text = (t, o = {}) =>
  new TextRun({ text: t, font: o.font ?? 'Mulish', size: o.size ?? 20, bold: o.bold, color: o.color });
const para = (c, o = {}) => new Paragraph({ children: [c], ...o });

const children = [
  para(text('Teneriffe Athletic Club', { size: 19, bold: true, color: PINE })),
  para(text(`Week ${weekNo} class programming`, { font: 'Fraunces', size: 48 }), {
    heading: HeadingLevel.TITLE,
    spacing: { after: 120 },
  }),
  para(
    text(
      `Week beginning ${new Date(`${monday}T00:00:00`).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })} \u00b7 every class, strength and conditioning`,
      { size: 19, bold: true, color: PINE },
    ),
    { spacing: { after: 200 } },
  ),
];

for (const block of all) {
  children.push(new Paragraph({ children: [new PageBreak()] }));
  block.split('\n').forEach((l, i) => {
    const t = l.trim();
    if (!t) {
      children.push(para(text(''), { spacing: { after: 40 } }));
      return;
    }
    if (i === 0) {
      children.push(
        para(text(t, { font: 'Fraunces', size: 34 }), {
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: PINE, space: 4 } },
        }),
      );
      return;
    }
    if (i === 1) {
      children.push(para(text(t, { size: 18, bold: true, color: PINE }), { spacing: { after: 160 } }));
      return;
    }
    const indent = l.match(/^ */)[0].length;
    if (indent === 0) {
      children.push(
        para(text(t, { size: 22, bold: true, color: PINE }), {
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: SAND, space: 2 } },
        }),
      );
    } else if (indent <= 2) {
      children.push(para(text(t, { size: 20 }), { indent: { left: 240 }, spacing: { after: 20 } }));
    } else {
      children.push(
        para(text(t, { size: 19, color: '3A3634' }), { indent: { left: 520 }, spacing: { after: 20 } }),
      );
    }
  });
}

const docx = join(out, `Week ${weekNo} - all workouts.docx`);
writeFileSync(
  docx,
  await Packer.toBuffer(
    new Document({
      styles: { default: { document: { run: { font: 'Mulish', size: 20 } } } },
      sections: [
        { properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children },
      ],
    }),
  ),
);

// The README is written by week-pack, before the conditioning is folded in, so
// it lists those classes as missing. Correct it here rather than leave a note
// in the folder saying a class is absent when it is sitting next to it.
const readme = join(out, 'README.txt');
if (existsSync(readme)) {
  const added = sessions.map((s) => `  ${titleCase(s.dayName)} · ${labelOf(s)} (Conditioning)`);
  const [head, tail = ''] = readFileSync(readme, 'utf8').split(/\nNot in this pack:\n/);
  // Anything still genuinely missing keeps its line; the classes just folded in
  // lose theirs, so the folder never claims a class is absent while it sits in
  // the boards folder.
  const stillMissing = tail
    .split('\n')
    .filter((l) => l.trim() && !sessions.some((s) => l.includes(`${labelOf(s)}: not written`)));
  const body = `${head.trimEnd()}\n${added.join('\n')}\n`.replace(
    /^Classes in this pack:$/m,
    `Week ${weekNo} - all workouts.docx  every class, strength and conditioning, in one document.\n\nClasses in this pack:`,
  );
  writeFileSync(
    readme,
    stillMissing.length ? `${body}\nNot in this pack:\n${stillMissing.join('\n')}\n` : body,
    'utf8',
  );
}

console.log(`${folder}: ${all.length} classes in one document`);
console.log(`  ${docx}`);
if (copied.length) console.log(`  boards added: ${copied.join(', ')}`);
if (briefs.length) console.log(`  briefs added: ${briefs.join(', ')}`);
if (noBoard.length) console.log(`  ${noBoard.join('\n  ')}`);
