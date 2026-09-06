// The designer pack: one PDF (plus a JSON twin) per block, giving the
// marketing agency every input the TV board can carry, each one labelled
// ON THE WALL or COACH ONLY exactly as the board treats it today, with the
// current board rendered beside each session for reference.
//
// A4 landscape at 96dpi, paginated by measurement: every session starts on a
// fresh page, its parts and movements flow across as many pages as they need,
// and its current board follows on its own page. Same export pipeline as the
// TV board and the block overview (toSvg then a manual canvas).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { useDoc } from '../../lib/useDoc';
import { useLibrary } from '../../lib/useLibrary';
import { generateBlurb } from '../../lib/blurb';
import { mergedLibrary } from '../../lib/library';
import { streamsOf } from '../../lib/programStreams';
import {
  buildDesignerPack,
  containerLabel,
  windowsOf,
  type PackField,
  type PackModel,
  type PackPart,
  type PackPiece,
  type PackSession,
  type PackSlot,
  type Where,
} from '../../lib/designerPack';
import type { Session } from '../../types/documents';
import TvBoard, { type BoardFit } from '../tv/TvBoard';
import { BOARD_RESOLUTIONS, captureNodePng, downloadText } from '../tv/boardExport';
import { BOARD_H, BOARD_W } from '../tv/boardRules';

const PW = 1123;
const PH = 794;
const PAD_X = 48;
const PAD_TOP = 40;
const PAD_BOTTOM = 36;
const HEADER_H = 34;
const FOOTER_H = 22;
const CONTENT_W = PW - PAD_X * 2;
const CONTENT_H = PH - PAD_TOP - PAD_BOTTOM - HEADER_H - FOOTER_H;
const GAP = 10;

const CREAM = '#F5F3EB';
const SAND = '#DEC5AE';
const CHARCOAL = '#201d1d';
const PINE = '#003030';
const MUTED = 'rgba(32,29,29,0.55)';

const fmtIso = (iso: string | null, opts: Intl.DateTimeFormatOptions) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', opts) : '';
const fmtDay = (iso: string | null) => fmtIso(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDate = (iso: string | null) => fmtIso(iso, { day: 'numeric', month: 'short' });
const fmtLong = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------- badges ----------

function Badge({ where, hidden }: { where?: Where; hidden?: boolean }) {
  if (hidden) {
    return (
      <span className="inline-block shrink-0 rounded-sm border px-1.5 py-[1px] text-[8.5px] font-extrabold tracking-[0.14em] uppercase" style={{ borderColor: '#b45309', color: '#b45309' }}>
        Off the wall · coach flag
      </span>
    );
  }
  if (where === 'wall') {
    return (
      <span className="inline-block shrink-0 rounded-sm px-1.5 py-[1px] text-[8.5px] font-extrabold tracking-[0.14em] uppercase" style={{ backgroundColor: PINE, color: CREAM }}>
        On the wall
      </span>
    );
  }
  return (
    <span className="inline-block shrink-0 rounded-sm border px-1.5 py-[1px] text-[8.5px] font-extrabold tracking-[0.14em] uppercase" style={{ borderColor: MUTED, color: MUTED }}>
      Coach only
    </span>
  );
}

function FieldRow({ f }: { f: PackField }) {
  return (
    <div className="flex items-start gap-3 border-b py-1.5" style={{ borderColor: 'rgba(32,29,29,0.1)' }}>
      <p className="w-[150px] shrink-0 text-[10px] font-bold tracking-wide uppercase" style={{ color: PINE }}>
        {f.label}
      </p>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-snug" style={{ color: CHARCOAL }}>
          {f.text}
        </p>
        <p className="mt-0.5 text-[9.5px] leading-snug" style={{ color: MUTED }}>
          {f.why}
        </p>
      </div>
      <Badge where={f.where} />
    </div>
  );
}

// ---------- chunks: the units the paginator measures and places ----------

interface Chunk {
  key: string;
  /** Do not leave this chunk last on a page. */
  keepWithNext?: boolean;
  node: ReactNode;
}

function SessionHead({ s, m }: { s: PackSession; m: PackModel }) {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b-2 pb-2" style={{ borderColor: PINE }}>
        <div>
          <p className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: PINE }}>
            Week {s.weekIndex + 1}
            {s.day ? ` · ${fmtDay(s.date)}` : s.weekMonday ? ` · week of ${fmtDate(s.weekMonday)}` : ''}
            {' · '}
            {m.stream.name}
          </p>
          <h2 className="mt-0.5 text-[26px] leading-none" style={{ fontFamily: 'Fraunces, serif', color: CHARCOAL }}>
            {s.label}
          </h2>
        </div>
        <p className="text-[10px] font-semibold" style={{ color: MUTED }}>
          {s.kind === 'circuit' ? 'Circuit format: pieces with headings and movement lines' : 'Series format: warm-up plus lettered series of movements'}
        </p>
      </div>
      <div className="mt-2">
        <FieldRow
          f={{
            label: 'Headline',
            text: s.wallTitle,
            where: 'wall',
            why: 'The big serif title, top left, next to the club mark and "TENERIFFE ATHLETIC CLUB".',
          }}
        />
        <FieldRow
          f={{
            label: 'Header, top right',
            text: s.wallHeader.join('  /  '),
            where: 'wall',
            why: 'Stacked top right, then the tagline "Train better, live better." in italic serif.',
          }}
        />
        {s.fields.map((f) => (
          <FieldRow key={f.label} f={f} />
        ))}
      </div>
    </div>
  );
}

