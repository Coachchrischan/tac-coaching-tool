import { useState } from 'react';
import type { DocId } from '../types/documents';

const DOCS: { id: DocId; label: string }[] = [
  { id: 'program', label: 'Programming' },
  { id: 'schedule', label: 'Timetable' },
  { id: 'annual-plan', label: 'Annual plan' },
  { id: 'layouts', label: 'Floor layouts' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'library-overrides', label: 'Exercise library overrides' },
  { id: 'planning', label: 'Planning' },
  { id: 'home', label: 'Home content' },
  { id: 'community', label: 'Community events' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'push-log', label: 'TrainHeroic push log' },
];

interface Snapshot {
  rev: number;
  updatedAt: string;
}

interface StoreStatus {
  backup: {
    lastAttemptAt: string | null;
    lastCommitAt: string | null;
    lastPushAt: string | null;
    lastError: string | null;
  };
  quarantines: string[];
  masterLag: number | null;
  machine: string;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never';

/**
 * The undo the store never had: every save snapshots the version it replaces
 * (data/_history/, 50 per document), and this panel restores one. A restore
 * snapshots what it replaces too, so it is always reversible.
 */
export default function DataSafetyPanel() {
  const [docId, setDocId] = useState<DocId>('program');
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Safety nets that fail silently are false comfort: the panel shows their
  // actual health, fetched when the panel is opened.
  const [status, setStatus] = useState<StoreStatus | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch('/api/store/_status');
      if (res.ok) setStatus((await res.json()) as StoreStatus);
    } catch {
      /* the panel still works without it */
    }
  }

  async function loadHistory(id: DocId) {
    setDocId(id);
    setSnapshots(null);
    const res = await fetch(`/api/store/${id}/history`);
    if (res.ok) {
      const body = (await res.json()) as { snapshots: Snapshot[] };
      setSnapshots(body.snapshots);
    } else {
      setSnapshots([]);
    }
  }

  async function restore(rev: number) {
    const label = DOCS.find((d) => d.id === docId)?.label ?? docId;
    const snap = snapshots?.find((s) => s.rev === rev);
    const when = snap ? new Date(snap.updatedAt).toLocaleString('en-AU') : `rev ${rev}`;
    if (
      !window.confirm(
        `Restore ${label} to the version saved ${when}?\n\nThe current version is snapshotted ` +
          `first, so this is reversible. Reload the page afterwards so every tab reads the ` +
          `restored version.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/store/${docId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rev }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        window.alert(`Restore failed: ${body.error ?? res.status}`);
        return;
      }
      window.alert(`${label} restored. Reloading so every tab reads it.`);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="mt-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) void loadStatus();
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-ink-950">
        Data safety: backups and restoring an earlier version
      </summary>
      {status && (
        <div className="mt-2 rounded-md bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
          <p>
            Off-machine backup: last pushed to GitHub <strong>{fmt(status.backup.lastPushAt)}</strong>
            {status.backup.lastError && (
              <span className="text-red-600"> · last error: {status.backup.lastError}</span>
            )}
          </p>
          {status.masterLag !== null && status.masterLag > 0 && (
            <p className="text-amber-700">
              {status.masterLag} code commit{status.masterLag === 1 ? '' : 's'} on this machine are
              not on GitHub yet. Push via the Launchpad when convenient (the data itself backs up
              separately).
            </p>
          )}
          {status.quarantines.length > 0 && (
            <p className="font-semibold text-red-600">
              Blocked documents need recovery: {status.quarantines.join(', ')}. Pick the document
              below and restore its newest snapshot; the corrupt file is archived automatically.
            </p>
          )}
        </div>
      )}
      <p className="mt-2 text-[13px] text-ink-500">
        Every save keeps the version it replaced (up to 250 for Programming, 50 to 100 for the
        rest). If a bulk copy or a deleted phase went wrong, pick the document and go back.
        Restoring snapshots the current version first, so nothing is ever lost by restoring, and
        a corrupt (blocked) document is recovered the same way.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DOCS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => void loadHistory(d.id)}
            className={`rounded-md border px-2.5 py-1 text-[12px] font-medium ${
              docId === d.id && snapshots !== null
                ? 'border-ink-950 bg-ink-950 text-white'
                : 'border-ink-300 text-ink-600 hover:text-ink-950'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {snapshots !== null && (
        <ul className="mt-3 max-h-56 divide-y divide-ink-100 overflow-auto">
          {snapshots.length === 0 && (
            <li className="py-2 text-[13px] text-ink-400">
              No snapshots yet: they accumulate as this document is saved.
            </li>
          )}
          {snapshots.map((s) => (
            <li key={s.rev} className="flex items-center gap-3 py-1.5 text-[13px]">
              <span className="w-16 font-mono text-ink-400">rev {s.rev}</span>
              <span className="text-ink-700">
                {s.updatedAt ? new Date(s.updatedAt).toLocaleString('en-AU') : 'unknown time'}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void restore(s.rev)}
                className="ml-auto rounded border border-ink-300 px-2 py-0.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-40"
              >
                Restore this version
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
