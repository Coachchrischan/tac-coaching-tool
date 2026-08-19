import { useState } from 'react';
import { useDoc } from '../../lib/useDoc';
import SaveBadge from '../../components/SaveBadge';

/** Split pasted text into to-do lines, stripping bullets and numbering. */
function toTodoLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·–—]|\d+[.)]|\[[ xX]\])\s*/, '').trim())
    .filter((l) => l.length > 0);
}

/**
 * Decide what a paste is. Short action-shaped lines are to-dos; anything
 * long or prose-shaped (a meeting summary, an email) is a note.
 */
function classifyPaste(text: string): 'todos' | 'note' | 'empty' {
  const lines = toTodoLines(text);
  if (lines.length === 0) return 'empty';
  const raw = text.split(/\r?\n/).filter((l) => l.trim());
  const bulleted = raw.filter((l) => /^\s*(?:[-*•·–—]|\d+[.)]|\[[ xX]\])\s/.test(l)).length;
  const longest = Math.max(...lines.map((l) => l.length));
  const avg = lines.reduce((n, l) => n + l.length, 0) / lines.length;

  // A single short line is just a to-do.
  if (lines.length === 1) return longest <= 120 ? 'todos' : 'note';
  // A tidy list: mostly bullets, nothing wordy.
  if (bulleted / raw.length >= 0.6 && longest <= 140 && lines.length <= 15) return 'todos';
  // Short punchy lines with no prose also read as a list.
  if (avg <= 60 && longest <= 100 && lines.length <= 10 && !/[.!?]\s/.test(text)) return 'todos';
  return 'note';
}

// Verbs that start a line someone intends to act on.
const ACTION_VERBS =
  /^(add|ask|book|build|buy|call|change|chase|check|confirm|create|decide|draft|email|finalise|finish|fix|follow up|get|give|introduce|invite|let|list|look|make|meet|message|move|order|organise|plan|prep|prepare|print|put|reach|record|remind|remove|reply|review|run|schedule|send|set|share|sort|speak|start|swap|talk|test|update|write)\b/i;

