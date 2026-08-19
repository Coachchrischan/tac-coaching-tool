// Suggesting a room format, not just dumping the gear on the floor.
//
// The old auto-build placed every kind of equipment in a row at x=60 with a
// hardcoded three of each. That tells a coach what to get out, not how to run
// the room. This module proposes a FORMATION: where the stations sit, where
// the coach stands, and how many of each piece to put out for the class size.
//
// The formations come from how group-training floors are actually run:
//
// - Stations in a loop with an OPEN CENTRE, rotating one way, so the coach can
//   see every station from one position and members flow without crossing.
//   (Circuit floors are laid out as a circle, semi-circle or U, not scattered.)
// - Two lines facing in, with a coaching aisle between them, for demo-led work
//   and partner sets where people work opposite each other.
// - Small pods for small-group and partner rotations when gear is limited.
// - A split room when a session has a strength piece and a conditioning piece,
//   so the rig half and the open half each do one job.
// - Relay lanes for the Hyrox pattern, one partner running or sledding while
//   the other works a station, which needs the run lane kept clear.
//
// Spacing: group functional training is commonly planned at 2 to 4 square
// metres per person, so stations are spread to the width available rather than
// packed. The canvas is a scale drawing of the Group Fitness Room.

import type { AttendanceDoc, EquipmentDoc, LayoutItem, ScheduleDoc } from '../types/documents';
import { CANVAS_W, equipDef } from '../tabs/layouts/roomModel';

/** Which timetable class types each layout room covers. */
export const ROOM_CLASS_TYPES: Record<string, string[]> = {
  strength: ['lbs', 'ubs', 'fbs'],
  esd: ['esd'],
  hyrox: ['hyrox'],
  gameday: ['gameday'],
};

/**
 * Typical heads in ONE class of this kind. The attendance document holds weekly
 * totals for a class type, so the per-class figure is that total divided by how
 * many of those classes the active timetable runs each week.
 */
export function typicalClassSize(
  attendance: AttendanceDoc | null,
  schedule: ScheduleDoc | null,
  roomId: string,
): number | null {
  const types = ROOM_CLASS_TYPES[roomId];
  if (!attendance || !schedule || !types) return null;

  const scenario =
    schedule.scenarios.find((s) => s.id === schedule.activeScenarioId) ?? schedule.scenarios[0];
  const classesPerWeek = (scenario?.blocks ?? []).filter((b) => types.includes(b.classTypeId)).length;
  if (!classesPerWeek) return null;

  const entries = attendance.entries.filter((e) => types.includes(e.classTypeId));
  if (!entries.length) return null;

  // Most recent periods only: the club changes, old numbers are not the room today.
  const periods = [...new Set(entries.map((e) => e.period))].sort().slice(-8);
  const recent = entries.filter((e) => periods.includes(e.period));
  const weeklyTotal = recent.reduce((sum, e) => sum + e.count, 0) / periods.length;
  return Math.max(1, Math.round(weeklyTotal / classesPerWeek));
}

// The equipment list is written the way the club counts it ("Dumbbell pairs",
// "Assault bikes"), so match it to the drawing kinds by keyword.
const STOCK_MATCH: { kind: string; re: RegExp }[] = [
  { kind: 'rower', re: /row/i },
  { kind: 'ski', re: /ski/i },
  { kind: 'bike', re: /bike/i },
  { kind: 'wallball', re: /wall\s?ball/i },
  { kind: 'box', re: /box|step/i },
  { kind: 'dumbbell', re: /dumbbell|\bdb\b/i },
  { kind: 'barbell', re: /barbell/i },
  { kind: 'bench', re: /bench/i },
  { kind: 'band', re: /band/i },
];

/** How many of each drawing kind the club owns, from the Equipment tab. */
export function stockByKind(equipment: EquipmentDoc | null): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const item of equipment?.items ?? []) {
    const hit = STOCK_MATCH.find((m) => m.re.test(item.name));
    if (hit) stock[hit.kind] = (stock[hit.kind] ?? 0) + item.count;
  }
  return stock;
}

export type FormationId = 'loop' | 'lines' | 'pods' | 'split' | 'relay';

export interface FormationDef {
  id: FormationId;
  name: string;
  /** One line a coach can read: what this formation is. */
  what: string;
  /** Why it is being suggested for this session. Filled in when ranked. */
  why?: string;
  /** When it is the right call. */
  suitsWhen: string;
}

