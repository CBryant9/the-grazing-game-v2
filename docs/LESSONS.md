# Lessons: mistakes made and how not to repeat them

Each entry gives the symptom, the cause and the fix, plus a rule for next time. Add to this file whenever something goes wrong. A rebuild should read it before starting.

## Model and realism

| # | Symptom | Cause | Fix / rule |
|---|---|---|---|
| 1 | Set-stocked Central Qld steers lost weight all year; first profit was −$36.8k | Intake and condition maths too harsh: quality factor `.4+(dmd−.5)×3`, availability 850, a protein penalty of .07, 1 CS = 9% LW, dead DMD .46 | qf `.62+(dmd−.5)×2`, availability 650, protein penalty .05, 1 CS = 15% LW, dead DMD .50. **Rule: tune against the steer benchmarks, not by feel.** |
| 2 | Cows ran themselves into the ground | Milk didn't drop on poor feed | Milk scaled by `clamp((ME−6)/3, .45, 1)` |
| 3 | Lick cost too much and helped on green feed | 30c a day, charged and applied all year | 15c, charged mainly when CP < 9%, intake lift only when CP < 9% (most when < 7%) |
| 4 | Ungrazed paddocks looked bare and brown | Litter drawn the same colour as soil; dead decay too fast (.004 + .018·wet); visual cover threshold (1,300) didn't match the cover score (1,000) | Straw litter, decay .003 + .009·wet, cover at ~1,000 kg DM/ha in both. **Rule: the map and the numbers must use the same thresholds.** |
| 5 | After rankness was added, Central Qld no-lick steers went to −5 kg | Rankness quality penalties stacked too hard | Softened twice; dead CP raised to 5. **Rule: after any new mechanic, re-run calibration straight away.** |
| 6 | 53–59 head on 260 ha looked fine but isn't realistic; grass outgrew the herd | No carrying-capacity check; farm scale unrealistic | CC formula, district farm sizes, district utilisation, scaled squares and costs. NT growth lowered (×.45), CW lowered (×.8). |
| 7 | Top End deaths of 10–78% in some runs | (a) new weaner mobs defaulted to no lick; (b) cattle wouldn't graze past 1.5 km from water; (c) deaths started at CS 1.5; (d) established stations had only 2 waters on 14,000–20,000 ha paddocks; (e) starts right after a failed run-up season | (a) new mobs inherit the lick, and the north defaults to lick; (b) a 3 km decay; (c) CS 1.4 and gentler; (d) about one water per 2,500 ha; (e) spin-up season floored at 0.85. **Rule: test the big northern farms separately; water distance dominates there.** |
| 8 | Top End went broke within a year on $300k | $222k of lick and overheads on a 50,000 ha place | Starting cash scaled to carrying capacity; advise selling each year |
| 9 | A plan with a waterless stop killed 40 steers in a test | Plan "stays put" when the next stop has no water, but the current paddock had none either | Plans check water on save and ask; moves to a dry stop pause the clock. **Rule: anything that moves cattle must check water.** |
| 10 | Fallow appeared at random after +1 week; a finished barley crop regrew; warnings came after harvest | Land-use state transitions were loose | Fallow only after a crop ends (or rotation blocks at start); finished crops become stubble with no growth; no warnings after harvest. **Rule: "things only happen for a reason".** |
| 11 | Cattle broke out with no reason and through several fences | Breakout chance not tied to hunger | Needs f < 0.85 or no water, a 21-day cooldown, one tape edge. Tape only. |
| 12 | Market chart showed "feeder steers" that couldn't be bought | Class names were defined in two places | One class list feeds both the chart and the saleyard |
| 13 | The 2019–2025 price series was written from memory | No data source on hand | **Half done.** The real MLA series are pulled and recorded in DATA.md ("Real data sources"). The engine still reads the old series until milestone 1.4 wires the real one in |

## Wording and design

