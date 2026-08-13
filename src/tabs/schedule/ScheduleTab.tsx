import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { ClassBlock } from '../../types/documents';
import BlockEditor from './BlockEditor';
import ScenarioBar from './ScenarioBar';
import SettingsDrawer from './SettingsDrawer';
import WeekGrid from './WeekGrid';

export default function ScheduleTab() {
  const { data: doc, saveState, update, reloadTheirs, keepMine } = useDoc('schedule');
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
          <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} />
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
        Drag classes to move them. Click an empty slot to add a class, or click a class to edit it.
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
