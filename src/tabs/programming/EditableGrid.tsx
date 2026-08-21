import type {
  ExerciseSlot,
  ProgramBlock,
  ProgramWeek,
  Session,
} from '../../types/documents';
import type { LibraryExercise, RankedExercise } from '../../lib/library';
import Combobox from '../../components/Combobox';

// Editable progression grids: Month (one block, four weeks side by side) and
// Phase (all three blocks, exercise column repeated per block). Both mirror
// Chris's Google Sheet layout: Seg | # | Exercise, then Sets/Reps/%/RPE per
// week, every prescription cell editable in place. Structural edits (adding
// or renaming exercises, load/tempo, scales) stay in the Week view.

/** Pin-points one slot inside the program document for targeted patches. */
export interface SlotRef {
  blockIndex: number;
  weekIndex: number;
  sessionId: string;
  timedBlockId: string;
  slotId: string;
  slot: ExerciseSlot;
}

/** A slot to create in a week that doesn't have this exercise yet. */
export interface AddTarget {
  blockIndex: number;
  weekIndex: number;
  sessionId: string;
  series: string;
  name: string;
  exerciseId: number | null;
}

export interface EditableRow {
  series: string; // display label, first seen
  seriesKey: string; // trimmed uppercase, for matching
  n: number; // 1-based position within the series
  name: string;
  exerciseId: number | null;
  cells: (SlotRef | null)[]; // one per week in the block
}

export interface BlockRows {
  blockIndex: number;
  weekSessions: (Session | undefined)[];
  rows: EditableRow[];
}

/**
 * Rows for one block, keyed by series + exercise identity so a week that
 * reorders its slots still lines up with its siblings. Series keep the order
 * they first appear in (WU before A before B), rows keep insertion order.
 */
export function buildBlockRows(
  block: ProgramBlock,
  blockIndex: number,
  match: (week: ProgramWeek) => Session | undefined,
): BlockRows {
  const weekSessions = block.weeks.map(match);
  const rows: (EditableRow & { order: number })[] = [];
  const index = new Map<string, EditableRow & { order: number }>();

  weekSessions.forEach((session, wi) => {
    if (!session) return;
    // Circuits have no editable exercise cells; the grids summarise them
    // read-only instead (see circuitSummaryRows).
    if (session.kind !== 'series') return;
    session.timedBlocks.forEach((tb) => {
      const seriesKey = tb.label.trim().toUpperCase();
      tb.slots.forEach((slot) => {
        if (!slot.name) return;
        const key = `${seriesKey}::${slot.exerciseId ?? slot.name.trim().toLowerCase()}`;
        let row = index.get(key);
        if (!row) {
          row = {
            series: tb.label.trim(),
            seriesKey,
            n: 0,
            name: slot.name,
            exerciseId: slot.exerciseId,
            order: rows.length,
            cells: Array<SlotRef | null>(block.weeks.length).fill(null),
          };
          index.set(key, row);
          rows.push(row);
        }
        if (!row.cells[wi]) {
          row.cells[wi] = {
            blockIndex,
            weekIndex: wi,
            sessionId: session.id,
            timedBlockId: tb.id,
            slotId: slot.id,
            slot,
          };
        }
      });
    });
  });

  const seriesOrder: string[] = [];
  for (const r of rows) if (!seriesOrder.includes(r.seriesKey)) seriesOrder.push(r.seriesKey);
  rows.sort(
    (a, b) =>
      seriesOrder.indexOf(a.seriesKey) - seriesOrder.indexOf(b.seriesKey) || a.order - b.order,
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    const n = (counts.get(r.seriesKey) ?? 0) + 1;
    counts.set(r.seriesKey, n);
    r.n = n;
  }
  return { blockIndex, weekSessions, rows };
}

// The four progressed prescription fields, matching the Sheet columns.
const GRID_FIELDS = [
  ['sets', 'Sets', 'w-9'],
  ['reps', 'Reps', 'w-14'],
  ['intensity', '%', 'w-14'],
  ['rpe', 'RPE', 'w-9'],
] as const;

