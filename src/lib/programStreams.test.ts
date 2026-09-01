// Regression tests for session migration. The original bug: `circuit` was an
// optional field beside `timedBlocks`, so any writer that spread a session
// could silently drop the circuit and the coach found a blank board. The
// discriminated union plus migrate-on-read is pinned here.

import { describe, expect, it } from 'vitest';
import { circuitParts, migrateSession, seriesBlocks, streamsOf } from './programStreams';
import type { CircuitLine, ProgramDoc, Session } from '../types/documents';

const legacySeries = {
  id: 's1',
  focus: 'full-a',
  timedBlocks: [
    { id: 'tb1', label: 'A', minutes: 15, slots: [{ id: 'sl1', exerciseId: 1, name: 'Back Squat' }] },
  ],
  circuit: [],
} as unknown as Session;

const legacyCircuit = {
  id: 's2',
  focus: 'esd',
  timedBlocks: [],
  circuit: [{ id: 'c1', heading: 'AMRAP in 10 minutes', lines: ['10 cal row', '10 burpees'] }],
} as unknown as Session;

describe('migrateSession', () => {
  it('a pre-kind session with slots becomes a series and drops the circuit field', () => {
    const next = migrateSession(legacySeries, 'series');
    expect(next.kind).toBe('series');
    expect('circuit' in next).toBe(false);
  });

  it('a pre-kind session with circuit content becomes a circuit even in a series stream', () => {
    const next = migrateSession(legacyCircuit, 'series');
    expect(next.kind).toBe('circuit');
    expect('timedBlocks' in next).toBe(false);
  });

  it('legacy string circuit lines are lifted to { text }', () => {
    const next = migrateSession(legacyCircuit, 'circuit');
    if (next.kind !== 'circuit') throw new Error('expected circuit');
    expect(next.circuit[0].lines[0]).toEqual({ text: '10 cal row' });
  });

  it('an empty shell takes the stream format', () => {
    const shell = { id: 's3', focus: 'esd', timedBlocks: [], circuit: [] } as unknown as Session;
    expect(migrateSession(shell, 'circuit').kind).toBe('circuit');
    expect(migrateSession(shell, 'series').kind).toBe('series');
  });

  it('preserves object identity when nothing needs migrating (React stability)', () => {
    const already: Session = {
      id: 's4',
      focus: 'full-a',
      kind: 'series',
      timedBlocks: [],
    };
    expect(migrateSession(already, 'series')).toBe(already);
    const alreadyCircuit: Session = {
      id: 's5',
      focus: 'esd',
      kind: 'circuit',
      circuit: [{ id: 'c', heading: 'h', lines: [{ text: 'x' } as CircuitLine] }],
    };
    expect(migrateSession(alreadyCircuit, 'circuit')).toBe(alreadyCircuit);
  });
});

describe('seriesBlocks / circuitParts', () => {
  it('a series edit can never touch a circuit part', () => {
    const blocks = [
      { id: 'a', label: 'A', minutes: 10, slots: [] },
      { id: 'b', label: 'B', minutes: 8, kind: 'circuit' as const, pieces: [] },
    ];
    expect(seriesBlocks(blocks).map((b) => b.id)).toEqual(['a']);
    expect(circuitParts(blocks).map((b) => b.id)).toEqual(['b']);
  });
});

describe('streamsOf', () => {
  it('migrates the pre-streams blocks shape into a strength stream', () => {
    const doc = { blocks: [{ id: 'p1', name: 'Phase 1', weeks: [] }] } as unknown as ProgramDoc;
    const streams = streamsOf(doc);
    expect(streams).toHaveLength(1);
    expect(streams[0].id).toBe('strength');
  });

  it('an empty doc yields no streams rather than crashing', () => {
    expect(streamsOf({} as ProgramDoc)).toEqual([]);
  });
});
