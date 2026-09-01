import { useEffect, useState } from 'react';

/**
 * Two quiet guards from the 2026-09-01 roundtable:
 *
 * - Timezone: every date in the tool is "machine local". That is only correct
 *   while the machine thinks it is in Brisbane; a travelling laptop or a
 *   mis-set clock shifts "today", the open week, and push dates.
 * - Foreign machine: the program document names the machine that last wrote
 *   it. Seeing the OTHER machine's name right after a pull is normal; seeing
 *   it while both machines are mid-edit means the sync needs sorting before
 *   editing here manufactures a conflict.
 */
export default function SystemBanners() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const found: string[] = [];
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz !== 'Australia/Brisbane') {
        found.push(
          `This machine's timezone is ${tz}, not Australia/Brisbane. Every date in the tool ` +
            `(today's classes, week dates, TrainHeroic push dates) follows the machine clock, ` +
            `so fix the timezone before trusting any of them.`,
        );
      }
    } catch {
      /* Intl unavailable: nothing useful to say */
    }

    // Meta only (rev, machine), never the payloads: checking the writing
    // machine must not download 300KB of programming, and it must cover
    // every document the two machines actually edit.
    const CHECK = ['program', 'schedule', 'annual-plan', 'library-overrides', 'layouts'];
    void Promise.all(
      CHECK.map((id) =>
        fetch(`/api/store/${id}/meta`)
          .then((r) => (r.ok ? r.json() : null))
          .then((meta: { machine?: string; currentMachine?: string } | null) => ({ id, meta }))
          .catch(() => ({ id, meta: null })),
      ),
    ).then((results) => {
      const foreign = results.filter(
        (r) => r.meta?.machine && r.meta.currentMachine && r.meta.machine !== r.meta.currentMachine,
      );
      if (foreign.length > 0) {
        found.push(
          `Last saved on ${foreign[0].meta?.machine}, not this machine: ` +
            `${foreign.map((f) => f.id).join(', ')}. Fine if you have just pulled; if both ` +
            `machines hold unsynced edits, sort the sync before editing here.`,
        );
      }
      setMessages([...found]);
    });
  }, []);

  if (messages.length === 0) return null;
  return (
    <div className="bg-amber-100 px-6 py-2 text-[13px] text-amber-900">
      {messages.map((m) => (
        <p key={m}>⚠ {m}</p>
      ))}
    </div>
  );
}