| # | What went wrong | Rule now |
|---|---|---|
| 14 | Three-zone labels ("green zone", "buffer") pushed a grazing philosophy, and "buffer" was shown on short dry pasture | Neutral labels only: Green, Mixed, Dry & rank, Short. Describe, don't prescribe. |
| 15 | "Bare and overgrazed" on short paddocks | "Short"/"Very short". "Bare" only under 450 kg DM/ha. No "overgrazed" until rest is modelled. |
| 16 | A weight-loss warning on green-looking feed gave no reason, so it looked like a bug | Every warning states its cause (gainWhy) |
| 17 | Actions seemed to do nothing (buying, troughs) because results only went to the diary | Feedback appears on the map or next to the button |
| 18 | Double buys pushed the player into debt on a narrow screen | Confirm inline, then show the result inline |
| 19 | Clicking a crowded paddock selected a cow or the crop | The map opens the paddock only |
| 20 | Big per-mob move lists ("bring all of Mob 1") | One "Move cattle in here" chooser by class and number |
| 21 | Help bar covered the map on small screens | Help hidden behind a button |
| 22 | Setup steps weren't obvious | Picture cards; the current step highlighted gold, done steps ticked |
| 23 | Wording slips: "cow with calfs"; "she" used for steers | Check plurals and sex in generated text |
| 24 | "Rested 1 yr+" shown on a paddock with cattle in it | Say "grazing now" when stocked |

## Fences, paddocks and the map

| # | Symptom | Cause | Fix / rule |
|---|---|---|---|
| 25 | A lane with gates wasn't becoming a paddock | Open gates treated as gaps | Two layers: paddocks are bounded by any fence or gate; grazing areas are what cattle can reach |
| 26 | Random starting paddocks with no gate | Fence lines crossed without gates | Every paddock gets a gate (checked on 40 random farms, 151 paddocks) |
| 27 | A gate placed off a fence couldn't be removed | Gates allowed anywhere | Gates only on fences; "Pull down" removes them |
| 28 | Splitting a paddock failed | In the angled view the wire is drawn a few px above the grid line, so clicks hit the wrong line | Snap to the drawn wire, show end dots, say which end missed. **Rule: in an angled view, hit-testing must use screen positions, not ground positions.** |
| 29 | Cattle drawn on the wrong side of fences | Sprites free to wander across edges | Cattle can't cross fences and stand back from them |
| 30 | Couldn't find the bore | Small sprite | Tall windmill, pulsing ring, pointer text |
| 31 | Big mobs hid the pasture | Every beast drawn | Cap about 120 sprites per mob |

## Code gotchas (single-file vanilla JS)

1. **Modal wouldn't hide:** `.modal{display:…}` beat the `hidden` attribute. Keep `[hidden]{display:none!important}`.
2. **Setup options stopped responding:** `openModal` clears `mbox.onchange`/`onclick` on each redraw. Re-attach the handlers inside `draw()`.
3. **A `//` comment swallowed code:** a comment added to a one-line statement ate the rest of the line and broke the cattle drawing loop. Use `/* */` inside one-liners.
4. **Unbalanced brace after a patch.** Run `node --check` on the extracted script after every patch.
5. **Sideways scroll on phones:** nowrap spans, wide charts, the saleyard table. Check narrow width after every UI change.
6. **`renderSide` skips re-rendering while an input has focus.** Remember this when a panel "doesn't update".
7. **Old saves:** new state fields need defaults in `loadGame`.
8. **A popup from the old game stayed open** in a new game. Close popups in `newGame`.
9. **Debug hook:** `window.__gg` must never ship. Use a scratch copy in `tests/tmp/` (git-ignored).
10. **Local files in the in-app browser** can't be scripted. Serve over http (`.claude/launch.json` entry `game`, port 8765).
11. **Publishing from a new session:** read the artifact first, then publish with its `url`.
12. **Big file edits:** use patch scripts that assert each target string exists exactly once before replacing.

## The rebuild

