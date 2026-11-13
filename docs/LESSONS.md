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
| 13 | The 2019–2025 price series was written from memory | No data source on hand | **Still open:** replace with real MLA restocker indicator data and record the source in DATA.md |

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

## Process lessons

- **Re-test after every fix that touches the model, even "small" ones.** The spin-up floor (0.85) went in at the same time the hook was removed and wasn't re-simulated until 13 Nov 2026.
- **Don't leave out bad runs when quoting a range.** One Top End run at 19.1% sat outside the published 2–5%. Record it and its cause.
- **Ask Claudia when a rule is unclear,** rather than inventing a grazing rule. She knows the system; the model should follow her, not the other way round.
- **Check "is this realistic?" from a grazier's view, not just a code view.** Her questions ("is 59 head realistic?", "why is it going brown?") found real model bugs.
