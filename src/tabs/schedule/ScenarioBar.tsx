import { useState } from 'react';
import type { ScheduleDoc, WeekScenario } from '../../types/documents';
import { liveIsAssumed, liveScenario, viewedScenario } from '../../lib/scenarios';
import { isoDate } from '../../lib/trainingWeeks';

const btn =
  'rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40';

export default function ScenarioBar({
  doc,
  onUpdate,
}: {
  doc: ScheduleDoc;
  onUpdate: (fn: (d: ScheduleDoc) => ScheduleDoc) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const active = viewedScenario(doc) ?? doc.scenarios[0];
  // While nothing has been marked current the live pointer is only a fallback,
  // so no week is badged as current: the button stays on offer everywhere and
  // the state reads as undecided rather than quietly decided.
  const assumed = liveIsAssumed(doc);
  const live = assumed ? undefined : liveScenario(doc);
  const viewingLive = !!live && live.id === active.id;

  // Retired weeks stay in the document so a format can come back; they just
  // drop out of the way while a new one is being planned.
  const current = doc.scenarios.filter((s) => !s.archived || s.id === active.id);
  const archived = doc.scenarios.filter((s) => s.archived && s.id !== active.id);

  function duplicate() {
    const copy: WeekScenario = {
      id: crypto.randomUUID(),
      name: `Copy of ${active.name}`,
      blocks: active.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })),
    };
    onUpdate((d) => ({
      ...d,
      scenarios: [...d.scenarios, copy],
      activeScenarioId: copy.id,
    }));
  }

  function addEmpty() {
    const fresh: WeekScenario = { id: crypto.randomUUID(), name: 'New week', blocks: [] };
    onUpdate((d) => ({
      ...d,
      scenarios: [...d.scenarios, fresh],
      activeScenarioId: fresh.id,
    }));
  }

  /**
   * Promote the week on screen to the club's real timetable, and retire the
   * one it replaces. The outgoing format is archived rather than deleted:
   * while a change is being planned it has to be possible to go back to the
   * week the club was actually running.
   */
  function makeCurrent() {
    const outgoing = live && live.id !== active.id ? live : null;
    const consequences = [
      `"${active.name}" becomes the current format.`,
      'The days sessions are pushed to TrainHeroic come from it,',
      'Home shows its classes as on today,',
      'and floor layouts size themselves off how often its classes run.',
      outgoing ? `\n"${outgoing.name}" is archived. You can bring it back at any time.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (!window.confirm(`Make "${active.name}" the current format?\n\n${consequences}`)) return;

    const today = isoDate(new Date());
    onUpdate((d) => ({
      ...d,
      liveScenarioId: active.id,
      scenarios: d.scenarios.map((s) => {
        // The incoming format is live, so it is never archived.
        if (s.id === active.id) {
          const { archived: _archived, archivedOn: _archivedOn, ...rest } = s;
          return rest;
        }
        if (outgoing && s.id === outgoing.id) return { ...s, archived: true, archivedOn: today };
        return s;
      }),
    }));
  }

  /** Bring an archived week back into the working list without making it live. */
  function restore() {
    onUpdate((d) => ({
      ...d,
      scenarios: d.scenarios.map((s) => {
        if (s.id !== active.id) return s;
        const { archived: _archived, archivedOn: _archivedOn, ...rest } = s;
        return rest;
      }),
    }));
  }

  function remove() {
    if (doc.scenarios.length <= 1) return;
    // Deleting the week the club is actually running would silently hand the
    // push and the Today panel to whatever week happened to be next.
    if (viewingLive) {
      window.alert(
        `"${active.name}" is the current format, so it cannot be deleted.\n\nMake another week current first, then delete this one.`,
      );
      return;
    }
    if (!window.confirm(`Delete scenario "${active.name}"? This cannot be undone.`)) return;
    onUpdate((d) => {
      const remaining = d.scenarios.filter((s) => s.id !== active.id);
      return { ...d, scenarios: remaining, activeScenarioId: remaining[0].id };
    });
  }

  const label = (s: WeekScenario) =>
    `${s.name}${s.id === live?.id ? ' (current format)' : ''}${
      s.archived ? ` (archived${s.archivedOn ? ` ${s.archivedOn}` : ''})` : ''
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Week layout</span>
      {renaming ? (
        <input
          autoFocus
          className="rounded-md border border-accent-600 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-950 focus:outline-none"
          value={active.name}
          onChange={(e) =>
            onUpdate((d) => ({
              ...d,
              scenarios: d.scenarios.map((s) =>
                s.id === active.id ? { ...s, name: e.target.value } : s,
              ),
            }))
          }
          onBlur={() => setRenaming(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <select
          className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-950 focus:border-accent-600 focus:outline-none"
          value={active.id}
          onChange={(e) => onUpdate((d) => ({ ...d, activeScenarioId: e.target.value }))}
        >
          {current.map((s) => (
            <option key={s.id} value={s.id}>
              {label(s)}
            </option>
          ))}
          {archived.length > 0 && (
            <optgroup label="Archived">
              {archived.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
      {viewingLive ? (
        <span
          className="rounded-md border border-accent-600 bg-accent-600 px-2.5 py-1.5 text-sm font-semibold text-white"
          title="This is the week the club runs, and the one the TrainHeroic push reads"
        >
          Current format
        </span>
      ) : (
        <button
          type="button"
          className="rounded-md border border-accent-600 bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          onClick={makeCurrent}
          title="Make this the week the club runs. The format it replaces is archived, not deleted."
        >
          Make this the current format
        </button>
      )}
      {active.archived && (
        <button type="button" className={btn} onClick={restore} title="Take this week out of the archive">
          Restore
        </button>
      )}
      <button type="button" className={btn} onClick={() => setRenaming(true)}>
        Rename
      </button>
      <button type="button" className={btn} onClick={duplicate}>
        Duplicate week
      </button>
      <button type="button" className={btn} onClick={addEmpty}>
        New empty week
      </button>
      <button
        type="button"
        className={btn}
        disabled={doc.scenarios.length <= 1 || viewingLive}
        title={viewingLive ? 'The current format cannot be deleted' : undefined}
        onClick={remove}
      >
        Delete
      </button>
    </div>
  );
}
