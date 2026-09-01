// Pins the prescription-to-TrainHeroic mapping (both prior push bugs were
// translation-shape bugs) and the circuit-to-instruction text.

import { describe, expect, it } from 'vitest';
import { buildCue, circuitPartText, mapReps } from './pushMapping';

describe('mapReps', () => {
  it('plain numbers stay numbers', () => {
    expect(mapReps('9')).toEqual({ reps: 9, note: null });
  });

  it('each-side moves to the note', () => {
    expect(mapReps('8 ea')).toEqual({ reps: 8, note: 'each side' });
  });

  it('holds carry the seconds unit', () => {
    expect(mapReps('30 sec')).toEqual({ reps: 30, repUnit: 'seconds', note: null });
    expect(mapReps('30 sec ea')).toEqual({ reps: 30, repUnit: 'seconds', note: 'each side' });
  });

  it('open sets keep the floor number and aim in the note', () => {
    expect(mapReps('10+')).toEqual({ reps: 10, note: 'aim 10+' });
  });

  it('RIR never renders as MAX (the most misread rep prescription)', () => {
    const m = mapReps('2 RIR');
    expect(m.reps).toBe('');
    expect(m.note).toContain('leaving 2 in reserve');
  });

  it('bare MAX never reaches the app unexplained', () => {
    expect(mapReps('MAX')).toEqual({ reps: '', note: 'as many quality reps as possible' });
  });

  it('free text falls through to the note with empty reps', () => {
    expect(mapReps('as many as week 1')).toEqual({ reps: '', note: 'as many as week 1' });
  });

  it('empty stays empty', () => {
    expect(mapReps('')).toEqual({ reps: '', note: null });
    expect(mapReps(undefined)).toEqual({ reps: '', note: null });
  });
});

describe('buildCue', () => {
  it('joins percentage, RPE, tempo, rep note and slot note in order', () => {
    expect(
      buildCue({ intensity: '65%', rpe: '7-8', tempo: '30X1', note: 'wave up' }, 'each side'),
    ).toBe('@ 65% · RPE 7-8 · 30X1 tempo · each side · wave up');
  });

  it('omits everything absent', () => {
    expect(buildCue({}, null)).toBe('');
    expect(buildCue({ rpe: '8' }, null)).toBe('RPE 8');
  });
});

describe('circuitPartText', () => {
  it('writes a challenge out as member-readable lines', () => {
    const text = circuitPartText({
      label: 'CHALLENGE',
      note: '3 minutes, all in',
      pieces: [
        {
          heading: 'AMRAP in 3 minutes',
          lines: [{ text: '10 wall balls', load: '6kg' }, { text: '10 cal row' }],
          restAfter: 'none',
        },
      ],
    });
    expect(text).toContain('CHALLENGE: 3 minutes, all in');
    expect(text).toContain('AMRAP in 3 minutes');
    expect(text).toContain('- 10 wall balls @ 6kg');
    expect(text).toContain('- 10 cal row');
    expect(text).toContain('Rest: none');
  });
});
