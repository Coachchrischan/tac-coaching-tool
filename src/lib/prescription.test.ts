// Pins the free-text scale keying (eleven of thirty-six live exercises have
// no TrainHeroic id) and the bare-number percentage lift.

import { describe, expect, it } from 'vitest';
import {
  effectiveScales,
  normaliseIntensity,
  scaleKey,
  scaleOptions,
  scaleSummary,
} from './prescription';
import type { LibraryOverridesDoc } from '../types/documents';

describe('scaleKey', () => {
  it('library exercises key by id', () => {
    expect(scaleKey({ exerciseId: 252, name: 'Diamond Push-Up' })).toBe('252');
  });

  it('free-text exercises key by lower-cased name', () => {
    expect(scaleKey({ exerciseId: null, name: 'DB or Plate Drag Through' })).toBe(
      'name:db or plate drag through',
    );
  });

  it('an unnamed free-text slot has nowhere to hang scales', () => {
    expect(scaleKey({ exerciseId: null, name: '  ' })).toBeNull();
  });
});

describe('scaleOptions', () => {
  const overrides = {
    scales: {
      '252': ['Knee push-up', { name: 'Incline push-up', sets: '3', reps: '10' }],
    },
  } as unknown as LibraryOverridesDoc;

  it('lifts legacy plain-string scales to named options', () => {
    const opts = scaleOptions(overrides, { exerciseId: 252, name: 'Diamond Push-Up' });
    expect(opts[0]).toEqual({ name: 'Knee push-up' });
    expect(opts[1].sets).toBe('3');
  });

  it('returns empty for an exercise with no scales', () => {
    expect(scaleOptions(overrides, { exerciseId: 999, name: 'x' })).toEqual([]);
  });
});

describe('effectiveScales', () => {
  const overrides = {
    scales: { '100': [{ name: 'Shared scale' }] },
  } as unknown as LibraryOverridesDoc;

  it('a slot override wins when any of its scales is named', () => {
    const out = effectiveScales(overrides, {
      exerciseId: 100,
      name: 'Wall Ball',
      scales: [{ name: 'Lighter ball' }],
    });
    expect(out[0].name).toBe('Lighter ball');
  });

  it('an empty or absent override falls back to the shared scales', () => {
    expect(effectiveScales(overrides, { exerciseId: 100, name: 'Wall Ball' })[0].name).toBe(
      'Shared scale',
    );
    expect(
      effectiveScales(overrides, { exerciseId: 100, name: 'Wall Ball', scales: [{ name: ' ' }] })[0]
        .name,
    ).toBe('Shared scale');
  });
});

describe('scaleSummary', () => {
  it('renders a full prescription on one line', () => {
    expect(
      scaleSummary({ name: 'DB Goblet Squat', sets: '3', reps: '10', load: '20' }),
    ).toBe('DB Goblet Squat  3 x 10  20kg');
  });

  it('a bare name stays a bare name', () => {
    expect(scaleSummary({ name: 'Band pull-apart' })).toBe('Band pull-apart');
  });
});

describe('normaliseIntensity (the % column)', () => {
  it('a bare number becomes a percentage', () => {
    expect(normaliseIntensity('70')).toBe('70%');
    expect(normaliseIntensity('67.5')).toBe('67.5%');
  });

  it('a range becomes a percentage range', () => {
    expect(normaliseIntensity('70-75')).toBe('70-75%');
  });

  it('already-percented and non-numeric values pass through', () => {
    expect(normaliseIntensity('75%')).toBe('75%');
    expect(normaliseIntensity('BW')).toBe('BW');
    expect(normaliseIntensity('as last week')).toBe('as last week');
    expect(normaliseIntensity(undefined)).toBe('');
  });
});
