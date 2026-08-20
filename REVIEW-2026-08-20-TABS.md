# TAC coaching tool: tab-by-tab assessment, 2026-08-20

> Panel review of every tab across four lenses (functionality, UI, ease of access, the Coach
> Leader role), written for the club owners. 16 reviewers, adversarially verified against the
> source, 140 findings kept. Also published as an artifact for sharing.
>
> **Already fixed since this was written:** the TrainHeroic push sending every session one day
> early; the push assuming Mon/Wed/Fri; Layouts being unable to select an item; the circuit
> streams rendering nothing in the grids and CSV; the Christmas break; circuit station loads;
> and Game Day being empty. Those rows are kept below so the record stays honest.

---
# TAC coaching tool: assessment

## Where the tool stands

This is a real internal product, not a prototype sketch: it holds the club's 2026/27 training year, a fully written ten week strength phase, the live timetable, the gym TV boards and a drafts-only push into TrainHeroic, and the hard parts (training week dating around the Christmas shutdown, two very different session formats, safe saving when two people edit at once) are done properly. The craft is high and the instincts around safety are right. What it is not yet is a club asset: it runs only on one laptop, has no off-site copy, roughly two thirds of the programmed year is still blank, and several of the numbers it puts in front of a reader are counted in a way that points at the wrong decision. It is also built around planning rather than around the moment a coach opens it ten minutes before a class, so nothing in it knows what day it is. To be relied on by the whole coaching team it needs three things: to be reachable by someone other than Chris, to open on today's classes, and to give a covering coach a single page they can read cold.

## What it already does for the club

- Holds the whole training year in one place: 52 week annual plan, phases per stream, HYROX race dates and the club's Christmas shutdown, with every week date derived from real training weeks rather than calendar weeks.
- Writes strength programming to a professional standard: ten weeks by three sessions, roughly 280 exercise slots, wave loading, a mid phase deload and a stated retest intent.
- Pushes sessions to TrainHeroic safely: drafts only, never published, with the days read from the live timetable and every date shown for confirmation before anything is created.
- Produces a gym TV board that looks like Teneriffe Athletic Club, not like a spreadsheet on a screen, and exports to PNG or PDF when a screen is not available.
- Keeps coaching cues and scaled options against the exercise itself, so every coach using that movement gives members the same instruction.
- Carries the club's real timetable (28 classes, six coaches, three rooms) with concurrent classes handled correctly, plus real equipment counts and a floor plan suggester that reads class size and stock.
- Saves everything through one storage layer with revision checks, so two coaches editing at once get a genuine choice rather than one person's work quietly disappearing.

## Tab by tab

### Home

Home is the landing page and is currently an attendance dashboard: a class popularity ranking, a bar chart with monthly and weekly views, a drill down into one class, and a strip of upcoming events. The interaction design is genuinely good and it is honest about gaps in the data. The arithmetic under the two headline numbers is not, and this is the tab most likely to be put in front of owners.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Coach leader | Create a private backup of the tool and its data today and add it to the existing sync routine. | The club's entire training year, timetable, layouts and inventory exist in one folder on one laptop with no copy anywhere. If that machine is lost, all of it is gone. | Small |
| Functionality | Rank classes by average heads per class, not by total attendances. | ESD runs nine times a week and averages about eight people; Game Day runs once and averages nineteen. The chart badges ESD "TOP" and puts Game Day sixth, so acting on it would mean protecting the emptiest classes and cutting the fullest. | Medium |
| Functionality | Show months as an average week and mark the current month as part recorded. | Because months hold different numbers of weeks and the current one is always incomplete, every class appears to be falling steeply when the weekly numbers are flat or rising. The dashboard will always tell a decline story. | Medium |
| Coach leader | Add a Today panel: today's classes with coach, room and one click to each session, board and floor plan. | The app opens on last quarter's numbers, never on the class about to run. A second coach has to be taught which of eleven tabs holds today's session, and anything that has to be taught does not survive a coach leaving. | Medium |
| UI | Re-space the class colours so no two look alike, and print the value on each bar. | Four of the ten class colours are effectively identical, and the numbers only appear when you hover one bar at a time, so the main chart cannot be read. People stop looking at it, which wastes the coach time spent collecting the data. | Small |
| Ease of access | Across the whole tool, restore a visible keyboard focus outline and darken the grey used for real information. | The focus ring is switched off in 38 places, and dates, counts and hints sit below readable contrast. On a laptop in a bright gym the second line of everything is a squint, and keyboard users lose their place entirely. | Medium |

