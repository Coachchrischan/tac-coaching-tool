// The parser is fed the real pack Chris exports from `TAC/programming/`, not a
// hand-made fixture, because the thing it has to survive is that file's exact
// indentation.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConditioningPaste } from './conditioningPaste';

const PACK = join(
  __dirname,
  '../../../programming/microcycles/2026-09-14',
  'TAC-Conditioning-Phase1-Micro1-programming-text-2026-09-12.txt',
);

const SINGLE = `TENERIFFE ATHLETIC CLUB · CONDITIONING · PHASE 1 · AEROBIC BASE
WEEK 2 · WEDNESDAY
Phase 1 · Week 2 of 12 · Wednesday 23 September

SESSION INTENT
  Aerobic base. Long intervals at the same lanes.

WARM UP · 8 MIN · WITH COACH
  Rower easy
      3 min
  Dead Bug
      2 × 8

PART 1 · 39 MIN · E3MOM
  One machine each, stay in your lane the whole way, this is not a race.
  Rower
      Base 2:35-2:45 · Build 2:20-2:30 · Push 2:05-2:15
  Floor task between blocks:
  Step Up
      Base 8ea · Build 10ea · Push 12ea
      Scale: Box height down

ROTATION
  16: one machine each. 12: same. 8: rowers only.

COACH NOTE
  Hold the lane. Nobody above talking pace.

MEMBER APP DESCRIPTION
  Long steady intervals on the rower.

FOOTER BLURB
  Aerobic base day. 5 min brief, 8 min warm-up, 39 min work, 8 min cool-down.
`;

describe('parseConditioningPaste', () => {
  it('reads a single pasted session into the tool session model', () => {
    const [parsed] = parseConditioningPaste(SINGLE);
    expect(parsed.focus).toBe('cond-wed');
    expect(parsed.dayName).toBe('WEDNESDAY');
    expect(parsed.weekNumber).toBe(2);
    expect(parsed.warnings).toEqual([]);

    const s = parsed.session;
    expect(s.kind).toBe('circuit');
    expect(s.intent).toBe('Aerobic base. Long intervals at the same lanes.');
    expect(s.note).toBe('Hold the lane. Nobody above talking pace.');
    expect(s.appDescription).toBe('Long steady intervals on the rower.');
    expect(s.blurbOverride).toContain('5 min brief');
  });

  it('keeps the parts, their instruction and their lanes', () => {
    const [{ session }] = parseConditioningPaste(SINGLE);
    expect(session.circuit.map((c) => c.heading)).toEqual([
      'WARM UP · 8 MIN · WITH COACH',
      'PART 1 · 39 MIN · E3MOM',
    ]);

    const part1 = session.circuit[1];
    // The leading prose is how the piece is run, not a movement.
    expect(part1.note).toBe('One machine each, stay in your lane the whole way, this is not a race.');
    expect(part1.lines.map((l) => l.text)).toEqual(['Rower', 'Floor task between blocks:', 'Step Up']);
    expect(part1.lines[0].load).toBe('Base 2:35-2:45 · Build 2:20-2:30 · Push 2:05-2:15');
    // A short label between movements keeps its place and carries no load.
    expect(part1.lines[1].load).toBeUndefined();
    // Lanes and the scaled option both survive, in order.
    expect(part1.lines[2].load).toBe('Base 8ea · Build 10ea · Push 12ea · Scale: Box height down');
  });

  it('keeps rotation and set-up as coach sections rather than dropping them', () => {
    const [{ session }] = parseConditioningPaste(SINGLE);
    expect(session.coachSections?.map((c) => c.heading)).toEqual(['ROTATION']);
    expect(session.coachSections?.[0].text).toContain('16: one machine each.');
  });

  it('reads every session out of a whole microcycle pack, and no cover pages', () => {
    const packs = parseConditioningPaste(readFileSync(PACK, 'utf8'), 'micro1');
    expect(packs).toHaveLength(12);
    expect(packs.map((p) => p.dayName)).toEqual([
      'MONDAY', 'WEDNESDAY', 'FRIDAY', 'SATURDAY',
      'MONDAY', 'WEDNESDAY', 'FRIDAY', 'SATURDAY',
      'MONDAY', 'WEDNESDAY', 'FRIDAY', 'SATURDAY',
    ]);
    expect(packs.map((p) => p.weekNumber)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(packs.map((p) => p.focus)).toEqual([
      'cond-mon', 'cond-wed', 'cond-fri', 'gameday',
      'cond-mon', 'cond-wed', 'cond-fri', 'gameday',
      'cond-mon', 'cond-wed', 'cond-fri', 'gameday',
    ]);
    // Every session came through with work and an intent.
    for (const p of packs) {
      expect(p.session.circuit.length, p.heading).toBeGreaterThan(0);
      expect(p.session.intent, p.heading).toBeTruthy();
      expect(p.warnings, p.heading).toEqual([]);
    }
    // Saturday carries how the class is grouped after the day.
    expect(packs.filter((p) => p.dayName === 'SATURDAY').map((p) => p.variant)).toEqual([
      'PAIRS', 'TRIOS', 'TEAMS OF FOUR',
    ]);
    // Ids are unique, so importing a whole pack cannot collide.
    const ids = packs.flatMap((p) => [p.session.id, ...p.session.circuit.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignores text that is not a session', () => {
    expect(parseConditioningPaste('just some notes I typed')).toEqual([]);
  });
});
