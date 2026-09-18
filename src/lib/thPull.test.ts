// The pull is the inverse of the push, so it is tested as one: every slot goes
// through the REAL push mapping into the payload TrainHeroic stores, then back
// through the pull, and has to come out as it went in.
//
// That is the strongest check available without a live token, and it is the
// one that matters: if either side is changed on its own, this goes red.

import { describe, expect, it } from 'vitest';
import { buildCue, mapReps } from './pushMapping';
import { parseCue, teamSessionOn, thExerciseToSlot, thToTimedBlocks, type ThExercise } from './thPull';
import type { ExerciseSlot, SeriesBlock } from '../types/documents';

/**
 * What the push plugin sends for one slot, in TrainHeroic's stored shape.
 * Mirrors teamPushPlugin's addExercise call and thClient's
 * buildExercisePayload; both are quoted in the comments there.
 */
function pushToTrainHeroic(slot: ExerciseSlot, blockTitle = 'A'): ThExercise {
  const { reps, repUnit, note } = mapReps(slot.reps);
  const cue = buildCue(slot, note);
  const sets = Number(slot.sets) || 1;
  const loadKg =
    slot.load && /^\d+(\.\d+)?$/.test(String(slot.load).trim()) ? Number(slot.load) : null;

  const e: ThExercise = {
    title: slot.name,
    instruction: cue,
    param_1_type: repUnit === 'seconds' ? 18 : 3,
    param_2_type: loadKg !== null ? 19 : 0,
    param_count: sets,
    set_num: sets,
    blockTitle,
  };
  for (let i = 1; i <= sets; i++) e[`param_1_data_${i}`] = String(reps);
  if (loadKg !== null) for (let i = 1; i <= sets; i++) e[`param_2_data_${i}`] = String(loadKg);
  return e;
}

function roundTrip(slot: ExerciseSlot): ExerciseSlot {
  return thExerciseToSlot(pushToTrainHeroic(slot), slot.id);
}

const slot = (over: Partial<ExerciseSlot>): ExerciseSlot => ({
  id: 's1',
  exerciseId: null,
  name: 'Barbell Back Squats',
  ...over,
});

describe('the TrainHeroic round trip', () => {
  it('brings a plain prescription back unchanged', () => {
    const s = slot({ sets: '3', reps: '9', intensity: '70%' });
    expect(roundTrip(s)).toEqual(s);
  });

  it('brings back each-side reps, which TrainHeroic cannot hold', () => {
    const s = slot({ name: 'DB or Plate Drag Through', sets: '3', reps: '8ea' });
    expect(roundTrip(s)).toEqual(s);
  });

  it('brings back RPE and tempo out of the cue', () => {
    const s = slot({
      name: 'Tempo Barbell Bench Press',
      sets: '3',
      reps: '7',
      intensity: '75%',
      tempo: '30X1',
      rpe: '8',
    });
    expect(roundTrip(s)).toEqual(s);
  });

  it('brings back a seconds-each-side hold', () => {
    const s = slot({ name: 'Reverse Copenhagen Plank', sets: '3', reps: '30sec ea' });
    expect(roundTrip(s)).toEqual(s);
  });

  it('brings back an open-ended rep target', () => {
    const s = slot({ name: 'Cyclist Squat Finisher (1 &1/4)', sets: '3', reps: '10+' });
    expect(roundTrip(s)).toEqual(s);
  });

  it('brings back a rep range', () => {
    const s = slot({ name: 'DB Rear Delt Fly', sets: '3', reps: '12-15' });
    expect(roundTrip(s)).toEqual(s);
  });

  it('keeps a load in kilograms', () => {
    const s = slot({ name: 'Barbell Hip Thrust', sets: '3', reps: '8', load: '60' });
    expect(roundTrip(s)).toEqual(s);
  });

  it('keeps the coach note, and keeps it apart from the rep note', () => {
    const s = slot({
      name: 'DB Bicep Curls',
      sets: '3',
      reps: '10ea',
      note: 'Superset with tricep push ups.',
    });
    expect(roundTrip(s)).toEqual(s);
  });

  it('normalises RIR spacing, and is then stable', () => {
    const once = roundTrip(slot({ name: 'Tricep Push Ups', sets: '3', reps: '1RIR' }));
    // The cue says "leaving 1 in reserve", so the spacing of the original
    // cell is not recoverable. It comes back canonical and stays there.
    expect(once.reps).toBe('1 RIR');
    expect(roundTrip(once)).toEqual(once);
  });

  it('loses the library id, because a team calendar does not carry one', () => {
    const s = slot({ exerciseId: 688272, sets: '3', reps: '9' });
    expect(roundTrip(s).exerciseId).toBeNull();
  });
});