### Annual Plan

The strongest idea in the tool: one 52 week ruler, one lane per stream, phases as bars, races as pins, and a club-wide break that both this tab and Programming date off. It reads as a year at a glance and is close to Chris's paper sheet. It is not yet trustworthy enough to hand to an owner.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Draw every lane on the same 52 column grid the ruler uses. | On the ESD and Hyrox lanes the bars are squeezed to a different scale than the ruler above them, so a race pin can appear to sit in the wrong phase. The picture and the text quietly disagree, and the picture is what people read. | Small |
| Functionality | Count training weeks for the "weeks used" badge, not calendar weeks including the shutdown. | The only quality check on the page is inverted: it warns amber on the two streams that are correct and stays silent on Strength, which is two weeks short of a full year. That gap becomes a scramble in April. | Small |
| Coach leader | Link ESD, Hyrox and Game Day to the annual plan the way Strength already is, and give Game Day a lane. | For three of the four streams the annual plan is a picture of a year nobody is delivering, and nothing will ever warn that a planned race prep phase was never programmed. This is the artefact owners will look at. | Large |
| Coach leader | Make phase notes a proper multi-line field and list them under the chart as a coach brief. | The note meant for the floor coaches is a one line box hidden inside an editor a second coach has no reason to open, so the intent behind a phase never reaches the people delivering it. | Medium |
| Coach leader | Add a one page print or PDF of the year: ruler, all lanes, races, breaks and phase notes. | The year cannot leave the screen, so the strongest evidence that the programming is designed rather than improvised only exists while Chris is sitting at his laptop. | Medium |
| UI | Darken or recolour the later phase bars so their labels stay readable, and give ESD a club palette colour. | The back half of the year, which for Hyrox is the whole race season, is close to unreadable. ESD is also pine on three tabs and blue on this one, where blue already means StretchFit, so colour tells two different stories. | Small |

### Programming

The heart of the tool and close to production. It handles both ways the club writes training, dates every week off the real training calendar, and pushes to TrainHeroic as drafts with the days read from the live timetable. Three gaps stop it being something a second coach could be handed.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Fix the date conversion on the TrainHeroic push and clear the stale drafts already sitting in athletes' calendars. | Every pushed session lands one day early, and the confirmation screen prints the correct day name beside the wrong date, so the error is hidden. Members open the app and see Tuesday's session on Monday. | Small |
| Coach leader | Show how much of the year is written: a filled or hollow dot on each week, and a count per stream. | Of 104 sessions, 38 hold anything. ESD has two written of eighteen and runs nine times a week; Game Day is empty. Neither Chris nor an owner can see that at a glance, and the TV boards and floor plans are unusable for the club's busiest class. | Medium |
| Ease of access | Add "copy this week to the rest of the block" and "add this session to every week in the phase". | Building a four week block is around 45 individual clicks, and reusing last week's ESD session means copying text out of one week and pasting it into another through a disclosure panel. That friction is why three of four streams are unwritten. | Medium |
| Functionality | Add a load column to the block and phase grids. | Progressive overload here is written in kg, and the one view designed to plan progression across four weeks is the one view where kg cannot be seen or typed. | Small |
| Ease of access | Open the tab on the phase and week containing today, and print the day each session runs on its pill. | A coach opening ten minutes before a class lands on Phase 1 Week 1 and has to count forward, then cannot tell which day "Lower" or "Upper" runs. It is the difference between a planning tool and a tool usable on the floor. | Medium |
| Coach leader | Give the spreadsheet export a scope (this week, this phase, this stream) and label columns with the stream name. | The only export is the entire year for all four streams, with phases numbered straight through so ESD phase 1 reads "P4" and no dates anywhere. It cannot be used as the handover document that is most of the point of an export. | Medium |

### TV board

