// THE storage module. Every component persists through this interface and
// nothing else. No localStorage, no direct fetch calls elsewhere.
//
// Backend: Vite middleware writing data/*.json (src/server/storagePlugin.ts),
// on both dev and preview servers. This local-first shape IS the architecture
// for a one-coach, two-machine tool; both 2026-09-01 review panels ruled a
// hosted database over-engineering until a second concurrent editor exists.

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
    opts?: SaveOptions & {
      /**
       * The updatedAt of the version this edit is based on. Sent so the
       * server can 409 on equal-rev divergence across the two machines
       * (rev numbers alone are not globally unique).
       */
      baseUpdatedAt?: string;
    },
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

/** The server writes real recovery guidance into error bodies (which file was
 *  quarantined, where the snapshots live); swallowing it left the coach with
 *  a bare status code at exactly the wrong moment. */
function serverError(prefix: string, res: Response, body: unknown): Error {
  const detail = (body as { error?: string })?.error;
  return new Error(detail ? `${prefix}: ${detail}` : `${prefix} (${res.status})`);
}

export const store: Store = {
  async load(id) {
    const res = await fetch(`${BASE}/${id}`);
    const body = await parseJson(res);
    if (!res.ok) throw serverError(`Failed to load '${id}'`, res, body);
    return body as DocEnvelope<never>;
  },

  async save(id, data, baseRev, opts) {
    const res = await fetch(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, baseRev, baseUpdatedAt: opts?.baseUpdatedAt }),
      keepalive: opts?.keepalive ?? false,
    });
    const body = await parseJson(res);
    if (res.status === 409) {
      throw new ConflictError((body as { current: DocEnvelope<unknown> }).current);
    }
    if (!res.ok) throw serverError(`Failed to save '${id}'`, res, body);
    return body as DocEnvelope<never>;
  },
};
