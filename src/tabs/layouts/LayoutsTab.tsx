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
  EQUIP_CODE,
  fixturesFor,
  roomIsModelled,
  equipDef,
  fitsCode,
  labelExtra,
} from './roomModel';
import type { Fixture } from './roomModel';
import {
  buildFormation,
  stockByKind,
  suggestFormations,
  typicalClassSize,
} from '../../lib/layoutFormations';

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
          className="absolute rounded bg-white/85 px-1.5 py-0.5 text-[12px] font-bold tracking-[0.12em] text-ink-700 uppercase"
          style={{ left: f.x, top: f.y + f.h + 5 }}
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
      <span className="pointer-events-none absolute right-2 bottom-1 rounded bg-white/85 px-1.5 py-0.5 text-[12px] font-bold tracking-[0.12em] text-ink-700 uppercase">
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
  // The name sits inside the shape, abbreviated, so the plan reads without
  // chasing a label. A barbell is too thin for text; it keeps its label below.
  const code = isZone ? item.label : EQUIP_CODE[def.kind];
  const showInside = isZone || fitsCode(w, h);
  const fontPx = isZone ? 13 : Math.max(8, Math.min(11, Math.floor(Math.min(w / 3.4, h / 1.8))));
  return (
    <div
      className="absolute flex items-center justify-center px-0.5 text-center leading-none font-bold text-white shadow-sm"
      style={{
        left: item.dir === 'col' ? 0 : i * step,
        top: item.dir === 'col' ? i * step : 0,
        width: w,
        height: h,
        backgroundColor: colour,
        borderRadius: radius,
        fontSize: `${fontPx}px`,
        letterSpacing: isZone ? undefined : '0.04em',
      }}
    >
      {showInside ? code : null}
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
  const below = labelExtra(item.label, item.kind);
  const totalW = item.dir === 'col' ? w : span(w);
  const totalH = item.dir === 'col' ? span(h) : h;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Without stopping here the click bubbles to the canvas, whose handler
      // clears the selection, so a piece was selected and deselected by the
      // same click and the whole properties panel was unreachable.
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect();
        }
      }}
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
        <span className="absolute -top-3 -left-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-ink-950 text-[13px] font-bold text-white shadow-md">
          {item.station}
        </span>
      )}
      {/* Only what the shape cannot say itself: a load the coach typed into
          the label, or the name when the shape is too thin to hold it. */}
      {item.kind && item.kind !== 'zone' && (below || !fitsCode(w, h)) && (
        <span className="pointer-events-none absolute -bottom-5 left-0 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink-950 shadow-sm">
          {[!fitsCode(w, h) ? item.label : null, below].filter(Boolean).join(' ')}
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
            className="relative shrink-0 rounded-lg border-2 border-ink-300 bg-white"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              backgroundImage:
                'linear-gradient(to right, rgba(32,29,29,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,29,29,0.035) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
            onClick={() => setSelectedId(null)}
          >
            {fixturesFor(room.room).map((f) => (
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
      {roomIsModelled(room.room) ? (
        <p className="mt-2 text-[11px] text-ink-400">
          The fixed fixtures are drawn from the {room.room} model and appear on every layout in
          this room. Everything else drags; pick an item to set how many, spacing and a station
          number.
        </p>
      ) : (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          {room.room ? `The ${room.room} has` : 'This layout has'} no measured fixture model yet,
          so no fixed fixtures are drawn. That is honest, not a bug: the wrong room's furniture
          taught a false map. Add the measurements to roomModel.ts and they appear here.
        </p>
      )}
    </section>
  );
}

/**
 * Suggest a format for the room rather than only where each item sits. Reads
 * the gear already on the floor as the stations, the class's real average size
 * from Attendance, and what the club owns from Equipment, then ranks the
 * formations with the reason each one is being put forward. Nothing is applied
 * until the coach picks one.
 */
function SuggestPanel({
  room,
  heads,
  onApply,
  onClose,
}: {
  room: LayoutRoom;
  heads: number | null;
  onApply: (items: LayoutItem[], name: string) => void;
  onClose: () => void;
}) {
  const equipment = useDoc('equipment');
  // Held as text, not a number: coercing every keystroke means clearing the
  // field to retype snaps it to 1, and the next digit lands after that 1.
  const [sizeText, setSizeText] = useState(String(heads ?? 12));
  const [pairs, setPairs] = useState(room.id === 'hyrox');
  const [strength, setStrength] = useState(room.id === 'strength');

  const typed = Number(sizeText);
  const sizeValid = sizeText.trim() !== '' && Number.isFinite(typed) && typed >= 1;
  const size = sizeValid ? Math.min(200, Math.floor(typed)) : (heads ?? 12);

  // The gear on the floor is the station list. Markers (no kind) are not gear.
  const stations = room.items
    .filter((i) => i.kind && i.kind !== 'zone')
    .map((i) => ({ kind: i.kind as string, label: i.label }));

  const stock = stockByKind(equipment.data);
  const input = { stations, heads: size, pairs, strength, stock };
  const suggestions = stations.length ? suggestFormations(input) : [];

  return (
    <section className="mb-4 rounded-xl border border-accent-500/40 bg-accent-100/20 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ink-950">Suggest a format for the room</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] font-medium text-ink-500 hover:text-ink-950"
        >
          Close
        </button>
      </div>

      {stations.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">
          There is no gear on this floor yet, so there are no stations to arrange. Add equipment from
          the palette below, or use "Build the floor layout from this week" on the Programming tab.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                Class size
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={sizeText}
                onChange={(e) => setSizeText(e.target.value)}
                onBlur={() => setSizeText(String(size))}
                className="w-20 rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 focus:border-accent-600"
              />
              {heads !== null && (
                <span className="text-[11px] text-ink-500">
                  {!sizeValid
                    ? `using the recent average, ${heads}`
                    : size === heads
                      ? 'the recent average for this class'
                      : `recent average is ${heads}`}
                </span>
              )}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={pairs} onChange={(e) => setPairs(e.target.checked)} />
              <span className="text-[13px] text-ink-700">Written as pairs</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={strength}
                onChange={(e) => setStrength(e.target.checked)}
              />
              <span className="text-[13px] text-ink-700">Strength session</span>
            </label>
          </div>

          <p className="mt-2 text-[12px] text-ink-500">
            {stations.length} station{stations.length === 1 ? '' : 's'} on the floor:{' '}
            {stations.map((s) => s.label).join(', ')}. Around{' '}
            {Math.max(1, Math.ceil(size / stations.length))} per station.
          </p>

          <ul className="mt-3 space-y-2">
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                className={`rounded-lg border bg-white p-3 ${
                  i === 0 ? 'border-accent-600' : 'border-ink-200'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-950">
                    {s.name}
                    {i === 0 && (
                      <span className="ml-2 rounded bg-accent-600 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                        Suggested
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onApply(buildFormation(s.id, input), s.name)}
                    className="rounded-md bg-ink-950 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-ink-800"
                  >
                    Lay the room out this way
                  </button>
                </div>
                <p className="mt-1 text-[13px] text-ink-700">{s.what}</p>
                <p className="mt-0.5 text-[12px] text-ink-500 italic">{s.why}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default function LayoutsTab() {
  const { data, saveState, update, reloadTheirs, keepMine, retry } = useDoc('layouts');
  const attendance = useDoc('attendance');
  const schedule = useDoc('schedule');
  const [roomIndexRaw, setRoomIndex] = useState(0);
  const [suggesting, setSuggesting] = useState(false);

  if (!data) return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;

  // One layout per class type; the dropdown picks which one you're planning.
  const roomIndex = Math.min(roomIndexRaw, data.rooms.length - 1);
  const room = data.rooms[roomIndex];
  const heads = room ? typicalClassSize(attendance.data, schedule.data, room.id) : null;

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
          <button
            type="button"
            onClick={() => setSuggesting((v) => !v)}
            className="rounded-md border border-accent-600 px-2.5 py-1.5 text-sm font-medium text-accent-600 hover:bg-accent-100/40"
            title="Propose a way to run the room for this class, not just where each item sits"
          >
            Suggest a format
          </button>
        </div>
        <SaveBadge state={saveState} onReloadTheirs={reloadTheirs} onKeepMine={keepMine} onRetry={retry} />
      </div>
      {room && suggesting && (
        <SuggestPanel
          // Keyed so switching room starts a fresh suggestion. The prefix
          // keeps it distinct from the canvas beside it: two siblings keyed
          // "hyrox" is a duplicate-key warning, not two separate keys.
          key={`suggest-${room.id}`}
          room={room}
          heads={heads}
          onClose={() => setSuggesting(false)}
          onApply={(items, name) => {
            if (
              !window.confirm(
                `Lay the ${room.name} floor out as "${name}"?\n\nThis replaces what is on the floor now.`,
              )
            )
              return;
            update((d) => ({
              ...d,
              rooms: d.rooms.map((r) => (r.id === room.id ? { ...r, items } : r)),
            }));
            setSuggesting(false);
          }}
        />
      )}
      {room && (
        <RoomCanvas
          key={`canvas-${room.id}`}
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
