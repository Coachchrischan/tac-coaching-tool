import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocEnvelope, DocId, DocTypes } from '../types/documents';
import { ConflictError, store } from './store';

const SAVE_DEBOUNCE_MS = 800;

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
}

export function useDoc<K extends DocId>(id: K): UseDoc<DocTypes[K]> {
  type T = DocTypes[K];

  const [data, setData] = useState<T | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const revRef = useRef(0);
  const dataRef = useRef<T | null>(null);
  const timerRef = useRef<number | null>(null);
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
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [id]);

  const flush = useCallback(() => {
    const current = dataRef.current;
    if (current === null) return;
    setSaveState('saving');
    store
      .save(id, current, revRef.current)
      .then((env) => {
        revRef.current = env.rev;
        setSaveState('saved');
      })
      .catch((err: unknown) => {
        if (err instanceof ConflictError) {
          conflictRef.current = err.current;
          setSaveState('conflict');
        } else {
          setSaveState('error');
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

  return { data, saveState, update, reloadTheirs, keepMine };
}
