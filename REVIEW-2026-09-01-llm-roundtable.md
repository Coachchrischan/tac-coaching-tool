# LLM Roundtable review: the whole TAC coaching tool (2026-09-01)

Full-depth run of the `llm-roundtable` skill at Chris's request. Four discipline
seats (S&C coaching, product/UX for a solo operator, software architecture,
data safety and reliability), each seat played independently by **GPT-5.2**
(GPT-5.3-codex on the architecture seat), **Gemini 3.1 Pro**, **Grok 4.6** and
**Claude** (free): 16 independent stage-1 reviews. Findings pooled and deduped,
then the contested and single-brain claims went through an adversarial
verification gate (rival models told to refute them, plus direct code checks).
Everything below is attributed as [discipline · raised by · verified by].
Convergent = raised independently by 2+ differently-trained models.

**Cost: ~US$1.30** (12 paid panel calls, ~326k tokens in / 62k out, plus 5
verification calls). Approved envelope was ~US$2.50.

---

## Chairman's verdict (Claude)

The tool's engineering fundamentals are unusually strong for a solo-built app,
and every seat independently said so: the store contract, the discriminated
unions, the live-vs-sketch timetable split, the drafts-only push posture and
the training-week dating all drew explicit clearances from all four brains.
What must change falls into three clusters. **First, the data is not safe
enough for what it now holds**: a corrupt file quarantines and then silently
reseeds on the next request, there is no automatic off-machine copy, and the
two-machine git sync is an unguarded second concurrency layer the rev system
does not cover. **Second, the programming's entry assumptions do not fit the
audience**: every coaching brain flagged percentage-primary loading for
members with no tested 1RM, depth jumps as the micro 1 default, nine weeks
with no load trough, and the placeholder warm-ups. **Third, the codebase has
no safety net for its own maintenance model**: no tests, no strict mode, a
2,086-line component, and a push plugin that bypasses the type and migration
layer that exists precisely to protect it. Nothing found requires a rewrite or
a hosted backend; almost everything is one evening to one week of targeted
work.

---

## Confirmed findings, ranked

### Critical

1. **The corrupt-quarantine flows straight into a silent reseed.**
   [reliability · Claude, Gemini, Grok, GPT (convergent 4) · code-verified]
   `storagePlugin.ts`: corrupt JSON is renamed to `*.corrupt-<ts>` and the
   request 500s; the very next request hits ENOENT and writes the demo seed as
   rev 1 with no UI signal. The most likely corruption source is the git sync
   itself (conflict markers inside a JSON). Gemini traced the full chain: the
   coach can then "keep mine" over the seed and bury the real year. Fix:
   tombstone the doc after quarantine, refuse GET/PUT (503 naming the
   quarantine file) until a human acts; never seed while a `*.corrupt-*`
   sibling exists (~20 lines).

2. **No automatic off-machine copy of the data.**
   [reliability + product · all four brains (convergent 4+)]
   Everything lives as JSON on one laptop; git push is manual and routinely
   lags days behind (this repo has sat multiple commits ahead of origin all
   week). The tabs review ranked this #1 two weeks ago and it is still open.
   Fix: auto-commit and push `data/` on a schedule (nightly minimum, hourly
   better) to a dedicated branch, plus per-doc history snapshots on every PUT
   (`data/_history/<docId>/<rev>.json`, keep ~50) with a restore picker. The
   history copies also give the missing undo for bulk copy actions and phase
   deletes. Test one restore.

3. **Two-machine git sync of live JSON is an unguarded multi-master.**
   [reliability + architecture · all four brains (convergent 4)]
   The rev 409 protects tabs on one machine only; each machine's rev counter
   advances independently and the envelope's `rev`/`updatedAt` lines collide
   on every merge, inside a 317KB pretty-printed file. The 4:30am refresh
   pulls while the old server may still serve, and logs show `PULL-FAILED`
   days where the script restarts anyway, potentially mid-rebase. Fix set:
   single-writer discipline surfaced in the tool (machine name in the
   envelope, loud banner when the doc was last written elsewhere and local git
   is behind); `.gitattributes` making `data/*.json` whole-file ours/theirs
   rather than line-merged; refresh script kills first, pulls second, and
   `git rebase --abort`s on failure; and split `program.json` into one doc per
   stream to shrink the blast radius (convergent 4).

