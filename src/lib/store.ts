// THE storage module. Every component persists through this interface and
// nothing else. No localStorage, no direct fetch calls elsewhere.
//
// Backend today: Vite dev middleware writing data/*.json (src/server/storagePlugin.ts).
// Backend later: Vercel serverless functions over Postgres/Supabase serving the
// exact same routes. Swapping backends must not touch any UI code.

import type { DocEnvelope, DocId, DocTypes } from '../types/documents';

export class ConflictError extends Error {
  current: DocEnvelope<unknown>;

  constructor(current: DocEnvelope<unknown>) {
    super('Document was changed by someone else');
    this.name = 'ConflictError';
    this.current = current;
  }
}

export interface SaveOptions {
  /** Keep the request alive through page unload (final flush on close). */
  keepalive?: boolean;
}

export interface Store {
  load<K extends DocId>(id: K): Promise<DocEnvelope<DocTypes[K]>>;
  save<K extends DocId>(
    id: K,
    data: DocTypes[K],
    baseRev: number,
    opts?: SaveOptions,
  ): Promise<DocEnvelope<DocTypes[K]>>;
}

const BASE = '/api/store';

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error(`Store request failed (${res.status})`);
  }
}

export const store: Store = {
  async load(id) {
    const res = await fetch(`${BASE}/${id}`);
    const body = await parseJson(res);
    if (!res.ok) throw new Error(`Failed to load '${id}' (${res.status})`);
    return body as DocEnvelope<never>;
  },

  async save(id, data, baseRev, opts) {
    const res = await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, baseRev }),
      keepalive: opts?.keepalive ?? false,
    });
    const body = await parseJson(res);
    if (res.status === 409) {
      throw new ConflictError((body as { current: DocEnvelope<unknown> }).current);
    }
    if (!res.ok) throw new Error(`Failed to save '${id}' (${res.status})`);
    return body as DocEnvelope<never>;
  },
};
