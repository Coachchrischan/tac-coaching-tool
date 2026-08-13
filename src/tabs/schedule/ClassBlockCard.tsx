import { useDraggable } from '@dnd-kit/core';
import type { ClassBlock, ScheduleDoc } from '../../types/documents';
import { formatRange, minToY, PX_PER_MIN } from './scheduleLayout';
import type { LanePlacement } from './scheduleLayout';

export function blockLabel(doc: ScheduleDoc, block: ClassBlock) {
  const type = doc.classTypes.find((t) => t.id === block.classTypeId);
  const coach = doc.coaches.find((c) => c.id === block.coachId);
  const room = doc.rooms.find((r) => r.id === block.roomId);
  return { type, coach, room };
}

export function BlockContent({ doc, block }: { doc: ScheduleDoc; block: ClassBlock }) {
  const { type, coach, room } = blockLabel(doc, block);
  const compact = block.durationMin < 50;
  return (
    <div className="flex h-full flex-col overflow-hidden px-2 py-1 text-left leading-tight">
      <span className="truncate text-[12px] font-semibold text-white">
        {type?.name ?? 'Class'}
      </span>
      {!compact && (
        <span className="truncate text-[10.5px] text-white/75">
          {room?.name ?? 'No room'}
          {coach ? ` · ${coach.name}` : ''}
        </span>
      )}
      <span className="mt-auto truncate text-[10.5px] text-white/65">
        {formatRange(block.startMin, block.durationMin)}
      </span>
    </div>
  );
}

export default function ClassBlockCard({
  doc,
  block,
  placement,
  selected,
  onSelect,
}: {
  doc: ScheduleDoc;
  block: ClassBlock;
  placement: LanePlacement;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
  });
  const { type } = blockLabel(doc, block);
  const widthPct = 100 / placement.lanes;

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onSelect(block.id)}
      className={`absolute rounded-md shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-ink-950 ring-offset-1' : 'hover:shadow-md'
      } ${isDragging ? 'opacity-30' : ''}`}
      style={{
        top: minToY(block.startMin),
        height: block.durationMin * PX_PER_MIN,
        left: `calc(${placement.lane * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: type?.colour ?? '#6b7280',
      }}
    >
      <BlockContent doc={doc} block={block} />
    </button>
  );
}
