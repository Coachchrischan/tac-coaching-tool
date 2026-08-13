import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryExercise, RankedExercise } from '../lib/library';

/**
 * Keyboard-first exercise autocomplete, in the spirit of TrainHeroic:
 * type to filter, ↓/↑ to move, Enter to select, Tab to select AND move to the
 * next field, Esc to keep free text. Free text is always allowed.
 */
export default function Combobox({
  value,
  search,
  onCommit,
  placeholder,
  autoFocus,
}: {
  value: string;
  search: (query: string) => RankedExercise[];
  onCommit: (name: string, exercise: LibraryExercise | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  const results = useMemo(() => (open ? search(text) : []), [open, search, text]);
  const clamped = Math.min(highlight, Math.max(results.length - 1, 0));

  function commitExercise(r: RankedExercise) {
    setText(r.exercise.title);
    setOpen(false);
    onCommit(r.exercise.title, r.exercise);
  }

  function commitFreeText() {
    setOpen(false);
    if (text !== value) onCommit(text, null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && open && results.length) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && open && results.length) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && !e.ctrlKey) {
      if (open && results[clamped]) {
        e.preventDefault();
        commitExercise(results[clamped]);
      } else {
        commitFreeText();
      }
    } else if (e.key === 'Tab') {
      // Select the highlighted match and let focus move on to Sets.
      if (open && results[clamped]) {
        commitExercise(results[clamped]);
      } else {
        commitFreeText();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commitFreeText();
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        className="w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-950 placeholder:text-ink-300 focus:border-accent-600 focus:outline-none"
        value={text}
        placeholder={placeholder ?? 'Exercise…'}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => text && setOpen(true)}
        onBlur={() => {
          // Delay so option mousedown can fire first.
          window.setTimeout(() => {
            setOpen(false);
            commitFreeText();
          }, 120);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full left-0 z-30 mt-1 max-h-64 w-full min-w-64 overflow-y-auto rounded-md border border-ink-200 bg-white py-1 shadow-lg">
          {results.map((r, i) => (
            <li key={r.exercise.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitExercise(r);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm ${
                  i === clamped ? 'bg-accent-100 text-ink-950' : 'text-ink-700'
                }`}
              >
                <span className="truncate">{r.exercise.title}</span>
                {r.exercise.custom && (
                  <span className="shrink-0 rounded bg-accent-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    CUSTOM
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
