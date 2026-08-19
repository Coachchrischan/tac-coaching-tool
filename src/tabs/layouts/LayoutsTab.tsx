import { useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';
import type { LayoutItem, LayoutRoom } from '../../types/documents';
import {
  CANVAS_H,
  CANVAS_W,
  EQUIPMENT,
  FIXTURES,
  equipDef,
} from './roomModel';
import type { Fixture } from './roomModel';

// ---------- Fixed room furniture ----------

function FixtureShape({ f }: { f: Fixture }) {
  const base =
    f.tone === 'dark'
      ? 'bg-ink-800 border border-ink-950'
      : 'border-[3px] border-ink-950 bg-white/40';

  if (f.repeat) {
    return (
      <>
        {Array.from({ length: f.repeat.count }, (_, i) => (
          <div
            key={i}
            className={`absolute rounded-sm ${base}`}
            style={{
              left: f.x + i * (f.w + f.repeat!.gap),
              top: f.y,
              width: f.w,
              height: f.h,
            }}
            title={f.label}
          />
        ))}
        <span
          className="absolute text-[10px] font-bold tracking-[0.2em] text-ink-400 uppercase"
          style={{ left: f.x, top: f.y + f.h + 4 }}
        >
          {f.label}
        </span>
      </>
    );
  }

  return (
    <div
      className={`absolute flex overflow-hidden rounded-sm ${base}`}
      style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
      title={f.label}
    >
      {/* rig uprights */}
      {f.segments
        ? Array.from({ length: f.segments }, (_, i) => (
            <div
              key={i}
              className="h-full flex-1 border-r-[3px] border-ink-950 last:border-r-0"
            />
          ))
        : null}
      {/* sled lanes */}
      {f.lanes
        ? Array.from({ length: f.lanes }, (_, i) => (
            <div
              key={i}
              className="absolute inset-x-0 border-b-[3px] border-ink-950"
              style={{ top: (i + 1) * (f.h / f.lanes!) - 3 }}
            />
          ))
        : null}
      <span className="pointer-events-none absolute right-2 bottom-1 text-[10px] font-bold tracking-[0.2em] text-ink-400 uppercase">
        {f.label}
      </span>
    </div>
  );
}

// ---------- Movable equipment ----------

function ItemShape({ item, i = 0 }: { item: LayoutItem; i?: number }) {
  const def = equipDef(item.kind ?? 'zone');
  const shape = item.kind ? def.shape : 'rect';
  const colour = item.colour ?? def.colour;
  const radius = shape === 'circle' ? '9999px' : shape === 'pill' ? '9999px' : '4px';
  const isZone = !item.kind || item.kind === 'zone';
  const w = item.w || def.w;
  const h = item.h || def.h;
  const step = (item.gap ?? 12) + (item.dir === 'col' ? h : w);
  return (
    <div
      className="absolute flex items-center justify-center text-center text-[11px] leading-tight font-semibold text-white shadow-sm"
      style={{
        left: item.dir === 'col' ? 0 : i * step,
        top: item.dir === 'col' ? i * step : 0,
        width: w,
        height: h,
        backgroundColor: colour,
        borderRadius: radius,
      }}
    >
      {isZone ? item.label : null}
    </div>
  );
}

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
  const def = equipDef(item.kind ?? 'zone');
  const count = Math.max(1, item.count ?? 1);
  const w = item.w || def.w;
  const h = item.h || def.h;
  const span = (n: number) => count * n + (count - 1) * (item.gap ?? 12);
  const totalW = item.dir === 'col' ? w : span(w);
  const totalH = item.dir === 'col' ? span(h) : h;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      className={`absolute cursor-grab rounded-md ${selected ? 'ring-2 ring-accent-600 ring-offset-2' : ''} ${
        isDragging ? 'z-20 opacity-80' : 'z-10'
      }`}
      style={{
        left: item.x,
        top: item.y,
        width: totalW,
        height: totalH,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
      title={`${item.label}${count > 1 ? ` ×${count}` : ''}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <ItemShape key={i} item={item} i={i} />
      ))}
      {item.station !== undefined && (
        <span className="absolute -top-3 -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-white shadow">
          {item.station}
        </span>
      )}
      {item.kind && item.kind !== 'zone' && (
        <span className="pointer-events-none absolute -bottom-4 left-0 text-[10px] font-medium whitespace-nowrap text-ink-500">
          {item.label}
          {count > 1 ? ` ×${count}` : ''}
        </span>
      )}
    </div>
  );
}

// ---------- Canvas ----------

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

  function patchItem(id: string, patch: Partial<LayoutItem>) {
    onUpdateRoom((r) => ({
      ...r,
      items: r.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, delta } = e;
    onUpdateRoom((r) => ({
      ...r,
      items: r.items.map((i) =>
        i.id === active.id
          ? {
              ...i,
              x: Math.max(0, Math.round(i.x + delta.x)),
              y: Math.max(0, Math.min(CANVAS_H - 20, Math.round(i.y + delta.y))),
            }
          : i,
      ),
    }));
  }

  function addEquipment(kind: string) {
    const def = equipDef(kind);
    const item: LayoutItem = {
      id: crypto.randomUUID(),
      kind,
      label: def.name,
      x: 60,
      y: 300,
      w: def.w,
      h: def.h,
      count: 1,
      gap: 12,
    };
    onUpdateRoom((r) => ({ ...r, items: [...r.items, item] }));
    setSelectedId(item.id);
  }

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      {/* Palette */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
          Add
        </span>
        {EQUIPMENT.map((e) => (
          <button
            key={e.kind}
            type="button"
            onClick={() => addEquipment(e.kind)}
            className="flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-2 py-1 text-[12px] font-medium text-ink-700 hover:border-accent-600 hover:text-accent-700"
          >
            <span
              className="inline-block h-3 w-3 shrink-0"
              style={{
                backgroundColor: e.colour,
                borderRadius: e.shape === 'rect' ? 2 : 9999,
              }}
            />
            {e.name}
          </button>
        ))}
      </div>

      {/* Selected item editor */}
      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-ink-50 px-3 py-2">
          <input
            className="w-44 rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
            value={selected.label}
            onChange={(e) => patchItem(selected.id, { label: e.target.value })}
          />
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
            How many
            <input
              type="number"
              min={1}
              max={20}
              className="w-16 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
              value={selected.count ?? 1}
              onChange={(e) =>
                patchItem(selected.id, {
                  count: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                })
              }
            />
          </label>
          <div className="flex overflow-hidden rounded-md border border-ink-300">
            {(['row', 'col'] as const).map((d) => (
              <button
                key={d}
                type="button"
                title={d === 'row' ? 'Lay them across the floor' : 'Stack them down the floor'}
                onClick={() => patchItem(selected.id, { dir: d })}
                className={`px-2 py-1 text-[12px] font-medium ${
                  (selected.dir ?? 'row') === d
                    ? 'bg-ink-950 text-white'
                    : 'bg-white text-ink-500 hover:text-ink-950'
                }`}
              >
                {d === 'row' ? 'Across' : 'Down'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
            Spacing
            <input
              type="number"
              min={0}
              max={120}
              className="w-16 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm text-ink-950 focus:border-accent-600 focus:outline-none"
              value={selected.gap ?? 12}
              onChange={(e) =>
                patchItem(selected.id, {
                  gap: Math.max(0, Math.min(120, Number(e.target.value) || 0)),
                })
              }
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
            Station #
            <input
              type="number"
              min={1}
              max={20}
              placeholder="–"
              className="w-16 rounded-md border border-ink-300 bg-white px-2 py-1 text-center text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
              value={selected.station ?? ''}
              onChange={(e) =>
                patchItem(selected.id, {
                  station: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onUpdateRoom((r) => ({ ...r, items: r.items.filter((i) => i.id !== selected.id) }));
              setSelectedId(null);
            }}
            className="ml-auto rounded-md border border-red-200 px-2 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      )}

      {/* Floor */}
      <div className="mt-3 overflow-x-auto">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            className="relative shrink-0 rounded-lg border-2 border-ink-300 bg-ink-50"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              backgroundImage:
                'linear-gradient(to right, rgba(32,29,29,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,29,29,0.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
            onClick={() => setSelectedId(null)}
          >
            {FIXTURES.map((f) => (
              <FixtureShape key={f.id} f={f} />
            ))}
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
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        The air runners, rig and sled track are fixed and appear on every layout. Everything else
        drags; pick an item to set how many, spacing and a station number.
      </p>
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
