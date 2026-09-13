# TAC Coaching Tool

Private planning workspace for the Coach Leader and programming role at Teneriffe Athletic Club. Class schedule theory-crafting, 12-week strength programming, gym-TV workout displays, plus Movement Check, Community, Planning, Layouts and Equipment tabs.

## Stack

React + Vite + TypeScript + Tailwind v4, dnd-kit for drag and drop, React Router. Runs locally on port 8127 (fixed, registered on the Launchpad); deploys to Vercel later with no rewrite.

## Dev

```
npm install
npm run dev        # http://127.0.0.1:8127
```

Or open it from the Launchpad (localhost:7777), tile "TAC coaching tool".

## Storage (the one architectural rule)

No component talks to persistence directly and nothing uses browser localStorage. All state flows through `src/lib/store.ts` (via the `useDoc` hook), which calls `GET/PUT /api/store/:docId`.

- Dev backend: `src/server/storagePlugin.ts`, a Vite middleware persisting to `data/<docId>.json` (committed).
- Every document carries a `rev`; saves send `baseRev` and the server answers 409 on a stale rev. That is the two-coach lost-update guard.
- Production later: the same routes implemented as Vercel serverless functions over a hosted database (Supabase or Vercel Postgres). No UI changes.

Documents (one per tab, plus the coach's library layer): `schedule`, `program`, `library-overrides`, `community`, `planning`, `layouts`, `equipment`. Shapes live in `src/types/documents.ts`, seeds in `src/seed/`.

## Exercise library

`public/data/exercise-library.json` is generated from the TrainHeroic catalogue cached by `trainheroic-mcp`:

```
npm run refresh-library
```

The script reads `../../trainheroic-mcp/.exercise-cache.json` (no session token needed), keeps real exercises only, normalises tags and guesses movement patterns. Coach-entered data (pattern tags, scaled options, cues, custom exercises) lives in the `library-overrides` store document and is never touched by a refresh.

## Importing the club's finished programming from TrainHeroic

The club authors the finished Strength microcycles on its own TrainHeroic account ("Teneriffe Athletic Club Strength", program 5109902). Chris's coach account is an athlete on that team, so his token can read those sessions (read-only) and this script maps them into the Programming tab:

```
npm run import-club-program -- --from 2026-09-14 --weeks 1-3 [--phase str2-hyp] [--dry]
```

`--from` is the Monday the phase starts on, `--weeks` the phase week numbers to import. It needs the dev server on 8127 (writes go through the store API) and a live token in `../../trainheroic-mcp/config.json`. It replaces the three sessions of each target week (names, sets, reps, %, tempo, short notes, block notes, intent, the TrainHeroic session text as `appDescription`), adds a coach cue per exercise where none exists (never overwrites one), and saves the fetched sessions verbatim to `archive/th-club-program/`. Re-running is a sync from TrainHeroic: tool-side edits to those weeks are replaced. Exercise ids are mapped by name to Chris's library in the script's `LIBRARY_ID` table; add a row when the club introduces an exercise.

## TV output

`/tv/:sessionId` renders a 1920x1080 display of one session for the gym TVs, exportable as PNG and PDF from the Programming tab. The board is authored at 1080p and the export size picker re-rasterises it at 1440p or 4K (the backdrop photos in `public/tv/` are the only limit; text stays sharp). The board itself is `src/tabs/tv/TvBoard.tsx`; the rules every reader shares (slide size, titles, the one-line prescription) live in `boardRules.ts`.

## Designer pack

`/designer-pack?stream=&container=&window=` (rail button on Programming) builds one A4-landscape PDF plus a JSON twin for one block of one stream: a cover with the legend, then every written session with every field it carries, each marked **ON THE WALL** (the current board prints it) or **COACH ONLY** (never on the wall), scaled options under each movement, and the current board rendered after each session for reference. The labelling is computed in `src/lib/designerPack.ts` from the same rules `TvBoard` renders by, and is unit-tested. Files are named `TAC-designer-pack-<stream>-<phase>-block<N>.pdf/.json`. Made for the marketing agency redesigning the wall boards; nothing in it is published to members.