export const FORMATIONS: Record<FormationId, FormationDef> = {
  loop: {
    id: 'loop',
    name: 'Station loop, open centre',
    what: 'Stations around the edge, rotating one way, centre left clear so you can see every station from the middle.',
    suitsWhen: 'Five or more stations and a full class.',
  },
  lines: {
    id: 'lines',
    name: 'Two lines facing in',
    what: 'Two rows facing each other with a coaching aisle down the middle.',
    suitsWhen: 'Demo-led sessions, partner work, and smaller classes.',
  },
  pods: {
    id: 'pods',
    name: 'Pods',
    what: 'Small clusters of gear, a group per pod, rotating between them.',
    suitsWhen: 'Three or four stations, or when there is not enough gear for one each.',
  },
  split: {
    id: 'split',
    name: 'Split room',
    what: 'Strength work on the rig half, conditioning on the open half, groups swap at the halfway point.',
    suitsWhen: 'A session with a strength piece and a conditioning piece.',
  },
  relay: {
    id: 'relay',
    name: 'Relay lanes',
    what: 'Work stations along one side with the run and sled lanes kept clear, so one partner works while the other runs.',
    suitsWhen: 'Hyrox and any pairs session built on run, work, swap.',
  },
};

/** A piece of gear the session calls for, ready to be placed. */
export interface Station {
  kind: string;
  label: string;
}

export interface SuggestInput {
  stations: Station[];
  /** Expected people in the class. Drives how many of each piece go out. */
  heads: number;
  /** True when the session is written as pairs, or is a Hyrox session. */
  pairs?: boolean;
  /** True when the session is strength series rather than a circuit. */
  strength?: boolean;
  /** How many of each kind the club owns, by equipment kind. */
  stock?: Record<string, number>;
}

export interface Suggestion extends FormationDef {
  /** 0-100; the highest is the recommended one. */
  score: number;
  why: string;
}

// The floor a class actually uses. The air runners sit across the top, the rig
// across the middle and the sled track along the bottom, so the working floor
// is the band between the rig and the sled, plus the strip under the runners.
const MAIN = { x: 44, y: 282, w: CANVAS_W - 88, h: 158 };
const UPPER = { x: 44, y: 114, w: CANVAS_W - 88, h: 74 };

/** How many of a piece to put out: one per person at that station, capped by stock. */
function countFor(kind: string, heads: number, stationCount: number, stock?: Record<string, number>) {
  const perStation = Math.max(1, Math.ceil(heads / Math.max(1, stationCount)));
  const owned = stock?.[kind];
  return owned && owned > 0 ? Math.min(perStation, owned) : perStation;
}

function item(
  s: Station,
  x: number,
  y: number,
  station: number,
  count: number,
  dir: 'row' | 'col' = 'row',
): LayoutItem {
  const def = equipDef(s.kind);
  return {
    id: crypto.randomUUID(),
    kind: s.kind,
    label: s.label,
    x: Math.round(x),
    y: Math.round(y),
    w: def.w,
    h: def.h,
    count,
    gap: 12,
    dir,
    station,
  };
}

/** A non-equipment marker, used for the coach's position and kept-clear lanes. */
function marker(label: string, x: number, y: number, w = 150): LayoutItem {
  return {
    id: crypto.randomUUID(),
    label,
    x: Math.round(x),
    y: Math.round(y),
    w,
    h: 40,
    colour: '#003030',
    count: 1,
    gap: 0,
  };
}

/**
 * Place the stations in the chosen formation. Returns a whole item list, ready
 * to replace the room's items.
 */