function PartHead({ p }: { p: PackPart }) {
  const title = p.isWarmup
    ? `Warm up · ${p.minutes} min · with coach`
    : p.kind === 'circuit'
      ? `${p.label.toUpperCase()} · circuit finisher · ${p.minutes} min`
      : `${p.label.toUpperCase()} series · ${p.minutes} min`;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-3 border-b-[2px] pb-1" style={{ borderColor: SAND }}>
        <p className="text-[14px] font-extrabold tracking-[0.06em]" style={{ color: PINE }}>
          {title}
        </p>
        {p.hiddenByCoach ? <Badge hidden /> : p.onWall ? <Badge where="wall" /> : (
          <span className="text-[9px] font-semibold uppercase" style={{ color: MUTED }}>
            empty: nothing to print
          </span>
        )}
        <p className="ml-auto text-[9.5px]" style={{ color: MUTED }}>
          {p.isWarmup
            ? 'Wall: one strip, movements side by side, name / prescription / cue.'
            : p.kind === 'circuit'
              ? 'Wall: one column, read like the ESD board.'
              : 'Wall: one column per series, numbered movements top to bottom.'}
        </p>
      </div>
      {p.note && <FieldRow f={p.note} />}
    </div>
  );
}

function Cell({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-bold tracking-[0.12em] uppercase" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="truncate text-[11.5px] font-semibold" style={{ color: value ? CHARCOAL : 'rgba(32,29,29,0.25)' }}>
        {value ?? '–'}
      </p>
    </div>
  );
}

