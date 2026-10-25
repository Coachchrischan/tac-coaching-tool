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

## TV output

`/tv/:sessionId` renders a 1920x1080 display of one session for the gym TVs, exportable as PNG and PDF from the Programming tab.