The most finished looking surface in the tool: a fixed club-branded slide that renders both session formats, pulls cues and scaling from the library, and exports cleanly. What stops it being trusted on the floor is that it can lose content silently and cannot be reached by an actual TV.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Measure the slide and shrink the type until it fits, with a visible warning when it still does not. | Long sessions run past the bottom edge and simply disappear, and the board looks complete. The class does what is on the wall, so members finish two movements short and nobody knows. | Medium |
| Coach leader | Serve the board somewhere a TV and a phone can reach it, add a day view, and refresh it automatically. | Today every screen needs its own laptop and a person clicking to the right session, and a board left up never updates, so a fix made on Wednesday night stays invisible until someone walks over and reloads it. | Large |
| Functionality | Build the automatic coaching line from the first working series, not the warm up. | On every strength day the one line of automatic coaching describes the mobility drills while the squat, the reason the session exists, gets no mention. | Small |
| Functionality | Print the real day and date in the board header. | Nobody can tell a current board from one left up since last week, so a member cannot confirm they are in the right class and the wall stops being trusted the first time it goes stale. | Small |
| Coach leader | Allow a cue and a scaled option per circuit movement, and show the circuit summary instead of blanking it. | Three of the four streams give a covering coach the movements and none of the coaching. That is exactly where delivery quality varies most between coaches. | Medium |
| UI | Enlarge and brighten the cue and scaling lines, and fade the export buttons out when the mouse stops. | The scaled option is the one thing a newer member needs off the wall and it is the least legible thing on it, so they interrupt the coach instead. Meanwhile "Export PNG" sits over the club tagline in front of the class. | Small |

### Movement Check

The club's balance and injury-risk audit: pick a phase, see how often each movement pattern appears, tag anything unclassified. The tagging pays off elsewhere, and the screen is honest about what it cannot count. It is a useful working screen that is not yet a trustworthy report.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Score coverage across the current phase and the one before it, and only warn on that rolling figure. | The club's own rule is a rolling two phase window, so the tool raises amber warnings on phases that are perfectly compliant. A tool that cries wolf gets ignored, and a coach who does not know the rule will bolt exercises in to clear the warnings and wreck the periodisation. | Medium |
| Functionality | Say plainly that it reads the Strength stream only, and add a stream selector. | The caption tells the coach it counts every session in the phase; it counts roughly one class type. Hinge work in the Hyrox stream is invisible, so the club looks under-covered when it is not. | Small |
| Coach leader | Add a one page export of the coverage figures. | The evidence that the programming is balanced exists on one laptop in one tab for whoever is looking right now. It cannot be handed to owners, taken to a coaches' meeting or attached to a handover. | Medium |
| Ease of access | Name the untagged exercises in the warning and add an "untagged only" filter. | The one action the tab asks for is the one it makes hardest: a coach is told six exercises need tagging, then has to eyeball thirty rows to find them. In practice it does not get done and the numbers stay wrong. | Small |
| Functionality | Show a per week rate beside the raw count. | A ten week phase shows roughly ten times the squat count of a one week deload purely because it is longer, so two phases cannot be compared and the bars stop communicating balance. | Small |
| UI | Replace every "block" on this screen with "phase", and do one naming sweep across the tool. | The buttons say Phase and the copy underneath says block, which in club language is a different window entirely. Across the tool the same thing is also called Seg, Timed block and Series on different screens, which is what most slows a second coach down. | Small |

### Schedule

A drag and drop weekly timetable with named week scenarios. The real club week is in there, concurrent classes in different rooms are handled deliberately, and deleting a coach or room cleans up cleanly. Its limits are that it is a picture of the week rather than a model of it, and that the scenario currently switched on is a proposal.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Mark one scenario as the live timetable, separate from the one being viewed. | The scenario on screen is "Suggested Format", a draft, and it is the one that decides which days real athlete sessions are pushed to. Sketching a hypothetical week for the owners can silently change the dates members see. | Medium |
| Coach leader | Add a coach load strip: classes and hours per coach, with unassigned classes flagged. | One coach is on 16 of the 28 classes and four classes have no coach at all, including three on Friday. Staffing the floor is the Coach Leader's core job and neither fact is visible anywhere. | Medium |
| Functionality | Drop a dragged class where the ghost shows, not where it was grabbed. | Every drag needs a correction of up to half an hour, so the headline feature of the tab feels broken and a second coach quietly stops using it. | Small |
| Coach leader | Wire up the unused rationale field and add a printable week plus a compare-against-live view. | To put a proposed timetable in front of the owners, Chris has to screenshot a browser window and carry the argument in his head. Three months later nobody remembers why the Friday class was added. | Medium |
| UI | Collapse the empty hours, tint today's column and draw a current time line. | More than half the grid is dead space between the morning and evening bands, and nothing marks today, so opening the tab does not answer the question a coach actually has. | Medium |
| Ease of access | Make the "Classes & coaches" button always do something visible, and let a class be added where you are looking. | With a class selected the button appears to do nothing, which is the classic reason someone decides a tool is broken. Adding a class in place needs a right-click, which does not exist on the iPad used on the floor. | Small |