const SEG_CHIP: Record<string, string> = {
  WU: 'bg-sand-500 text-ink-950',
  A: 'bg-accent-600 text-white',
  B: 'bg-accent-500 text-white',
  C: 'bg-ink-500 text-white',
};

const inputCls =
  'rounded border border-transparent bg-transparent px-1 py-1 text-center text-[12px] text-ink-950 placeholder:text-ink-200 hover:border-ink-200 focus:border-accent-600 focus:bg-white focus:outline-none';

const headCls =
  'border-b border-ink-200 bg-ink-950 px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-white uppercase';

const subHeadCls =
  'border-b border-ink-200 bg-ink-800 px-1 py-1 text-center text-[10px] font-semibold tracking-wide text-ink-300 uppercase';

/** Spreadsheet banding: row tint, week-column tint, both together. */
function cellShade(rowBand: boolean, colBand: boolean): string {
  if (rowBand && colBand) return 'bg-ink-100/70';
  if (rowBand) return 'bg-ink-50';
  if (colBand) return 'bg-ink-50/60';
  return 'bg-white';
}

/**
 * Circuits carry free text, not exercise cells, so they have no editable grid.
 * Show the week's pieces read-only, aligned by position, so the Block and
 * Phase views are not blank for ESD, Hyrox and Game Day. Editing stays in the
 * Week view.
 */
