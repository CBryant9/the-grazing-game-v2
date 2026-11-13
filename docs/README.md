# Project memory

These files hold everything learned building The Grazing Game (v1 to v15), so a rebuild or any later change moves forward and never repeats a mistake.

| File | What's in it | Read it when |
|---|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Every requirement and correction Claudia gave, as a checklist of rules (including what she reversed) | Before designing or changing any feature |
| [VISUALS.md](VISUALS.md) | What the map, side-view pictures, labels, layers, fences, sprites and panels must show, with colours and thresholds | Before touching anything drawn |
| [MODEL.md](MODEL.md) | The simulation rules: growth, rankness, quality, grazing, intake, energy, breeding, deaths, water, fences, plans, scoring | Before changing the simulation |
| [DATA.md](DATA.md) | Every real-world figure: district curves, farm sizes, seasons, prices, costs, supplements, species, rotations, arable shares | Before changing any number |
| [CALIBRATION.md](CALIBRATION.md) | The benchmarks that must hold, how to run `tests/calibrate.js`, and the results log | After any model or data change, and before publishing |
| [LESSONS.md](LESSONS.md) | Mistakes made, their causes and fixes, and code gotchas | Before starting work, and when something breaks |
| [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) | Round-by-round history of requests and changes | For background |
| [PRD.md](PRD.md) | Product requirements for the rebuild: game modes, phone and PC layouts, community, ads, admin, tech stack, data model. Mockups in [mockups/](mockups/), visual references in [reference/](reference/) | When planning or building the rebuild |

The MVP these docs describe is in `../reference/mvp/` (`grazing-game.html`, and `calibrate.js`, which CALIBRATION.md calls `tests/calibrate.js`). In this repo the benchmarks become engine tests in `packages/engine`.

`../.claude/agents/realism-guardian.md` is a project agent that checks a change against all of these before it is published.

## Keeping it up to date (every session)

1. **New request or correction from Claudia:** add it to REQUIREMENTS.md as a rule, in her words where possible. If it reverses an earlier one, change the rule and note the reversal.
2. **New or changed figure:** update DATA.md, and say where the number came from.
3. **Model change:** update MODEL.md, run `tests/calibrate.js`, and add the results to CALIBRATION.md.
4. **Anything drawn changes:** update VISUALS.md.
5. **A bug or wrong turn:** add it to LESSONS.md with the symptom, cause, fix and a rule.
6. **Each published version:** add a section to DEVELOPMENT_LOG.md.
7. **Before publishing:** run the realism-guardian agent on the change.

Never quietly drop a rule because the new code doesn't meet it. Fix the code, or ask Claudia.
