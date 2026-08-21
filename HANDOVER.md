# TAC coaching tool: handover to a new chat

Paste this whole file as the first message of the new chat.

---

## Who and what

I am Chris Chan, Coach Leader at **Teneriffe Athletic Club** (TAC), a group-training gym at
76 Commercial Road, Teneriffe, Brisbane. You are continuing work on the **TAC coaching tool**:
a private web app I use to plan the club's training year and run classes off the floor.

- **Location:** `C:\Users\User\Cowork\TAC\coaching-tool\` (its own git repo,
  `Coachchrischan/tac-coaching-tool`, private; gitignored from the outer `cowork` repo and
  covered by the Launchpad Git sync buttons).
- **Stack:** React + Vite + TypeScript + Tailwind v4. Runs on **port 8127**
  (`preview_start` with name `tac-coaching-tool`, or it may already be running).
- **Zone rules:** read `TAC/brief.md` and `TAC/brand.md` first. Root routing is
  `C:\Users\User\Cowork\CLAUDE.md`.
- **Plan of record:** `PROGRAMMING-PLAN.md` in this repo (the ratified 2026/27 macrocycle).
- **Latest expert reviews:** `REVIEW-2026-08-20.md` (code audit, 38 findings, mostly actioned) and
  `REVIEW-2026-08-20-TABS.md` (tab-by-tab panel review written for the club owners, also published
  as an artifact). Start with the tabs one; it is the current backlog.

## House rules (do not break these)

- **Australian / UK English.** Never American spellings. **No em dashes anywhere.**
- **Terminology.** `blocks[]` in the data model are **PHASES** in all UI copy (10/1/6 weeks).
  A **BLOCK** is a 3 to 4 week window inside a phase. A **SERIES** is WU/A/B/C inside a session.
  A **STREAM** is a class type (Strength, ESD, Hyrox, Game Day).
- **All persistence** goes through `src/lib/store.ts` and the `/api/store/:docId` API
  (Vite middleware writes `data/*.json`, rev-based 409 concurrency). **localStorage is banned**
  for feature data.
- **TrainHeroic sessions are ALWAYS drafts.** Never publish, never call the publish endpoint.
  I publish by hand.
- **Loads in kg.** Rep columns hold numbers only; each-side, ranges and holds go in the note.
- **Brand:** cream `#F5F3EB`, charcoal `#201d1d`, deep pine `#003030`, warm sand `#DEC5AE`;
  Fraunces display, Mulish body. The Workout Builder's JARVIS theme does not apply here.
- **Verify before claiming.** Check the running app or the store API; do not assume.
- **Typecheck with `npx tsc -p tsconfig.app.json --noEmit`.** A bare `tsc --noEmit` checks nothing
  (it resolved with exit 0 while the app had real errors).
- **Commit per feature**, with a message that says why. Outer-repo changes (CLAUDE.md, Launchpad,
  trainheroic-mcp) go via my Launchpad git sync, not by you.

## The tabs (in nav order)

Home, Annual Plan, Programming, Movement Check, Schedule, Attendance, Layouts, Equipment,
Community, Planning, Ethos.

- **Home**: class-numbers dashboard. Popularity ranking; a grouped comparison chart; clicking a
  class drills into that class against itself (bar per week or month). 12 weeks of seeded demo
  attendance (Jun to Aug 2026, 108 entries).
- **Annual Plan**: 52-week ruler with a Month / Week / Monday-date header, three lanes
  (Strength 9 phases, ESD 6, Hyrox 8), phases as bars (labels run vertical when 2 weeks or less),
  and **HYROX race markers**: Perth 21-23 Aug 2026, Melbourne 9-13 Dec 2026, Auckland 4-7 Feb 2027,
  Brisbane 31 Mar - 4 Apr 2027. Year starts **Mon 24 Aug 2026**.
- **Programming**: the big one. See below.
- **Movement Check**: pattern coverage for the Strength stream only.
- **Schedule**: drag-drop timetable, named week scenarios. **"Suggested Format" is the current
  format**, the live timetable everything acts on; "Current timetable" is the older week, kept.
  The one on screen may be a sketch, and the tab says which you are looking at. Right-click an
  empty slot to add a class. Concurrent classes lane by **room order**.
- **Layouts**: one floor plan per class. Fixed fixtures (air runners, rig, sled track) are drawn
  from `roomModel.ts` on every layout; movable gear is a palette with count, spacing, direction
  and a station number.
- **Planning**: paste box: paste anything, one **Save** button decides if it is to-dos or a dated
  note, and lifts action lines out of prose. Notes in a dropdown. 1 real note (my meeting summary),
  13 to-dos.

## Programming tab: how it is built

- **Data:** `ProgramDoc.streams[]`, one per class type, each with its own `blocks[]` (phases).
  Reads go through `src/lib/programStreams.ts` (`streamsOf` migrates the legacy `doc.blocks`
  shape in memory; `withStreamBlocks` writes). Current live state:
  Each stream also declares a **cadence**. Strength runs `phases`, linked to the annual plan.
  ESD, Hyrox and Game Day run `months` (Aug 2026 through Dec 2026), because after talking to Dave
  those three are programmed month to month rather than periodised; the UI says "Month" for them.
  - **strength** (`series`, phases): 3 phases, 17 weeks, **280 exercises** (my real Block 1). Each
    phase carries `annualPhaseId` linking it to its AnnualPhase.
  - **esd** (`circuit`, months): 5 months, 17 weeks. Aug W1 written, plus **all of Sept 2026**
    (4 weeks x Monday MAP + Friday threshold) from the conditioning block document.
  - **hyrox** (`circuit`, months): 5 months, 17 weeks. Aug W1 written, plus **all of Sept 2026**
    (4 weeks x Monday HYROX A + Friday HYROX B).
  - **gameday** (`circuit`, months): 5 months, 17 weeks, **first 4 Saturdays written**.
  50 of 104 sessions hold content. Writing the rest is the main outstanding job, and it is
  coaching time rather than build time.
- **Two session formats.** Strength uses `timedBlocks` (WU/A/B/C series of exercise slots with
  sets/reps/%/RPE). ESD, Hyrox and Game Day use `circuit[]`: each piece has a heading
  ("AMRAP in 10 minutes", "In 8 minutes", "0:00-10:00"), movement lines, an optional rest, plus a
  session `note` (pairs instructions) and `intent`.
- **Control bar:** stream dropdown, phase dropdown, session pills, then view switcher
  (**Week / Block / Phase**), Scales toggle, and an **Edit** button holding phase theme, length,
  add and delete. Week pills show their **Monday date**.
- **Left rail:** TV output, Export for Sheets, Push to TrainHeroic (drafts), Build floor layout,
  **Email the week** (opens a Gmail compose window with the week written out; it never sends).
  Coach addresses live on `ScheduleDoc.coaches[].email`, edited in Schedule's settings drawer.
- **TV board** (`/tv/:sessionId`): 1920x1080 landscape, TAC-branded, renders both formats, with
  per-class member photos as backdrops. Export PNG / PDF.
- **TrainHeroic push:** `POST /api/team-push` via `src/server/teamPushPlugin.ts`, using
  `trainheroic-mcp`'s client and token. **Only Strength** maps to a team ("TAC Strength Class",
  TrainHeroic program id **5071078**). The six stale drafts were deleted on 2026-08-20 and
  **Phase 1 weeks 1 and 2 were re-pushed on 2026-08-21**: Tue 25, Thu 27, Fri 28 Aug and Tue 1,
  Thu 3, Fri 4 Sept. Weeks 3 to 10 are written but not pushed.
  Session days come from the **current format** (the scenario marked live in Schedule, currently
  "Suggested Format": Lower Tuesday, Upper Thursday, Full Body Friday) through
  `src/lib/classDays.ts`, which both the confirm dialogue and the server use, so they cannot
  disagree. A focus with no class in the live timetable is named and skipped rather than guessed
  at, and an exercise with no TrainHeroic id is skipped and named too.
- **Dates are TRAINING weeks.** `src/lib/trainingWeeks.ts` turns a training-week index into a
  calendar Monday, stepping over club shutdowns (see below). Read a Date back with its `isoDate`
  helper, never `toISOString().slice(0, 10)`: these Dates are local midnight, and in Brisbane the
  UTC round trip moves them a day earlier. That bug sent every push a day early once already.
- **Club breaks.** `AnnualPlanDoc.breaks` holds dated club-wide shutdowns (Christmas break,
  2026-12-21, 2 weeks). Phase lengths are training weeks; every lane and every Programming week
  date steps over a break. Edit them in Annual Plan under "Club breaks".

## What the expert review said (read `REVIEW-2026-08-20.md`)

20 experts, five disciplines, adversarially verified, panel voted. 163 raw findings, 38 distinct,
37 confirmed, none rejected. Three critical items were already fixed (commit `4e21e80`): circuit
sessions were being silently emptied when a phase grew, the push read a deleted field, and the
circuit paste buffer leaked across sessions. The TV board circuit gap was fixed in `895c4f8`.

**Closed on 2026-08-20** (see the git log for the reasoning on each):

- **#32** `Session` is now a discriminated union on `kind` ('series' | 'circuit'), migrated on read.
- **#3** the Block and Phase grids show a read-only circuit summary; the CSV emits circuit rows.
- **#2** the push derives days from the active Schedule scenario and shows every date first.
- **#5** the Christmas break is a club-wide dated window all week dating steps over.
- **#4** Strength phases carry `annualPhaseId`, with a drift warning and a pull-from-annual action.
- **#37** circuit lines carry a load, typed inline as "50m Sled push @ 60kg".
- Plus, found by the tabs review: the push was sending every date **one day early** (timezone),
  and Layouts could not select an item at all (click selected then instantly deselected).

**Still open from the code audit:** #11 (TV board clips silently when a session is long) and
#10 (Movement Check judges one phase, hides the stream, and contradicts the rolling two-phase
rule). The medium and low items are largely superseded by the tabs review, which is the better
backlog now: it covers the same ground ordered by what it costs the club.

## Known gotchas

- The **in-app Browser pane cannot screenshot** (times out) and blocks page-initiated downloads.
  To capture the TV board: intercept `HTMLAnchorElement.prototype.click` in-page to grab the export
  data URL, draw it to a canvas as JPEG, `PUT` it into the planning doc's `notes` via the store API,
  read `data/planning.json` off disk, then restore notes. Claude-in-Chrome works when connected.
- **Never rewrite files with PowerShell `Set-Content`/`-replace`** on this repo: it corrupted UTF-8
  (en dashes, ellipses, the multiply sign) and I had to repair it. Use the Edit tool, or Node with
  explicit `utf8` read/write.
- Vite's watcher ignores `data/**` (autosaves used to full-reload the page and reset the UI).
- `html-to-image`'s `toPng` hangs in background tabs; the TV export uses `toSvg` plus a manual
  canvas.
- Workflow scripts with CRLF line endings are rejected by the approval dialog; normalise to LF first.

## What shipped on 2026-08-21

All committed and pushed to `Coachchrischan/tac-coaching-tool`. Programming tab unless noted.

- **Session parts are a union.** A part is a SERIES (sets and reps) or a CIRCUIT, on
  `kind`, so a strength day can finish on a 10 minute AMRAP. `+ Circuit` sits beside
  `+ Timed block`; it is written the ESD way and gets its own board column. Every
  sets-and-reps edit goes through the `mapSeries` helper so circuit parts are never
  touched by a series edit. A part with no `kind` is a series, so nothing needed
  migrating. `CircuitPartCard.tsx` is its editor.
- **Reorder arrows** on each exercise row, applied across every week of the phase by
  exercise name, since the same exercises run all phase.
- **Three copy actions, deliberately distinct.** Per row (the arrow in the Copy
  column) copies that exercise's week-1 sets/reps/%/RPE across the block. `all` under
  that header does every row at once, with a confirm, because the main lifts wave.
  The first week's header (`Week 5 -> 6-8`) pushes that week's EXERCISE LIST to the
  rest of the block, keeping each week's own numbers so the waves survive.
- **Block length is per phase** (`ProgramBlock.blockLength`, default 4), stepper in
  the Edit panel, so three-week waves are expressible. Block pages, their week ranges
  and the grid window all follow it.
- **Scaled options carry their own prescription** (sets, reps, load, %, RPE, tempo).
  Older documents stored plain strings and are lifted on read by `scaleOptions()`.
  Limitation: scales are stored against the EXERCISE, not the slot, so a scale reads
  the same everywhere that exercise appears. Per-week scale numbers would need them
  moved onto the slot.
- **A bare number in the % column becomes a percentage** on blur (70 becomes 70%).
- **The tool opens on today.** Programming jumps to the live training week; Home has
  an "On today" panel listing today's classes with coach, room and links.
- **Home's two numbers are honest now.** Popularity ranks by heads in one class
  (Game Day 17 tops it, ESD 7 is eighth) rather than total attendances, and months
  show an average week with the current one marked "so far", so ESD reads 62, 65, 73
  climbing rather than 311, 259, 219 falling.
- **Block pages show only their own weeks.** They used to list every exercise in the
  phase, so Block 1 showed work from Block 2.
- **Layouts.** Clicking an item selects it (it used to select and deselect on the
  same click, making the whole editor dead); items are labelled inside the shape
  (ROW, SKI, DB), with a load kept underneath; "Suggest a format" proposes a station
  loop, two lines, pods, split room or relay lanes from the real class size and the
  stock the club owns.
- **The output rail is z-40** so its hover labels sit above the grids.

## What shipped on 2026-08-21, later the same day

- **The live timetable is separate from the one being sketched.** `ScheduleDoc`
  gained `liveScenarioId`. `activeScenarioId` still means "what is on screen",
  and only the live one is read by the TrainHeroic push (through
  `classDays.ts`), Home's Today panel and popularity ranking, and the
  floor-plan class sizes. Schedule says which of the two you are looking at.
  **"Make this the current format"** promotes the week on screen and archives
  the one it replaces, dated; archived weeks sit in their own group in the
  dropdown with a Restore action, and the current format cannot be deleted.
  Documents without `liveScenarioId` fall back to the viewed one. **Suggested
  Format is marked current**, so the push behaves as it did before.
  See `src/lib/scenarios.ts`.
- **The TrainHeroic drafts are up.** Phase 1 weeks 1 and 2, six drafts:
  Tue 25, Thu 27, Fri 28 Aug and Tue 1, Thu 3, Fri 4 Sept. Verified against
  TrainHeroic itself: right days, `published = 0`, no auto-publish schedule.
  One exercise is skipped on Lower each week, **Squat Rotations**, which has no
  TrainHeroic id. Weeks 3 to 10 of Phase 1 are written but not pushed.
- **The TV board fits itself to the slide.** The work area is laid out at
  1/fit of its size and scaled back, so type shrinks while the board keeps its
  width. It measures its own columns after each paint and steps down until
  nothing is hidden, stopping at 0.64. Below that an amber note says the
  session is too long for one board. That note sits **outside** the slide, so
  it never reaches the wall or the export.
- **Scaled options are laid out in the table's own columns.** Each scale is a
  real row, so its name box ends on the same pixel as the exercise box and
  every number sits under its heading. Field names removed from inside the
  boxes, since each box now sits under its own heading.
- **A free-text exercise can carry scales.** Scales were keyed by TrainHeroic
  id alone, so eleven of the thirty-six exercises (the DB or plate drag
  through among them) could not be scaled. The key is now the id where there
  is one and `name:<lower-case name>` where there is not; see `scaleKey` in
  `lib/prescription.ts`. No migration: JSON keys were strings already.
  **`cues` and `patterns` still have the same limitation**, so a free-text
  exercise still gets no coaching cue on the board and is invisible to
  Movement Check. The same fix would apply.
- **ESD and Hyrox Sept 2026 written** from Chris's TAC Conditioning Block 1
  document, as a placeholder: 4 weeks x 2 sessions x 2 streams. ESD Monday is
  the MAP session and Friday the threshold session. The document calls its
  HYROX class mid-week; the club runs Hyrox Monday and Friday, so HYROX A
  (race format) took Monday and HYROX B (stations) took Friday. Written as the
  document's block body, **without the roundtable's Tier 1 revisions applied**
  (the Monday round restructure, dropping burpee broad jumps from Monday,
  cutting W3 Monday to 4 rounds, inverting the HYROX load defaults). Those are
  recommendations on Chris's programming and are his call.
- **Scaled options carry the demo video link too.** `ScaledOption` gained an
  optional `exerciseId`, and the scale name field is now the same library
  picker the exercise above uses, so a scale picked from the library gets the
  exact title, the id and the video. Video lookup is by id then by name, so
  scales written before this still resolve where the name matches the library
  title exactly. Free text still works and just gets no video.
- **Month-cadence boards print the month**, not "Phase 2". Strength unchanged.
- The duplicate `hyrox` React key was `LayoutsTab.tsx`: the suggest panel and
  the canvas were siblings both keyed `room.id`. Reproduced, fixed, confirmed.

## Where to start

Read `REVIEW-2026-08-20-TABS.md` and go over it with me before building. Its own top five are:
back the tool up off this laptop; fix the two Home numbers (rank by heads per class, and show per
week averages with the current month marked); make the tool open on today; write the rest of the
year; and give each artefact one printable way out.

**Still owed from earlier:**

- **The Strength floor layout.** `data/layouts.json` has the Strength room labelled "Gym Floor"
  while `roomModel.ts` draws the Group Fitness Room on every layout, so this needs the room model
  keyed by room first.
- **Game Day beyond Sept W2**, ESD and Hyrox Oct to Dec, and Strength Phases 2 and 3.
  Sept 2026 is now written for ESD and Hyrox, so the count is 50 of 104 sessions.
- **Chris's call on the Sept ESD and Hyrox placeholder**: whether the A-to-Monday,
  B-to-Friday mapping is right, and whether the roundtable's Tier 1 revisions go in.
- **Push Phase 1 weeks 3 onward** when he wants them in members' calendars.
- **`cues` and `patterns` for free-text exercises**, the same root cause as the
  scales fix above.

**Decisions already made, do not reopen without me:** ESD, Hyrox and Game Day are month to month,
not periodised. TrainHeroic stays drafts only. The week email opens a Gmail compose window and
never sends.