| # | Symptom | Cause | Fix / rule |
|---|---|---|---|
| R1 | The landing shell scored 97 to 100 for Lighthouse Performance, not a steady 100, and shipped 141 KB of JavaScript against a 100 KB budget | The Next.js App Router runtime is about that size before any of our code | **Open, milestone 5.4.** Keep website pages free of client components where possible and measure the budget in CI. Do not claim 100 until it holds |
| R2 | Lighthouse Performance swung from 74 to 100 on the same page | Lighthouse was run on a busy PC with the server on the same machine | Judge performance on the median of several runs, and on CI, not on one local run |
| R3 | The newest TypeScript (7) could not be used | `typescript-eslint` supports TypeScript below 6.1 | Check that tools support each other before taking the newest version. TypeScript is pinned to 6.0 |
| R4 | A model doc and the MVP code disagreed in 15 places | The docs were written after the code | Port from the code, correct the doc in the same change (BUILD_PLAN 2.4) |
| R5 | Grass tests that matched the MVP exactly would still have passed with six rules wrong | The sample squares never reached those thresholds (for example a paddock between 760 and 800 kg DM/ha) | A match only proves the cases the inputs reach. After porting a formula, nudge each figure in turn and check a test fails. Add a sample for each one missed |
| C1 | MVP: a mob sent to the feedlot while out of water kept losing 4% of its weight a day, and died there if it went in on day 4 | The no-water count was only reset for mobs in a paddock | The count is set to 0 in the lot. **Rule: every place a mob can be must set every counter the mob carries.** |
| C2 | MVP: a cow whose calf died kept eating, milking and counting as if the calf were alive | Her calf and milking markers were only cleared at weaning | She is dried off when the day's deaths are settled. **Rule: when one of a linked pair goes, update the other in the same step.** |
| C3 | MVP: weaning left the dam milking if she was in another mob | The dam was looked up in the calf's own mob only | The dam is looked up across the whole farm |
| C4 | MVP: making an animal used up a random number for where to draw it | Drawing state lived inside the model | The engine makes no map draws. In tests the MVP's map draws are told apart by which MVP function asked, so both sides still see the same numbers |
| C5 | Cattle herds that matched the MVP exactly for 240 days would still have passed with 19 figures nudged (of 265 tried) | A chance (say deaths at 1.5% a point of CS) only shows if a random draw lands between the old figure and the new. Some limits were never met: a share of feed between 70 and 71%, a note on farm day 0, a class forecast to gain between 0 and 0.01 kg | Go looking: sweep a fixed draw across the range, put animals either side of each threshold, tune a mob to sit just inside a limit. **Rule: a long random run is not a threshold test.** |
| C6 | A nudge run nearly ran another builder's script of the same name | Two builders shared one scratch folder | Keep scratch files in a folder named for the milestone |
| RF1 | Farm tests that passed one file at a time timed out when the whole suite ran | The MVP runs slowly inside its test sandbox (about half a second to start a game), and slower again when test files run side by side. The default limit is 5 seconds a test | Tests that start MVP games set a long time limit for the file. Run the whole suite before calling it done, not just the file being worked on |
| RF2 | On a mixed farm with all its arable land cropped, the MVP's rotation sat on land that was not arable (found on Northern Tablelands at 30% arable) | The patch-growing code skipped marking its starting squares when there was nothing more to add | Fixed in the rebuild. **Rule: check generated farms against the rules they are meant to meet, on every setup choice, not only against the MVP's output** |
| RF3 | A test written to show that fault was wrong about what the MVP did (it expected no arable land at all; a second patch still appeared) | The fault was reasoned out from the code and not looked at | Look at what the MVP really produces before writing down how it is wrong |
| W1 | MVP: the first roll of tape cost $910 more than the tape (an energiser and a $10 fee) | The energiser was charged on anything that was not permanent fence, and the roll fee on every tape job | The energiser is bought with the first electric fence only. The $10 is for rolling tape up, or running out tape from the roll. **Rule: a cost belongs to the thing it pays for. Test each fee on the job that should not carry it, as well as the one that should** |
| W2 | MVP: net worth went up by the full price of fences the farm came with, and never fell when a fence, trough or hub was pulled out | One running total of "infrastructure", added to and never taken from | A ledger, item by item, of what was spent on what is still in place. **Rule: a total that can only go up is wrong as soon as anything can be removed** |
| W3 | MVP: who was on which side of a new fence came from where cattle were drawn | Drawing state was used as model state | A seeded rule: each beast to one side by the area's share of the hectares, calves with their dams. **Rule: the model never reads the picture** |
| W4 | Two farms in the same state gave different hashes | A random stream's saved state was written signed in one place and unsigned in another | The state is always written as four unsigned words. **Rule: anything that is saved or hashed has exactly one written form** |
| W5 | A test of the 21-day breakout wait found no second breakout | The test made the whole farm bare to keep the mob hungry, and the farm was "eaten out" and the game over on day 10 | Only the fenced box is made bare. **Rule: on a whole farm every rule is running. Set up only what the test is about, and check the game is not over** |
| W6 | The speed test read 2 ms a day on its own and 15 ms with the whole suite running | The MVP comparisons use every core at once | The speed test prints its figure and checks only a loose limit. The benchmark belongs to the calibration milestone, run on its own. **Rule: never fail a build on a stopwatch that other tests can lean on** |
| W7 | Tag numbers drifted apart between the MVP and the engine in a whole-farm run | The MVP hands out tag numbers, planting ids and portable trough ids from one counter. The engine has one each | Each comparison run makes only one kind of new id after its start, or lines the counters up first. In the engine a new planting can never use up a tag number |
| W8 | Reading the call stack on every random draw made long MVP comparisons slow (milestone 1.2a) | It was the only way found to tell the MVP's map draws from its model draws | The MVP's own functions are wrapped in memory so each marks its draws (cattle, breakouts, market, season, a batch of cattle, the map). No stack is read. **Rule: when the old code has to be told apart by who is calling, mark the callers** |
| W9 | A nudge run that was stopped part-way left a changed figure in the source | The runner restores each nudge when its tests finish, and it was killed before that | Check `git status` after any stopped nudge run, before doing anything else. Run nudges in batches that finish by themselves |
| W10 | Changing "hungry under 85%" to 86%, or the 21-day wait to 20 or 22, failed no test | The tests read those figures from the engine's own constants, so they moved with the nudge | Tests of a rule write the figure out (0.85, 21) and put a case either side of it: a mob that got 85.5% of its feed and one that got 84.5%. **Rule: a test must not read the figure it is checking from the code under test** |
| W11 | A test that bulls sell lowest condition first passed with the order changed to heaviest first | In the made-up herd the two bulls in the lowest condition were also the two heaviest | The lowest-condition bulls are now the lightest. **Rule: when a test checks an order, make sure the wrong order gives a different answer** |
| W12 | 27 of 330 nudges to the whole-farm code were missed at first, though whole farms matched the MVP for 380 days | The same cause as C5: a limit only shows if a run lands on it (a class price at exactly 20% drift, a cash base beside a $10,000 step, a harvest on the day the season changes). Others sat behind a second guard, or were entries in the ledger that no test removed | A targeted test for each (DEVELOPMENT_LOG, milestone 1.2c). **Rule: after a whole-farm match, still nudge every figure. The match proves the path that was walked, not the edges** |
| K1 | Central West steers ran 154 kg a head in an average year against 115 to 130 | Green feed all year, so they gain in every month. Less frosted or winter feed did not fix it: the steers made the weight up in spring | Peak green digestibility 0.70 to 0.68, the one lever that moved the year and nothing else. **Rule: try each lever on its own and look at the gain month by month before tuning.** |
| K2 | A benchmark band could not be held on every run | One block differs from the next by 20 to 30 kg a head in the very same season, which is wider than a 15 kg band | The band is held on the average over twelve fixed blocks in the average year, and every run is logged. Asked Claudia whether that is how the bands are meant. **Rule: measure the spread between runs before deciding what a band is held on.** |
| K3 | The first steers-on-oats test lost all 30 steers in four days | The test farm came with an old fence line that cut the oats paddock in two. The trough was in one half and the steers in the other. The engine was right | Test farms for a fenced set-up use a farm with no old fence line, and the set-up stops if a mob has no water. **Rule: a set-up checks its own water before it measures anything.** |
| K4 | The oats benchmark (ME 10.7, CP 18%) looked wrong against young oats at ME 11.4 and CP 21% | The benchmark does not say which stage of the crop it is for. The model gives those figures only in the fortnight after lock-up | The test holds that fortnight, marked as proposed, and the question is on Claudia's list. **Rule: a benchmark for a crop or pasture says its stage.** |
| K5 | The first 1.3 write-up said how a benchmark is judged as if it were settled, and said a benchmark "passes" where it passed only on my reading of it | The build plan judges every run. The model can't pass that, so the tests hold averages, and the write-up took that as the rule | The realism check caught it. The readings are now marked "proposed, waiting on Claudia" in the tests and the docs, with the figures that fail the plan's wording beside them. **Rule: when a test is written to a reading of a rule and not the rule, say so in the test and in the log, and put it to Claudia.** |
| R5 | Page 60 of a 30-year MLA price request timed out | The MLA service gives 100 rows a page, has no bulk download, and gets slower the deeper the page | Ask for fixed 100-day windows, one page each. **Rule: test the last page of a paged service before planning a pull around it** |
| R6 | The first plan for the MLA pull was about an hour for everything. The full list is 6 to 10 hours | A yard's indicator has a row for every day, each sale repeated for seven days, so a yard costs about as many requests as a national series. And about 7 requests in 100 failed on MLA's side and had to wait | Size every series with one request before starting. Pull in priority order, cache every answer, and make the script able to stop and carry on |
| R7 | The first page of MLA yardings looked like the start of the history but was not | Yardings pages come back in no date order (indicator pages are in date order) | Never take a first date from page one unless the page is checked to be in order. Yardings are walked window by window from 1996 |
| W1 | The soil water capacity was first set at 150 mm, the middle of FAO-56's ranges, before any outside growth series had been looked at. Western Victoria then grew exactly the curve from July to October every year, and its years followed AussieGRASS poorly (rank correlation 0.43) | A tuning value was picked from a range on paper, and the check that could have guided it was left until after | 50 to 250 mm were run against the AussieGRASS shire series and 100 mm chosen. **Rule: find the outside series first, then pick tuning values against it. Say in the docs when the same series was used to pick a value and to check it** |
| W2 | A made-up weather table that was dry two years in three still "scaled": the solver made the scaling figure so small that a trace of water counted as average | With a ceiling on the factor, a month can only average 1 if enough days reach the ceiling. The solver got there by shrinking the figure without limit | A scaling figure under 0.01 stops the build with a reason. **Rule: when a solver can always find an answer, test that the answer still means something** |
| W3 | Central Queensland's second and fourth wettest years (1998, 2022) came out with average growth, which looked like a fault | Both had a dry January to March and their rain from winter on, when the district curve is low and the factor is held under 1.9 | Not a fault in the code. It is a limit of the method, listed for Claudia. **Rule: judge a year by when its rain fell, not by its total. Look at the months before calling a year wrong** |
| W4 | A test said the 18 months before January 2007 at Dubbo grew under 60% of average. They grew 74% | The figure was guessed from one dry year, and the run-up also holds the spring before it | The test reads the figure and checks it is under the floor. Same rule as RF3: look at the number before writing it down |
| W5 | The check that a year gives the same growth when run again timed out at 5 seconds, once | It re-ran all 29 years for a district while other test files were running | It re-runs three years. Same rule as RF1 |
| W7 | Taking the floor off the scaling figures failed no test | The only test of a month too dry to scale used a made-up table that the solver gave up on first, by another route | A test now builds Emerald on a 50 mm soil, which only the floor stops. Same rule as R5 (the grass one): nudge each figure and guard in turn, and add a test for each one missed |
| W6 | Joining the cattle and farm branch with the real data branch left two lessons numbered R5 | Each branch took the next free number on its own | Both kept, as the brief said. New lessons here are numbered W. The lead may want to renumber the data ones |
| W8 | The dry-start protection lifted the run-up's daily growth to 85% but left the season factor alone. The realism check counted 17 of 29 Central Qld January starts where the run-up still went under 0.8 and hayed off at the faster rate | The MVP floors the run-up's season factor. The weather version only carried over the growth half of that rule. The realism check found it, not a test | The run-up's season factor is now never under 0.85, with a test over every district and start year. **Rule: when a rule is carried over from the MVP, check each thing it protected, not just the first.** |

## Process lessons

- **Re-test after every fix that touches the model, even "small" ones.** The spin-up floor (0.85) went in at the same time the hook was removed and wasn't re-simulated until 13 Nov 2026.
- **Don't leave out bad runs when quoting a range.** One Top End run at 19.1% sat outside the published 2–5%. Record it and its cause.
- **Ask Claudia when a rule is unclear,** rather than inventing a grazing rule. She knows the system; the model should follow her, not the other way round.
- **Check "is this realistic?" from a grazier's view, not just a code view.** Her questions ("is 59 head realistic?", "why is it going brown?") found real model bugs.
