// Which week is real, and which week is a sketch.
//
// `activeScenarioId` used to mean both "the one on screen" and "the one that
// is true". Everything that acts on the week read it, so opening a
// hypothetical timetable for the owners quietly moved the days real athlete
// sessions were pushed to. The live timetable is now its own pointer:
// `liveScenarioId`. Sketch freely; nothing members see moves until the
// "Make this the current format" button is pressed.
//
// The .js extension keeps this importable from the Vite plugin, which is
// compiled under nodenext resolution as well as from the app.
import type { ScheduleDoc, WeekScenario } from '../types/documents.js';

/**
 * The club's real timetable. Read this for anything that acts on the week:
 * the TrainHeroic push, Home's Today panel, floor-plan class sizes.
 *
 * Documents written before the split carry no `liveScenarioId`, so they fall
 * back to the viewed scenario, which is what they meant at the time.
 */
export function liveScenario(doc: ScheduleDoc): WeekScenario | undefined {
  return (
    doc.scenarios.find((s) => s.id === doc.liveScenarioId) ??
    doc.scenarios.find((s) => s.id === doc.activeScenarioId) ??
    doc.scenarios[0]
  );
}

/** The scenario on screen in the Schedule tab. Safe to sketch on. */
export function viewedScenario(doc: ScheduleDoc): WeekScenario | undefined {
  return doc.scenarios.find((s) => s.id === doc.activeScenarioId) ?? doc.scenarios[0];
}

/** True while no format has been marked current, so the live pointer is a guess. */
export function liveIsAssumed(doc: ScheduleDoc): boolean {
  return !doc.scenarios.some((s) => s.id === doc.liveScenarioId);
}