4. **Percentage-primary loading for members with no tested 1RM.**
   [coaching · GPT, Grok, Claude (convergent 3; Gemini concurred at MEDIUM)]
   The plan itself concedes it (banked item 18) but only fixed RDL and late
   bench. 65% of a number that does not exist calibrates nothing, and the push
   cue emits `@ 65%` before the RPE. Fix: RPE-primary on every main lift for
   the class, % as the coach's reference band; a written week 1 "find your
   working weight" protocol in `appDescription` and the W1 intents; emit RPE
   first (or drop %) in the TrainHeroic cue.

5. **Depth jumps as the micro 1 default is an inverted plyometric
   progression.** [coaching · Gemini, Claude explicitly; GPT and Grok
   demanded lower-risk defaults (convergent 4)]
   Depth jumps are the highest-intensity common plyometric and sit at the END
   of every mainstream progression, yet land in week 1 on unscreened adults.
   Fix: micro 1 jump-and-stick/low box landings for everyone, micro 2 broad-
   to-vertical or squat jumps, micro 3 depth jumps as the coached advanced
   option only. Note: this is a different question from the micro 3 default
   Chris confirmed on 2026-09-01 (broad-to-vertical vs single-leg); nothing
   decided today conflicts with reopening micro 1.

6. **Nine weeks, no load trough, challenges stacked on the peak week of every
   micro.** [coaching · all four brains (convergent 4)]
   Removing the standalone Deload/Skills week was a calendar decision; the
   block still needs a loading trough. Weeks 6 to 9 at rising intensity with
   challenges on the heaviest weeks is where gen-pop tweaks happen. Fix that
   respects the club's decision: make week 6 or 7 an in-block step-back (cut
   compound top-set volume 30 to 40 per cent, cap RPE, no challenge; the
   bench week 7 calibration already does this for one lift, extend the logic)
   and move challenges to the first week of the next micro. Needs the club;
   present it as "no deload week, one lighter week inside the block".

### High

7. **Members never see the challenges: the push skips circuit parts.**
   [coaching/product · Gemini, Grok · code-verified (`teamPushPlugin.ts:219`
   skips with "stays on the wall board")]
   The crash was fixed; the content drop is now deliberate but still real.
   Push circuit parts as a text block or workout note so week 3/6/9
   challenges exist in members' calendars.

8. **A failed push wedges the week.** [reliability/product · GPT, Grok,
   Claude x2 (convergent 4)]
   Mid-loop token expiry or network drop leaves a half-built draft; the
   duplicate-day 409 then refuses the clean retry, and recovery is hand
   deleting drafts in TrainHeroic (already happened once). Fix: pre-flight
   token check before creating anything; per-day resume (treat existing days
   as "already present", create only the missing ones); best-effort delete of
   the partial workout on error; surface token expiry as its own message, not
   a 500.

9. **The tool has no memory of what has been pushed.** [product · GPT, Claude
   (convergent 2)]
   Push state lives in handover prose. Record each push into a push-log doc
   and badge week pills pushed/unpushed/changed-since-push; add "push the
   rest of this block" as one action.

10. **The final flush on tab close silently fails for the main document.**
    [reliability · Claude · verified UPHELD HIGH by Gemini]
    Browsers cap `keepalive` bodies at 64KB; `program.json` is 317KB, so the
    beforeunload flush is rejected every time and the error is swallowed.
    Exposure is the last debounce window before close. Fix: skip keepalive
    for large docs and show the native "unsaved changes" prompt while dirty,
    or log the failure loudly.

11. **Zero automated tests over the pure core that has already shipped three
    real bugs.** [architecture · all four brains (convergent 4), echoed by
    product and reliability seats]
    `trainingWeeks`, `classDays`, `programStreams.migrateSession`,
    `prescription.scaleKey` and an extracted `mapReps` are pure, DOM-free and
    trivially testable. Add vitest, encode the day-early timezone bug, the
    circuit-wipe bug and the circuit-part crash as named regression tests,
    and wire one `npm run check` (correct tsc invocation + tests).

12. **TypeScript strict mode is off in both tsconfigs.** [architecture ·
    Claude · verified partially-upheld by GPT-5.3-codex (severity moderated);
    factual scope confirmed by grep: no strict flag anywhere]
    The type model's `| null` annotations and unions are not actually
    enforced. Enable `"strict": true`, burn down the errors (roughly a day of
    agent time). Chairman ranks it HIGH given no tests and AI-agent
    maintenance; the verifier called it MEDIUM for a single-user tool.

