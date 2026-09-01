# LLM Roundtable review 2: the tool after the same-day build (2026-09-01)

Second full-depth run of the `llm-roundtable` skill, at Chris's request, after
the first review's findings were implemented and personally tested the same
day. Same matrix: four discipline seats (S&C coaching, product/UX, software
architecture, data safety and reliability), each played independently by
GPT-5.2 (GPT-5.3-codex on architecture), Gemini 3.1 Pro, Grok 4.6 and Claude:
16 independent reviews of the post-build state, primed with the day's commits
and Chris's stood-down rulings. Contested and Claude-raised claims went
through the adversarial verification gate.

**Cost: ~US$1.75 this round** (12 panel calls, ~446k tokens in / 80k out,
plus 3 verification calls). **Both rounds together: ~US$3.05.**

---

## Chairman's verdict (Claude)

The panel confirmed the build's direction and found no regressions in what
shipped, but it earned its fee by breaking the build's own safety features in
review: **the corrupt-doc tombstone locked out the restore panel that was
supposed to cure it, a missing (rather than corrupt) file still silently
reseeded demo data, a server shutdown discarded the pending backup, the
backup could wedge forever on one hanging git prompt, a partial push never
reached the new ledger, and the ledger's dots slid when the phase structure
changed.** Every one of those, plus a dozen smaller residues, was fixed and
live-verified the same evening (commits `6e92e72` and the verification
refinement after it). What remains is deliberately not code: the machine's
timezone is genuinely wrong (Australia/Sydney, which diverges from Brisbane
when DST starts 4 October; the push endpoint now refuses outright until it is
fixed), nothing for the A/B block is in TrainHeroic thirteen days before it
starts, and the near calendar (Phase 3, Hyrox Block 02, October conditioning)
is the real remaining risk surface. The big build items every seat keeps
asking for are unchanged and sequenced below.

## What the panel found and what happened to it

### Fixed and live-verified the same evening

1. **Restore now works through the tombstone** [4 brains]: the corrupt file
   is archived into `_history/` and the snapshot written; verified corrupt →
   503 → restore → 200.
2. **A missing file refuses to seed** when history exists OR git tracks the
   doc [3 brains + gate refinement]: verified live, no seed written.
   Residual (named by the gate): a doc deleted on a fresh clone before any
   save has neither proof; accepted.
3. **Shutdown takes a final backup; git calls carry a 60s timeout and
   `GIT_TERMINAL_PROMPT=0`; orphaned temp indexes are swept; wedges log.**
4. **Backup health is visible**: `GET /api/store/_status` (last push, last
   error, quarantines, unpushed-code count) shown in the Data safety panel.
5. **The push ledger records partial pushes** (logged before the error
   surfaces) **and matches weeks by Monday date**, never by position.
6. **Every push skip is named** (missing session, circuit-kind session,
   empty shell — which is now deleted rather than left as draft litter), the
   month-read shape is asserted instead of defaulting to "empty month" (the
   duplicate guard could otherwise become the duplicator), and the challenge
   instruction is written in the same PUT as the title, before any blocks
   exist.
7. **The push refuses on a non-Brisbane machine timezone** — proved live,
   because this PC really is on Australia/Sydney.
8. **Write identity is required**: PUTs carry `baseUpdatedAt` (400 without
   it), closing the equal-rev divergence overwrite across the two machines.
9. **Client last mile**: server recovery guidance reaches the UI; a failed
   initial load is retryable; `beforeunload` sets `returnValue`; a hidden
   tab flushes immediately; banners check five docs via the new cheap
   `/meta` endpoint; `vite preview` serves the same store; bare MAX reps
   translate to plain words; program history deepened to 250 snapshots.

### The verification gate this round

- **"The late instruction PUT wipes the just-created exercises"** (Claude):
  REFUTED as unproven — the evidence shows the risk is plausible, not
  demonstrated. The reorder ships anyway (strictly safer, one fewer call).
- **"Optional baseUpdatedAt closes the divergence hole"**: partially upheld —
  optional is rev-only for any client that forgets it, so it became required.