### Attendance

A small, honest data entry tab that autosaves and feeds the dashboard. The date handling, which is where tools like this usually break, is done correctly. What it records does not yet match how the club runs.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Roll weekly numbers up in the monthly view instead of showing an exact match only. | The tab opens on monthly and shows "Total: 0" while the table immediately below shows 265 for last week. A second coach will assume the numbers were lost, or retype a monthly total on top and create a second version of the truth. | Small |
| Functionality | Record a per session figure keyed to the timetable slot, keeping the class type total as a roll-up. | Nine ESD classes a week collapse into one number, so the club can say ESD had 74 people but never that the 7am had four. Every timetable decision the owners care about is a timeslot decision, and they are currently argued from memory. | Large |
| Functionality | Report a per week average and mark the in-progress month. | Because months hold different numbers of weeks, ESD rolls up as 311, 259, 219 and looks like a 30 per cent decline, while week by week it is climbing. This is the chart the owners will look at. | Medium |
| Coach leader | Attach the coach and the training phase to the numbers. | Chris cannot see that one coach's classes are quietly emptying while another's fill, and when the owners ask whether a new programming phase worked there is no before and after to show. | Medium |
| Functionality | Confirm or offer an undo before anything that deletes recorded work. | One click on a faint cross wipes a whole week of hand-typed numbers, with no prompt and no way back. The same is true of an equipment line and of a whole series inside a session, while less costly deletions do ask first. | Small |
| Ease of access | Add "copy last week" and a sanity check on a number far off the previous one, plus an optional note per week. | Ten numbers typed cold every Monday is how attendance logs go stale, a fat fingered 740 instead of 74 goes straight to the owners' dashboard, and nothing records why a week was down. | Small |

### Layouts

A floor plan drawing board with the rig, air runners and sled track drawn permanently so they cannot be dragged away, station number badges, and coach-friendly wording. The idea is right. In its current state it cannot be used.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Make clicking a piece of equipment select it. | Right now a click selects and instantly deselects, so the entire editing panel is dead: nothing can be renamed, renumbered, counted or removed. It is a one line fix standing between a picture and a working tool. | Small |
| Functionality | Draw the room each layout actually belongs to, and build the missing Strength and Game Day plans. | The Strength layout is labelled Gym Floor and draws the Group Fitness Room, so the club's biggest stream cannot be planned and anything drawn there misleads the next coach who opens it. | Medium |
| Coach leader | Add print and image export, and show the plan on the TV board. | The floor plan is the most handover-shaped thing in the tool and the one thing that cannot be handed over. A coach setting up at 5:45am has to carry a laptop onto the floor; a relief coach gets nothing. | Medium |
| Functionality | Let a class hold several dated plans instead of one that is overwritten. | Building this week's floor plan destroys last week's, so nothing accumulates and the club never builds a library of formats that worked. | Medium |
| UI | Space auto-built rows by the real size of the gear and offset each manually added item. | The output of the one automated feature arrives overlapping itself and the fixed equipment, which teaches everyone not to trust it. | Small |
| UI | Label the floor in metres and warn when a plan calls for more gear than the club owns. | A plan can call for twelve rowers against eight owned, or pack gear into a space it does not fit, and nothing objects. The coach finds out at 5:50am with members waiting. | Medium |

### Equipment

