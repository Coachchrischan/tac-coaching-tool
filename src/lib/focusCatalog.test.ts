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

  it('the three-day split maps Lower, Upper and Full Body to the three strength classes', () => {
    // The club runs Upper on Tuesday and Lower on Thursday, so upper takes
    // the Tuesday class (lbs) and lower the Thursday one (ubs). Checked
    // against the TrainHeroic calendar on 2026-09-18.
    expect(FOCUS_CLASS_TYPE['upper']).toBe('lbs');
    expect(FOCUS_CLASS_TYPE['lower']).toBe('ubs');
    expect(FOCUS_CLASS_TYPE['full']).toBe('fbs');
    // The archived A/B focuses keep their class types so the Primer weeks and
    // the archive still resolve.
    expect(FOCUS_CLASS_TYPE['full-a']).toBe('lbs');
    expect(FOCUS_CLASS_TYPE['full-b']).toBe('ubs');
  });

  it('the Hyrox tracks split the two class days and ROX Engine stays parked', () => {
    expect(FOCUS_DAY_PICK['rox-strong']).toBe(0);
    expect(FOCUS_DAY_PICK['rox-race']).toBe(1);
    expect(FOCUS_DAY_PICK['rox-engine']).toBeNull();
  });

  it('only Strength pushes, Upper then Lower then Full Body, with the ratified titles', () => {
    expect(pushPlanFor('strength')).toEqual([
      { focus: 'upper', title: 'Upper Body' },
      { focus: 'lower', title: 'Lower Body' },
      { focus: 'full', title: 'Full Body' },
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
