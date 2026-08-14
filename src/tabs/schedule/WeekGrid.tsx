import { useMemo } from 'react';
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import type { ClassBlock, ScheduleDoc, WeekScenario } from '../../types/documents';
import ClassBlockCard, { BlockContent } from './ClassBlockCard';
import {
  DAY_END_MIN,
  DAY_NAMES,
  DAY_START_MIN,
  formatTime,
  layoutDay,
  minToY,
  PX_PER_MIN,
  SNAP_MIN,
} from './scheduleLayout';

function DropCell({ day, min, onCreate }: { day: number; min: number; onCreate: (day: number, min: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}:${min}` });
  const onHour = min % 60 === 0;
  return (
    <div
      ref={setNodeRef}
      onClick={() => onCreate(day, min)}
      className={`w-full cursor-cell border-t ${
        onHour ? 'border-ink-200' : 'border-ink-100'
      } ${isOver ? 'bg-accent-100' : 'hover:bg-ink-100/60'}`}
      style={{ height: SNAP_MIN * PX_PER_MIN }}
    />
  );
}

export default function WeekGrid({
  doc,
  scenario,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onCreateBlock,
}: {
  doc: ScheduleDoc;
  scenario: WeekScenario;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onMoveBlock: (id: string, day: ClassBlock['day'], startMin: number) => void;
  onCreateBlock: (day: ClassBlock['day'], startMin: number) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SNAP_MIN) out.push(m);
    return out;
  }, []);

  const laneMaps = useMemo(
    () =>
      Array.from({ length: 7 }, (_, day) =>
        layoutDay(
          scenario.blocks.filter((b) => b.day === day),
          doc.rooms.map((r) => r.id),
        ),
      ),
    [scenario.blocks, doc.rooms],
  );

  const draggingBlock = scenario.blocks.find((b) => b.id === draggingId) ?? null;

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
    onSelectBlock(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const over = e.over?.id;
    if (typeof over !== 'string' || !over.includes(':')) return;
    const [dayStr, minStr] = over.split(':');
    const day = Number(dayStr) as ClassBlock['day'];
    const block = scenario.blocks.find((b) => b.id === e.active.id);
    if (!block) return;
    const startMin = Math.min(Number(minStr), DAY_END_MIN - block.durationMin);
    onMoveBlock(block.id, day, startMin);
  }

  const hourMarks = useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START_MIN; m < DAY_END_MIN; m += 60) out.push(m);
    return out;
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="grid min-w-[980px] grid-cols-[64px_repeat(7,1fr)]">
          {/* header */}
          <div className="border-b border-ink-200 bg-ink-950" />
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              className="border-b border-l border-ink-200 bg-ink-950 py-2.5 text-center text-[13px] font-semibold text-white"
            >
              {name}
            </div>
          ))}

          {/* time gutter */}
          <div className="relative" style={{ height: minToY(DAY_END_MIN) }}>
            {hourMarks.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-ink-400"
                style={{ top: minToY(m) + (m === DAY_START_MIN ? 8 : 0) }}
              >
                {formatTime(m)}
              </span>
            ))}
          </div>

          {/* day columns */}
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="relative border-l border-ink-200">
              {slots.map((min) => (
                <DropCell
                  key={min}
                  day={day}
                  min={min}
                  onCreate={(d, m) => onCreateBlock(d as ClassBlock['day'], m)}
                />
              ))}
              {scenario.blocks
                .filter((b) => b.day === day)
                .map((block) => (
                  <ClassBlockCard
                    key={block.id}
                    doc={doc}
                    block={block}
                    placement={laneMaps[day].get(block.id) ?? { lane: 0, lanes: 1 }}
                    selected={block.id === selectedBlockId}
                    onSelect={onSelectBlock}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      <DragOverlay>
        {draggingBlock ? (
          <div
            className="rounded-md shadow-lg"
            style={{
              height: draggingBlock.durationMin * PX_PER_MIN,
              width: 132,
              backgroundColor:
                doc.classTypes.find((t) => t.id === draggingBlock.classTypeId)?.colour ?? '#6b7280',
            }}
          >
            <BlockContent doc={doc} block={draggingBlock} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
