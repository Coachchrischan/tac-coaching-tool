// Regenerates public/data/exercise-library.json from the TrainHeroic catalogue
// cached on disk by trainheroic-mcp (.exercise-cache.json). Read-only, no session
// token needed. Coach-entered data (pattern tags, scales, cues, custom exercises)
// lives in the library-overrides store document and is never touched here.
//
// Run: npm run refresh-library

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, '..', '..', '..', 'trainheroic-mcp', '.exercise-cache.json');
const OUT_DIR = join(__dirname, '..', 'public', 'data');
const OUT_PATH = join(OUT_DIR, 'exercise-library.json');

// TrainHeroic tag title -> movement pattern. Matched on lowercased title substrings.
// "carry" has no TrainHeroic tag; it only ever comes from coach tagging in the app.
function guessPatterns(tagTitles) {
  const out = new Set();
  for (const raw of tagTitles) {
    const t = raw.toLowerCase();
    if (t.includes('horizontal push')) out.add('h-push');
    else if (t.includes('vertical push')) out.add('v-push');
    else if (t.includes('horizontal pull')) out.add('h-pull');
    else if (t.includes('vertical pull')) out.add('v-pull');
    else if (t.includes('hinge') || t.includes('hip dominant')) out.add('hinge');
    else if (t.includes('lunge')) out.add('lunge');
    else if (t.includes('squat')) out.add('squat');
    else if (t.includes('carry')) out.add('carry');
    else if (t.startsWith('core')) out.add('core-rotation');
  }
  return [...out];
}

if (!existsSync(CACHE_PATH)) {
  console.error(`Cache not found: ${CACHE_PATH}`);
  console.error('Run any trainheroic-mcp exercise tool once (with a valid token) to populate it.');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
const exercises = raw
  .filter((e) => e.eType === 'e')
  .map((e) => {
    // Dedupe tags by TITLE, not id: the catalogue has duplicate ids for the same label.
    const tags = [...new Set((e.tags || []).map((t) => t.title).filter(Boolean))];
    return {
      id: e.id,
      title: e.title,
      custom: e.orgName === 'Coach Chris Chan',
      tags,
      patternGuess: guessPatterns(tags),
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

// Diff summary against the previous file so refreshes are auditable.
let previous = [];
if (existsSync(OUT_PATH)) {
  try {
    previous = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
  } catch {
    previous = [];
  }
}
const prevIds = new Set(previous.map((e) => e.id));
const nextIds = new Set(exercises.map((e) => e.id));
const added = exercises.filter((e) => !prevIds.has(e.id));
const removed = previous.filter((e) => !nextIds.has(e.id));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(exercises), 'utf8');

const custom = exercises.filter((e) => e.custom).length;
const tagged = exercises.filter((e) => e.patternGuess.length > 0).length;
console.log(`Wrote ${exercises.length} exercises (${custom} custom, ${tagged} with a pattern guess).`);
console.log(`Added ${added.length}, removed ${removed.length} vs previous file.`);
if (added.length && added.length <= 20) added.forEach((e) => console.log(`  + ${e.title}`));
if (removed.length && removed.length <= 20) removed.forEach((e) => console.log(`  - ${e.title}`));
