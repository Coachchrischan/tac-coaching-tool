import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { ClassBlock } from '../../types/documents';
import BlockEditor from './BlockEditor';
import ScenarioBar from './ScenarioBar';
import SettingsDrawer from './SettingsDrawer';
import WeekGrid from './WeekGrid';
import { DAY_END_MIN } from './scheduleLayout';

export default function ScheduleTab() {
  const { data: doc, saveState, update, reloadTheirs, keepMine, retry } = useDoc('schedule');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  if (!doc) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading timetable…</p>;
  }

  const scenario = doc.scenarios.find((s) => s.id === doc.activeScenarioId) ?? doc.scenarios[0];
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

      <p className="mb-3 text-[13px] text-ink-500">
        Drag classes to move them. Add a class with the button or by clicking an empty slot; click a
        class to edit or duplicate it.
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
