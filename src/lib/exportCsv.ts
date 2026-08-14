// Exports the whole program (any block/week shape) as a CSV that opens cleanly in Google
// Sheets (File > Import, or drag onto a Sheet). One row per exercise per
// session type, one column per week, cells are the compact prescription.

import type { ProgramDoc, Session } from '../types/documents';
import { sessionLabel, slotSummary } from '../tabs/programming/ProgressionViews';

function esc(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function programToCsv(doc: ProgramDoc): string {
  const weekLabels = doc.blocks.flatMap((_, b) =>
    doc.blocks[b].weeks.map((_, w) => `B${b + 1} W${w + 1}`),
  );

  // Distinct session identities (custom name first, then focus) in first-seen order.
  const identities: { key: string; label: string; match: (s: Session) => boolean }[] = [];
  for (const block of doc.blocks) {
    for (const week of block.weeks) {
      for (const session of week.sessions) {
        const key = session.name || session.focus;
        if (!identities.some((i) => i.key === key)) {
          identities.push({
            key,
            label: sessionLabel(session),
            match: (s) => (s.name || s.focus) === key,
          });
        }
      }
    }
  }

  const lines: string[] = [];
  lines.push([esc(doc.name), ...weekLabels.map(esc)].join(','));

  for (const identity of identities) {
    const sessions = doc.blocks.flatMap((b) =>
      b.weeks.map((w) => w.sessions.find(identity.match)),
    );
    // Union of (series, exercise) rows in first-seen order.
    const rows = new Map<string, { series: string; name: string; cells: (string | null)[] }>();
    sessions.forEach((session, ci) => {
      session?.timedBlocks.forEach((tb) => {
        tb.slots.forEach((slot) => {
          if (!slot.name) return;
          const key = `${tb.label}::${slot.exerciseId ?? slot.name.toLowerCase()}`;
          let row = rows.get(key);
          if (!row) {
            row = {
              series: tb.label,
              name: slot.name,
              cells: Array<string | null>(sessions.length).fill(null),
            };
            rows.set(key, row);
          }
          row.cells[ci] = slotSummary(slot) || '·';
        });
      });
    });
    if (rows.size === 0) continue;

    lines.push(''); // blank spacer row
    lines.push(esc(identity.label.toUpperCase()));
    for (const row of [...rows.values()].sort((a, b) => a.series.localeCompare(b.series))) {
      lines.push(
        [esc(`${row.series} ${row.name}`), ...row.cells.map((c) => esc(c ?? ''))].join(','),
      );
    }
  }

  return lines.join('\r\n');
}

export function downloadProgramCsv(doc: ProgramDoc) {
  const csv = programToCsv(doc);
  const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'program';
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tac-${slug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
