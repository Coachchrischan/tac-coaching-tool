import type { ScheduleDoc } from '../../types/documents';

const input =
  'w-full rounded-md border border-ink-300 bg-white px-2 py-1 text-sm text-ink-950 focus:border-accent-600 focus:outline-none';

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export default function SettingsDrawer({
  doc,
  onUpdate,
  onClose,
}: {
  doc: ScheduleDoc;
  onUpdate: (fn: (d: ScheduleDoc) => ScheduleDoc) => void;
  onClose: () => void;
}) {
  const typeInUse = (id: string) =>
    doc.scenarios.some((s) => s.blocks.some((b) => b.classTypeId === id));

  return (
    <aside className="w-80 shrink-0 self-start rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-950">Classes, coaches and rooms</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-sm text-ink-400 hover:bg-ink-100 hover:text-ink-950"
        >
          ✕
        </button>
      </div>

      {/* Class types */}
      <section className="mt-4">
        <h4 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Class types</h4>
        <ul className="mt-2 space-y-1.5">
          {doc.classTypes.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <input
                type="color"
                value={t.colour}
                title="Block colour"
                onChange={(e) =>
                  onUpdate((d) => ({
                    ...d,
                    classTypes: d.classTypes.map((x) =>
                      x.id === t.id ? { ...x, colour: e.target.value } : x,
                    ),
                  }))
                }
                className="h-7 w-8 cursor-pointer rounded border border-ink-300 bg-white p-0.5"
              />
              <input
                className={input}
                value={t.name}
                onChange={(e) =>
                  onUpdate((d) => ({
                    ...d,
                    classTypes: d.classTypes.map((x) =>
                      x.id === t.id ? { ...x, name: e.target.value } : x,
                    ),
                  }))
                }
              />
              <button
                type="button"
                disabled={typeInUse(t.id)}
                title={typeInUse(t.id) ? 'In use on the timetable' : 'Delete'}
                onClick={() =>
                  onUpdate((d) => ({
                    ...d,
                    classTypes: d.classTypes.filter((x) => x.id !== t.id),
                  }))
                }
                className="rounded px-1.5 py-0.5 text-sm text-ink-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onUpdate((d) => ({
              ...d,
              classTypes: [
                ...d.classTypes,
                { id: newId('ct'), name: 'New class', colour: '#4b5563' },
              ],
            }))
          }
          className="mt-2 text-sm font-medium text-accent-600 hover:text-accent-700"
        >
          + Add class type
        </button>
      </section>

      {/* Coaches */}
      <section className="mt-5">
        <h4 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Coaches</h4>
        <ul className="mt-2 space-y-1.5">
          {doc.coaches.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <input
                className={input}
                value={c.name}
                onChange={(e) =>
                  onUpdate((d) => ({
                    ...d,
                    coaches: d.coaches.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  }))
                }
              />
              <input
                className={`${input} w-56`}
                type="email"
                placeholder="email (for the weekly programming)"
                value={c.email ?? ''}
                onChange={(e) =>
                  onUpdate((d) => ({
                    ...d,
                    coaches: d.coaches.map((x) =>
                      x.id === c.id
                        ? e.target.value
                          ? { ...x, email: e.target.value }
                          : (({ email: _drop, ...rest }) => rest)(x)
                        : x,
                    ),
                  }))
                }
              />
              <button
                type="button"
                title="Delete (classes become unassigned)"
                onClick={() =>
                  onUpdate((d) => ({
                    ...d,
                    coaches: d.coaches.filter((x) => x.id !== c.id),
                    scenarios: d.scenarios.map((s) => ({
                      ...s,
                      blocks: s.blocks.map((b) =>
                        b.coachId === c.id ? { ...b, coachId: null } : b,
                      ),
                    })),
                  }))
                }
                className="rounded px-1.5 py-0.5 text-sm text-ink-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onUpdate((d) => ({
              ...d,
              coaches: [...d.coaches, { id: newId('coach'), name: 'New coach' }],
            }))
          }
          className="mt-2 text-sm font-medium text-accent-600 hover:text-accent-700"
        >
          + Add coach
        </button>
      </section>

      {/* Rooms */}
      <section className="mt-5">
        <h4 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Rooms</h4>
        <ul className="mt-2 space-y-1.5">
          {doc.rooms.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <input
                className={input}
                value={r.name}
                onChange={(e) =>
                  onUpdate((d) => ({
                    ...d,
                    rooms: d.rooms.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)),
                  }))
                }
              />
              <button
                type="button"
                title="Delete (classes lose their room)"
                onClick={() =>
                  onUpdate((d) => ({
                    ...d,
                    rooms: d.rooms.filter((x) => x.id !== r.id),
                    scenarios: d.scenarios.map((s) => ({
                      ...s,
                      blocks: s.blocks.map((b) =>
                        b.roomId === r.id ? { ...b, roomId: null } : b,
                      ),
                    })),
                  }))
                }
                className="rounded px-1.5 py-0.5 text-sm text-ink-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            onUpdate((d) => ({
              ...d,
              rooms: [...d.rooms, { id: newId('room'), name: 'New room' }],
            }))
          }
          className="mt-2 text-sm font-medium text-accent-600 hover:text-accent-700"
        >
          + Add room
        </button>
      </section>
    </aside>
  );
}
