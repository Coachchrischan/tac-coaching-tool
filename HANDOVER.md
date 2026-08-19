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
- **Latest expert review:** `REVIEW-2026-08-20.md` in this repo. Start here.

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
  - **strength** (format `strength`): 3 phases, 17 weeks, **280 exercises** (my real Block 1).
  - **esd** (format `circuit`): 3 phases, 17 weeks, Monday + Friday week 1 written.
  - **hyrox** (format `circuit`): 3 phases, 17 weeks, Monday + Friday week 1 written.
  - **gameday** (format `circuit`): 3 phases, 17 weeks, empty.
- **Two session formats.** Strength uses `timedBlocks` (WU/A/B/C series of exercise slots with
  sets/reps/%/RPE). ESD, Hyrox and Game Day use `circuit[]`: each piece has a heading
  ("AMRAP in 10 minutes", "In 8 minutes", "0:00-10:00"), movement lines, an optional rest, plus a
  session `note` (pairs instructions) and `intent`.
- **Control bar:** stream dropdown, phase dropdown, session pills, then view switcher
  (**Week / Block / Phase**), Scales toggle, and an **Edit** button holding phase theme, length,
  add and delete. Week pills show their **Monday date**.
- **Left rail:** TV output, Export for Sheets, Push to TrainHeroic (drafts), Build floor layout.
- **TV board** (`/tv/:sessionId`): 1920x1080 landscape, TAC-branded, renders both formats, with
  per-class member photos as backdrops. Export PNG / PDF.
- **TrainHeroic push:** `POST /api/team-push` via `src/server/teamPushPlugin.ts`, using
  `trainheroic-mcp`'s client and token. **Only Strength** maps to a team ("TAC Strength Class",
  TrainHeroic program id **5071078**). Six drafts already pushed for 31 Aug / 2 Sep / 4 Sep and
  7 / 9 / 11 Sep; they are **stale** (dated off the old start and the old Week 1 scheme) and
  should be deleted and re-pushed.

## What the expert review said (read `REVIEW-2026-08-20.md`)

20 experts, five disciplines, adversarially verified, panel voted. 163 raw findings, 38 distinct,
37 confirmed, none rejected. Three critical items were already fixed (commit `4e21e80`): circuit
sessions were being silently emptied when a phase grew, the push read a deleted field, and the
circuit paste buffer leaked across sessions. The TV board circuit gap was fixed in `895c4f8`.

**Still open, in the panel's priority order:**

1. **#32 (critical, must-fix).** `Session` carries two mutually exclusive payloads
   (`timedBlocks` vs `circuit`) with no discriminator, which is what caused the data-loss bugs.
   Make it a discriminated union on `kind`, migrated on read, so the compiler catches every site.
2. **#4 (high, top should-fix).** **Phases are authored twice** and the data already disagrees:
   ESD phase 1 is "Strength-Hypertrophy" in Programming but "Aerobic base" in the Annual Plan;
   Strength has 9 phases in the plan against 3 in Programming. Link them.
3. **#5 (high).** Programming cannot express the **Christmas break**, so every date after it runs
   two weeks early.
4. **#2 (high).** The push hardcodes Mon/Wed/Fri, but the timetable runs **Lower Tuesday** and
   **Upper Thursday**. Derive days from the schedule.
5. **#11 (high).** The TV board **clips silently** when a session is long.
6. **#37 (high).** Circuits cannot carry a **load**, so Hyrox station weights never reach the floor.
7. **#10 (high).** Movement Check judges one phase, hides the stream, and contradicts the rolling
   two-phase coverage rule; it still says "block".

27 more medium/low items are in the report, including: no "today" entry point (#13); Game Day
missing from the Annual Plan (#8); ESD is pine on some tabs and blue on the Annual Plan where blue
means StretchFit (#27); "Block" means three different things (#22); contrast and focus-state
failures (#24, #35, #36); the equipment inventory is decorative (#30); layout auto-build hardcodes
three of everything and drops loads (#28, #38).

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

## Where to start

Go over the open review items above with me and agree an order before building. My instinct is that
the **phase duplication (#4)** and the **session type (#32)** matter most, but tell me what you think.
Then we still owe: Game Day's first sessions, a Gmail button on the rail to email the week's
programming to selected recipients, the Strength floor layout, and re-pushing the stale TrainHeroic
drafts.
