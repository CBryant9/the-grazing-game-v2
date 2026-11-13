# The Grazing Game (app): project context

A realistic grazing game and community for Australian graziers, playable on phone and PC as one web app (PWA). This repo is the full rebuild of the MVP. The MVP (`reference/mvp/grazing-game.html`) is the reference for how the simulation behaves. Built for Claudia Bryant.

**The point of the game is to show what real grazing decisions do to pasture and cattle, so realism matters more than anything else.**

## Read before you build (mandatory)

| Before you... | Read |
|---|---|
| start any work | `docs/PRD.md` (the spec, v1.0), then `docs/LESSONS.md` |
| build any screen | `docs/mockups/index.html` (open it in a browser; Phone, Landscape, PC, Admin and Render styles tabs, light and dark) and `docs/reference/` |
| design or change any feature | `docs/REQUIREMENTS.md` (every rule Claudia gave, including what she reversed) |
| touch anything drawn | `docs/VISUALS.md` (the picture must match the model) |
| port or change the simulation | `docs/MODEL.md` (exact formulas) and the MVP source in `reference/mvp/` |
| change any number | `docs/DATA.md` |
| change the model or data | `docs/CALIBRATION.md`; the benchmarks become automated engine tests |

The MVP's `tests/calibrate.js` is kept at `reference/mvp/calibrate.js` as the source for those engine tests.

## How Claudia wants it built (values, treat as rules)

1. **Realistic first.** Real Australian figures: kg DM/ha, growth curves, intake as % of live weight, CS 1–5, AE/DSE, carrying capacity, conception rates, prices, establishment costs. If something looks off to a grazier, it is a bug.
2. **Describe, don't judge or prescribe.** Neutral paddock labels only: Green, Mixed, Dry & rank, Short. No three-zone wording, no "overgrazed" until rest history is modelled. The activity ticker and day cards state facts, never praise or criticism.
3. **Things only happen for a reason.** Cattle only break through tape when actually hungry or thirsty, one fence at a time. Fallow only after a crop. Finished crops don't regrow.
4. **The visuals must match the model.** Height, greenness, green at the base of rank grass, seed heads, crops, fallow and stubble readable at every zoom. Cattle never blur into the grass.
5. **Warnings explain why** (not enough feed, low ME, CP under 7%, milking, late pregnancy).
6. **Feedback where you clicked.** Confirm before spending money; show the result right there.
7. **Simple controls, details on demand.** Quick view first. Tools snap back to Look. Tapping the map opens a paddock, never a cow.
8. **One mob per paddock.**
9. **Scale everything to the farm.**
10. **Fun and decision-driven.** Clear status after each day or skip.
11. **Writing:** plain Australian English, short sentences, no jargon without explanation, no em-dash asides. Claudia's terms: kg DM/ha, AE, DSE, CS, PTIC, ME (MJ/kg), CP %, weaners, joining, marking, lick, stubble, fallow.
12. **Fast and solid.** Meet the speed targets in PRD 14.10 (Lighthouse 100 on website pages, 60 fps play). Never janky.
13. **Build everything, switch on later.** Ads, subscriptions, community and Daily Farm all sit behind admin feature switches (PRD 11.7).

## Stack (decided, PRD section 14)

TypeScript, pnpm monorepo. Next.js (App Router) on Vercel. Supabase (Postgres, Auth, Storage, RLS, Edge Functions, pg_cron). PixiJS v8 map renderer. React + Zustand game UI. Serwist PWA. IndexedDB local saves. Stripe Billing. PostHog. Resend. Sentry.

```
apps/web            Next.js app: website, game page (/play), admin (/admin), PWA
packages/engine     Simulation, pure TypeScript, seeded, no DOM. Runs in a Web Worker, on the server, and in tests
packages/render     PixiJS map renderer
packages/shared     Types, constants (mode names, slot IDs, feature switch keys, job times)
art/                Source art and exported atlases
supabase/           Migrations, RLS policies, edge functions, cron
docs/               Spec, project memory, mockups, references
reference/mvp/      The MVP game and calibration script (read only)
```

## How to work

- **Work in the build stages in PRD section 20, in order.** One branch and pull request per milestone. Stop at the end of each stage and report to Claudia.
- **Stage report** (end of each stage, in the PR description and in `docs/DEVELOPMENT_LOG.md`): what was built, how it was tested, screenshots on phone (portrait and landscape) and PC, which PRD defaults (section 21) were used, anything not done, and questions for Claudia.
- **Open questions:** never stop on one. Build the default in PRD section 21, keep it easy to change, and list it in the stage report.
- **Engine first, and prove it:** the TypeScript engine must reproduce the MVP's behaviour, and every benchmark in `docs/CALIBRATION.md` must pass as an automated test, before UI work depends on it.
- **Keep the memory current in the same change:** new request from Claudia → REQUIREMENTS; new figure → DATA (with source); model change → MODEL plus a calibration run logged in CALIBRATION; anything drawn → VISUALS; a bug or wrong turn → LESSONS.
- **Before each pull request:** type check, lint, unit and engine tests, Lighthouse CI on the main pages (mobile), and the `realism-guardian` agent on the change. Fix regressions; never weaken a rule to make code pass. If a rule looks wrong, ask Claudia.
- **Check real flows on a phone-sized screen in both orientations and both themes**, not just tests.

## Never

- Create accounts with outside services, accept terms, or enter passwords or card details. Ask Claudia, and tell her exactly which keys to put in which environment variables.
- Commit secrets. Every variable goes in `.env.example` with a comment.
- Use Google game video ads (H5 Games Ads). Ad slots are in-house (PRD 10.1).
- Show the live activity toast on the farm screen, or two ad units on one phone screen.
- Draw a saleyard or feedlot on the map.
- Push to `main` directly or merge without Claudia's go-ahead.

## Git

- Remote `origin` → https://github.com/CBryant9/the-grazing-game-v2.git (private). The MVP repo https://github.com/CBryant9/the-grazing-game-mvp stays as the reference. Default branch `main`. Feature branches per milestone.
- Commit author: Claudia Bryant. End commit messages with the Co-Authored-By line given in the session's system prompt.