The simplest tab: a flat list of gear with counts and notes, edited in place. What it does it does cleanly, and the seeded numbers are the real gym. Today it is a tidy record that no other tab reads.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Give each item a type that matches the names the floor planner already uses. | The two lists only join by guessing at wording, so kettlebells, sleds and plates fall through and are treated as zero owned. Whoever builds the availability check later will have to rewrite one of the lists: a couple of hours now against a day later. | Small |
| Coach leader | Record when each count was done and by whom, and show a "last stocktake" line. | Chris cannot hand a coach the job of walking the floor and counting and then see that it happened, and owners cannot tell whether these are current numbers or the ones typed once in August. Capital spend then gets decided on memory. | Medium |
| Functionality | Add an out of service count so a row reads "8 (2 down)". | The most common equipment fact in a gym has nowhere to go, so the inventory reports the club as better equipped than it is and a coach plans an eight station piece and finds six machines. | Small |
| Functionality | Record which room each item lives in. | The club runs three rooms and concurrent classes deliberately, so "Rowers: 8" says nothing about how many are in the room the class is actually in. That is where equipment clashes happen. | Medium |
| Functionality | Hold the count while it is being edited and only save a valid number, and confirm a deletion. | Clearing the field to retype silently writes zero, and a line can be removed with one click and no way back, on the list that is meant to become the source of truth for other tabs. | Small |
| UI | Group the list by category with a summary line, and use the club's pine for the Add button. | A real inventory is forty-plus lines, and today a new item lands at the bottom nowhere near its siblings with no way to search. The charcoal button also makes the tab look like a different product beside Programming. | Medium |

### Community

The club's event planner: a dated list, a form, and ten ready-made TAC event ideas that prefill it. It is clean and already feeds the dashboard, but it has never been used in earnest and an event here is only a name and a single date.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Make each event editable in place and offer an undo on delete. | If the BBQ moves from Saturday to Sunday the coach has to delete and retype it from memory, and one stray click on a small pale cross removes a planned event with no trace until the week it was meant to run. | Small |
| Functionality | Add an optional end date so an event can span a week. | "Bring-a-mate week", which the tab itself calls the best membership driver the club controls, cannot be recorded properly. It ends up as seven near-identical rows or as a one day entry on the dashboard. | Medium |
| Coach leader | Add an owner, a status (idea, confirmed, done) and a start time. | Chris cannot delegate an event through the tool, so ownership stays in his head or a text message, and a second coach cannot tell a loose idea from a catered, promoted, confirmed event. | Medium |
| Coach leader | Capture turnout and a line on how it went, and show events run per quarter on the dashboard. | When the owners ask what the community programme delivered this year there is no answer in the tool, so next year's calendar gets planned on memory rather than on what actually drew members. | Medium |
| Functionality | Show the training phase and week beside the chosen date, and draw events on the annual plan. | Events get booked into the wrong training week. A PB night in a build week instead of the deload, or an in-house comp in the heaviest week before HYROX Brisbane, costs the club either the event or the block. | Medium |
| Ease of access | Label the three fields, darken the hint text, and move the upcoming list above the ideas. | The instructions are the faintest text on the page and vanish the moment anything is typed, and the thing a coach opens the tab to see, what is coming up, sits below an unchanging brainstorm. | Small |

### Planning

The capture surface: paste a meeting summary in, one button decides whether it becomes a dated note or a list of to-dos. The one-button capture with a live preview of what it will do is unusually well judged. What happens after capture is where it falls down.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Recognise "Name will do X" as an action, and show the extracted lines for a tick before they are committed. | Run over the one real meeting note, it pulled six vague themes and missed all fourteen actual commitments, including obtaining the ESD programming from Mike and sending David the first month for review. It looks like it worked, so nobody goes back to the note. | Medium |
| Coach leader | Add an owner, a due date and a link back to the source note on each to-do. | An unowned, undated list can hold personal reminders but cannot run a team of six coaches. Chris cannot answer "what is David waiting on from me" without rereading the note. | Medium |
| Coach leader | Add a copy and a one page "meeting actions" export. | The tool holds the club's actual decisions (three weekly strength sessions, a 25 to 30 cap per coach, a 21 December endpoint) and gives nothing back to the people who need to see them. Nobody gets a written follow-up unless Chris retypes it. | Medium |
| Ease of access | Put the to-do list above the note reader, use the full screen width, and surface an open actions count on Home. | The thing Chris opens this tab for sits below a note that can be a full screen tall, on the tenth tab of eleven. In practice the list gets checked rarely, which is how a to-do list dies. | Small |
| Functionality | Confirm or undo a to-do deletion, and add a "hide done" toggle. | Deleting a note asks first; deleting a commitment does not, and because there is no owner or date on it there is no way to reconstruct what it said. The list also only ever grows. | Small |
| UI | Rename the free-form box so two different things on one screen are not both called Notes. | A second coach cannot tell where to type, so the club's thinking ends up split across two places with no way to search either. | Small |