/** Lines from a note that read like something to do. */
function actionLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((raw) => {
      const bulleted = /^\s*(?:[-*•·–—]|\d+[.)]|\[[ xX]\])\s/.test(raw);
      const line = raw.replace(/^\s*(?:[-*•·–—]|\d+[.)]|\[[ xX]\])\s*/, '').trim();
      if (!line) return false;
      if (line.length > 160) return false;
      if (/^(action|to ?do|next step|follow[- ]up)s?\s*:?\s*$/i.test(line)) return false;
      // "Dave to send the list", "I'll book the room", "we need to confirm"
      const assigned = /^[A-Z][\w'-]*(?:\s+and\s+[A-Z][\w'-]*)?\s+to\s+\w+/.test(line);
      const committed = /\b(?:I'?ll|I will|we (?:need|have) to|need to|must)\s+\w+/i.test(line);
      return (
        bulleted ||
        ACTION_VERBS.test(line) ||
        assigned ||
        committed ||
        /\b(to ?do|action|follow up)\b/i.test(line)
      );
    })
    .map((raw) => raw.replace(/^\s*(?:[-*•·–—]|\d+[.)]|\[[ xX]\])\s*/, '').trim());
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlanningTab() {
  const planning = useDoc('planning');
  const program = useDoc('program');
  const [todoDraft, setTodoDraft] = useState('');
  const [paste, setPaste] = useState('');
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [lastFiled, setLastFiled] = useState<string | null>(null);

  if (!planning.data || !program.data) {
    return <p className="py-20 text-center text-sm text-ink-400">Loading…</p>;
  }

  function addTodo() {
    const text = todoDraft.trim();
    if (!text) return;
    planning.update((d) => ({
      ...d,
      todos: [...d.todos, { id: crypto.randomUUID(), text, done: false }],
    }));
    setTodoDraft('');
  }

  const pasteLines = toTodoLines(paste);
  const pasteKind = classifyPaste(paste);
  const pasteActions = pasteKind === 'note' ? actionLines(paste) : [];

  /** Keep the pasted text as a dated note; its first line becomes the title. */
  function saveAsNote() {
    const text = paste.trim();
    if (!text) return;
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const firstLine = lines[0].replace(/^\s*(?:[-*•·–—]|\d+[.)])\s*/, '').trim();
    const note = {
      id: crypto.randomUUID(),
      date: todayIso(),
      title: firstLine.slice(0, 80) || 'Pasted note',
      text,
    };
    planning.update((d) => ({ ...d, noteEntries: [note, ...(d.noteEntries ?? [])] }));
    setOpenNoteId(note.id);
    setPaste('');
  }

  /** Turn every non-empty pasted line into a to-do. */
  function saveAsTodos() {
    if (pasteLines.length === 0) return;
    addTodos(pasteLines);
    setPaste('');
  }

  function addTodos(lines: string[]) {
    if (lines.length === 0) return;
    planning.update((d) => ({
      ...d,
      todos: [...d.todos, ...lines.map((text) => ({ id: crypto.randomUUID(), text, done: false }))],
    }));
  }

  /**
   * One button for anything: a short list becomes to-dos, while prose (a
   * meeting summary, an email) is kept as a dated note AND has its action
   * lines lifted out into to-dos.
   */
  function fileIt() {
    const text = paste.trim();
    if (!text) return;
    if (pasteKind === 'todos') {
      saveAsTodos();
      setLastFiled(`Added ${pasteLines.length} to-do${pasteLines.length === 1 ? '' : 's'}.`);
      return;
    }
    const actions = actionLines(text);
    saveAsNote();
    addTodos(actions);
    setLastFiled(
      actions.length
        ? `Saved as a note and pulled out ${actions.length} to-do${actions.length === 1 ? '' : 's'}.`
        : 'Saved as a note.',
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink-950">Planning</h2>
        <SaveBadge
          state={planning.saveState}
          onReloadTheirs={planning.reloadTheirs}
          onKeepMine={planning.keepMine}
          onRetry={planning.retry}
        />
      </div>

      {/* Capture box: paste anything in, file it as a note or split into to-dos */}
      <section className="rounded-xl border border-accent-500/40 bg-accent-100/30 p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-accent-700 uppercase">
          Paste in
        </h3>
        <textarea
          className="mt-2 w-full resize-y rounded-md border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
          rows={5}
          placeholder="Paste a meeting summary, an email, a list of actions… then keep it as a dated note or split it into to-dos."
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pasteKind === 'empty'}
            onClick={fileIt}
            className="rounded-md bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
          {pasteKind !== 'empty' && (
            <span className="text-[12px] text-ink-500">
              {pasteKind === 'todos'
                ? `→ ${pasteLines.length} to-do${pasteLines.length === 1 ? '' : 's'}`
                : `→ a dated note${
                    pasteActions.length
                      ? ` + ${pasteActions.length} to-do${pasteActions.length === 1 ? '' : 's'}`
                      : ''
                  }`}
            </span>
          )}
          <span className="mx-1 h-4 w-px bg-ink-200" />
          <button
            type="button"
            disabled={!paste.trim()}
            onClick={() => {
              saveAsNote();
              setLastFiled('Saved as a note.');
            }}
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-600 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Note only
          </button>
          <button
            type="button"
            disabled={pasteLines.length === 0}
            onClick={() => {
              saveAsTodos();
              setLastFiled(`Added ${pasteLines.length} to-do${pasteLines.length === 1 ? '' : 's'}.`);
            }}
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-600 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            To-dos only
          </button>
          {paste.trim() && (
            <button
              type="button"
              onClick={() => setPaste('')}
              className="text-[12px] font-medium text-ink-400 hover:text-ink-950"
            >
              Clear
            </button>
          )}
          {lastFiled && !paste.trim() && (
            <span className="ml-auto text-[12px] font-medium text-accent-700">{lastFiled}</span>
          )}
        </div>
      </section>

      {/* Captured notes */}
      {(planning.data.noteEntries ?? []).length > 0 && (
        <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
            Notes ({(planning.data.noteEntries ?? []).length})
          </h3>
          <ul className="mt-3 divide-y divide-ink-100">
            {(planning.data.noteEntries ?? []).map((n) => {
              const open = openNoteId === n.id;
              return (
                <li key={n.id} className="py-2">
                  <div className="flex items-baseline gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenNoteId(open ? null : n.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-sm font-medium text-ink-950">{n.title}</span>
                      <span className="ml-2 text-[11px] text-ink-400">{fmtDate(n.date)}</span>
                      {!open && (
                        <span className="block truncate text-[12px] text-ink-500">
                          {n.text.split(/\r?\n/).slice(1).join(' ').trim() || ' '}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Turn this note's lines into to-dos"
                      onClick={() => {
                        const lines = toTodoLines(n.text);
                        if (lines.length === 0) return;
                        planning.update((d) => ({
                          ...d,
                          todos: [
                            ...d.todos,
                            ...lines.map((text) => ({
                              id: crypto.randomUUID(),
                              text,
                              done: false,
                            })),
                          ],
                        }));
                      }}
                      className="shrink-0 rounded border border-ink-300 px-1.5 py-0.5 text-[11px] font-medium text-ink-500 hover:text-ink-950"
                    >
                      → to-dos
                    </button>
                    <button
                      type="button"
                      title="Delete this note"
                      onClick={() =>
                        planning.update((d) => ({
                          ...d,
                          noteEntries: (d.noteEntries ?? []).filter((x) => x.id !== n.id),
                        }))
                      }
                      className="shrink-0 rounded px-1.5 py-0.5 text-sm text-ink-300 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                  {open && (
                    <textarea
                      className="mt-2 w-full resize-y rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[13px] leading-relaxed text-ink-950 focus:border-accent-600 focus:bg-white focus:outline-none"
                      rows={Math.min(20, Math.max(4, n.text.split(/\r?\n/).length))}
                      value={n.text}
                      onChange={(e) =>
                        planning.update((d) => ({
                          ...d,
                          noteEntries: (d.noteEntries ?? []).map((x) =>
                            x.id === n.id ? { ...x, text: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* To-dos */}
      <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">To-dos</h3>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
            placeholder="Add a to-do and press Enter"
            value={todoDraft}
            onChange={(e) => setTodoDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          />
          <button
            type="button"
            onClick={addTodo}
            className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
          >
            Add
          </button>
        </div>
        <ul className="mt-2 divide-y divide-ink-100">
          {planning.data.todos.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 py-2">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  planning.update((d) => ({
                    ...d,
                    todos: d.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                  }))
                }
                className="h-4 w-4 accent-accent-600"
              />
              <span className={`flex-1 text-sm ${t.done ? 'text-ink-400 line-through' : 'text-ink-950'}`}>
                {t.text}
              </span>
              <button
                type="button"
                onClick={() =>
                  planning.update((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== t.id) }))
                }
                className="rounded px-1.5 py-0.5 text-sm text-ink-300 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Free-form notes */}
      <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">Notes & links</h3>
        <textarea
          className="mt-2 w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm leading-relaxed text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
          rows={12}
          placeholder="Working notes: ideas, links, class mix thinking, attendance observations…"
          value={planning.data.notes}
          onChange={(e) => planning.update((d) => ({ ...d, notes: e.target.value }))}
        />
      </section>
    </div>
  );
}
