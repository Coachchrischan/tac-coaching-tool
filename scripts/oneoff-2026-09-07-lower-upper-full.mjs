// One-off, 2026-09-07: the club reverted from the Full Body A/B split to
// Lower / Upper / Full Body before the A/B block started, with Full Body on
// the Saturday 6am class instead of Friday.
//
// What this does, through the store API on localhost:8127 so revs, history
// snapshots and the git backup all see it:
//   program:   archives the A/B strength stream to
//              archive/strength-full-body-ab-2026-09.json (restorable), then
//              rebuilds the stream: Primer 3 (empty L/U/F skeletons, intents
//              kept), Strength-Hypertrophy 9 (weeks 1 to 9 of the archived
//              August Lower/Upper/Full block, week 1 being Chris's sheet),
//              Strength 5 (empty L/U/F skeletons). Phase ids, themes,
//              annualPhaseIds and week ids are kept so nothing else moves.
//   schedule:  the three coachless Friday Full Body classes on the live
//              timetable become one Saturday 06:00 class; the Tue/Thu class
//              types get their Lower / Upper names back.
//   annual:    the Strength-Hypertrophy lane text names the new split.
// Safe to re-run: each step checks whether it has already happened.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'http://localhost:8127/api/store/';
const TODAY = '2026-09-07';
const FOCUSES = ['lower', 'upper', 'full'];

