import type { ClassBlock, ScheduleDoc } from '../../types/documents';
import { DAY_END_MIN, DAY_NAMES, DAY_START_MIN, formatTime, SNAP_MIN } from './scheduleLayout';

const label = 'text-[11px] font-medium tracking-wide text-ink-500 uppercase';
const field =
  'w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 focus:border-accent-600 focus:outline-none';

export default function BlockEditor({
  doc,
  block,
  onChange,
  onDelete,
  onClose,
}: {
  doc: ScheduleDoc;
  block: ClassBlock;
  onChange: (patch: Partial<ClassBlock>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const startOptions: number[] = [];
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += SNAP_MIN) startOptions.push(m);

  return (
    <aside className="w-72 shrink-0 self-start rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-950">Edit class</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-sm text-ink-400 hover:bg-ink-100 hover:text-ink-950"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className={label}>Class type</label>
          <select
            className={field}
            value={block.classTypeId}
            onChange={(e) => onChange({ classTypeId: e.target.value })}
          >
            {doc.classTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>Day</label>
          <select
            className={field}
            value={block.day}
            onChange={(e) => onChange({ day: Number(e.target.value) as ClassBlock['day'] })}
          >
            {DAY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Start</label>
            <select
              className={field}
              value={block.startMin}
              onChange={(e) => onChange({ startMin: Number(e.target.value) })}
            >
              {startOptions.map((m) => (
                <option key={m} value={m}>
                  {formatTime(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Minutes</label>
            <input
              type="number"
              className={field}
              min={15}
              max={DAY_END_MIN - block.startMin}
              step={5}
              value={block.durationMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 5) {
                  onChange({ durationMin: Math.min(v, DAY_END_MIN - block.startMin) });
                }
              }}
            />
          </div>
        </div>

        <div>
          <label className={label}>Coach</label>
          <select
            className={field}
            value={block.coachId ?? ''}
            onChange={(e) => onChange({ coachId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {doc.coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>Room</label>
          <select
            className={field}
            value={block.roomId ?? ''}
            onChange={(e) => onChange({ roomId: e.target.value || null })}
          >
            <option value="">No room</option>
            {doc.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="mt-5 w-full rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete class
      </button>
    </aside>
  );
}
