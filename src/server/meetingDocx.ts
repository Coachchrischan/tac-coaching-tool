// A coach meeting as an editable Word document: the same content as the
// Meetings tab (attendance snapshot, OKRs, actions, agenda, decisions), laid
// out in the TAC colours with real Word tables, so it can be typed into in the
// room and sent on. Bars are shaded table cells rather than a picture, so they
// stay crisp and the numbers beside them stay editable.
//
// Used by the dev server (GET /api/meeting-docx/:id, the Word doc button) and
// by scripts/meeting-docx.mjs on the command line.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableCellOptions,
} from 'docx';
import type { AttendanceDoc, Meeting, MeetingsDoc, ScheduleDoc } from '../types/documents.js';
import {
  MEETING_SECTIONS,
  attendanceWindow,
  autoValue,
  krProgress,
  previousMeeting,
  sectionTitle,
} from '../lib/meetings.js';

const PINE = '003030';
const SAND = 'C5A683';
const SAND_LIGHT = 'F2E9DE';
const INK = '292626';
const MUTED = '5A5A52';
const FAINT = '8A867C';
const PAPER = 'F5F3EB';
const RULE = 'D8D5C9';
const LOW = 'B3261E';

const PAGE_W = 11906; // A4
const MARGIN = 1000;
const W = PAGE_W - 2 * MARGIN;

const fmt = (iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', o);
const one = (n: number | null | undefined) => (n == null ? '–' : String(Math.round(n * 10) / 10));

type RunOpts = { size?: number; bold?: boolean; italics?: boolean; color?: string; font?: string };
const run = (text: string, o: RunOpts = {}) =>
  new TextRun({ text, font: o.font ?? 'Mulish', size: o.size ?? 20, bold: o.bold, italics: o.italics, color: o.color ?? INK });
const p = (children: TextRun[] | string, o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bullet?: boolean } = {}) =>
  new Paragraph({
    children: typeof children === 'string' ? [run(children)] : children,
    spacing: { after: o.after ?? 60, before: o.before ?? 0 },
    alignment: o.align,
    numbering: o.bullet ? { reference: 'bullets', level: 0 } : undefined,
  });

const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none };
const hairline = { style: BorderStyle.SINGLE, size: 4, color: RULE };

function cell(children: Paragraph[], width: number, o: Partial<ITableCellOptions> & { fill?: string } = {}) {
  const { fill, ...rest } = o;
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    ...rest,
  });
}

function table(widths: number[], rows: TableRow[], borders = true) {
  return new Table({
    width: { size: widths.reduce((s, x) => s + x, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows,
    borders: borders
      ? { top: hairline, bottom: hairline, left: none, right: none, insideHorizontal: hairline, insideVertical: none }
      : { ...noBorders, insideHorizontal: none, insideVertical: none },
  });
}

/** Header row of a data table: small muted labels. */
function headRow(labels: string[], widths: number[], aligns: ('left' | 'right')[] = []) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l, i) =>
      cell([p([run(l, { size: 16, bold: true, color: MUTED })], { after: 0, align: aligns[i] === 'right' ? AlignmentType.RIGHT : undefined })], widths[i]),
    ),
  });
}

function sectionHead(n: number, title: string, sub?: string) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 360, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: PINE, space: 4 } },
    children: [
      run(`${String(n).padStart(2, '0')}  `, { font: 'Fraunces', size: 26, color: SAND }),
      run(title, { font: 'Fraunces', size: 30, color: INK }),
      ...(sub ? [run(`   ${sub}`, { size: 16, color: MUTED })] : []),
    ],
  });
}

const label = (text: string) =>
  new Paragraph({ keepNext: true, spacing: { before: 200, after: 60 }, children: [run(text.toUpperCase(), { size: 18, bold: true, color: PINE })] });

/** Text that may hold several lines; '- ' lines become bullets. */
function lines(text: string, o: RunOpts = {}): Paragraph[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const bullet = /^\s*[-*•]\s+/.test(l);
      return p([run(l.replace(/^\s*[-*•]\s+/, ''), o)], { bullet });
    });
}

/** Empty ruled lines to write on, for a printed copy. */
const blankLines = (n: number) =>
  Array.from({ length: n }, () =>
    new Paragraph({ spacing: { after: 0, before: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 1 } }, children: [run('')] }),
  );