async function get(id) {
  const r = await fetch(API + id);
  if (!r.ok) throw new Error(`GET ${id}: ${r.status} ${await r.text()}`);
  return r.json();
}
/** Write back against the envelope we read: rev and updatedAt are the identity check. */
async function put(id, data, env) {
  const r = await fetch(API + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`PUT ${id}: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

const emptySeries = (sid) =>
  [
    ['WU', 5],
    ['A', 15],
    ['B', 12],
    ['C', 10],
  ].map(([label, minutes]) => ({ id: `${sid}-${label}`, kind: 'series', label, minutes, slots: [] }));

const skeleton = (sid, focus, intent) => ({
  id: sid,
  focus,
  ...(intent ? { intent } : {}),
  kind: 'series',
  timedBlocks: emptySeries(sid),
});

/** Re-id an archived session into this phase and clean the stale keys off it. */
function restoreSession(old, sid) {
  const timedBlocks = old.timedBlocks.map((tb) => {
    const tbId = `${sid}-${tb.label}`;
    if (tb.kind === 'circuit') return { ...tb, id: tbId };
    const slots = (tb.slots ?? []).map((sl, i) => {
      const { showScales: _drop, ...rest } = sl;
      void _drop;
      return { ...rest, id: `${tbId}-s${i + 1}` };
    });
    return { ...tb, id: tbId, kind: 'series', slots };
  });
  const { id: _id, ...rest } = old;
  void _id;
  return { ...rest, id: sid, kind: 'series', timedBlocks };
}

// ---------- program ----------
{
  const env = await get('program');
  const doc = env.data;
  const st = doc.streams.find((s) => s.id === 'strength');
  const already = st.blocks[1]?.weeks[0]?.sessions.some((s) => s.focus === 'lower');
  if (already) {
    console.log('program: already on Lower / Upper / Full Body, skipped');
  } else {
    const archivePath = join(root, 'archive', 'strength-full-body-ab-2026-09.json');
    if (!existsSync(archivePath)) {
      writeFileSync(
        archivePath,
        JSON.stringify(
          {
            archivedOn: TODAY,
            why:
              'The club reverted from the two-day Full Body A/B split (planned from 14 Sept 2026) to the Lower / Upper / Full Body three-day split, with Full Body on Saturday 6am. Chris asked for the A/B programming to be kept, not lost. Restore by pasting this stream object back into data/program.json through the store API (or ask Claude).',
            stream: st,
          },
          null,
          2,
        ),
        'utf8',
      );
      console.log(`program: archived the A/B stream to ${archivePath}`);
    }
    const aug = JSON.parse(readFileSync(join(root, 'archive', 'strength-lower-upper-full-2026-08.json'), 'utf8'));
    const written = aug.stream.blocks[0]; // Strength-Hypertrophy, 10 weeks
    if (written.theme !== 'Strength-Hypertrophy' || written.weeks.length !== 10) throw new Error('unexpected archive shape');

    const [primer, hyp, str5] = st.blocks;
    const rebuild = (block, prefix, sessionsFor) => ({
      ...block,
      weeks: block.weeks.map((w, wi) => ({ ...w, sessions: sessionsFor(w, wi, `${prefix}-w${wi + 1}`) })),
    });
    const newPrimer = rebuild(primer, 'str2-primer', (w, _wi, base) =>
      FOCUSES.map((f) => skeleton(`${base}-${f}`, f, w.sessions[0]?.intent)),
    );
    const newHyp = rebuild(hyp, 'str2-luf', (_w, wi, base) => {
      const src = written.weeks[wi];
      return FOCUSES.map((f) => {
        const old = src.sessions.find((s) => s.focus === f);
        if (!old) throw new Error(`archive week ${wi + 1} has no ${f} session`);
        return restoreSession(old, `${base}-${f}`);
      });
    });
    const newStr5 = rebuild(str5, 'str2-str5', (_w, _wi, base) => FOCUSES.map((f) => skeleton(`${base}-${f}`, f)));
    const next = {
      ...doc,
      streams: doc.streams.map((s) => (s.id === 'strength' ? { ...s, blocks: [newPrimer, newHyp, newStr5] } : s)),
    };
    // Sanity: ids unique across the whole document.
    const ids = new Set();
    for (const s of next.streams) for (const b of s.blocks) for (const w of b.weeks) for (const x of w.sessions) {
      if (ids.has(x.id)) throw new Error(`duplicate session id ${x.id}`);
      ids.add(x.id);
    }
    const slots = newHyp.weeks.reduce(
      (n, w) => n + w.sessions.reduce((m, s) => m + s.timedBlocks.reduce((k, tb) => k + (tb.slots ?? []).filter((x) => x.name).length, 0), 0),
      0,
    );
    const res = await put('program', next, env);
    console.log(`program: rev ${env.rev} -> ${res.rev}; Phase 2 now ${newHyp.weeks.length} weeks x 3 sessions, ${slots} named slots restored (archive week 10 not used: the phase is 9 weeks)`);
  }
}

// ---------- schedule ----------
{
  const env = await get('schedule');
  const doc = env.data;
  const live = doc.scenarios.find((s) => s.id === doc.liveScenarioId);
  if (!live) throw new Error('no live scenario');
  const fridays = live.blocks.filter((b) => b.classTypeId === 'fbs' && b.day === 4);
  const saturday = live.blocks.find((b) => b.classTypeId === 'fbs' && b.day === 5);
  const lbs = doc.classTypes.find((c) => c.id === 'lbs');
  const ubs = doc.classTypes.find((c) => c.id === 'ubs');
  if (saturday && fridays.length === 0 && lbs.name === 'Lower Body Strength') {
    console.log('schedule: already moved, skipped');
  } else {
    const blocks = live.blocks.filter((b) => !(b.classTypeId === 'fbs' && b.day === 4));
    if (!saturday) {
      blocks.push({
        id: `blk-${Math.random().toString(16).slice(2, 10)}`,
        day: 5,
        startMin: 6 * 60,
        durationMin: 60,
        classTypeId: 'fbs',
        coachId: fridays[0]?.coachId ?? null,
        roomId: fridays[0]?.roomId ?? 'gym-floor',
      });
    }
    const next = {
      ...doc,
      classTypes: doc.classTypes.map((c) =>
        c.id === 'lbs' ? { ...c, name: 'Lower Body Strength' } : c.id === 'ubs' ? { ...c, name: 'Upper Body Strength' } : c,
      ),
      scenarios: doc.scenarios.map((s) => (s.id === live.id ? { ...s, blocks } : s)),
    };
    const res = await put('schedule', next, env);
    console.log(
      `schedule: rev ${env.rev} -> ${res.rev}; "${live.name}": removed ${fridays.length} Friday Full Body class(es), ${saturday ? 'kept' : 'added'} Saturday 06:00 Full Body; Tue/Thu classes renamed Lower / Upper Body Strength`,
    );
    void ubs;
  }
}

// ---------- annual plan ----------
{
  const env = await get('annual-plan');
  const doc = env.data;
  const lane = doc.streams.find((s) => s.id === 'strength');
  const TEXT = {
    'ap-2026-hyp9':
      'Lower / Upper / Full Body split (Tue / Thu / Sat 6am), restored 2026-09-07. Week 1 is the sheet: squat 3x9 at 70%, bench 3x7 at 75%, RDL 3x5 at 80%. Main lifts wave 9/7/5 across each 3-week micro.',
    'ap-2027-hyp9': 'Lower / Upper / Full Body split (Tue / Thu / Sat). Main lifts wave 9/7/5 across each 3-week micro.',
  };
  let changed = 0;
  const phases = lane.phases.map((p) => {
    if (TEXT[p.id] && p.focus !== TEXT[p.id]) {
      changed++;
      return { ...p, focus: TEXT[p.id] };
    }
    return p;
  });
  if (!changed) console.log('annual-plan: already updated, skipped');
  else {
    const next = { ...doc, streams: doc.streams.map((s) => (s.id === 'strength' ? { ...s, phases } : s)) };
    const res = await put('annual-plan', next, env);
    console.log(`annual-plan: rev ${env.rev} -> ${res.rev}; ${changed} phase description(s) updated`);
  }
}

// ---------- anything still pointing at the old session ids? ----------
{
  const stale = [];
  for (const id of ['layouts', 'push-log', 'planning']) {
    try {
      const env = await get(id);
      const text = JSON.stringify(env.data);
      const hits = text.match(/str2-hyp-w\d+[ab]/g);
      if (hits) stale.push(`${id}: ${[...new Set(hits)].join(', ')}`);
    } catch {
      /* optional doc */
    }
  }
  console.log(stale.length ? `note: references to the old A/B session ids remain in ${stale.join(' | ')}` : 'no other document referenced the A/B session ids');
}
