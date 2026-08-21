# TAC coaching tool: handover to a new chat

Paste this whole file as the first message of the new chat.

---

## Who and what

I am Chris Chan, Coach Leader at **Teneriffe Athletic Club** (TAC), a group-training gym at
76 Commercial Road, Teneriffe, Brisbane. You are continuing work on the **TAC coaching tool**:
a private web app I use to plan the club's training year and run classes off the floor.

- **Location:** `C:\Users\User\Cowork\TAC\coaching-tool\` (its own git repo, gitignored from the
  outer `cowork` repo, no GitHub remote yet).
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

- **Home** — class-numbers dashboard. Popularity ranking; a grouped comparison chart; clicking a
  class drills into that class against itself (bar per week or month). 12 weeks of seeded demo
  attendance (Jun to Aug 2026, 108 entries).
- **Annual Plan** — 52-week ruler with a Month / Week / Monday-date header, three lanes
  (Strength 9 phases, ESD 6, Hyrox 8), phases as bars (labels run vertical when 2 weeks or less),
  and **HYROX race markers**: Perth 21-23 Aug 2026, Melbourne 9-13 Dec 2026, Auckland 4-7 Feb 2027,
  Brisbane 31 Mar - 4 Apr 2027. Year starts **Mon 24 Aug 2026**.
- **Programming** — the big one. See below.
- **Movement Check** — pattern coverage for the Strength stream only.
- **Schedule** — drag-drop timetable, scenarios ("Current timetable", "Suggested Format" is
  active). Right-click an empty slot to add a class. Concurrent classes lane by **room order**.
- **Layouts** — one floor plan per class. Fixed fixtures (air runners, rig, sled track) are drawn
  from `roomModel.ts` on every layout; movable gear is a palette with count, spacing, direction
  and a station number.
- **Planning** — paste box: paste anything, one **Save** button decides if it is to-dos or a dated
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
  - **esd** (`circuit`, months): 5 months, 17 weeks, Monday + Friday of Aug W1 written.
  - **hyrox** (`circuit`, months): 5 months, 17 weeks, Monday + Friday of Aug W1 written.
  - **gameday** (`circuit`, months): 5 months, 17 weeks, **first 4 Saturdays written**.
  34 of 104 sessions hold content. Writing the rest is the main outstanding job, and it is
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
  TrainHeroic program id **5071078**). The six stale drafts were **deleted on 2026-08-20**; the
  team calendar is empty for Aug to Oct and **nothing has been re-pushed yet**.
  Session days come from the **active Schedule scenario** (currently "Suggested Format": Lower
  Tuesday, Upper Thursday, Full Body Friday) through `src/lib/classDays.ts`, which both the
  confirm dialogue and the server use, so they cannot disagree. A focus with no class in the
  active timetable is named and skipped rather than guessed at.
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

**Known, not chased:** a duplicate React key warning mentioning `hyrox` in the
console, seen while debugging something else. Source not identified.

## Where to start

Read `REVIEW-2026-08-20-TABS.md` and go over it with me before building. Its own top five are:
back the tool up off this laptop; fix the two Home numbers (rank by heads per class, and show per
week averages with the current month marked); make the tool open on today; write the rest of the
year; and give each artefact one printable way out.

**Still owed from earlier:**

- **Re-push the TrainHeroic drafts.** The calendar is empty and the day derivation is now correct,
  so this is a clean first push. Confirm the dates in the dialogue before letting it run.
- **The Strength floor layout.** `data/layouts.json` has the Strength room labelled "Gym Floor"
  while `roomModel.ts` draws the Group Fitness Room on every layout, so this needs the room model
  keyed by room first.
- **Game Day beyond Sept W2**, and the rest of ESD and Hyrox.

**Decisions already made, do not reopen without me:** ESD, Hyrox and Game Day are month to month,
not periodised. TrainHeroic stays drafts only. The week email opens a Gmail compose window and
never sends.