export function CircuitSummaryGrid({
  block,
  weekOffset = 0,
  onOpenWeek,
}: {
  block: BlockRows;
  weekOffset?: number;
  onOpenWeek: (weekIndex: number) => void;
}) {
  const weeks = block.weekSessions.map((s) => (s?.kind === 'circuit' ? s.circuit : []));
  const most = weeks.reduce((n, pieces) => Math.max(n, pieces.length), 0);
  if (most === 0) return <EmptyState />;

  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={`sticky left-0 z-10 w-20 text-left ${headCls}`}>Piece</th>
            {weeks.map((_, wi) => (
              <th key={wi} className={`${headCls} border-l-2 border-l-ink-700`}>
                <button
                  type="button"
                  title="Open this week in the editor"
                  onClick={() => onOpenWeek(weekOffset + wi)}
                  className="rounded px-1 uppercase hover:text-sand-500"
                >
                  Week {weekOffset + wi + 1}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: most }, (_, pi) => (
            <tr key={pi}>
              <td
                className={`sticky left-0 z-10 border-b border-ink-200 px-2 py-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase ${cellShade(pi % 2 === 1, false)}`}
              >
                {pi + 1}
              </td>
              {weeks.map((pieces, wi) => {
                const piece = pieces[pi];
                return (
                  <td
                    key={wi}
                    className={`border-b border-l-2 border-ink-200 border-l-ink-200 px-2 py-2 align-top text-[12px] leading-relaxed text-ink-950 ${cellShade(pi % 2 === 1, wi % 2 === 1)}`}
                  >
                    {piece ? (
                      <>
                        <span className="block font-semibold">{piece.heading}</span>
                        {piece.lines
                          .filter((l) => l.text.trim())
                          .map((l, li) => (
                            <span key={li} className="block text-ink-500">
                              {l.text}
                              {l.load && <span className="text-ink-700"> · {l.load}</span>}
                            </span>
                          ))}
                        {piece.restAfter?.trim() && (
                          <span className="mt-0.5 block text-[11px] text-ink-400 italic">
                            rest {piece.restAfter}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-300">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-400">
      Nothing programmed for this session type yet. Program a week, then edit the whole
      progression here.
    </p>
  );
}

function SegChip({ series }: { series: string }) {
  const cls = SEG_CHIP[series.toUpperCase()] ?? 'bg-ink-700 text-white';
  return (
    <span
      className={`inline-block min-w-6 rounded px-1 text-center text-[10px] font-bold ${cls}`}
    >
      {series}
    </span>
  );
}

/** The 4 editable cells for one row/week, or an add/dash placeholder. */
function WeekCells({
  row,
  cellIndex,
  weekIndex,
  session,
  blockIndex,
  topBorder,
  shade,
  onEdit,
  onAdd,
}: {
  row: EditableRow;
  cellIndex: number; // index into row.cells (may be a sliced window)
  weekIndex: number; // absolute week index within the phase
  session: Session | undefined;
  blockIndex: number;
  topBorder: string;
  shade: string; // alternating week-column tint
  onEdit: (ref: SlotRef, patch: Partial<ExerciseSlot>) => void;
  onAdd: (t: AddTarget) => void;
}) {
  const ref = row.cells[cellIndex];
  if (!ref) {
    return (
      <td
        colSpan={GRID_FIELDS.length}
        className={`border-b border-ink-100 border-l-2 border-l-ink-100 px-2 py-1.5 text-center ${shade} ${topBorder}`}
      >
        {session ? (
          <button
            type="button"
            title={`Add ${row.name} to this week's ${row.series} series`}
            onClick={() =>
              onAdd({
                blockIndex,
                weekIndex,
                sessionId: session.id,
                series: row.series,
                name: row.name,
                exerciseId: row.exerciseId,
              })
            }
            className="w-full rounded px-2 text-[11px] text-ink-200 italic hover:text-accent-600"
          >
            click to add exercise
          </button>
        ) : (
          <span className="text-ink-200">–</span>
        )}
      </td>
    );
  }
  return (
    <>
      {GRID_FIELDS.map(([key, label, width], fi) => (
        <td
          key={key}
          className={`border-b border-ink-100 px-0.5 py-0.5 text-center ${
            fi === 0 ? 'border-l-2 border-l-ink-100' : ''
          } ${shade} ${topBorder}`}
        >
          <input
            className={`${inputCls} ${width}`}
            placeholder={label === '%' ? '%' : undefined}
            value={ref.slot[key] ?? ''}
            onChange={(e) => onEdit(ref, { [key]: e.target.value })}
          />
        </td>
      ))}
    </>
  );
}

// ---------- Month view: one block, four editable weeks side by side ----------

/**
 * Copy this exercise's first-week prescription across the rest of the block.
 *
 * Warm-ups and most accessories repeat week to week, so typing the same four
 * numbers four times is the bulk of building a block. It is per row on purpose:
 * the main lifts wave 9/7/5 and must NOT be flattened, so the coach chooses
 * which rows repeat.
 */
function CopyAcrossCell({
  row,
  topBorder,
  stickyBg,
  onEdit,
}: {
  row: EditableRow;
  topBorder: string;
  stickyBg: string;
  onEdit: (ref: SlotRef, patch: Partial<ExerciseSlot>) => void;
}) {
  const source = row.cells[0];
  const targets = row.cells.slice(1).filter((c): c is SlotRef => c !== null);
  const filled = source
    ? GRID_FIELDS.some(([key]) => (source.slot[key] ?? '').toString().trim() !== '')
    : false;
  const canCopy = Boolean(source) && filled && targets.length > 0;

  return (
    <td
      className={`w-9 border-b border-ink-100 border-l-2 border-l-ink-100 px-1 py-1.5 text-center ${stickyBg} ${topBorder}`}
    >
      <button
        type="button"
        disabled={!canCopy}
        title={
          !source || !filled
            ? 'Fill in the first week to copy it across'
            : targets.length === 0
              ? 'Nothing after this week to copy into'
              : `Copy week 1's sets, reps, % and RPE into the next ${targets.length} week${targets.length === 1 ? '' : 's'}`
        }
        aria-label={`Copy ${row.name} across the block`}
        onClick={() => {
          const patch: Partial<ExerciseSlot> = {};
          for (const [key] of GRID_FIELDS) patch[key] = source!.slot[key] ?? '';
          for (const ref of targets) onEdit(ref, patch);
        }}
        className="rounded px-1 py-0.5 text-[13px] leading-none text-ink-300 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-25"
      >
        »
      </button>
    </td>
  );
}

export function MonthGrid({
  block,
  weekOffset = 0,
  onEdit,
  onAdd,
  onOpenWeek,
}: {
  block: BlockRows;
  weekOffset?: number; // when block is a sliced window, the absolute index of its first week
  onEdit: (ref: SlotRef, patch: Partial<ExerciseSlot>) => void;
  onAdd: (t: AddTarget) => void;
  onOpenWeek: (weekIndex: number) => void;
}) {
  // ESD, Hyrox and Game Day never produce editable rows; summarise instead of
  // showing an empty grid, which read as "nothing programmed" for a written week.
  if (block.rows.length === 0) {
    if (block.weekSessions.some((s) => s?.kind === 'circuit')) {
      return <CircuitSummaryGrid block={block} weekOffset={weekOffset} onOpenWeek={onOpenWeek} />;
    }
    return <EmptyState />;
  }

  let lastSeries = '';
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th rowSpan={2} className={`sticky left-0 z-10 w-9 ${headCls}`}>
              Seg
            </th>
            <th rowSpan={2} className={`sticky left-9 z-10 w-7 ${headCls}`}>
              #
            </th>
            <th rowSpan={2} className={`sticky left-16 z-10 min-w-48 text-left ${headCls}`}>
              Exercise
            </th>
            {block.weekSessions.map((_, wi) => (
              <th key={wi} colSpan={GRID_FIELDS.length} className={`${headCls} border-l-2 border-l-ink-700`}>
                <button
                  type="button"
                  title="Open this week in the editor"
                  onClick={() => onOpenWeek(weekOffset + wi)}
                  className="rounded px-1 uppercase hover:text-sand-500"
                >
                  Week {weekOffset + wi + 1}
                </button>
              </th>
            ))}
            <th
              rowSpan={2}
              className={`w-9 ${headCls} border-l-2 border-l-ink-700`}
              title="Copy the first week's prescription across the rest of the block, row by row"
            >
              Copy
            </th>
          </tr>
          <tr>
            {block.weekSessions.map((_, wi) =>
              GRID_FIELDS.map(([key, label], fi) => (
                <th
                  key={`${wi}-${key}`}
                  className={`${subHeadCls} ${fi === 0 ? 'border-l-2 border-l-ink-700' : ''}`}
                >
                  {label}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => {
            const seriesStart = row.seriesKey !== lastSeries;
            lastSeries = row.seriesKey;
            const topBorder = seriesStart ? 'border-t-2 border-t-ink-200' : '';
            // Spreadsheet banding: every second ROW tinted, and every second
            // WEEK column tinted again, so a cell is easy to trace both ways.
            const rowBand = ri % 2 === 1;
            const stickyBg = rowBand ? 'bg-ink-50' : 'bg-white';
            return (
              <tr key={`${row.seriesKey}-${row.n}`}>
                <td className={`sticky left-0 z-10 w-9 border-b border-ink-100 px-1.5 py-1.5 text-center ${stickyBg} ${topBorder}`}>
                  <SegChip series={row.series} />
                </td>
                <td className={`sticky left-9 z-10 w-7 border-b border-ink-100 px-1 py-1.5 text-center text-[11px] text-ink-400 ${stickyBg} ${topBorder}`}>
                  {row.n}
                </td>
                <td
                  className={`sticky left-16 z-10 min-w-48 border-b border-ink-100 px-2 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-950 ${stickyBg} ${topBorder}`}
                  title={row.name}
                >
                  {row.name}
                </td>
                {block.weekSessions.map((session, wi) => (
                  <WeekCells
                    key={wi}
                    row={row}
                    cellIndex={wi}
                    weekIndex={weekOffset + wi}
                    session={session}
                    blockIndex={block.blockIndex}
                    topBorder={topBorder}
                    shade={cellShade(rowBand, (weekOffset + wi) % 2 === 1)}
                    onEdit={onEdit}
                    onAdd={onAdd}
                  />
                ))}
                <CopyAcrossCell row={row} topBorder={topBorder} stickyBg={stickyBg} onEdit={onEdit} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Phase view: all blocks, exercise column repeated per block ----------

interface PhaseRow {
  series: string;
  seriesKey: string;
  n: number;
  perBlock: (EditableRow | null)[];
}

function buildPhaseRows(blocks: BlockRows[], withSpareRow = false): PhaseRow[] {
  const seriesOrder: string[] = [];
  const display = new Map<string, string>();
  for (const b of blocks)
    for (const r of b.rows) {
      if (!seriesOrder.includes(r.seriesKey)) {
        seriesOrder.push(r.seriesKey);
        display.set(r.seriesKey, r.series);
      }
    }
  const out: PhaseRow[] = [];
  for (const seriesKey of seriesOrder) {
    const perBlockLists = blocks.map((b) => b.rows.filter((r) => r.seriesKey === seriesKey));
    const max = Math.max(...perBlockLists.map((l) => l.length));
    // The spare row (exercise planning view only) lets the coach start a new
    // position in any block without a trip to the Week view.
    const upTo = withSpareRow ? max + 1 : max;
    for (let i = 0; i < upTo; i++) {
      out.push({
        series: display.get(seriesKey) ?? seriesKey,
        seriesKey,
        n: i + 1,
        perBlock: perBlockLists.map((l) => l[i] ?? null),
      });
    }
  }
  return out;
}

// ---------- Phase exercise view: phase-to-phase exercise planning, no prescriptions ----------
//
// One column per block, exercise names only, side by side. This is where the
// coach plans which accessories rotate every four weeks while the compounds
// hold. Committing an exercise into an empty cell creates it in every week of
// that block (same series); committing over an existing one renames it across
// the block, keeping each week's prescription.

export function PhaseExerciseGrid({
  blocks,
  themes,
  search,
  onCommitCell,
  onRemoveCell,
}: {
  blocks: BlockRows[];
  themes: (string | undefined)[];
  search: (query: string) => RankedExercise[];
  onCommitCell: (
    blockIndex: number,
    series: string,
    n: number,
    row: EditableRow | null,
    name: string,
    exercise: LibraryExercise | null,
  ) => void;
  onRemoveCell: (blockIndex: number, row: EditableRow) => void;
}) {
  const rows = buildPhaseRows(blocks, true);
  if (rows.length === 0) return <EmptyState />;

  let lastSeries = '';
  // No overflow container: the grid is narrow and the exercise dropdowns
  // must be free to extend past the table edge.
  return (
    <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={`w-9 rounded-tl-xl ${headCls}`}>Seg</th>
            <th className={`w-7 ${headCls}`}>#</th>
            {blocks.map((_b, bi) => (
              <th
                key={bi}
                className={`${headCls} border-l-2 border-l-sand-500 text-left ${
                  bi === blocks.length - 1 ? 'rounded-tr-xl' : ''
                }`}
              >
                Phase {bi + 1}
                {themes[bi] ? (
                  <span className="ml-2 font-normal normal-case text-ink-300">{themes[bi]}</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const seriesStart = row.seriesKey !== lastSeries;
            lastSeries = row.seriesKey;
            const topBorder = seriesStart ? 'border-t-2 border-t-ink-200' : '';
            const rowBand = ri % 2 === 1;
            return (
              <tr key={`${row.seriesKey}-${row.n}`} className="group">
                <td
                  className={`w-9 border-b border-ink-100 px-1.5 py-1.5 text-center ${
                    rowBand ? 'bg-ink-50' : ''
                  } ${topBorder}`}
                >
                  <SegChip series={row.series} />
                </td>
                <td
                  className={`w-7 border-b border-ink-100 px-1 py-1.5 text-center text-[11px] text-ink-400 ${
                    rowBand ? 'bg-ink-50' : ''
                  } ${topBorder}`}
                >
                  {row.n}
                </td>
                {row.perBlock.map((blockRow, bi) => (
                  <td
                    key={bi}
                    className={`border-b border-ink-100 border-l-2 border-l-sand-500/60 px-1.5 py-1 ${cellShade(
                      rowBand,
                      bi % 2 === 1,
                    )} ${topBorder}`}
                  >
                    <div className="flex items-center gap-1">
                      <Combobox
                        value={blockRow?.name ?? ''}
                        search={search}
                        placeholder="Add exercise…"
                        onCommit={(name, ex) =>
                          onCommitCell(blocks[bi].blockIndex, row.series, row.n, blockRow, name, ex)
                        }
                      />
                      {blockRow && (
                        <button
                          type="button"
                          title={`Remove ${blockRow.name} from every week of Phase ${blocks[bi].blockIndex + 1}`}
                          onClick={() => onRemoveCell(blocks[bi].blockIndex, blockRow)}
                          className="shrink-0 rounded px-1 py-0.5 text-sm text-ink-200 hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
