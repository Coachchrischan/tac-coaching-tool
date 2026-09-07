// The catalog replaced five hand-synchronised tables in four files; these
// assertions pin the derivations that every consumer now relies on.

import { describe, expect, it } from 'vitest';
import {
  FOCUS_CLASS_TYPE,
  FOCUS_DAY_PICK,
  FOCUS_LABEL,
  pushPlanFor,
  STREAM_DEFS,
  STREAM_FOR_CLASS,
} from './focusCatalog';
import { PATTERNS } from '../types/documents';

describe('focus catalog derivations', () => {
  it('every stream focus has a label and a class type', () => {
    for (const s of STREAM_DEFS) {
      for (const f of s.focuses) {
        expect(FOCUS_LABEL[f], `label for ${f}`).toBeTruthy();
        expect(FOCUS_CLASS_TYPE[f], `class type for ${f}`).toBeTruthy();
      }
    }
  });

  it('Lower / Upper / Full Body map to the three strength classes, and the archived A/B still resolve', () => {
    expect(FOCUS_CLASS_TYPE['lower']).toBe('lbs');
    expect(FOCUS_CLASS_TYPE['upper']).toBe('ubs');
    expect(FOCUS_CLASS_TYPE['full']).toBe('fbs');
    expect(FOCUS_CLASS_TYPE['full-a']).toBe('lbs');
    expect(FOCUS_CLASS_TYPE['full-b']).toBe('ubs');
    // Only the live 'full' focus points at the Full Body class.
    const toFbs = Object.entries(FOCUS_CLASS_TYPE).filter(([, ct]) => ct === 'fbs');
    expect(toFbs).toEqual([['full', 'fbs']]);
  });

  it('the Hyrox tracks split the two class days and ROX Engine stays parked', () => {
    expect(FOCUS_DAY_PICK['rox-strong']).toBe(0);
    expect(FOCUS_DAY_PICK['rox-race']).toBe(1);
    expect(FOCUS_DAY_PICK['rox-engine']).toBeNull();
  });

  it('only Strength pushes, Lower then Upper then Full Body, and the archived A/B never push', () => {
    expect(pushPlanFor('strength')).toEqual([
      { focus: 'lower', title: 'Day 1 - Lower' },
      { focus: 'upper', title: 'Day 2 - Upper' },
      { focus: 'full', title: 'Day 3 - Full Body' },
    ]);
    expect(pushPlanFor('esd')).toEqual([]);
    expect(pushPlanFor('hyrox')).toEqual([]);
    expect(pushPlanFor('gameday')).toEqual([]);
  });

  it('STREAM_FOR_CLASS covers the programmable class types', () => {
    expect(STREAM_FOR_CLASS['lbs']).toBe('strength');
    expect(STREAM_FOR_CLASS['fbs']).toBe('strength');
    expect(STREAM_FOR_CLASS['hyrox']).toBe('hyrox');
    expect(STREAM_FOR_CLASS['gameday']).toBe('gameday');
    expect(STREAM_FOR_CLASS['run']).toBeUndefined(); // not programmed here
  });

  it('sanity: the pattern taxonomy still holds nine patterns (import guard)', () => {
    expect(PATTERNS).toHaveLength(9);
  });
});