13. **`ProgrammingTab.tsx` is a 2,086-line monolith.** [architecture · all
    four brains (convergent 4)]
    Every programming change lands in one file holding 15+ useState hooks and
    five doc subscriptions; it is where the regressions cluster and the worst
    shape for AI edits. Mechanical extraction, no redesign: push dialog, edit
    modal, session editor, left rail, a navigation hook. Target no file over
    ~500 lines.

14. **The push plugin bypasses the migration and type layer.**
    [architecture/reliability · GPT, Grok, Claude (convergent 4); MCP_DIR
    hardcoded path flagged by all four]
    It `readFileSync`s the raw JSON, re-declares a hand-copied `PushSession`
    type and duplicates legacy fallbacks; both prior push bugs were
    shape-drift bugs. Import `streamsOf`/`migrateSession` and the real types;
    read `MCP_DIR` from an env var with the current value as default; flush
    (or refuse while dirty) before pushing so the push cannot read a stale
    disk file (Grok).

15. **Friday strength is bookable with nothing behind it.** [coaching/product
    · GPT, Grok x2, Claude (convergent 4)]
    A member can book a coached class no one has programmed, which also
    breaks the A/B dose logic for keen members. The club must pick one of:
    pull `fbs` from the live scenario, repoint it, or give it a fixed
    low-fatigue template. The tool should warn whenever a live-timetable
    class type has no focus mapped to it.

16. **Warm-ups are a placeholder on a heavy lifting block.** [coaching · GPT,
    Gemini, Grok (convergent 3)]
    "5min WU, coach's circuit" on squat/RDL days is the cheapest injury-
    prevention gap in the plan. Write one A warm-up and one B warm-up
    (raise, mobilise, pattern rehearsal) and copy them across the phase.

17. **The carry pattern is absent for nine weeks in a gym that sells Hyrox.**
    [coaching · GPT, Grok, Claude (convergent 3)]
    One edit closes three banked items: farmers/suitcase carries into the
    empty Day B accessory slot (items 5, 13 and the week 3 asymmetry in 14).

18. **Phase 3 and October conditioning are dated cliffs, not backlog.**
    [coaching · Grok, GPT, Claude (convergent 3)]
    A/B starts 14 Sept with nothing pushed; October ESD/Hyrox/Game Day are
    empty in four weeks; Phase 3 has no structure eleven weeks out and the
    old 6-week waves do not fit five. Sequence by deadline: push A/B weeks
    1 to 3 now, write October before 21 Sept, decide Phase 3's shape (a
    single 5-week wave with a marker week, volume strip into Christmas, and
    a January return-to-training week before any testing).

19. **Home's dashboard runs on invented attendance.** [product · Grok, Claude
    x2 (convergent 3)]
    The honest-maths work sits on 108 seeded demo entries; screenshots to the
    owners would present fabricated class numbers under real class names.
    Mark seeded entries or purge them, banner the charts "demo data", and
    build the 30-second weekly real-entry flow.

20. **The wall board negotiates with itself instead of being curated.**
    [product · GPT, Grok, Claude (convergent 3)]
    Shrink-to-fit at 64 per cent is hard to read across a floor, and Hyrox
    already clips in red. Add a per-part "show on board" toggle (keep the
    full text in the email/PDF), split into Board 1/2 when needed, and raise
    the scale floor once parts can be dropped. Closes audit #11 and the
    banked Hyrox wall question with a mechanism.

21. **The Strength floor layout draws the wrong room's fixtures.** [product ·
    GPT, Grok, Claude (convergent 3); already owed]
    Key `roomModel.ts` by room; until then hide the fixture layer on the
    Strength layout rather than draw fiction.

22. **The September conditioning runs with its own safety review unapplied.**
    [coaching · Grok, Claude (convergent 2)]
    The Tier 1 items (Monday restructure, burpee broad jumps out, W3 cut,
    load defaults inverted) are neither applied nor rejected, and the
    sessions are live. Put the four in front of Chris as yes/no each and
    record the answers in BANKED; undecided safety findings on live
    programming must not age silently.

