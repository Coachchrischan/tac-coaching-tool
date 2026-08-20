// The Group Fitness Room, as coaches actually draw it.
//
// Three things never move and belong on every layout: the air runners across
// the back, the rig, and the sled track. They are drawn from this file rather
// than stored per layout, so they can't be dragged away or forgotten.
//
// Everything else (Concept2 bikes, rowers, skis, wall balls, boxes, bands,
// dumbbells) comes in and out of the room, so it lives in the document as
// draggable items.

export const CANVAS_W = 1120;
export const CANVAS_H = 620;

export interface Fixture {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** repeat horizontally: count and gap */
  repeat?: { count: number; gap: number };
  /** vertical lanes drawn inside the box */
  lanes?: number;
  /** vertical segment divisions (the rig's uprights) */
  segments?: number;
  tone: 'dark' | 'outline';
}

const RUNNER_W = 62;
const RUNNER_GAP = 46;

export const FIXTURES: Fixture[] = [
  {
    id: 'air-runners',
    label: 'Air runners',
    x: 40,
    y: 18,
    w: RUNNER_W,
    h: 86,
    repeat: { count: 10, gap: RUNNER_GAP },
    tone: 'dark',
  },
  {
    id: 'rig',
    label: 'Rig',
    x: 90,
    y: 196,
    w: 940,
    h: 72,
    segments: 9,
    tone: 'outline',
  },
  {
    id: 'sled-track',
    label: 'Sled track',
    x: 24,
    y: 452,
    w: 1072,
    h: 144,
    lanes: 3,
    tone: 'outline',
  },
];

// ---------- Movable equipment ----------

export type EquipKind =
  | 'bike'
  | 'rower'
  | 'ski'
  | 'wallball'
  | 'box'
  | 'band'
  | 'dumbbell'
  | 'bench'
  | 'barbell'
  | 'zone';

export interface EquipDef {
  kind: EquipKind;
  name: string;
  w: number;
  h: number;
  colour: string;
  shape: 'rect' | 'circle' | 'pill';
}

// Colours stay within the TAC palette: pine for ergs, red for Hyrox-ish
// gear, sand/stone for the rest, charcoal for structure.
export const EQUIPMENT: EquipDef[] = [
  { kind: 'bike', name: 'C2 Bike', w: 40, h: 78, colour: '#3E6B8C', shape: 'rect' },
  { kind: 'rower', name: 'Rower', w: 34, h: 96, colour: '#C64545', shape: 'rect' },
  { kind: 'ski', name: 'Ski erg', w: 34, h: 72, colour: '#7A5C3E', shape: 'rect' },
  { kind: 'box', name: 'Box', w: 52, h: 52, colour: '#C5A683', shape: 'rect' },
  { kind: 'wallball', name: 'Wall ball', w: 40, h: 40, colour: '#5A5A52', shape: 'circle' },
  { kind: 'dumbbell', name: 'Dumbbells', w: 56, h: 26, colour: '#4E6353', shape: 'pill' },
  { kind: 'band', name: 'Band', w: 56, h: 18, colour: '#7C6FA0', shape: 'pill' },
  { kind: 'bench', name: 'Bench', w: 76, h: 26, colour: '#5A5A52', shape: 'rect' },
  { kind: 'barbell', name: 'Barbell', w: 110, h: 12, colour: '#3F3B3B', shape: 'pill' },
  { kind: 'zone', name: 'Zone label', w: 130, h: 44, colour: '#003030', shape: 'rect' },
];

export const equipDef = (kind: string): EquipDef =>
  EQUIPMENT.find((e) => e.kind === kind) ?? EQUIPMENT[EQUIPMENT.length - 1];

// What gets drawn INSIDE the shape on a floor plan. A plan is read at a glance
// while setting the room up, so each object says what it is rather than being
// traced to a label floating underneath it.
export const EQUIP_CODE: Record<EquipKind, string> = {
  bike: 'BIKE',
  rower: 'ROW',
  ski: 'SKI',
  wallball: 'WB',
  box: 'BOX',
  band: 'BAND',
  dumbbell: 'DB',
  bench: 'BENCH',
  barbell: 'BAR',
  zone: '',
};

/** True when a shape has room for its code without the text spilling out. */
export function fitsCode(w: number, h: number): boolean {
  return h >= 16 && w >= 22;
}

/**
 * Anything the coach added to the label beyond the equipment's own name, which
 * in practice is the load: "Dumbbells 22.5kg" gives "22.5kg". That still has to
 * reach the floor, so it stays under the shape while the name moves inside.
 */
export function labelExtra(label: string, kind: string | undefined): string {
  const def = equipDef(kind ?? 'zone');
  const trimmed = (label ?? '').trim();
  if (!kind || kind === 'zone') return '';
  const withoutName = trimmed.toLowerCase().startsWith(def.name.toLowerCase())
    ? trimmed.slice(def.name.length)
    : trimmed === def.name
      ? ''
      : trimmed;
  return withoutName.replace(/^[\s,·-]+/, '').trim();
}
