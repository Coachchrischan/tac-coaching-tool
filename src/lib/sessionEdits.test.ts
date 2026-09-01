// Both shipped data-loss bugs lived in this class of code: the phase-grow
// clone that dropped circuits, and series edits touching circuit finishers.
// Pinned here now the functions live outside the 2,000-line component.

import { describe, expect, it } from 'vitest';
import {
  cloneSession,
  mapSeries,
  newSession,
  nextLabel,
  sessionHasContent,
} from './sessionEdits';
import type { Session, TimedBlock } from '../types/documents';

const circuitSession: Session = {
  id: 'c1',
  focus: 'esd',
  kind: 'circuit',
  circuit: [
    { id: 'p1', heading: 'AMRAP in 10', lines: [{ text: '10 cal row' }], restAfter: '2 min' },
  ],
};

const seriesSession: Session = {
  id: 's1',
  focus: 'full-a',
  kind: 'series',
  timedBlocks: [
    {
      id: 'a',
      label: 'A',
      minutes: 15,
      slots: [
        { id: 'sl1', exerciseId: 7, name: 'Back Squat', sets: '3', reps: '9', intensity: '65%' },
        { id: 'sl2', exerciseId: null, name: '' },
      ],
    },
    { id: 'ch', label: 'CHALLENGE', minutes: 3, kind: 'circuit', pieces: [] },
  ],
};

describe('cloneSession (the phase-grow bug)', () => {
  it('a circuit session clones its circuit, never a blank series shell', () => {
    const c = cloneSession(circuitSession);
    if (c.kind !== 'circuit') throw new Error('dropped the circuit');
    expect(c.circuit[0].heading).toBe('AMRAP in 10');
    expect(c.circuit[0].restAfter).toBe('2 min');
    expect(c.id).not.toBe(circuitSession.id);
  });

  it('a series clone keeps exercise names but blanks prescriptions (they progress weekly)', () => {
    const c = cloneSession(seriesSession);
    if (c.kind !== 'series') throw new Error('expected series');
    const slots = c.timedBlocks.flatMap((tb) => (tb.kind === 'circuit' ? [] : tb.slots));
    expect(slots.map((sl) => sl.name)).toEqual(['Back Squat']);
    expect(slots[0].sets).toBeUndefined();
    expect(slots[0].intensity).toBeUndefined();
  });
});

describe('mapSeries (the finisher-mangling guard)', () => {
  it('never hands a circuit part to the edit function', () => {
    const out = mapSeries(seriesSession.kind === 'series' ? seriesSession.timedBlocks : [], (b) => ({
      ...b,
      minutes: 99,
    }));
    const challenge = out.find((b) => b.label === 'CHALLENGE');
    expect(challenge?.minutes).toBe(3);
    expect(out.find((b) => b.label === 'A')?.minutes).toBe(99);
  });

  it('returning null drops only that series part', () => {
    const out = mapSeries(seriesSession.kind === 'series' ? seriesSession.timedBlocks : [], () => null);
    expect(out.map((b) => b.label)).toEqual(['CHALLENGE']);
  });
});

describe('sessionHasContent', () => {
  it('sees content in both formats and none in shells', () => {
    expect(sessionHasContent(circuitSession)).toBe(true);
    expect(sessionHasContent(seriesSession)).toBe(true);
    expect(sessionHasContent(newSession('esd', 'circuit'))).toBe(false);
  });
});

describe('newSession', () => {
  it('writes the session the way its stream is written', () => {
    expect(newSession('esd', 'circuit').kind).toBe('circuit');
    const s = newSession('full-a', 'series');
    if (s.kind !== 'series') throw new Error('expected series');
    expect(s.timedBlocks.length).toBeGreaterThan(0);
  });
});

describe('nextLabel', () => {
  const part = (label: string): TimedBlock => ({ id: label, label, minutes: 10, slots: [] });

  it('continues the alphabet', () => {
    expect(nextLabel([part('WU'), part('A'), part('B')])).toBe('C');
  });

  it('never mints a duplicate after a deletion', () => {
    // A, C on screen (B deleted): the old code produced C again.
    expect(nextLabel([part('A'), part('C')])).not.toBe('C');
    expect(nextLabel([part('A'), part('C')])).toBe('D');
  });

  it('starts at A on an empty session', () => {
    expect(nextLabel([])).toBe('A');
  });
});