23. **Movement Check misleads more than it informs.** [coaching/product ·
    Grok x2, GPT, Claude (convergent 4); audit #10]
    One stream, one phase, free text invisible, accessories untagged. Fix
    the keying first (below), widen to the rolling two phases, label
    untagged work "not classified", and retitle honestly until it can see
    other streams.

24. **`cues` and `patterns` are still id-keyed; free text is invisible.**
    [product/architecture · GPT, Gemini, Grok, Claude (convergent 5);
    already owed]
    Eleven of thirty-six live exercises get no board cue and no pattern
    count. Apply the shipped `scaleKey` string-key fix to both records.

25. **Scaling belongs on the slot.** [coaching/product/architecture · all
    four brains across three seats (the most convergent finding in the run);
    already owed]
    A wall ball used three ways in one Hyrox block cannot carry three
    scalings; slot notes die on a clipped board and never reach TrainHeroic.
    Grok's product nuance is the right design: keep exercise-level scales as
    defaults, add optional per-slot overrides, render both on TV/CSV/email.

26. **The 409 conflict dialog is a blind choice.** [architecture/reliability
    · GPT x2, Gemini, Claude x2 (convergent 5)]
    "Keep mine" silently discards the other side wholesale, with no basis
    for choosing. Show both `updatedAt`s and a summary diff (weeks/sessions
    changed) before offering the buttons.

### Medium (condensed)

27. **One-off migration write-back + `schemaVersion`** [architecture · GPT,
    Grok, Claude (convergent 3)]: run the five legacy-shape migrations once
    against the real files, commit, delete most of the compat code; stamp a
    version so future migrations are explicit.
28. **showScales (UI state) persisted in the business document** [architecture
    · Claude x2 · verified partially-upheld MEDIUM by Grok]: browsing dirties
    data and git; move to React state and strip the field.
29. **Drafts-only should be a mechanism, not a convention** [reliability ·
    Claude, Grok (convergent 2)]: wrap the TrainHeroic client so publish
    throws; one assertion turns the house rule into an invariant.
30. **Timezone is machine-local** [reliability · GPT, Grok, Claude
    (convergent 3, severity moderated by the panel itself)]: current maths is
    internally consistent; add a startup check that the TZ is
    Australia/Brisbane with a banner otherwise, plus the date tests in #11.
    The full PlainDate rewrite GPT wanted is not warranted.
31. **Circuit authoring speed** [product · Grok, Claude (convergent 2)]:
    duplicate-last-week and month-structure copy plus 3 or 4 named piece
    templates; most of the 77 unwritten sessions are circuits.
32. **Tab consolidation** [product · all four brains (convergent 4)]: fold
    Ethos into Home, Equipment behind Layouts, Community into Home/Planning;
    eleven tabs is a mid-size SaaS IA on a one-person tool.
33. **Delivery rules into data** [product/architecture · GPT, Gemini, Grok
    (convergent 3)]: focus-to-class mapping and day picks configurable in the
    Schedule drawer (or a single `catalog.ts` as the one source), so club
    changes stop requiring TypeScript edits.
34. **Per-member anchor capture** [coaching · Claude]: the RPE-primary block
    depends on members retrieving week 1/7 numbers eight weeks later; put
    "record your top set" into the relevant `appDescription`s and the plan.
    Not a member database; that is the Training-App's job.
35. **Primer weeks in-app** [coaching · GPT, Grok, Claude (convergent 3)]:
    paste the emailed primer into the empty Primer block so the phase that
    teaches RPE and landings is auditable and cover coaches have a board.
36. **Hyrox race windows vs the strength calendar** [coaching · Grok, plus
    Claude's Block 04 taper point]: Block 04's W4 retest lands the week after
    Melbourne with no taper written, and 2027 Q1 is aesthetic hypertrophy
    with two races drawn on it. Strategic call for Chris: race-support
    programming or social race markers, and write W3/W4 taper rules into
    each race block when authored.
37. **Error boundary per tab** [architecture · Claude]: one small boundary so
    a render crash in one tab cannot white-screen the whole tool at 6am.
38. **Email-the-week compose URL truncation** [product · Claude]: add "copy
    week as text" as the primary path; compose URLs truncate silently on a
    full week.
39. **ROX Engine authored into a void** [coaching/product · GPT, Grok, Claude
    (convergent 3)]: park it visually, exclude it from written/total counts,
    and either fold engine pieces into ESD or stop writing it.
40. **Front squat on the back squat wave** [coaching · Grok]: split the
    prescription; front squat RPE-primary or ~7.5 to 10 per cent down.

---

## Disagreement log

- **Remove the rev/409 system** (Gemini, both seats) vs keep it (Claude,
  Grok, and GPT as verifier). The gate REFUTED removal: it protects any
  concurrent client on one machine (Programming + TV + Overview all hold the
  same doc), a real clobber incident predates it, and removing revs does not
  stop git conflicts because `updatedAt` rewrites anyway. Chairman: keep.
- **Hosted backend**: the `store.ts` comment plans Vercel/Supabase; Gemini
  says cancel the plan outright, Grok and both Claude seats say do snapshots
  and a sync protocol instead and keep the seam. Chairman: the backup problem
  is real, the backend is not its fix; keep the interface, build nothing
  hosted until a second concurrent editor exists.
- **Timezone severity**: GPT (reliability) called for a CRITICAL PlainDate
  rewrite; Gemini, Grok and Claude found the current discipline internally
  consistent. Chairman: sided with the majority, pin-and-test (see #30).
- **Deload**: the club removed it; all four coaching brains want a trough.
  Chairman: the brains are right and the fix in #6 respects the club's
  calendar decision. This goes back to the club, not into the tool
  unilaterally.
- **"Suggested Format" label** (Grok, product): rename the live scenario's
  display name to "Current format (live)". Chris ruled this morning that the
  timetable stays as it is; that ruling was about the scenario's contents.
  The pure label rename is listed here once and left entirely to Chris.
- **Strict-mode severity**: Claude CRITICAL, codex verifier MEDIUM. Chairman
  ranked HIGH (#12): the moderation is fair for a single-user tool, but with
  zero tests the compiler is the only reviewer this codebase has.

## What the verification gate killed

Five claims were refuted or materially cut down, so the list above is what
survived, not everything that was said:

1. **"Node can interleave two PUTs and silently drop one"** (Grok): refuted
   by Gemini and by direct code reading; the check-then-write is synchronous.
2. **"Remove the rev system"** (Gemini): refuted (above).
3. **"The TV export is a brittle hack the coach depends on"** (Gemini): the
   convoluted pipeline it attacked is Claude's own screenshot-capture
   workaround, not the coach's export path (toSvg + canvas download works).
   The suggested `/api/export-board` endpoint survives only as a nice-to-have.
4. **"The 4MB body cap will break saves this year"** (GPT): arithmetic
   refutes it; 317KB at ~37 per cent written projects far under the cap.
5. **"Windows rename is not atomic" as a HIGH** (Grok): downgraded to a
   footnote; tmp+rename plus the quarantine already contain the realistic
   failure, though a `.bak` of the previous envelope is cheap insurance.

Severity was also moderated on strict mode (CRITICAL to HIGH), showScales
(HIGH to MEDIUM) and the timezone rewrite (CRITICAL to MEDIUM).

---

## Chairman's implement-next roadmap

**This week (before the block lands on 14 Sept):**
1. Close the reseed hole and automate the off-machine backup (#1, #2): one
   evening, removes both data-loss chains.
2. A/B entry fixes (#4, #5, #16, #17): RPE-primary framing, jumps default
   inverted, real warm-ups, carries into the Day B hole; then push weeks
   1 to 3 as drafts.
3. Decisions to Chris/club, yes/no each: Friday class (#15), the four Tier 1
   September revisions (#22), the in-block step-back week (#6).

**September:**
4. Build hygiene sprint (#11, #12, #13, #14): vitest on the pure core,
   strict mode on, push plugin through the shared layer, ProgrammingTab
   carved up. This is what makes every later change safe.
5. Push ledger + resumable push + token pre-flight (#7, #8, #9).
6. Board curation toggle (#20), scales-on-slot (#25), cues/patterns keys
   (#24).
7. Coaching runway (#18): October conditioning, Phase 3 skeleton, January
   return week.

**Later:** sync hardening extras (#3 remainder, #27, #28), Movement Check
rescope (#23), real attendance (#19), room-keyed layouts (#21), tab
consolidation (#32), delivery rules into data (#33), the medium tail.

---

*Stage-1 transcripts: scratchpad only (this session). Verification verdicts
quoted above. Panel prompts and the artefact pack are regenerable from this
repo. No member-identifying data left the machine.*