function SlotRow({ slot, part }: { slot: PackSlot; part: PackPart }) {
  const wallWhere: Where = part.onWall ? 'wall' : 'coach';
  return (
    <div className="flex gap-3 border-b py-2" style={{ borderColor: 'rgba(32,29,29,0.1)' }}>
      <span
        className="mt-0.5 flex h-7 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-extrabold"
        style={{ borderColor: PINE, color: PINE }}
      >
        {slot.tag}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] leading-tight font-bold" style={{ color: CHARCOAL }}>
              {slot.name}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: PINE }}>
              <span className="font-bold">As printed: </span>
              {slot.asOnWall || <span style={{ color: MUTED }}>movement name only</span>}
            </p>
          </div>
          <Badge where={wallWhere} />
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-3 rounded-sm px-2 py-1" style={{ backgroundColor: 'rgba(222,197,174,0.22)' }}>
          <Cell label="Sets" value={slot.sets} />
          <Cell label="Reps" value={slot.reps} />
          <Cell label="Load" value={slot.load} />
          <Cell label="Intensity" value={slot.intensity} />
          <Cell label="RPE" value={slot.rpe} />
          <Cell label="Tempo" value={slot.tempo} />
        </div>
        {slot.note && (
          <div className="mt-1 flex items-start gap-2">
            <p className="w-[70px] shrink-0 text-[9px] font-bold uppercase" style={{ color: PINE }}>
              Slot note
            </p>
            <p className="flex-1 text-[11px] leading-snug" style={{ color: CHARCOAL }}>
              {slot.note.text} <span style={{ color: MUTED }}>({slot.note.why})</span>
            </p>
            <Badge where={slot.note.where} />
          </div>
        )}
        {slot.cue && (
          <div className="mt-1 flex items-start gap-2">
            <p className="w-[70px] shrink-0 text-[9px] font-bold uppercase" style={{ color: PINE }}>
              Cue
            </p>
            <p className="flex-1 text-[11px] leading-snug italic" style={{ color: CHARCOAL }}>
              {slot.cue.text}
            </p>
            <Badge where={slot.cue.where} />
          </div>
        )}
        {slot.scales.map((sc, i) => (
          <div key={i} className="mt-1 flex items-start gap-2">
            <p className="w-[70px] shrink-0 text-[9px] font-bold uppercase" style={{ color: PINE }}>
              Scale {i + 1}
            </p>
            <p className="flex-1 text-[11px] leading-snug" style={{ color: CHARCOAL }}>
              {sc.text}
            </p>
            <Badge where={sc.where} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PieceBlock({ piece, index, inPart }: { piece: PackPiece; index: number; inPart?: boolean }) {
  return (
    <div className="flex gap-3 border-b py-2" style={{ borderColor: 'rgba(32,29,29,0.1)' }}>
      <span className="mt-0.5 w-14 shrink-0 text-[9px] font-extrabold tracking-[0.14em] uppercase" style={{ color: PINE }}>
        Piece {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[14px] leading-tight font-extrabold" style={{ color: CHARCOAL }}>
            {piece.heading || <span style={{ color: MUTED }}>(no heading)</span>}
          </p>
          {piece.hiddenByCoach ? <Badge hidden /> : <Badge where={piece.onWall ? 'wall' : 'coach'} />}
        </div>
        <ul className="mt-1 space-y-0.5">
          {piece.lines.map((l, i) => (
            <li key={i} className="text-[12px] leading-snug" style={{ color: CHARCOAL }}>
              {l.text}
              {l.load && (
                <span className="ml-2 text-[10.5px] font-semibold" style={{ color: PINE }}>
                  load: {l.load}
                </span>
              )}
            </li>
          ))}
        </ul>
        {piece.restAfter && (
          <p className="mt-1 text-[10.5px] font-semibold" style={{ color: MUTED }}>
            Then: {piece.restAfter}
          </p>
        )}
        {!inPart && index === 0 && (
          <p className="mt-1 text-[9.5px]" style={{ color: MUTED }}>
            Wall: pieces sit side by side as cards (up to four across); heading in sand, movements large in cream, the load under its movement, the rest line along the card's foot.
          </p>
        )}
      </div>
    </div>
  );
}

function chunksFor(s: PackSession, m: PackModel): Chunk[] {
  const out: Chunk[] = [{ key: `${s.id}-head`, keepWithNext: true, node: <SessionHead s={s} m={m} /> }];
  s.parts.forEach((p, pi) => {
    out.push({ key: `${s.id}-p${pi}`, keepWithNext: true, node: <PartHead p={p} /> });
    p.slots.forEach((slot, si) => out.push({ key: `${s.id}-p${pi}-s${si}`, node: <SlotRow slot={slot} part={p} /> }));
    p.pieces.forEach((piece, ci) => out.push({ key: `${s.id}-p${pi}-c${ci}`, node: <PieceBlock piece={piece} index={ci} inPart /> }));
  });
  s.pieces.forEach((piece, ci) => out.push({ key: `${s.id}-c${ci}`, node: <PieceBlock piece={piece} index={ci} /> }));
  out.push({
    key: `${s.id}-foot`,
    node: (
      <div className="mt-2">
        <p className="border-b-[2px] pb-1 text-[14px] font-extrabold tracking-[0.06em]" style={{ borderColor: SAND, color: PINE }}>
          Footer
        </p>
        {s.footer.map((f) => (
          <FieldRow key={f.label} f={f} />
        ))}
      </div>
    ),
  });
  return out;
}

/**
 * Measure every chunk once (off-screen, at page width) and split each
 * session's chunks into pages that fit the content box, never leaving a
 * heading as the last thing on a page.
 */
function paginate(heights: number[], chunks: Chunk[], starts: number[]): number[][][] {
  const perSession: number[][][] = [];
  for (let si = 0; si < starts.length; si++) {
    const from = starts[si];
    const to = si + 1 < starts.length ? starts[si + 1] : chunks.length;
    const pages: number[][] = [];
    let cur: number[] = [];
    let h = 0;
    for (let i = from; i < to; i++) {
      const need = heights[i] + (cur.length ? GAP : 0);
      if (h + need > CONTENT_H && cur.length) {
        // Carry trailing headings over so a series title is never orphaned.
        const carry: number[] = [];
        while (cur.length > 1 && chunks[cur[cur.length - 1]].keepWithNext) carry.unshift(cur.pop()!);
        pages.push(cur);
        cur = carry;
        h = carry.reduce((n, c, k) => n + heights[c] + (k ? GAP : 0), 0);
      }
      cur.push(i);
      h += cur.length === 1 ? heights[i] : heights[i] + GAP;
    }
    if (cur.length) pages.push(cur);
    perSession.push(pages);
  }
  return perSession;
}

// ---------- off-screen board capture ----------

interface Captured {
  png: string;
  fit: BoardFit;
}

let captureQueue: Promise<unknown> = Promise.resolve();
function enqueueCapture(job: () => Promise<unknown>) {
  captureQueue = captureQueue.then(job, job);
}

function BoardCapture({
  session,
  blockIndex,
  weekIndex,
  blockWeeks,
  theme,
  cadence,
  overrides,
  blurb,
  onCaptured,
}: Omit<Parameters<typeof TvBoard>[0], 'slideRef' | 'style' | 'onFit'> & { onCaptured: (id: string, c: Captured) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef<string>('');
  const onFit = useCallback(
    (fit: BoardFit) => {
      const key = `${session.id}:${fit.fit}`;
      if (!fit.settled || done.current === key || !ref.current) return;
      done.current = key;
      // Let the commit paint first. A timeout, not requestAnimationFrame: a
      // background tab never gets an animation frame, and the coach may well
      // switch tabs while a long pack renders. Captures run one at a time:
      // six boards at once (each a 3 MB SVG with fonts and photos inlined)
      // took twenty seconds; in sequence they take about one second each.
      setTimeout(() => {
        if (!ref.current) return;
        const node = ref.current;
        enqueueCapture(() =>
          captureNodePng(node, { width: BOARD_W, height: BOARD_H, type: 'image/jpeg', quality: 0.9 })
            .then((png) => onCaptured(session.id, { png, fit }))
            .catch(() => onCaptured(session.id, { png: '', fit })),
        );
      }, 50);
    },
    [session.id, onCaptured],
  );
  return (
    <TvBoard
      session={session}
      blockIndex={blockIndex}
      weekIndex={weekIndex}
      blockWeeks={blockWeeks}
      theme={theme}
      cadence={cadence}
      overrides={overrides}
      blurb={blurb}
      slideRef={ref}
      onFit={onFit}
    />
  );
}

// ---------- the page ----------

export default function DesignerPackPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const program = useDoc('program');
  const lib = useDoc('library-overrides');
  const annual = useDoc('annual-plan');
  const schedule = useDoc('schedule');
  const { library } = useLibrary();
  const [exporting, setExporting] = useState<string | null>(null);
  const [includeBoards, setIncludeBoards] = useState(true);
  const [boards, setBoards] = useState<Record<string, Captured>>({});
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ sig: string; pages: number[][][] } | null>(null);

  const streams = program.data ? streamsOf(program.data) : [];
  const streamId = params.get('stream') ?? streams[0]?.id ?? 'strength';
  const stream = streams.find((s) => s.id === streamId) ?? streams[0];
  const containerIndex = Math.min(Number(params.get('container') ?? 0) || 0, Math.max(0, (stream?.blocks.length ?? 1) - 1));
  const windowCount = stream ? windowsOf(stream.blocks[containerIndex] ?? { weeks: [] }).count : 1;
  const windowIndex = Math.min(Number(params.get('window') ?? 0) || 0, windowCount - 1);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === 'stream') {
      next.set('container', '0');
      next.set('window', '0');
    }
    if (key === 'container') next.set('window', '0');
    setParams(next, { replace: true });
  };

  const overrides = lib.data;
  const merged = useMemo(() => (library && overrides ? mergedLibrary(library, overrides) : []), [library, overrides]);
  const blurbFor = useCallback(
    (s: Session) => s.blurbOverride ?? (library && overrides ? generateBlurb(s, merged, overrides) : ''),
    [library, overrides, merged],
  );

  const model = useMemo(
    () =>
      program.data && overrides && stream
        ? buildDesignerPack({
            doc: program.data,
            overrides,
            schedule: schedule.data ?? null,
            annual: annual.data ? { startDate: annual.data.startDate, breaks: annual.data.breaks ?? [] } : null,
            streamId: stream.id,
            containerIndex,
            windowIndex,
            blurbFor,
          })
        : null,
    [program.data, overrides, schedule.data, annual.data, stream, containerIndex, windowIndex, blurbFor],
  );

  // The raw sessions behind the model, for the board renders.
  const rawSessions = useMemo(() => {
    if (!model || !stream) return [];
    const block = stream.blocks[model.container.index];
    return model.sessions.flatMap((ps) => {
      const s = block.weeks[ps.weekIndex].sessions.find((x) => x.id === ps.id);
      return s ? [{ pack: ps, session: s }] : [];
    });
  }, [model, stream]);

  const chunks = useMemo(() => (model ? model.sessions.map((s) => chunksFor(s, model)) : []), [model]);
  const flat = useMemo(() => chunks.flat(), [chunks]);
  const starts = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const c of chunks) {
      out.push(n);
      n += c.length;
    }
    return out;
  }, [chunks]);
  const sig = model ? `${model.fileBase}:${flat.map((c) => c.key).join(',')}:${JSON.stringify(model.sessions).length}` : '';

  // Measure after paint, whenever the content changes.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !model) return;
    if (layout?.sig === sig) return;
    const heights = Array.from(el.children).map((c) => (c as HTMLElement).getBoundingClientRect().height);
    setLayout({ sig, pages: paginate(heights, flat, starts) });
  }, [sig, model, flat, starts, layout?.sig]);

  // Boards captured for a previous selection are stale.
  useEffect(() => {
    setBoards({});
  }, [model?.fileBase]);

  // Heights measured before the web fonts arrive are wrong by a few pixels a
  // line; lay out again once they are in.
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) setLayout(null);
    });
    return () => {
      live = false;
    };
  }, []);

  const onCaptured = useCallback((id: string, c: Captured) => setBoards((b) => ({ ...b, [id]: c })), []);

  if (!program.data || !lib.data || !annual.data || !schedule.data) {
    return <div className="flex min-h-screen items-center justify-center bg-black text-ink-400">Loading…</div>;
  }
  if (!model || !stream) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p>Nothing to pack: this stream has no programming yet.</p>
        <button type="button" onClick={() => navigate('/programming')} className="rounded border border-ink-700 px-3 py-1.5 text-sm">
          Back to Programming
        </button>
      </div>
    );
  }

  const ready = layout?.sig === sig;
  const boardsReady = !includeBoards || rawSessions.every((r) => boards[r.session.id]);
  const generated = new Date(model.generatedAt);
  const totalPages = ready ? 1 + layout!.pages.reduce((n, p) => n + p.length, 0) + (includeBoards ? rawSessions.length : 0) : 0;

  async function exportPdf() {
    setExporting('Rendering pages…');
    try {
      const pages = Array.from(pagesRef.current!.querySelectorAll<HTMLElement>('[data-page]'));
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [PW, PH], hotfixes: ['px_scaling'] });
      for (let i = 0; i < pages.length; i++) {
        setExporting(`Rendering page ${i + 1} of ${pages.length}…`);
        const png = await captureNodePng(pages[i], {
          width: PW,
          height: PH,
          outWidth: PW * 2,
          outHeight: PH * 2,
          type: 'image/jpeg',
          quality: 0.92,
        });
        if (i > 0) pdf.addPage([PW, PH], 'landscape');
        pdf.addImage(png, 'JPEG', 0, 0, PW, PH);
      }
      pdf.save(`${model!.fileBase}.pdf`);
    } catch (err) {
      // A silent failure reads as a working button that did nothing.
      window.alert(`PDF export failed: ${String(err)}`);
    } finally {
      setExporting(null);
    }
  }

  function exportJson() {
    const twin = {
      ...model,
      boards: Object.fromEntries(
        rawSessions.map((r) => {
          const c = boards[r.session.id];
          return [r.session.id, c ? { fit: c.fit.fit, fitState: c.fit.fitState } : null];
        }),
      ),
      note: 'Every text field carries where: "wall" (the current TV board prints it) or "coach" (never on the wall). Parts and pieces carry onWall and hiddenByCoach.',
    };
    downloadText(JSON.stringify(twin, null, 2), `${model!.fileBase}.json`);
  }

  const control =
    'rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-50';
  const select = 'rounded bg-black/40 px-1.5 py-0.5 text-sm font-medium text-white focus:outline-none';
  const page = 'relative mx-auto shrink-0 overflow-hidden shadow-xl';
  // A plain render helper, not a component: a component declared inside
  // render remounts its subtree every render, which would re-fire the board
  // images and lose scroll position.
  let pageNo = 0;
  const frame = (title: string, children: ReactNode) => {
    const n = ++pageNo;
    return (
      <div key={n} data-page className={page} style={{ width: PW, height: PH, backgroundColor: CREAM, fontFamily: 'Mulish, sans-serif' }}>
        <div className="flex h-full flex-col" style={{ padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px` }}>
          <div className="flex items-baseline justify-between" style={{ height: HEADER_H }}>
            <p className="text-[9px] font-bold tracking-[0.35em] uppercase" style={{ color: PINE }}>
              Teneriffe Athletic Club · Designer pack · {model!.stream.name} · {model!.container.label} · Block {model!.window.index + 1}
            </p>
            <p className="text-[9px] font-semibold tracking-[0.2em] uppercase" style={{ color: MUTED }}>
              {title}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden" style={{ height: CONTENT_H }}>
            {children}
          </div>
          <div className="flex items-end justify-between" style={{ height: FOOTER_H }}>
            <p className="text-[8.5px]" style={{ color: MUTED }}>
              {model!.fileBase} · prepared {fmtLong(generated)} · inputs for the wall-board redesign, not for members
            </p>
            <p className="text-[8.5px] font-semibold" style={{ color: MUTED }}>
              Page {n} of {totalPages || '…'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const weeksLine = model.weeks
    .map((w) => `W${w.index + 1}${w.monday ? ` (${fmtDate(w.monday)})` : ''}`)
    .join(' · ');
  const from = model.weeks[0]?.monday;
  const to = model.weeks[model.weeks.length - 1]?.monday;
  const backdrops = [
    ['Strength backdrop', 'bg-gym-dark.jpg', '960 x 1440'],
    ['ESD backdrop', 'bg-esd.jpg', '1536 x 2048'],
    ['Hyrox backdrop', 'bg-hyrox.jpg', '1536 x 2048'],
    ['Game Day backdrop', 'bg-gameday.jpg', '1536 x 2048'],
  ];

  return (
    <div className="min-h-screen bg-black py-8">
      {/* control bar */}
      <div className="fixed top-4 right-4 left-4 z-10 flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 backdrop-blur">
          <span>Stream</span>
          <select value={stream.id} onChange={(e) => setParam('stream', e.target.value)} className={select}>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 backdrop-blur">
          <span>{model.container.unit}</span>
          <select value={containerIndex} onChange={(e) => setParam('container', e.target.value)} className={select}>
            {stream.blocks.map((b, i) => (
              <option key={b.id} value={i}>
                {containerLabel(stream, i).label}
                {stream.cadence !== 'months' && stream.cadence !== 'blocks' && b.theme ? ` · ${b.theme}` : ''}
                {` · ${b.weeks.length} wk`}
              </option>
            ))}
          </select>
        </label>
        {windowCount > 1 && (
          <label className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 backdrop-blur">
            <span>Block</span>
            <select value={windowIndex} onChange={(e) => setParam('window', e.target.value)} className={select}>
              {Array.from({ length: windowCount }, (_, i) => {
                const len = windowsOf(stream.blocks[containerIndex]).length;
                const a = i * len + 1;
                const b = Math.min(stream.blocks[containerIndex].weeks.length, a + len - 1);
                return (
                  <option key={i} value={i}>
                    Block {i + 1} · weeks {a}–{b}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 backdrop-blur">
          <input type="checkbox" checked={includeBoards} onChange={(e) => setIncludeBoards(e.target.checked)} />
          <span>Include current boards</span>
        </label>
        <span className="text-xs text-white/60">
          {exporting ??
            (!ready
              ? 'Laying out…'
              : includeBoards && !boardsReady
                ? `Rendering boards ${Object.keys(boards).length} of ${rawSessions.length}…`
                : `${totalPages} pages · ${model.sessions.length} sessions`)}
        </span>
        <button type="button" disabled={Boolean(exporting) || !ready || !boardsReady} onClick={exportPdf} className={control}>
          Export PDF
        </button>
        <button type="button" disabled={Boolean(exporting)} onClick={exportJson} className={control}>
          Export JSON
        </button>
        <button type="button" onClick={() => navigate('/programming')} className={control}>
          Close
        </button>
      </div>

      {/* Measuring column: the same chunks at page width, never shown. */}
      <div
        ref={measureRef}
        aria-hidden
        className="fixed top-0 flex flex-col"
        style={{ left: -30000, width: CONTENT_W, gap: GAP, visibility: 'hidden', fontFamily: 'Mulish, sans-serif' }}
      >
        {flat.map((c) => (
          <div key={c.key}>{c.node}</div>
        ))}
      </div>

      {/* Boards rendered at full size off-screen and captured once settled. */}
      {includeBoards && (
        <div aria-hidden className="fixed top-0" style={{ left: -40000 }}>
          {rawSessions.map(({ pack, session }) => (
            <BoardCapture
              key={session.id}
              session={session}
              blockIndex={model.container.index}
              weekIndex={pack.weekIndex}
              blockWeeks={model.container.weeksTotal}
              theme={model.container.theme ?? undefined}
              cadence={model.stream.cadence}
              overrides={overrides!}
              blurb={blurbFor(session)}
              onCaptured={onCaptured}
            />
          ))}
        </div>
      )}

      <div ref={pagesRef} className="mt-12 flex flex-col items-center gap-8">
        {/* Cover */}
        {frame(
          'Cover and legend',
          <div className="flex h-full gap-10">
            <div className="flex w-[46%] flex-col">
              <p className="text-[11px] font-bold tracking-[0.45em]" style={{ color: PINE }}>
                TENERIFFE ATHLETIC CLUB
              </p>
              <h1 className="mt-4 text-[44px] leading-[1.02]" style={{ fontFamily: 'Fraunces, serif', color: CHARCOAL }}>
                Designer pack
                <br />
                <span style={{ color: PINE }}>{model.stream.name}</span>
              </h1>
              <p className="mt-3 text-[15px] font-semibold" style={{ color: PINE }}>
                {model.container.label}
                {model.container.theme && model.stream.cadence === 'phases' ? ` · ${model.container.theme}` : ''}
                {model.window.count > 1 ? ` · Block ${model.window.index + 1} of ${model.window.count}` : ''}
              </p>
              <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
                {from && to ? `Week of ${fmtDate(from)} to week of ${fmtDate(to)} · ` : ''}
                {model.weeks.length} week{model.weeks.length === 1 ? '' : 's'} · {model.sessions.length} written session
                {model.sessions.length === 1 ? '' : 's'} · days from the "{model.timetable}" timetable
              </p>
              <p className="mt-5 text-[12px] leading-relaxed" style={{ color: CHARCOAL }}>
                This pack holds every input a gym-TV board can carry for one block of programming, exactly as the
                coaching tool stores it. Each field is marked with where it goes today. The current board is rendered
                after each session for reference only: it is the layout being replaced, not a brief for the new one.
              </p>
              <div className="mt-5 space-y-2">
                {[
                  { badge: <Badge where="wall" />, text: model.legend.wall },
                  { badge: <Badge where="coach" />, text: model.legend.coach },
                  { badge: <Badge hidden />, text: model.legend.hidden },
                ].map((l, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-[150px] shrink-0 pt-0.5">{l.badge}</div>
                    <p className="text-[11px] leading-snug" style={{ color: CHARCOAL }}>
                      {l.text}
                    </p>
                  </div>
                ))}
                <div className="flex items-start gap-3">
                  <p className="w-[150px] shrink-0 pt-0.5 text-[9px] font-extrabold tracking-[0.14em] uppercase" style={{ color: PINE }}>
                    Scaled options
                  </p>
                  <p className="text-[11px] leading-snug" style={{ color: CHARCOAL }}>
                    {model.legend.scales}
                  </p>
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-[13px] italic" style={{ fontFamily: 'Fraunces, serif', color: PINE }}>
                  Train better, live better.
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <p className="border-b-[2px] pb-1 text-[12px] font-extrabold tracking-[0.06em]" style={{ borderColor: SAND, color: PINE }}>
                Sessions in this block
              </p>
              <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
                {weeksLine}
              </p>
              <ul className="mt-2 space-y-1">
                {model.sessions.map((s, i) => (
                  <li key={s.id} className="flex items-baseline gap-3 text-[11.5px]" style={{ color: CHARCOAL }}>
                    <span className="w-5 shrink-0 text-right font-bold" style={{ color: PINE }}>
                      {i + 1}
                    </span>
                    <span className="w-[130px] shrink-0 font-semibold">
                      W{s.weekIndex + 1}
                      {s.day ? ` · ${fmtDay(s.date)}` : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="shrink-0 text-[9.5px]" style={{ color: MUTED }}>
                      {s.kind === 'circuit'
                        ? `${s.pieces.length} piece${s.pieces.length === 1 ? '' : 's'}`
                        : `${s.parts.length} part${s.parts.length === 1 ? '' : 's'} · ${s.parts.reduce((n, p) => n + p.slots.length, 0)} movements`}
                    </span>
                  </li>
                ))}
                {model.sessions.length === 0 && (
                  <li className="text-[11.5px] italic" style={{ color: MUTED }}>
                    Nothing written yet in this block.
                  </li>
                )}
              </ul>
              {model.unwritten.length > 0 && (
                <p className="mt-2 text-[10px]" style={{ color: MUTED }}>
                  Not written yet, so not in this pack: {model.unwritten.join('; ')}.
                </p>
              )}

              <p className="mt-5 border-b-[2px] pb-1 text-[12px] font-extrabold tracking-[0.06em]" style={{ borderColor: SAND, color: PINE }}>
                The board today
              </p>
              <ul className="mt-2 space-y-1 text-[10.5px] leading-snug" style={{ color: CHARCOAL }}>
                <li>
                  Authored at {model.board.width} x {model.board.height} (16:9). Exports are available at{' '}
                  {BOARD_RESOLUTIONS.map((r) => r.label.split(' · ')[0]).join(', ')}; text re-rasterises sharp at any of them.
                </li>
                <li>
                  Palette: cream #F5F3EB, charcoal #201d1d, deep pine #003030, warm sand #DEC5AE. Display face Fraunces (stand-in for
                  Albra), body Mulish (stand-in for Avenir). The club style guide is the source of truth.
                </li>
                <li>
                  Backdrop photos, native pixels:{' '}
                  {backdrops.map(([what, file, px]) => `${what} ${file} ${px}`).join('; ')}. Better originals are welcome.
                </li>
                <li>
                  A session that runs long shrinks its type before anything is cut; the coach can also flag parts off the wall. The
                  board's fit is noted under each rendered board.
                </li>
                <li>Every field here is also in the JSON twin ({model.fileBase}.json), with where: "wall" or "coach" on each one.</li>
              </ul>
            </div>
          </div>,
        )}

        {/* Sessions */}
        {ready &&
          model.sessions.map((s, si) => (
            <div key={s.id} className="contents">
              {layout!.pages[si].map((idxs, pi) =>
                frame(
                  `${s.label} · week ${s.weekIndex + 1}${layout!.pages[si].length > 1 ? ` · ${pi + 1} of ${layout!.pages[si].length}` : ''}`,
                  <div className="flex flex-col" style={{ gap: GAP }}>
                    {idxs.map((i) => (
                      <div key={flat[i].key}>{flat[i].node}</div>
                    ))}
                  </div>,
                ),
              )}
              {includeBoards &&
                frame(
                  `${s.label} · week ${s.weekIndex + 1} · current board`,
                  <div className="flex h-full flex-col">
                    <p className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: PINE }}>
                      Current board · {model.board.width} x {model.board.height} · reference only
                    </p>
                    <div className="mt-2 min-h-0 flex-1">
                      {boards[s.id]?.png ? (
                        <img src={boards[s.id].png} alt="" style={{ width: CONTENT_W, height: (CONTENT_W * 9) / 16, display: 'block' }} />
                      ) : (
                        <div
                          className="flex items-center justify-center text-[12px] italic"
                          style={{ width: CONTENT_W, height: (CONTENT_W * 9) / 16, backgroundColor: CHARCOAL, color: SAND }}
                        >
                          {boards[s.id] ? 'Board could not be rendered.' : 'Rendering the board…'}
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-[9.5px]" style={{ color: MUTED }}>
                      {boards[s.id]
                        ? boards[s.id].fit.fitState === 'ok'
                          ? 'Fit: everything on the board at full type size.'
                          : boards[s.id].fit.fitState === 'small'
                            ? `Fit: everything on the board, but the work area is shrunk to ${Math.round(boards[s.id].fit.fit * 100)}% type. A long session; worth designing for.`
                            : `Fit: the board is at its ${Math.round(boards[s.id].fit.fit * 100)}% floor and work is still cut off. The new layout must hold more, or the coach flags parts off the wall.`
                        : ''}
                    </p>
                  </div>,
                )}
            </div>
          ))}
      </div>
    </div>
  );
}