- **"History presence is the right seed guard"**: partially upheld — weak on
  fresh clones, so git tracking became the second existence proof.
- **"Deleting a referenced class type orphans everything"** (GPT, CRITICAL):
  REFUTED by code — deletes are already guarded (class types blocked while
  timetabled; coach/room deletes null their references). Residual: attendance
  rows keep a deleted type's id; minor.
- **"Two PUTs can interleave and both pass the rev check"** (Grok, again):
  REFUTED again — the check-then-write is synchronous after the body read.
- **"Day B trains upper body once a week"** (Gemini, HIGH): REFUTED by data —
  Day B holds half-kneeling press, Powell raise, Z-press and Y-raise; the
  reviewer could not see session contents.

### For Chris: decisions and coaching (the panel's real remaining risk)

- **Fix this PC's timezone to Australia/Brisbane** (Settings → Time).
  Sydney's DST starts 4 October; until it is fixed the push refuses and
  "today" flips an hour off. The laptop should be checked too.
- **Press the Launchpad push button**: 23 code commits (both reviews, all
  fixes) exist only on this machine; the data backs up automatically but the
  code does not, by your own ratified workflow.
- **Push A/B weeks 1 and 2 as drafts this week** (after the timezone fix).
  The block starts 14 September and members' calendars are empty; the
  hardened push path should earn its keep with runway to spare.
- **The near calendar beats everything else**: Phase 3's five-week skeleton
  (the panel converges on: retest week 4, unload/strip week 5 into
  Christmas, never a max week adjacent to the shutdown), Hyrox Block 02
  before Block 01's retest week (w/c 21 Sept), October ESD, and the four
  Tier 1 September conditioning yes/nos. Also flagged: Hyrox Block 04's
  week-4 retest lands the week after Melbourne with no taper written; plan
  W3/W4 as a declared taper for racers when Block 04 is authored.
- **The jump default was re-raised unprompted by three brains this round**
  (make jump-and-stick the written line, depth jumps the advanced scale).
  Your ruling stands and nothing was changed; the panel asks you to consider
  the one-line flip, and at minimum a box-height cap in the A2 note.
- Smaller calls still open: the pike push-up's missing superset partner and
  the Day B challenge ruling (the panel's own view: leave Day B without
  challenges), a mid-block joiner line in the plan ("no tested number means
  RPE-primary until a crisp top set is recorded"), and a lighter carry in
  micros 1 and 2 if you want the pattern weekly rather than late.

### Planned, deliberately not rushed (the next build sessions)

Sequenced per the architecture seat, agreed by the chairman:

1. **Focus catalog first**: one `src/lib/focusCatalog.ts` collapsing
   `FOCUS_LABEL`, `FOCUS_CLASS_TYPE`, `FOCUS_DAY_PICK`, `STREAM_DEFS` and
   the push plugin's `STRENGTH_PLAN` (five tables, four files, one concept).
2. **Extract and test the pure mutators** out of ProgrammingTab
   (`sessionEdits.ts`), then move the detached components, then split the
   views behind one context — one view per commit with live checks. File
   budget ~500 lines.
3. **The Today/run-week cockpit** (both product brains' top ask): Home leads
   with today's classes, written/unfed state, one-click board and layout,
   and a week-readiness strip (written / curated / emailed / pushed) instead
   of leading with charts. Attendance steppers ride along.
4. **Room-keyed layouts** the moment Chris's measurements arrive.
5. Later, with Chris: single-writer takeover flow for the two-machine story,
   runtime schema validation on PUT, per-doc write locks if the store ever
   leaves one process, cadence label pass ("Micro/Block/Month" per stream),
   Movement Check across streams, durable ids for free-text exercises,
   time-tiered history retention, `_history` in the off-machine backup.
   Ruled over-engineering by both panels: any hosted database, splitting
   program.json, CRDTs, muscle-group/trunk taxonomies, more export formats.

---

*Round-1 report: REVIEW-2026-09-01-llm-roundtable.md. Stage transcripts are
session-local; the pack and prompts are regenerable from the repo. No member
data left the machine in either round.*