export interface MeetingDocxInput {
  meeting: Meeting;
  meetings: MeetingsDoc;
  attendance: AttendanceDoc;
  schedule: ScheduleDoc;
  /** White landscape logo PNG for the green header band; optional. */
  logo?: { data: Buffer; width: number; height: number };
}

export function meetingDocxName(meeting: Meeting, className: string) {
  return `${meeting.date} ${className} coach meeting.docx`;
}

export async function buildMeetingDocx({ meeting, meetings, attendance, schedule, logo }: MeetingDocxInput): Promise<Buffer> {
  const className = schedule.classTypes.find((c) => c.id === meeting.classTypeId)?.name ?? meeting.classTypeId;
  const prev = previousMeeting(meetings.meetings, meeting);
  const win = attendanceWindow(attendance.entries, schedule, meeting.classTypeId, meeting.date);
  const full = win.weeks.filter((w) => !w.partWeek);
  const recorded = full.filter((w) => w.count != null);
  const children: (Paragraph | Table)[] = [];

  // ---------- Header band ----------
  const logoW = 2600;
  const logoCell = logo
    ? cell(
        [
          new Paragraph({
            children: [
              new ImageRun({
                type: 'png',
                data: logo.data,
                transformation: { width: 150, height: Math.round((150 * logo.height) / logo.width) },
              }),
            ],
          }),
        ],
        logoW,
        { fill: PINE, margins: { top: 240, bottom: 240, left: 280, right: 120 } },
      )
    : null;
  const titleW = logo ? W - logoW : W;
  children.push(
    table(
      logo ? [logoW, titleW] : [W],
      [
        new TableRow({
          children: [
            ...(logoCell ? [logoCell] : []),
            cell(
              [
                p([run(`TENERIFFE ATHLETIC CLUB  ·  COACH MEETING  ·  ${meeting.period.toUpperCase()}`, { size: 15, bold: true, color: 'DEC5AE' })], { after: 40 }),
                p([run(className, { font: 'Fraunces', size: 44, color: 'FFFFFF' })], { after: 40 }),
                p([run(fmt(meeting.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (prev ? `  ·  follows ${fmt(prev.date)}` : '  ·  first meeting'), { size: 19, color: 'E5EBE7' })], { after: 0 }),
              ],
              titleW,
              { fill: PINE, margins: { top: 240, bottom: 240, left: 200, right: 280 } },
            ),
          ],
        }),
      ],
      false,
    ),
  );
  children.push(
    p([run('Attendees: ', { bold: true, color: MUTED, size: 19 }), run(meeting.attendees || '', { size: 19 })], { before: 160, after: 0 }),
  );

  // ---------- 01 Attendance ----------
  const first = full[0].monday;
  const last = full[full.length - 1].monday;
  const change =
    win.avgWeek != null && win.prevAvgWeek != null && win.prevAvgWeek > 0
      ? (win.avgWeek - win.prevAvgWeek) / win.prevAvgWeek
      : null;
  children.push(sectionHead(1, 'Attendance snapshot', `Weeks of ${fmt(first, { day: 'numeric', month: 'short' })} to ${fmt(last, { day: 'numeric', month: 'short' })}`));
  if (win.seeded) children.push(p([run('Demo data in this window. Do not quote these numbers.', { bold: true, color: LOW })]));

  const tiles: [string, string, string][] = [
    ['Check-ins per week', one(win.avgWeek), `${recorded.length} of 8 weeks recorded`],
    ['Check-ins per class', one(win.avgSession), `${win.sessionsPerWeek} classes a week`],
    ['vs the 8 weeks before', change == null ? '–' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`, change == null ? 'No earlier data yet' : `was ${one(win.prevAvgWeek)} a week`],
    ['Latest week', one(recorded.at(-1)?.count), recorded.length ? `week of ${fmt(recorded.at(-1)!.monday, { day: 'numeric', month: 'short' })}` : 'Nothing recorded'],
  ];
  const tileW = W / 4;
  children.push(
    new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: tiles.map(() => tileW),
      layout: TableLayoutType.FIXED,
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' } },
      rows: [
        new TableRow({
          children: tiles.map(([l, v, n]) =>
            cell(
              [
                p([run(l, { size: 16, color: MUTED })], { after: 20 }),
                p([run(v, { font: 'Fraunces', size: 40 })], { after: 20 }),
                p([run(n, { size: 15, color: FAINT })], { after: 0 }),
              ],
              tileW,
              { fill: PAPER, margins: { top: 120, bottom: 120, left: 160, right: 120 } },
            ),
          ),
        }),
      ],
    }),
  );

  // Weekly bars: one borderless row each, the filled cell sized to the count.
  children.push(label('Check-ins per week'));
  const max = Math.max(5, ...win.weeks.map((w) => w.count ?? 0));
  const labelW = 1500;
  const numW = 900;
  const barW = W - labelW - numW;
  for (const w of win.weeks) {
    const fillW = w.count ? Math.max(60, Math.round((barW * w.count) / max)) : 0;
    const restW = barW - fillW;
    const widths = [labelW, ...(fillW ? [fillW] : []), ...(restW ? [restW] : []), numW];
    const wk = w.partWeek ? 'This week so far' : fmt(w.monday, { day: 'numeric', month: 'short' });
    children.push(
      new Table({
        width: { size: W, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
        rows: [
          new TableRow({
            height: { value: 300, rule: 'atLeast' },
            children: [
              cell([p([run(wk, { size: 17, color: MUTED })], { after: 0 })], labelW, { margins: { top: 30, bottom: 30, left: 0, right: 120 } }),
              ...(fillW ? [cell([p('', { after: 0 })], fillW, { fill: w.estimated ? SAND : w.partWeek ? '7A9590' : PINE, margins: { top: 30, bottom: 30, left: 0, right: 0 } })] : []),
              ...(restW ? [cell([p(w.count == null ? [run('no data', { size: 15, color: FAINT })] : '', { after: 0 })], restW, { margins: { top: 30, bottom: 30, left: 80, right: 0 } })] : []),
              cell([p([run(w.count == null ? '' : `${w.count}${w.estimated ? '*' : ''}`, { size: 18, bold: true })], { after: 0, align: AlignmentType.RIGHT })], numW, { margins: { top: 30, bottom: 30, left: 0, right: 0 } }),
            ],
          }),
        ],
      }),
    );
  }
  if (win.weeks.some((w) => w.estimated)) children.push(p([run('* estimated from a monthly total', { size: 15, color: FAINT })]));

  if (win.slots.length) {
    children.push(label('By session'));
    const sw = [2300, 1700, 3606, 1300, 1000];
    children.push(
      table(sw, [
        headRow(['Session', 'Coach', 'Check-ins, oldest week first', 'Avg', ''], sw, ['left', 'left', 'left', 'right']),
        ...win.slots.map(
          (s) =>
            new TableRow({
              children: [
                cell([p([run(s.label, { bold: true })], { after: 0 })], sw[0]),
                cell([p([run(s.coach ?? '', { color: MUTED })], { after: 0 })], sw[1]),
                cell([p([run(s.counts.join('  ·  '), { color: MUTED })], { after: 0 })], sw[2]),
                cell([p([run(one(s.avg), { bold: true })], { after: 0, align: AlignmentType.RIGHT })], sw[3]),
                cell([p(s.avg < 5 ? [run('▼ low', { size: 16, bold: true, color: LOW })] : '', { after: 0 })], sw[4]),
              ],
            }),
        ),
      ]),
    );
  }

  // ---------- 02 OKRs ----------
  children.push(sectionHead(2, `Objectives and key results · ${meeting.period}`));
  children.push(p([run('1 to 3 objectives, 2 to 4 measurable results each. Confidence is 1 to 10. Reaching 70% of a stretch target is a good quarter.', { size: 16, color: MUTED, italics: true })]));
  const kw = [3906, 1000, 1000, 1000, 1500, 1500];
  meeting.objectives.forEach((o, i) => {
    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 240, after: 20 },
        children: [run(`O${i + 1}  `, { font: 'Fraunces', size: 28, color: SAND }), run(o.text || 'Objective', { font: 'Fraunces', size: 28 })],
      }),
      new Paragraph({ keepNext: true, spacing: { after: 80 }, children: [run(sectionTitle(o.sectionId).toUpperCase(), { size: 15, bold: true, color: PINE })] }),
    );
    children.push(
      table(kw, [
        headRow(['Key result', 'Start', 'Now', 'Target', 'Progress', 'Confidence'], kw, ['left', 'right', 'right', 'right', 'right', 'right']),
        ...o.keyResults.map((k) => {
          const now = k.auto ? autoValue(k, win) : k.current;
          const pr = krProgress({ ...k, current: now });
          const num = (v: string, bold = false) => [p([run(v, { bold })], { after: 0, align: AlignmentType.RIGHT })];
          return new TableRow({
            cantSplit: true,
            children: [
              cell([p([run(k.text)], { after: 0 }), ...(k.auto ? [p([run('from attendance', { size: 14, color: FAINT })], { after: 0 })] : [])], kw[0]),
              cell(num(one(k.start)), kw[1]),
              cell(num(one(now), true), kw[2]),
              cell(num(one(k.target)), kw[3]),
              cell(num(pr == null ? '' : `${Math.round(pr * 100)}%`), kw[4]),
              cell(num(k.confidence == null ? '   /10' : `${k.confidence}/10`), kw[5]),
            ],
          });
        }),
      ]),
    );
  });
  children.push(p([run('New objective:', { size: 18, bold: true, color: MUTED })], { before: 200 }), ...blankLines(2));

  // ---------- 03 Actions ----------
  const open = meeting.actions.filter((a) => !a.done).length;
  children.push(sectionHead(3, 'Actions', `${open} open. Unfinished actions carry into the next meeting.`));
  const aw = [800, 4606, 1700, 1500, 1300];
  const actionRows = [
    ...meeting.actions.map((a) => ({ done: a.done, text: a.text, owner: a.owner, due: a.due ? fmt(a.due, { day: 'numeric', month: 'short' }) : '', raised: a.raised === meeting.date ? 'today' : fmt(a.raised, { day: 'numeric', month: 'short' }) })),
    ...Array.from({ length: Math.max(3, 6 - meeting.actions.length) }, () => ({ done: false, text: '', owner: '', due: '', raised: '' })),
  ];
  children.push(
    table(aw, [
      headRow(['Done', 'Action', 'Owner', 'Due', 'Raised'], aw),
      ...actionRows.map(
        (a) =>
          new TableRow({
            height: { value: 380, rule: 'atLeast' },
            children: [
              cell([p([run(a.done ? '☒' : '☐', { size: 22 })], { after: 0, align: AlignmentType.CENTER })], aw[0]),
              cell([p([run(a.text, { color: a.done ? FAINT : INK })], { after: 0 })], aw[1]),
              cell([p(a.owner, { after: 0 })], aw[2]),
              cell([p(a.due, { after: 0 })], aw[3]),
              cell([p([run(a.raised, { size: 17, color: MUTED })], { after: 0 })], aw[4]),
            ],
          }),
      ),
    ]),
  );

  // ---------- 04 Agenda ----------
  children.push(sectionHead(4, 'Agenda'));
  for (const s of MEETING_SECTIONS) {
    children.push(label(s.title));
    for (const q of s.prompts) children.push(p([run(q, { size: 17, italics: true, color: MUTED })], { bullet: true, after: 20 }));
    const notes = meeting.notes[s.id] ?? '';
    children.push(...(notes.trim() ? lines(notes) : []), ...blankLines(notes.trim() ? 1 : 3));
    if (prev?.notes[s.id]?.trim()) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: SAND_LIGHT },
          children: [run(`Last time (${fmt(prev.date)})`, { size: 16, bold: true, color: MUTED })],
        }),
        ...lines(prev.notes[s.id], { size: 17, color: MUTED }),
      );
    }
  }

  // ---------- 05 Decisions ----------
  children.push(sectionHead(5, 'Decisions'));
  children.push(...(meeting.decisions.trim() ? lines(meeting.decisions) : []), ...blankLines(4));

  const doc = new Document({
    creator: 'TAC coaching tool',
    title: `${className} coach meeting ${meeting.date}`,
    styles: { default: { document: { run: { font: 'Mulish', size: 20, color: INK } } } },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 900, bottom: 900, left: MARGIN, right: MARGIN } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run(`TAC coach meeting  ·  ${className}  ·  ${fmt(meeting.date)}  ·  page `, { size: 15, color: FAINT }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Mulish', size: 15, color: FAINT }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** Width and height from a PNG header, so the logo keeps its proportions. */
export function pngSize(data: Buffer): { width: number; height: number } {
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}
