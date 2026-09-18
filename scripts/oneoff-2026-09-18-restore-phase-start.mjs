// Put the strength phase back on 14 September.
//
//   node scripts/oneoff-2026-09-18-restore-phase-start.mjs
//
// A block's dates come from its position in the stream, counted in weeks from
// the annual plan's start (24 August). Deleting the empty Primer block on
// 2026-09-18 therefore moved every strength week three weeks earlier, so the
// week Chris knows as "week 1" (14 September) became the plan's week 4, and
// the sessions pulled before the deletion were left sitting in weeks 1 to 3
// under the wrong dates.
//
// Two things to undo that:
//  1. A named three-week spacer at the head of the stream, so the phase starts
//     on 14 September again. It is called what it is, rather than "Primer",
//     so nobody deletes it a second time thinking it is dead weight.
//  2. Clear the copies left in the wrong weeks. Re-pull afterwards:
//     npm run pull-week -- 2026-09-14 && npm run pull-week -- 2026-09-21
//
// Every version is snapshotted by the store, so this is reversible from the
// document history if it turns out to be wrong.

const BASE = process.env.TAC_STORE ?? 'http://localhost:8127/api/store';

const env = await (await fetch(`${BASE}/program`)).json();
const doc = env.data;
const stream = doc.streams.find((s) => s.id === 'strength');
if (!stream) throw new Error('no strength stream');
if (stream.blocks[0].id === 'str2-lead') {
  console.log('The spacer is already there. Nothing to do.');
  process.exit(0);
}

const hyp = stream.blocks.find((b) => b.id === 'str2-hyp');
if (!hyp) throw new Error('no str2-hyp block');

stream.blocks.unshift({
  id: 'str2-lead',
  theme: 'Before the phase',
  annualPhaseId: hyp.annualPhaseId,
  blockLength: 3,
  weeks: [{ sessions: [] }, { sessions: [] }, { sessions: [] }],
});

// Weeks 3 to 5 of the phase hold what was written while the dates were wrong.
// Weeks 1 and 2 are left alone: once the spacer is in they are 14 and 21
// September, which is what those sessions were pulled for.
let cleared = 0;
for (const i of [2, 3, 4]) {
  if (!hyp.weeks[i]) continue;
  cleared += hyp.weeks[i].sessions.length;
  hyp.weeks[i].sessions = [];
}

const res = await fetch(`${BASE}/program`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: doc, baseRev: env.rev, baseUpdatedAt: env.updatedAt }),
});
const body = await res.json();
if (!res.ok) throw new Error(`save failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);

console.log(`Spacer added; ${cleared} sessions cleared from the wrong weeks.`);
console.log(`program rev ${env.rev} -> ${body.rev}`);
console.log('Now re-pull: npm run pull-week -- 2026-09-14 and 2026-09-21');