### Ethos

A single well written statement of what TAC group training is, plus two short lists, editable in place. The words are the strongest thing in the tool and the sort of thing most gyms never write down. As software it is the thinnest tab in the app.

| Lens | What to improve | Why it matters | Effort |
|---|---|---|---|
| Functionality | Edit a working copy and commit it on Save, with a Cancel that discards. | There is no save and no undo: every keystroke is written straight over the club's only statement of its coaching standards. "Done" looks like a save button, so a coach who opens it to read more closely and changes a word has already changed it for everyone. | Medium |
| Coach leader | Give it a route out: a line on the TV board and a one page print for the coach induction pack. | The standards a new coach is meant to deliver against sit on the eleventh tab of a private app. Nothing a coach looks at while running a class carries them, so the ethos currently changes nobody's behaviour. | Medium |
| UI | Recolour the bullets on "What we focus on". | The five training principles, the most important list on the page, are marked with a bullet that is invisible against the background, while the marketing list below is crisply bulleted. | Small |
| Functionality | Fix or remove the "12-week plan" claim. | The real programme runs seventeen weeks per stream against a 52 week annual plan. A small wrong number in front of an owner or a member undermines everything else on the page. | Small |
| Coach leader | Show a last reviewed date with a "mark reviewed" button. | An owner cannot tell whether this is a considered position reviewed last month or a draft from a year ago, and there is nothing to hang a review cadence off. | Medium |
| Ease of access | Move Ethos next to Home and group the eleven tabs into daily and yearly clusters. | This is the natural induction page for a new coach and it sits at the far right where it reads as an afterthought. Nothing in the nav says which two tabs a coach needs every day and which nine are quarterly. | Small |

## The five things worth doing first

1. **Back the tool up and get a copy off the laptop.** The whole training year, timetable, floor plans and inventory exist in one place with no copy anywhere. Effort: Small.
2. **Fix the one day early TrainHeroic date and clear the stale drafts already sitting in athletes' calendars.** This is the only part of the tool members see, and it is currently wrong on every session. Effort: Small.
3. **Fix the two Home numbers: heads per class in the ranking, and per week averages with the current month marked.** The dashboard the owners look at currently says the opposite of the truth about which classes are full and whether the club is growing. Effort: Medium.
4. **Take the three cheap corrections that make three tabs honest:** the Layouts click that unlocks the whole editor, the Annual Plan bars that do not line up with their own ruler, and the Movement Check warning that judges the wrong window. Effort: Small each.
5. **Make the tool open on today:** a Today panel on Home linking to each class's board, week and floor plan, and Programming defaulting to the current week. It is the single change that most reduces what has to be taught. Effort: Medium.

## What this needs to become a team tool

Everything above is capped by one fact: the tool runs on Chris's laptop and nobody else can open it. Six coaches are named in the timetable and not one of them can look up this week's session, the floor layout or the intent behind a phase without Chris being present. Three changes close that gap. First, deploy it behind a simple club login so a coach's phone and the gym TV can reach it, which the storage layer was already written to allow without changing any screens. Second, build a coach view: pick a coach or a day, get their classes with the session, the intent, the cues, the scaled options and the floor plan on one printable page a covering coach can read cold. Third, give each artefact one honest way out of the tool, a week's programming, the annual plan, the coverage figures and a floor plan, so the club's evidence can reach the owners without Chris sitting at the keyboard. Until those exist, this is an excellent planning workspace for one person and the club's programming remains only as available as he is.