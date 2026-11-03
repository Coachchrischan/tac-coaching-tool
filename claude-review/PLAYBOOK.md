# Weekly Claude setup review: playbook

Version: 1 (2026-11-03). The weekly scheduled task "Weekly Claude setup review" reads this
file and follows it. The loop may rewrite the **Method** section of this file to improve
itself (step 6). It may never weaken the **Fixed rules**.

## Fixed rules (never edit or remove these)

1. Report, do not change. The loop never edits, disables, deletes or creates skills,
   plugins, connectors, other scheduled tasks, Gmail filters, artifacts or anything on
   Chris's computer. It proposes; Chris decides. The only files it writes are inside
   `claude-review/` in this repo.
2. The loop may edit only this playbook's Method section. Its own scheduled-task prompt
   and schedule are off limits (only Chris changes those).
3. Never use em dashes or en dashes in anything written. Australian / UK English.
4. Never claim a capability is new or real without a source link or direct evidence from
   the tools in the session. Mark anything unverified as unverified.
5. Do not nag. An open item already raised is only repeated if its status changed or it
   has been open 4+ weeks (then once, under "Still open").
6. Keep the emailed summary under 250 words. The full detail lives in the report file.
7. Commit only `claude-review/`, with the attribution trailers, to branch
   `claude/beautiful-hypatia-yla5gj` (or `master` once Chris merges it; check which
   branch holds the newest `claude-review/PLAYBOOK.md`).

## Method (the loop may improve this section)

### 1. Load state
- Read `claude-review/LOOP-CHANGELOG.md` and the newest file in `claude-review/reports/`.
  Its "Open items" table is the backlog you are tracking.

### 2. Inventory (evidence only, from tools, not memory)
- Skills: `ListSkills`; plugin skills from the session's skill list (meta-skills plugin).
- Plugins: `ListPlugins` and `~/.claude/plugins/synced/*/manifest.json` (note `updatedAt`).
- Connectors: `ListConnectors` (install state, duplicates, needs_reconnect).
- Scheduled tasks: `list_triggers` (schedule, last_run status, connectors attached,
  model, whether bound to a persistent session, end dates that have passed).
- Computer folders: `list_computer_folders`. If Chris has shared his Cowork folder, also
  read `CLAUDE.md`, `MAINTENANCE_LOG.md` and the skill folders there (read only).
- Repos: `list_repos`; for this repo, branches ahead of / behind `master` and their age.

### 3. What changed in AI this week
- Search (WebSearch, standard first, extended only if thin) for: Anthropic and Claude
  release notes and announcements from the last 8 days, Claude Code changelog, new
  claude.ai connectors / skills / artifact features, and one search on notable non-Anthropic
  AI tooling relevant to a coach running a small business (scheduling, email, content,
  video, finance).
- Prefer official sources (anthropic.com, claude.com, docs.claude.com, code.claude.com,
  support.claude.com, the npm / GitHub changelog). Third-party aggregators are leads only.
- Also note what the tools in this very session reveal (new tool names, new skill types,
  new Artifact types via `Artifact` action `list` scope `types`).

### 4. Assess
For every component ask:
- Is it still used and still working? (last_run status, connector state)
- Is it duplicated by another skill, a built-in feature, or a simpler non-AI tool
  (Gmail filter, Calendar rule, GitHub Action)?
- Is it outdated (old model names, third-party APIs where Claude now does it natively,
  a pattern that a newer feature replaces)?
- Is it over-permissioned (connectors attached that the task never uses)?
- Is it on the right model (mechanical tasks on a smaller model)?
- Is it fragile (bound to one old session, living on an unmerged branch, hard-coded IDs)?
- Could a new capability from step 3 make it better? Be concrete: which component, what
  change, expected benefit.

### 5. Write the report
Create `claude-review/reports/YYYY-MM-DD.md` with:
1. **Top 3 this week** (the three changes worth Chris's time, each one action).
2. **New in AI that matters to you** (max 5 bullets, each with a source link and the
   component it affects; skip hype).
3. **Open items** table: id, item, first raised, status (new / open / done / dropped),
   evidence for the status. Carry every open item forward; mark done ones with evidence.
4. **Full findings** grouped by Scheduled tasks, Skills and plugins, Connectors, Repos,
   Platform capabilities.

### 6. Review the loop itself
Score last week's run honestly:
- Did Chris act on any items? (status changes are the evidence.) Items ignored 4+ weeks
  are either wrongly prioritised or not worth raising: demote or drop them, and say so.
- Were any findings wrong? Was anything missed that later turned up?
- Did searches return useful, sourced news or noise?
- Was the run too long, too costly, too naggy?
Then make at most **2 small edits** to the Method section above that would have made this
run better (new check, better search terms, dropped low-value step). Bump the version
line. Log each edit with its reason in `LOOP-CHANGELOG.md`. If an improvement needs a
Fixed rule or the scheduled-task prompt changed, propose it in the report instead.

### 7. Ship
- Commit `claude-review/` and push (retry up to 4 times on network errors).
- Email chris@coachchrischan.com.au via Gmail `send_message`, subject
  "Claude setup review: week of <Monday date>". Body: Top 3, the AI news bullets, a count
  of open items, what the loop changed about itself, and the path to the full report.
- End with a 3-line summary in the session.
