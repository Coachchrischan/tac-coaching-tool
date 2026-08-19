import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { LayoutItem, LayoutRoom } from '../../types/documents';

const CANVAS_H = 480;

const ITEM_COLOURS = ['#003030', '#5A5A52', '#3E6B8C', '#C64545', '#7C6FA0', '#C5A683'];

function DraggableItem({
  item,
  selected,
  onSelect,
}: {
  item: LayoutItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`absolute flex items-center justify-center rounded-md px-2 text-center text-[12px] leading-tight font-semibold text-white shadow ${
        selected ? 'ring-2 ring-ink-950 ring-offset-1' : ''
      } ${isDragging ? 'z-10 opacity-80' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.w,
        height: item.h,
        backgroundColor: item.colour ?? ITEM_COLOURS[0],
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      {item.label}
    </button>
  );
}

function RoomCanvas({
  room,
  onUpdateRoom,
}: {
  room: LayoutRoom;
  onUpdateRoom: (fn: (r: LayoutRoom) => LayoutRoom) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const selected = room.items.find((i) => i.id === selectedId) ?? null;

  function handleDragEnd(e: DragEndEvent) {
    const { active, delta } = e;
    onUpdateRoom((r) => ({
      ...r,
      items: r.items.map((i) =>
        i.id === active.id
          ? {
              ...i,
              x: Math.max(0, Math.round(i.x + delta.x)),
              y: Math.max(0, Math.min(CANVAS_H - i.h, Math.round(i.y + delta.y))),
            }
          : i,
      ),
    }));
  }

  function addItem() {
    const item: LayoutItem = {
      id: crypto.randomUUID(),
      label: 'New zone',
      x: 24,
      y: 24,
      w: 120,
      h: 48,
      colour: ITEM_COLOURS[room.items.length % ITEM_COLOURS.length],
    };
    onUpdateRoom((r) => ({ ...r, items: [...r.items, item] }));
    setSelectedId(item.id);
  }

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-950">
          {room.name} layout
          {room.room && <span className="ml-2 font-normal text-ink-500">{room.room}</span>}
          <span className="ml-2 text-[12px] font-normal text-ink-400">
            {room.items.length} item{room.items.length === 1 ? '' : 's'}
          </span>
        </h3>
        <button
          type="button"
          onClick={addItem}
          className="rounded-md border border-ink-300 px-3 py-1 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          + Add label
        </button>
      </div>

      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
          <input
            className="rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
            value={selected.label}
            onChange={(e) =>
              onUpdateRoom((r) => ({
                ...r,
                items: r.items.map((i) => (i.id === selected.id ? { ...i, label: e.target.value } : i)),
              }))
            }
          />
          <div className="flex gap-1">
            {ITEM_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  onUpdateRoom((r) => ({
                    ...r,
                    items: r.items.map((i) => (i.id === selected.id ? { ...i, colour: c } : i)),
                  }))
                }
                className={`h-6 w-6 rounded ${selected.colour === c ? 'ring-2 ring-ink-950 ring-offset-1' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <label className="ml-2 flex items-center gap-1 text-[12px] text-ink-500">
            W
            <input
              type="number"
              min={40}
              step={10}
              className="w-16 rounded-md border border-ink-300 bg-white px-1.5 py-0.5 text-sm focus:border-accent-600 focus:outline-none"
              value={selected.w}
              onChange={(e) =>
                onUpdateRoom((r) => ({
                  ...r,
                  items: r.items.map((i) =>
                    i.id === selected.id ? { ...i, w: Math.max(40, Number(e.target.value) || 40) } : i,
                  ),
                }))
              }
            />
          </label>
          <label className="flex items-center gap-1 text-[12px] text-ink-500">
            H
            <input
              type="number"
              min={32}
              step={8}
              className="w-16 rounded-md border border-ink-300 bg-white px-1.5 py-0.5 text-sm focus:border-accent-600 focus:outline-none"
              value={selected.h}
              onChange={(e) =>
                onUpdateRoom((r) => ({
                  ...r,
                  items: r.items.map((i) =>
                    i.id === selected.id ? { ...i, h: Math.max(32, Number(e.target.value) || 32) } : i,
                  ),
                }))
              }
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onUpdateRoom((r) => ({ ...r, items: r.items.filter((i) => i.id !== selected.id) }));
              setSelectedId(null);
            }}
            className="ml-auto rounded-md border border-red-200 px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          className="relative mt-3 overflow-hidden rounded-lg border border-ink-200"
          style={{
            height: CANVAS_H,
            backgroundColor: '#fafaf9',
            backgroundImage:
              'linear-gradient(#e7e5e4 1px, transparent 1px), linear-gradient(90deg, #e7e5e4 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {room.items.map((item) => (
            <DraggableItem
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={() => setSelectedId(item.id)}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}

export default function LayoutsTab() {
  const { data, saveState, update, reloadTheirs, keepMine, retry } = useDoc('layouts');
  const [roomIndexRaw, setRoomIndex] = useState(0);

  if (!data) return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;

  // One layout per class type; the dropdown picks which one you're planning.
  const roomIndex = Math.min(roomIndexRaw, data.rooms.length - 1);
  const room = data.rooms[roomIndex];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl text-ink-950">Floor layouts</h2>
          <select
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-950 focus:border-accent-600 focus:outline-none"
            value={roomIndex}
            onChange={(e) => setRoomIndex(Number(e.target.value))}
            title="Which class you're planning the floor for"
          >
            {data.rooms.map((r, i) => (
              <option key={r.id} value={i}>
                {r.name}
                {r.room ? ` · ${r.room}` : ''}
              </option>
            ))}
          </select>
        </div>
        <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} onRetry={retry} />
      </div>
      <p className="mb-3 text-[13px] text-ink-500">
        Drag equipment and zone labels to plan resources per class. One grid square ≈ 1 m.
      </p>
      {room && (
        <RoomCanvas
          key={room.id}
          room={room}
          onUpdateRoom={(fn) =>
            update((d) => ({
              ...d,
              rooms: d.rooms.map((r) => (r.id === room.id ? fn(r) : r)),
            }))
          }
        />
      )}
    </div>
  );
}
