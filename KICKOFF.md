# Kickoff prompt for the build session

Paste everything below the line into a new session opened in the new app repo folder, with the model set to Fable.

---

You're building The Grazing Game app from a finished spec. This repo already has everything you need. Nothing is built yet.

**Read first, in this order, before writing any code:**
1. `CLAUDE.md` (rules, stack, how to work, what never to do).
2. `docs/PRD.md` (v1.0, the full spec). Read it end to end. Section 21 gives the default for every open question: build the default, don't stop to ask.
3. `docs/mockups/index.html`. Open it in the browser and go through every tab (Phone, Landscape, PC, Admin, Render styles) in both light and dark. **The build must match these screens:** layout, navigation, panels, colours, type, chips, ad placements, the separate website and game headers on PC, landscape full-screen panels, and the S3 + S5 render style. Treat the mockups as the design spec, and the PRD as the behaviour spec. Where they differ, the PRD wins; note it in your report.
4. `docs/reference/` (the style references) and `docs/README.md`, then `docs/REQUIREMENTS.md`, `docs/VISUALS.md`, `docs/MODEL.md`, `docs/DATA.md`, `docs/CALIBRATION.md` and `docs/LESSONS.md`. These hold everything learned building the MVP. Nothing may go backwards.
5. `reference/mvp/grazing-game.html`, the working MVP. Its simulation is the starting point for `packages/engine`.

**Then, before coding, write `docs/BUILD_PLAN.md`:**
- The build stages from PRD section 20, broken into milestones of a few days each, with what "done" means for each (use the PRD's acceptance tests).
- How you'll port the MVP engine to TypeScript and prove it matches: module by module, same seed, compared against the MVP, with every `docs/CALIBRATION.md` benchmark as an automated test.
- How the renderer will meet the speed targets in PRD 14.10 with 4,000+ head, and how level of detail (mob markers when zoomed out) works.
- The list of outside accounts and keys you'll need from me, and at which milestone (PRD 21a). Don't create any accounts yourself.
- Risks and anything in the spec that seems unclear or contradictory.

Show me the plan and wait for my go-ahead.

**Once I approve, work stage by stage:**
- Start with Stage 1: monorepo scaffold, engine port with calibration tests passing, PixiJS map in the S3 + S5 style (placeholder art drawn in code, swappable later), phone portrait and landscape and PC game layouts, Fast Farm with the daylight work budget and jobs in progress, PWA install, offline Fast Farm.
- One branch and pull request per milestone. Never push to `main` directly.
- Before each pull request: type check, lint, tests, Lighthouse CI (mobile) on the main pages, the `realism-guardian` agent, and a real check on a phone-sized screen in both orientations and both themes.
- At the end of each stage, stop and give me a stage report: what was built, how it was tested, screenshots (phone portrait, phone landscape, PC), which section 21 defaults you used, what's not done, and questions. Add it to `docs/DEVELOPMENT_LOG.md`.
- Keep the project memory current as you go (CLAUDE.md, "How to work").

Realism comes before everything else. If a rule in the docs gets in your way, fix the code or ask me. Never quietly drop the rule.
