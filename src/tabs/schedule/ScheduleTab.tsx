import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { ClassBlock } from '../../types/documents';
import BlockEditor from './BlockEditor';
import ScenarioBar from './ScenarioBar';
import SettingsDrawer from './SettingsDrawer';
import WeekGrid from './WeekGrid';
import { DAY_END_MIN } from './scheduleLayout';
import { liveIsAssumed, liveScenario, viewedScenario } from '../../lib/scenarios';

export default function ScheduleTab() {
  const { data: doc, saveState, update, reloadTheirs, keepMine, retry } = useDoc('schedule');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  if (!doc) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading timetable…</p>;
  }

  // The week on screen, which may be a sketch. What the club actually runs is
  // liveScenario(doc), and only that decides the days sessions are pushed to.
  const scenario = viewedScenario(doc) ?? doc.scenarios[0];
  const live = liveScenario(doc);
  const viewingLive = live?.id === scenario.id;
  const selectedBlock = scenario.blocks.find((b) => b.id === selectedBlockId) ?? null;

  function patchBlock(id: string, patch: Partial<ClassBlock>) {
    update((d) => ({
      ...d,
      scenarios: d.scenarios.map((s) =>
        s.id !== scenario.id
          ? s
          : { ...s, blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
      ),
    }));
  }

  function createBlock(day: ClassBlock['day'], startMin: number) {
    const block: ClassBlock = {
      id: crypto.randomUUID(),
      day,
      startMin,
      durationMin: 60,
      classTypeId: doc!.classTypes[0]?.id ?? '',
      coachId: null,
      roomId: null,
    };
    update((d) => ({
      ...d,
      scenarios: d.scenarios.map((s) =>
        s.id !== scenario.id ? s : { ...s, blocks: [...s.blocks, block] },
      ),
    }));
    setSelectedBlockId(block.id);
  }

  function duplicateBlock(source: ClassBlock) {
    // Copy lands directly after the original (clamped to the day), selected
    // and ready to drag or edit.
    const copy: ClassBlock = {
      ...source,
      id: crypto.randomUUID(),
      startMin: Math.min(source.startMin + source.durationMin, DAY_END_MIN - source.durationMin),
    };
    update((d) => ({
      ...d,
      scenarios: d.scenarios.map((s) =>
        s.id !== scenario.id ? s : { ...s, blocks: [...s.blocks, copy] },
      ),
    }));
    setSelectedBlockId(copy.id);
  }

  function deleteBlock(id: string) {
    update((d) => ({
      ...d,
      scenarios: d.scenarios.map((s) =>
        s.id !== scenario.id ? s : { ...s, blocks: s.blocks.filter((b) => b.id !== id) },
      ),
    }));
    setSelectedBlockId(null);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ScenarioBar doc={doc} onUpdate={update} />
        <div className="flex items-center gap-3">
          <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} onRetry={retry} />
          <button
            type="button"
            onClick={() => createBlock(0, 9 * 60)}
            className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            + Add class
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            Classes & coaches
          </button>
        </div>
      </div>

      {/* Which week you are on is never left to be inferred: everything that
          acts on the timetable reads the current format, not this view. */}
      {liveIsAssumed(doc) ? (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <span className="font-semibold">No format is marked current yet.</span> Until one is, the
          tool falls back to the week you are viewing, so a sketch can move the days sessions are
          pushed to. Open the real week and press <strong>Make this the current format</strong>.
        </p>
      ) : viewingLive ? (
        <p className="mb-3 rounded-md border border-accent-600/30 bg-accent-100/40 px-3 py-2 text-[13px] text-ink-700">
          <span className="font-semibold text-ink-950">This is the current format.</span> It decides
          the days sessions are pushed to TrainHeroic, what Home shows as on today, and the class
          sizes floor layouts are built for. Sketch on a duplicate instead of editing here.
        </p>
      ) : (
        <p className="mb-3 rounded-md border border-ink-300 bg-ink-100 px-3 py-2 text-[13px] text-ink-700">
          <span className="font-semibold text-ink-950">You are sketching.</span> The current format
          is <strong>{live?.name}</strong>, and nothing here changes what members see until you press
          Make this the current format.
        </p>
      )}
      <p className="mb-3 text-[13px] text-ink-500">
        Drag classes to move them. Add a class with the button or by right-clicking an empty slot;
        click a class to edit or duplicate it.
      </p>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <WeekGrid
            doc={doc}
            scenario={scenario}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onMoveBlock={(id, day, startMin) => patchBlock(id, { day, startMin })}
            onCreateBlock={createBlock}
          />
        </div>
        {selectedBlock && (
          <BlockEditor
            doc={doc}
            block={selectedBlock}
            onChange={(patch) => patchBlock(selectedBlock.id, patch)}
            onDuplicate={() => duplicateBlock(selectedBlock)}
            onDelete={() => deleteBlock(selectedBlock.id)}
            onClose={() => setSelectedBlockId(null)}
          />
        )}
        {showSettings && !selectedBlock && (
          <SettingsDrawer doc={doc} onUpdate={update} onClose={() => setShowSettings(false)} />
        )}
      </div>
    </div>
  );
}
