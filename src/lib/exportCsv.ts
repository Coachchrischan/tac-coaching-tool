// Exports the whole program (any block/week shape) as a CSV that opens cleanly in Google
// Sheets (File > Import, or drag onto a Sheet). One row per exercise per
// session type, one column per week, cells are the compact prescription.

import type { ProgramDoc, Session } from '../types/documents';
import { slotSummary } from '../tabs/programming/ProgressionViews';
import { circuitParts, seriesBlocks, sessionLabel, streamsOf } from './programStreams';
import { lineToText } from './circuit';

function esc(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function programToCsv(doc: ProgramDoc): string {
  // Exports the active shape: every stream's phases, week by week.
  const blocks = streamsOf(doc).flatMap((s) => s.blocks);
  const weekLabels = blocks.flatMap((b, i) => b.weeks.map((_, w) => `P${i + 1} W${w + 1}`));

  // Distinct session identities (custom name first, then focus) in first-seen order.
  const identities: { key: string; label: string; match: (s: Session) => boolean }[] = [];
  for (const block of blocks) {
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
    const sessions = blocks.flatMap((b) => b.weeks.map((w) => w.sessions.find(identity.match)));
    // Union of (series, exercise) rows in first-seen order.
    const rows = new Map<string, { series: string; name: string; cells: (string | null)[] }>();
    const rowFor = (key: string, series: string, name: string) => {
      let row = rows.get(key);
      if (!row) {
        row = { series, name, cells: Array<string | null>(sessions.length).fill(null) };
        rows.set(key, row);
      }
      return row;
    };

    sessions.forEach((session, ci) => {
      if (!session) return;
      if (session.kind === 'circuit') {
        // A circuit has no exercise rows: every week holds its own pieces.
        // Align them by position so one piece reads across the weeks, with the
        // heading and its movement lines together in the cell.
        session.circuit.forEach((piece, pi) => {
          const label = `Piece ${pi + 1}`;
          const row = rowFor(`circuit::${pi}`, label, '');
          const body = [piece.heading.trim(), ...piece.lines.map((l) => lineToText(l).trim()).filter(Boolean)]
            .filter(Boolean)
            .join(' / ');
          const rest = piece.restAfter?.trim();
          row.cells[ci] = [body, rest ? `rest ${rest}` : null].filter(Boolean).join(' / ') || '·';
        });
        return;
      }
      seriesBlocks(session.timedBlocks).forEach((tb) => {
        tb.slots.forEach((slot) => {
          if (!slot.name) return;
          // Key by name as well as id: a variation carries the base lift's id
          // for its video (Tempo Barbell Bench Press on the bench press id),
          // and keying by id alone merged it into the base lift's row.
          const key = `${tb.label}::${slot.exerciseId ?? ''}::${slot.name.toLowerCase()}`;
          const row = rowFor(key, tb.label, slot.name);
          row.cells[ci] = slotSummary(slot) || '·';
        });
      });
      // Challenge finishers are circuit parts inside a series session; the
      // wall board shows them, so the spreadsheet must too.
      circuitParts(session.timedBlocks).forEach((part) => {
        part.pieces.forEach((piece, pi) => {
          const body = [piece.heading.trim(), ...piece.lines.map((l) => lineToText(l).trim()).filter(Boolean)]
            .filter(Boolean)
            .join(' / ');
          if (!body) return;
          const row = rowFor(`part::${part.label}::${pi}`, part.label, '');
          row.cells[ci] = body;
        });
      });
    });
    if (rows.size === 0) continue;

    lines.push(''); // blank spacer row
    lines.push(esc(identity.label.toUpperCase()));
    for (const row of [...rows.values()].sort((a, b) => a.series.localeCompare(b.series))) {
      const label = row.name ? `${row.series} ${row.name}` : row.series;
      lines.push([esc(label), ...row.cells.map((c) => esc(c ?? ''))].join(','));
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
