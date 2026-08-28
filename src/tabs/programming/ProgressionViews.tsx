import type { ExerciseSlot, Session } from '../../types/documents';

// Shared helpers for progression displays and the CSV export. The editable
// Month/Block and Phase grids themselves live in EditableGrid.tsx.

/** Compact prescription string: "4×6 · 70% · RPE 8 · 31X1" */
export function slotSummary(slot: ExerciseSlot): string {
  return [
    slot.sets && slot.reps ? `${slot.sets}×${slot.reps}` : slot.sets || slot.reps,
    slot.load,
    slot.intensity,
    slot.rpe ? `RPE ${slot.rpe}` : undefined,
    slot.tempo,
  ]
    .filter(Boolean)
    .join(' · ');
}

const FOCUS_LABEL: Record<Session['focus'], string> = {
  lower: 'Lower',
  upper: 'Upper',
  full: 'Full Body',
  esd: 'ESD',
  hyrox: 'Hyrox',
  'rox-strong': 'ROX Strong',
  'rox-engine': 'ROX Engine',
  'rox-race': 'ROX Race',
  gameday: 'Game Day',
};

export function sessionLabel(s: Session): string {
  return s.name || FOCUS_LABEL[s.focus];
}
