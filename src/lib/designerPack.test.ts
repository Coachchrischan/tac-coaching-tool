// The designer pack must label every field the way the board actually treats
// it. These pin the rules that are easy to get wrong: warm-up strips carry
// no notes or scales, a strength session note never reaches the wall, a
// circuit session note does, and a coach-hidden part is marked, not dropped.

import { describe, expect, it } from 'vitest';
import { buildDesignerPack } from './designerPack';
import type { LibraryOverridesDoc, ProgramDoc, ScheduleDoc } from '../types/documents';

const overrides = {
  scales: { '7': [{ name: 'Goblet Squat', sets: '3', reps: '10', load: '16' }] },
  cues: { '7': 'Chest up, knees out' },
  customExercises: [],
  patterns: {},
} as unknown as LibraryOverridesDoc;

const doc: ProgramDoc = {
  name: 'TAC 2026/27',
  streams: [
    {
      id: 'strength',
      name: 'Strength',
      cadence: 'phases',
      blocks: [
        {
          id: 'p1',
          theme: 'Strength-Hypertrophy',
          blockLength: 2,
          weeks: [
            {
              id: 'w1',
              sessions: [
                {
                  id: 's1',
                  kind: 'series',
                  focus: 'full-a',
                  intent: 'Squat and upper focus',
                  note: 'Coach: watch the new members on the rack',
                  appDescription: 'Full body strength, all levels',
                  timedBlocks: [
                    {
                      id: 'wu',
                      label: 'WU',
                      minutes: 8,
                      note: 'Coach leads',
                      slots: [{ id: 'wu1', exerciseId: 7, name: 'Back Squat', reps: '10', note: 'empty bar', scales: [{ name: 'Air Squat' }] }],
                    },
                    {
                      id: 'a',
                      label: 'A',
                      minutes: 20,
                      note: 'Every 2 minutes',
                      slots: [
                        { id: 'a1', exerciseId: 7, name: 'Back Squat', sets: '3', reps: '8', load: '60kg', note: 'pause 2s' },
                        { id: 'a2', exerciseId: null, name: '', sets: '1' },
                      ],
                    },
                    {
                      id: 'c',
                      label: 'C',
                      minutes: 6,
                      hideFromBoard: true,
                      slots: [{ id: 'c1', exerciseId: null, name: 'Cooldown walk', sets: '1' }],
                    },
                  ],
                },
                { id: 's2', kind: 'series', focus: 'full-b', timedBlocks: [] },
              ],
            },
            { id: 'w2', sessions: [] },
            { id: 'w3', sessions: [] },
          ],
        },
      ],
    },
    {
      id: 'esd',
      name: 'ESD',
      format: 'circuit',
      cadence: 'months',
      blocks: [
        {
          id: 'm1',
          theme: 'September',
          weeks: [
            {
              id: 'e1',
              sessions: [
                {
                  id: 'esd1',
                  kind: 'circuit',
                  focus: 'esd',
                  note: 'In pairs, one works one rests',
                  circuit: [
                    { id: 'c1', heading: 'AMRAP in 10 minutes', lines: [{ text: '10 Cal Row', load: '' }, { text: '' }], restAfter: 'Rest 2 min' },
                    { id: 'c2', heading: 'Station prep', lines: [{ text: 'Set up sleds' }], hideFromBoard: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const schedule = { classTypes: [], coaches: [], rooms: [], scenarios: [] } as unknown as ScheduleDoc;

const build = (streamId: string, windowIndex = 0) =>
  buildDesignerPack({
    doc,
    overrides,
    schedule,
    annual: { startDate: '2026-08-24', breaks: [] },
    streamId,
    containerIndex: 0,
    windowIndex,
    blurbFor: () => 'Build the base.',
    now: new Date('2026-09-07T00:00:00Z'),
  });

describe('designer pack', () => {
  it('labels strength fields the way the board prints them', () => {
    const pack = build('strength')!;
    const s = pack.sessions[0];
    expect(s.wallTitle).toBe('Week 1 · FULL BODY A');
    expect(s.wallHeader).toEqual(['STRENGTH-HYPERTROPHY', 'Phase 1 · Week 1 of 3']);
    const by = Object.fromEntries(s.fields.map((f) => [f.label, f.where]));
    expect(by['Session intent']).toBe('wall');
    expect(by['Session note']).toBe('coach');
    expect(by['Members app description']).toBe('coach');
    expect(s.footer.find((f) => f.label.startsWith('Footer blurb'))?.where).toBe('wall');
  });

  it('keeps notes and scales off the warm-up strip but on the series columns', () => {
    const [wu, a, c] = build('strength')!.sessions[0].parts;
    expect(wu.isWarmup).toBe(true);
    expect(wu.onWall).toBe(true);
    expect(wu.note?.where).toBe('coach');
    expect(wu.slots[0].tag).toBe('WU');
    expect(wu.slots[0].note?.where).toBe('coach');
    expect(wu.slots[0].scales[0].where).toBe('coach');
    expect(wu.slots[0].cue?.where).toBe('wall');

    expect(a.note?.where).toBe('wall');
    expect(a.slots).toHaveLength(1); // the empty-name slot is bookkeeping, not a movement
    expect(a.slots[0].tag).toBe('A1');
    expect(a.slots[0].asOnWall).toBe('3 × 8   |   60kg');
    expect(a.slots[0].note?.where).toBe('wall');
    expect(a.slots[0].scales[0]).toEqual({ text: 'Goblet Squat  3 x 10  16kg', where: 'wall' });

    expect(c.hiddenByCoach).toBe(true);
    expect(c.onWall).toBe(false);
  });

  it('lists unwritten sessions instead of padding the pack with them', () => {
    const pack = build('strength')!;
    expect(pack.sessions).toHaveLength(1);
    expect(pack.unwritten).toEqual(['Week 1 · Full Body B']);
    expect(pack.window).toEqual({ index: 0, count: 2, weekFrom: 0, weekTo: 1 });
    expect(pack.weeks.map((w) => w.monday)).toEqual(['2026-08-24', '2026-08-31']);
    expect(pack.fileBase).toBe('TAC-designer-pack-strength-phase1-block1');
  });

  it('pages a phase into its block windows', () => {
    const pack = build('strength', 1)!;
    expect(pack.window).toEqual({ index: 1, count: 2, weekFrom: 2, weekTo: 2 });
    expect(pack.fileBase).toBe('TAC-designer-pack-strength-phase1-block2');
  });

  it('marks a circuit session note on the wall and a hidden piece as off it', () => {
    const pack = build('esd')!;
    const s = pack.sessions[0];
    expect(pack.stream.format).toBe('circuit');
    expect(s.wallTitle).toBe('ESD · Week 1');
    expect(s.fields[0]).toMatchObject({ label: 'Session note', where: 'wall' });
    expect(s.pieces[0]).toMatchObject({ onWall: true, restAfter: 'Rest 2 min' });
    expect(s.pieces[0].lines).toEqual([{ text: '10 Cal Row', load: undefined }]);
    expect(s.pieces[1]).toMatchObject({ onWall: false, hiddenByCoach: true });
    expect(s.footer.find((f) => f.label.startsWith('Footer blurb'))?.where).toBe('coach');
    expect(pack.fileBase).toBe('TAC-designer-pack-esd-september-block1');
  });
});
