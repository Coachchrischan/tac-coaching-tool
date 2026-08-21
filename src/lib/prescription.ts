// Tidying what gets typed into a prescription cell.
//
// The intensity column is headed "%", so a bare number in it means per cent.
// Left alone, the same block ends up holding "70%" in one week and "75" in the
// next, which then reaches the TrainHeroic cue as "@ 75" and the wall as a
// number with no unit.

/**
 * A bare number, decimal or range in the % column is a percentage: "70" becomes
 * "70%", "70-75" becomes "70-75%". Anything already carrying a % is untouched,
 * and anything that is not a number ("BW", "as last week") is left exactly as
 * the coach wrote it.
 */
import type { LibraryOverridesDoc, ScaledOption } from '../types/documents';

/** What identifies an exercise for the purpose of hanging scales off it. */
export interface ScaleRef {
  exerciseId: number | null;
  name: string;
}

/**
 * Where an exercise's scales are stored.
 *
 * Scales used to be keyed by the TrainHeroic library id alone, so anything
 * written as free text ("DB or Plate Drag Through", eleven of the thirty-six
 * exercises in the club's programming) could not be scaled at all: there was
 * nowhere to put them. A free-text exercise is keyed by its name instead, so
 * it behaves like every other exercise and its scales still follow it
 * everywhere that name appears.
 *
 * Library exercises keep their numeric key. JSON object keys are strings
 * anyway, so documents written before this need no migration.
 */
export function scaleKey(ref: ScaleRef): string | null {
  if (ref.exerciseId !== null) return String(ref.exerciseId);
  const name = ref.name.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/**
 * The scaled options for an exercise. Older documents stored plain strings, so
 * lift those to a named option with no prescription of its own.
 */
export function scaleOptions(
  overrides: LibraryOverridesDoc,
  ref: ScaleRef,
): ScaledOption[] {
  const key = scaleKey(ref);
  if (key === null) return [];
  return (overrides.scales[key] ?? []).map((s) => (typeof s === 'string' ? { name: s } : s));
}

/** What a scaled option reads as on one line: "DB Goblet Squat  3 x 10  20kg". */
export function scaleSummary(o: ScaledOption): string {
  const detail = [
    o.sets && o.reps ? `${o.sets} x ${o.reps}` : o.reps,
    o.load ? `${o.load}kg` : null,
    o.intensity ? `@ ${o.intensity}` : null,
    o.rpe ? `RPE ${o.rpe}` : null,
    o.tempo ? `${o.tempo} tempo` : null,
  ]
    .filter(Boolean)
    .join('  ');
  return detail ? `${o.name}  ${detail}` : o.name;
}

export function normaliseIntensity(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v || v.endsWith('%')) return v;
  return /^\d+(\.\d+)?(\s*[-–]\s*\d+(\.\d+)?)?$/.test(v) ? `${v}%` : v;
}
