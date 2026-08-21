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
export function normaliseIntensity(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v || v.endsWith('%')) return v;
  return /^\d+(\.\d+)?(\s*[-–]\s*\d+(\.\d+)?)?$/.test(v) ? `${v}%` : v;
}
