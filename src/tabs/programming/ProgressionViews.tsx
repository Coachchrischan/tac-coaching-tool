import type { ExerciseSlot, Session } from '../../types/documents';

/** Compact prescription string: "4×6 · 70% · RPE 8 · 31X1" */
export function slotSummary(slot: ExerciseSlot): string {
  return [
    slot.sets && slot.reps ? `${slot.sets}×${slot.reps}` : slot.sets || slot.reps,
    slot.load,
    slot.intensity,
    slot.rpe ? `RPE ${slot.rpe}` : undefined,
    slot.tempo,
  ]
    .filter(Boolean)
    .join(' · ');
}

const FOCUS_LABEL: Record<Session['focus'], string> = {
  lower: 'Lower',
  upper: 'Upper',
  full: 'Full Body',
  esd: 'ESD',
  hyrox: 'Hyrox',
};

export function sessionLabel(s: Session): string {
  return s.name || FOCUS_LABEL[s.focus];
}

// ---------- Progression grid: one session type, weeks side by side ----------

export interface GridColumn {
  label: string;
  session: Session | undefined;
  weekIndex: number; // within its block
  blockIndex: number;
}

interface GridRow {
  series: string;
  key: string;
  name: string;
  order: number;
  cells: (string | null)[];
}

function buildRows(columns: GridColumn[]): GridRow[] {
  const rows: GridRow[] = [];
  const index = new Map<string, GridRow>();
  columns.forEach((col, ci) => {
    col.session?.timedBlocks.forEach((tb) => {
      tb.slots.forEach((slot) => {
        if (!slot.name) return;
        const key = `${tb.label}::${slot.exerciseId ?? slot.name.toLowerCase()}`;
        let row = index.get(key);
        if (!row) {
          row = {
            series: tb.label,
            key,
            name: slot.name,
            order: rows.length,
            cells: Array<string | null>(columns.length).fill(null),
          };
          index.set(key, row);
          rows.push(row);
        }
        row.cells[ci] = slotSummary(slot) || '·';
      });
    });
  });
  return rows.sort((a, b) => a.series.localeCompare(b.series) || a.order - b.order);
}

export function ProgressionGrid({
  columns,
  onOpenColumn,
}: {
  columns: GridColumn[];
  onOpenColumn: (col: GridColumn) => void;
}) {
  const rows = buildRows(columns);
  const blockStart = (ci: number) =>
    ci > 0 && columns[ci].blockIndex !== columns[ci - 1].blockIndex;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-400">
        Nothing programmed for this session type yet. Program a week, then watch the progression fill
        in here.
      </p>
    );
  }

  let lastSeries = '';
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-52 border-b border-ink-200 bg-ink-950 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-white uppercase">
              Exercise
            </th>
            {columns.map((col, ci) => (
              <th
                key={ci}
                className={`min-w-28 border-b border-ink-200 bg-ink-950 px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-white uppercase ${
                  blockStart(ci) ? 'border-l-2 border-l-sand-500' : ''
                }`}
              >
                <button
                  type="button"
                  title="Open this week in the editor"
                  onClick={() => onOpenColumn(col)}
                  className="rounded px-1 hover:text-sand-500"
                >
                  {col.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const seriesHeader = row.series !== lastSeries;
            lastSeries = row.series;
            return (
              <tr key={row.key} className="group">
                <td
                  className={`sticky left-0 z-10 border-b border-ink-100 bg-white px-3 py-1.5 text-[13px] font-medium text-ink-950 ${
                    seriesHeader ? 'border-t-2 border-t-ink-200' : ''
                  }`}
                >
                  <span className="mr-1.5 inline-block w-5 rounded bg-accent-100 text-center text-[10px] font-bold text-accent-700">
                    {row.series}
                  </span>
                  {row.name}
                </td>
                {row.cells.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`border-b border-ink-100 px-2 py-1.5 text-center text-[12px] whitespace-nowrap ${
                      cell ? 'text-ink-700' : 'text-ink-300'
                    } ${seriesHeader ? 'border-t-2 border-t-ink-200' : ''} ${
                      blockStart(ci) ? 'border-l-2 border-l-sand-500' : ''
                    }`}
                  >
                    {cell ?? '-'}
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