export function buildFormation(id: FormationId, input: SuggestInput): LayoutItem[] {
  const { stations, heads, stock } = input;
  const n = stations.length;
  if (n === 0) return [];
  const count = (s: Station) => countFor(s.kind, heads, n, stock);

  if (id === 'loop') {
    // Half along the top of the working floor, half along the bottom running
    // back the other way, so the numbers read clockwise and the middle is free.
    const topCount = Math.ceil(n / 2);
    const bottom = stations.slice(topCount);
    const top = stations.slice(0, topCount);
    const spread = (i: number, of: number) => MAIN.x + (MAIN.w / Math.max(of, 1)) * i;
    const items = [
      ...top.map((s, i) => item(s, spread(i, topCount), MAIN.y, i + 1, count(s))),
      ...bottom.map((s, i) =>
        item(s, spread(bottom.length - 1 - i, Math.max(bottom.length, 1)), MAIN.y + MAIN.h - 30, topCount + i + 1, count(s)),
      ),
    ];
    items.push(marker('COACH: centre', MAIN.x + MAIN.w / 2 - 75, MAIN.y + MAIN.h / 2 - 20));
    return items;
  }

  if (id === 'lines') {
    const half = Math.ceil(n / 2);
    const spread = (i: number, of: number) => MAIN.x + (MAIN.w / Math.max(of, 1)) * i;
    const items = [
      ...stations.slice(0, half).map((s, i) => item(s, spread(i, half), MAIN.y, i + 1, count(s))),
      ...stations
        .slice(half)
        .map((s, i) => item(s, spread(i, Math.max(n - half, 1)), MAIN.y + MAIN.h - 30, half + i + 1, count(s))),
    ];
    items.push(marker('COACHING AISLE', MAIN.x + MAIN.w / 2 - 80, MAIN.y + MAIN.h / 2 - 20, 160));
    return items;
  }

  if (id === 'pods') {
    // Spread the pods across the floor in up to three columns, two rows.
    const cols = Math.min(3, Math.max(1, n));
    const rows = Math.ceil(n / cols);
    const cellW = MAIN.w / cols;
    const cellH = MAIN.h / Math.max(rows, 1);
    const items = stations.map((s, i) =>
      item(
        s,
        MAIN.x + cellW * (i % cols) + 20,
        MAIN.y + cellH * Math.floor(i / cols) + 10,
        i + 1,
        count(s),
        'row',
      ),
    );
    items.push(marker('COACH: rove', MAIN.x + MAIN.w - 170, MAIN.y + MAIN.h - 34));
    return items;
  }

  if (id === 'split') {
    // First half up under the rig (strength side), rest on the open floor.
    const half = Math.ceil(n / 2);
    const spreadU = (i: number, of: number) => UPPER.x + (UPPER.w / Math.max(of, 1)) * i;
    const spreadM = (i: number, of: number) => MAIN.x + (MAIN.w / Math.max(of, 1)) * i;
    const items = [
      ...stations.slice(0, half).map((s, i) => item(s, spreadU(i, half), UPPER.y, i + 1, count(s))),
      ...stations
        .slice(half)
        .map((s, i) => item(s, spreadM(i, Math.max(n - half, 1)), MAIN.y + 40, half + i + 1, count(s))),
    ];
    items.push(marker('STRENGTH SIDE', UPPER.x, UPPER.y - 46, 150));
    items.push(marker('CONDITIONING SIDE', MAIN.x, MAIN.y - 14, 180));
    return items;
  }

  // relay
  const spread = (i: number, of: number) => MAIN.x + (MAIN.w / Math.max(of, 1)) * i;
  const items = stations.map((s, i) => item(s, spread(i, n), MAIN.y + 10, i + 1, count(s)));
  items.push(marker('KEEP CLEAR: run lane', MAIN.x, MAIN.y + MAIN.h - 28, 200));
  items.push(marker('COACH: by the sled', MAIN.x + MAIN.w - 190, MAIN.y + MAIN.h - 28, 190));
  return items;
}

/**
 * Rank the formations for this session, best first, each with the reason it is
 * being suggested. The coach picks; nothing is applied automatically.
 */
export function suggestFormations(input: SuggestInput): Suggestion[] {
  const n = input.stations.length;
  const heads = input.heads;
  const out: Suggestion[] = [];

  const add = (id: FormationId, score: number, why: string) =>
    out.push({ ...FORMATIONS[id], score: Math.max(0, Math.min(100, score)), why });

  // Loop: the default for a real circuit with a full class.
  add(
    'loop',
    (n >= 5 ? 80 : n >= 4 ? 55 : 25) + (heads >= 12 ? 15 : 0) - (input.strength ? 25 : 0),
    n >= 5
      ? `${n} stations and ${heads} in, so the loop keeps everyone moving one way with the centre clear for you.`
      : `Only ${n} stations, so a loop leaves gaps, but the open centre still gives you the sightlines.`,
  );

  // Lines: smaller classes and partner work.
  add(
    'lines',
    (heads <= 10 ? 70 : 45) + (input.pairs ? 20 : 0) + (n <= 6 ? 10 : 0),
    input.pairs
      ? 'Written as pairs, so facing rows put partners opposite each other with an aisle to coach from.'
      : `${heads} in the class, small enough that two rows and a centre aisle keeps every demo visible.`,
  );

  // Pods: few stations, or not enough gear to go round.
  const short = input.stock
    ? input.stations.filter((s) => (input.stock?.[s.kind] ?? 99) < Math.ceil(heads / Math.max(n, 1)))
    : [];
  add(
    'pods',
    (n <= 4 ? 70 : 35) + (short.length ? 25 : 0),
    short.length
      ? `Not enough ${short.map((s) => s.label.toLowerCase()).join(' or ')} for one each, so pods share the gear in small groups.`
      : `${n} stations divides cleanly into pods, with a group rotating around each.`,
  );

  // Split: a strength session, or a session with both jobs to do.
  add(
    'split',
    input.strength ? 85 : 30,
    input.strength
      ? 'A strength session, so the rig half does the lifting and the open half takes the accessory work.'
      : 'Use this when a session has a strength piece and a conditioning piece to separate.',
  );

  // Relay: the Hyrox pattern.
  add(
    'relay',
    input.pairs ? 85 : 30,
    input.pairs
      ? 'One partner works while the other runs, so the run and sled lanes have to stay clear.'
      : 'Use this when you want the run or sled lane kept clear for a relay.',
  );

  return out.sort((a, b) => b.score - a.score);
}
