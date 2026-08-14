import type { ClassBlock } from '../../types/documents';

// Grid constants. The visible day runs 05:00 to 20:00, snapped to 15 minutes.
export const DAY_START_MIN = 5 * 60;
export const DAY_END_MIN = 20 * 60;
export const SNAP_MIN = 15;
export const PX_PER_MIN = 1.2;

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function minToY(min: number): number {
  return (min - DAY_START_MIN) * PX_PER_MIN;
}

export function formatTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function formatRange(startMin: number, durationMin: number): string {
  return `${formatTime(startMin)} – ${formatTime(startMin + durationMin)}`;
}

export interface LanePlacement {
  lane: number;
  lanes: number;
}

/**
 * Assign side-by-side lanes to overlapping blocks within one day
 * (concurrent classes in different rooms render beside each other).
 *
 * Lane priority for concurrent classes is the ROOM ORDER from the settings
 * drawer: the room listed first always takes the left lane, so e.g. the
 * Group Fitness Room class sits on the same side every day. Roomless blocks
 * go last; ids only break exact ties, keeping the layout deterministic.
 */
export function layoutDay(
  blocks: ClassBlock[],
  roomOrder: string[] = [],
): Map<string, LanePlacement> {
  const roomRank = (b: ClassBlock) => {
    const i = b.roomId ? roomOrder.indexOf(b.roomId) : -1;
    return i === -1 ? roomOrder.length : i;
  };
  const sorted = [...blocks].sort(
    (a, b) => a.startMin - b.startMin || roomRank(a) - roomRank(b) || a.id.localeCompare(b.id),
  );
  const result = new Map<string, LanePlacement>();

  let cluster: ClassBlock[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned: Array<[ClassBlock, number]> = [];
    for (const b of cluster) {
      let lane = laneEnds.findIndex((end) => end <= b.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = b.startMin + b.durationMin;
      assigned.push([b, lane]);
    }
    for (const [b, lane] of assigned) {
      result.set(b.id, { lane, lanes: laneEnds.length });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const b of sorted) {
    if (cluster.length > 0 && b.startMin >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.startMin + b.durationMin);
  }
  flush();

  return result;
}