describe('parseCue', () => {
  it('returns nothing for an empty cue', () => {
    expect(parseCue(undefined)).toEqual({});
    expect(parseCue('   ')).toEqual({});
  });

  it('leaves a coach’s own words as the note', () => {
    expect(parseCue('Stagger the rig: half on the minute, half on the 30')).toEqual({
      note: 'Stagger the rig: half on the minute, half on the 30',
    });
  });
});

describe('thToTimedBlocks', () => {
  const blocks = [
    { id: 11, title: 'WU', order: 1 },
    { id: 12, title: 'A', order: 2 },
    { id: 13, title: 'B', order: 3 },
  ];
  const exercises: ThExercise[] = [
    { ...pushToTrainHeroic(slot({ name: 'Rower easy', sets: '1', reps: '3' }), 'WU'), set_id: 11 },
    { ...pushToTrainHeroic(slot({ sets: '3', reps: '9', intensity: '70%' }), 'A'), set_id: 12 },
    { ...pushToTrainHeroic(slot({ name: 'Depth Jump', sets: '3', reps: '5' }), 'A'), set_id: 12 },
  ];

  it('rebuilds the series in order, with the tool’s own minutes', () => {
    const out = thToTimedBlocks(blocks, exercises, 'pull', (label) => (label === 'WU' ? 8 : 20));
    expect(out.map((b) => b.label)).toEqual(['WU', 'A']); // B had nothing in it
    expect(out[0].minutes).toBe(8);
    expect(out[1].minutes).toBe(20);
    expect(out[1].kind).toBe('series');
    expect((out[1] as SeriesBlock).slots.map((s) => s.name)).toEqual(['Barbell Back Squats', 'Depth Jump']);
    expect((out[1] as SeriesBlock).slots[0].intensity).toBe('70%');
  });
});

describe('teamSessionOn', () => {
  // The team calendar nests differently from the athlete one, so the objects
  // are found by their own fields. This is that response's shape, flattened
  // the way `walk` delivers it.
  const objects: Record<string, unknown>[] = [
    { id: 1, workout_id: 900, title: 'Day 1 - Lower Body', program_type: 2, year: 2026, month: 9, day: 22, published: null },
    { id: 2, workout_id: 901, title: 'Some other day', program_type: 2, year: 2026, month: 9, day: 25, published: null },
    { id: 50, workout_id: 900, title: 'WU', order: 1, type: 4 },
    { id: 51, workout_id: 900, title: 'A', order: 2, type: 4 },
    { id: 52, workout_id: 901, title: 'A', order: 1, type: 4 },
    { ...pushToTrainHeroic(slot({ name: 'Rower easy', sets: '1', reps: '3' }), 'WU'), id: 70, set_id: 50, order: 1 },
    { ...pushToTrainHeroic(slot({ sets: '3', reps: '9', intensity: '70%' }), 'A'), id: 71, set_id: 51, order: 1 },
    { ...pushToTrainHeroic(slot({ name: 'Wrong day', sets: '3', reps: '5' }), 'A'), id: 72, set_id: 52, order: 1 },
  ];

  it('finds the session on exactly that day, with only its own blocks', () => {
    const got = teamSessionOn(objects, 2026, 9, 22)!;
    expect(got.session.title).toBe('Day 1 - Lower Body');
    expect(got.blocks.map((b) => b.title)).toEqual(['WU', 'A']);
    expect(got.exercises.map((e) => e.title)).toEqual(['Rower easy', 'Barbell Back Squats']);
    // The other day's exercise never leaks in.
    expect(got.exercises.some((e) => e.title === 'Wrong day')).toBe(false);
  });

  it('tags each exercise with its block, so the series rebuild', () => {
    const got = teamSessionOn(objects, 2026, 9, 22)!;
    const built = thToTimedBlocks(got.blocks, got.exercises, 'p', () => 20);
    expect(built.map((b) => b.label)).toEqual(['WU', 'A']);
    expect((built[1] as SeriesBlock).slots[0].intensity).toBe('70%');
  });

  it('returns null for a day with nothing on it', () => {
    expect(teamSessionOn(objects, 2026, 9, 23)).toBeNull();
  });
});
