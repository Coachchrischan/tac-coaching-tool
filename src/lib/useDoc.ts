import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocEnvelope, DocId, DocTypes } from '../types/documents';
import { ConflictError, store } from './store';

const SAVE_DEBOUNCE_MS = 800;
const RETRY_MS = 3000;
const SAVED_DECAY_MS = 2500;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

export interface UseDoc<T> {
  data: T | null;
  saveState: SaveState;
  /** Apply a pure update to the document; persistence is debounced automatically. */
  update: (fn: (current: T) => T) => void;
  /** After a conflict: discard local changes and take the server's version. */
  reloadTheirs: () => void;
  /** After a conflict: keep local changes and overwrite the server's version. */
  keepMine: () => void;
  /** After a save error: retry immediately (errors also auto-retry on a timer). */
  retry: () => void;
}

export function useDoc<K extends DocId>(id: K): UseDoc<DocTypes[K]> {
  type T = DocTypes[K];

  const [data, setData] = useState<T | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const revRef = useRef(0);
  const dataRef = useRef<T | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const decayRef = useRef<number | null>(null);
  const conflictRef = useRef<DocEnvelope<unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    store
      .load(id)
      .then((env) => {
        if (cancelled) return;
        revRef.current = env.rev;
        dataRef.current = env.data;
        setData(env.data);
        setSaveState('idle');
      })
      .catch(() => {
        if (!cancelled) setSaveState('error');
      });

    // Never drop a pending debounced save: flush it if the page is closed or
    // the component unmounts (e.g. switching tabs right after typing). The
    // dirty flag is only cleared once the save actually succeeds.
    const flushPending = (keepalive: boolean) => {
      if (!dirtyRef.current || dataRef.current === null) return;
      void store
        .save(id, dataRef.current, revRef.current, { keepalive })
        .then((env) => {
          revRef.current = env.rev;
          dirtyRef.current = false;
        })
        .catch(() => {
          /* final-chance flush; conflicts surface on next load */
        });
    };
    const onBeforeUnload = () => flushPending(true);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (retryRef.current !== null) window.clearTimeout(retryRef.current);
      if (decayRef.current !== null) window.clearTimeout(decayRef.current);
      flushPending(false);
    };
  }, [id]);

  const flush = useCallback(() => {
    const current = dataRef.current;
    if (current === null) return;
    if (retryRef.current !== null) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    setSaveState('saving');
    store
      .save(id, current, revRef.current)
      .then((env) => {
        revRef.current = env.rev;
        if (dataRef.current === current) {
          // No newer edits arrived while saving: truly clean.
          dirtyRef.current = false;
          setSaveState('saved');
          if (decayRef.current !== null) window.clearTimeout(decayRef.current);
          decayRef.current = window.setTimeout(() => {
            setSaveState((s) => (s === 'saved' ? 'idle' : s));
          }, SAVED_DECAY_MS);
        }
        // else: an edit landed mid-flight; its debounce timer will flush again.
      })
      .catch((err: unknown) => {
        if (err instanceof ConflictError) {
          conflictRef.current = err.current;
          setSaveState('conflict');
        } else {
          // The edit is still unsaved: keep it dirty and retry on a timer.
          setSaveState('error');
          retryRef.current = window.setTimeout(flush, RETRY_MS);
        }
      });
  }, [id]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const update = useCallback(
    (fn: (current: T) => T) => {
      const current = dataRef.current;
      if (current === null) return;
      const next = fn(current);
      dataRef.current = next;
      dirtyRef.current = true;
      setData(next);
      setSaveState('dirty');
      scheduleSave();
    },
    [scheduleSave],
  );

  const reloadTheirs = useCallback(() => {
    const theirs = conflictRef.current;
    if (!theirs) return;
    conflictRef.current = null;
    revRef.current = theirs.rev;
    dataRef.current = theirs.data as T;
    dirtyRef.current = false;
    setData(theirs.data as T);
    setSaveState('idle');
  }, []);

  const keepMine = useCallback(() => {
    const theirs = conflictRef.current;
    if (!theirs) return;
    conflictRef.current = null;
    revRef.current = theirs.rev; // retry on top of their rev
    flush();
  }, [flush]);

  return { data, saveState, update, reloadTheirs, keepMine, retry: flush };
}

/** Pick the doc whose save state most urgently needs the coach's attention.
 *  Prevents one doc's 'saved'/'idle' from masking another's conflict or error. */
const SEVERITY: Record<SaveState, number> = {
  conflict: 5,
  error: 4,
  saving: 3,
  dirty: 2,
  saved: 1,
  idle: 0,
};

export function mostUrgent<T extends { saveState: SaveState }>(docs: T[]): T {
  return docs.reduce((worst, d) =>
    SEVERITY[d.saveState] > SEVERITY[worst.saveState] ? d : worst,
  );
}
