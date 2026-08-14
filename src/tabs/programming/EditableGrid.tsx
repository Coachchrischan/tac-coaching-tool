import type { ReactNode } from 'react';
import type {
  ExerciseSlot,
  ProgramBlock,
  ProgramWeek,
  Session,
} from '../../types/documents';

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
  weekIndex,
  session,
  blockIndex,
  topBorder,
  onEdit,
  onAdd,
}: {
  row: EditableRow;
  weekIndex: number;
  session: Session | undefined;
  blockIndex: number;
  topBorder: string;
  onEdit: (ref: SlotRef, patch: Partial<ExerciseSlot>) => void;
  onAdd: (t: AddTarget) => void;
}) {
  const ref = row.cells[weekIndex];
  if (!ref) {
    return (
      <td
        colSpan={GRID_FIELDS.length}
        className={`border-b border-ink-100 border-l-2 border-l-ink-100 px-2 py-1.5 text-center ${topBorder}`}
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
            className="rounded px-2 text-[11px] font-medium text-ink-300 hover:text-accent-600"
          >
            + add
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
          } ${topBorder}`}
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

export function MonthGrid({
  block,
  onEdit,
  onAdd,
  onOpenWeek,
}: {
  block: BlockRows;
  onEdit: (ref: SlotRef, patch: Partial<ExerciseSlot>) => void;
  onAdd: (t: AddTarget) => void;
  onOpenWeek: (weekIndex: number) => void;
}) {
  if (block.rows.length === 0) return <EmptyState />;

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
                  onClick={() => onOpenWeek(wi)}
                  className="rounded px-1 uppercase hover:text-sand-500"
                >
                  Week {wi + 1}
                </button>
              </th>
            ))}
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
          {block.rows.map((row) => {
            const seriesStart = row.seriesKey !== lastSeries;
            lastSeries = row.seriesKey;
            const topBorder = seriesStart ? 'border-t-2 border-t-ink-200' : '';
            return (
              <tr key={`${row.seriesKey}-${row.n}`}>
                <td className={`sticky left-0 z-10 w-9 border-b border-ink-100 bg-white px-1.5 py-1.5 text-center ${topBorder}`}>
                  <SegChip series={row.series} />
                </td>
                <td className={`sticky left-9 z-10 w-7 border-b border-ink-100 bg-white px-1 py-1.5 text-center text-[11px] text-ink-400 ${topBorder}`}>
                  {row.n}
                </td>
                <td
                  className={`sticky left-16 z-10 min-w-48 border-b border-ink-100 bg-white px-2 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-950 ${topBorder}`}
                  title={row.name}
                >
                  {row.name}
                </td>
                {block.weekSessions.map((session, wi) => (
                  <WeekCells
                    key={wi}
                    row={row}
                    weekIndex={wi}
                    session={session}
                    blockIndex={block.blockIndex}
                    topBorder={topBorder}
                    onEdit={onEdit}
                    onAdd={onAdd}
                  />
                ))}
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

function buildPhaseRows(blocks: BlockRows[]): PhaseRow[] {
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
    for (let i = 0; i < max; i++) {
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

export function PhaseGrid({
  blocks,
  themes,
  onEdit,
  onAdd,
  onOpenWeek,
}: {
  blocks: BlockRows[];
  themes: (string | undefined)[];
  onEdit: (ref: SlotRef, patch: Partial<ExerciseSlot>) => void;
  onAdd: (t: AddTarget) => void;
  onOpenWeek: (blockIndex: number, weekIndex: number) => void;
}) {
  const rows = buildPhaseRows(blocks);
  if (rows.length === 0) return <EmptyState />;

  const blockSpan = (b: BlockRows) => 1 + b.weekSessions.length * GRID_FIELDS.length;

  let lastSeries = '';
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th rowSpan={3} className={`sticky left-0 z-10 w-9 ${headCls}`}>
              Seg
            </th>
            <th rowSpan={3} className={`sticky left-9 z-10 w-7 ${headCls}`}>
              #
            </th>
            {blocks.map((b, bi) => (
              <th key={bi} colSpan={blockSpan(b)} className={`${headCls} border-l-2 border-l-sand-500`}>
                Block {bi + 1}
                {themes[bi] ? <span className="ml-2 font-normal normal-case text-ink-300">{themes[bi]}</span> : null}
              </th>
            ))}
          </tr>
          <tr>
            {blocks.map((b, bi) => (
              <FragmentRow key={bi}>
                <th rowSpan={2} className={`min-w-44 text-left ${headCls} border-l-2 border-l-sand-500`}>
                  Exercise
                </th>
                {b.weekSessions.map((_, wi) => (
                  <th key={wi} colSpan={GRID_FIELDS.length} className={headCls}>
                    <button
                      type="button"
                      title="Open this week in the editor"
                      onClick={() => onOpenWeek(bi, wi)}
                      className="rounded px-1 uppercase hover:text-sand-500"
                    >
                      W{wi + 1}
                    </button>
                  </th>
                ))}
              </FragmentRow>
            ))}
          </tr>
          <tr>
            {blocks.map((b, bi) =>
              b.weekSessions.map((_, wi) =>
                GRID_FIELDS.map(([key, label]) => (
                  <th key={`${bi}-${wi}-${key}`} className={subHeadCls}>
                    {label}
                  </th>
                )),
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const seriesStart = row.seriesKey !== lastSeries;
            lastSeries = row.seriesKey;
            const topBorder = seriesStart ? 'border-t-2 border-t-ink-200' : '';
            return (
              <tr key={`${row.seriesKey}-${row.n}`}>
                <td className={`sticky left-0 z-10 w-9 border-b border-ink-100 bg-white px-1.5 py-1.5 text-center ${topBorder}`}>
                  <SegChip series={row.series} />
                </td>
                <td className={`sticky left-9 z-10 w-7 border-b border-ink-100 bg-white px-1 py-1.5 text-center text-[11px] text-ink-400 ${topBorder}`}>
                  {row.n}
                </td>
                {row.perBlock.map((blockRow, bi) => {
                  const b = blocks[bi];
                  if (!blockRow) {
                    return (
                      <td
                        key={bi}
                        colSpan={blockSpan(b)}
                        className={`border-b border-ink-100 border-l-2 border-l-sand-500/60 px-2 py-1.5 text-center text-ink-200 ${topBorder}`}
                      >
                        –
                      </td>
                    );
                  }
                  return (
                    <FragmentRow key={bi}>
                      <td
                        className={`min-w-44 border-b border-ink-100 border-l-2 border-l-sand-500/60 px-2 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-950 ${topBorder}`}
                        title={blockRow.name}
                      >
                        {blockRow.name}
                      </td>
                      {b.weekSessions.map((session, wi) => (
                        <WeekCells
                          key={wi}
                          row={blockRow}
                          weekIndex={wi}
                          session={session}
                          blockIndex={b.blockIndex}
                          topBorder={topBorder}
                          onEdit={onEdit}
                          onAdd={onAdd}
                        />
                      ))}
                    </FragmentRow>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// React fragments can't take className, but we need keyed groups of cells.
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
