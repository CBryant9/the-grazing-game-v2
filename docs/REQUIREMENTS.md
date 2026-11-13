# Requirements: what Claudia asked for

Every requirement and correction Claudia gave while building v1 to v15, grouped by topic and written as rules. **Each line must still be true after any change or rebuild.** Where she changed her mind, only the final decision is a rule, and the reversal is noted so nobody brings the old version back.

Her own words are in quotes. The how-it-works detail is in [MODEL.md](MODEL.md), the look in [VISUALS.md](VISUALS.md), and the figures in [DATA.md](DATA.md).

## The point of the game

- [ ] It shows how real grazing decisions affect pasture, cattle and money in Australian native pasture, "using realistic factors". Realism comes before everything else.
- [ ] The player gets choices, not a philosophy. "We're giving them the choice to graze how they want."

## Grass

- [ ] Each district follows its own real growth curve, growing "only in their seasons" (summer or winter rainfall).
- [ ] Grass goes through phases: short regrowth, then leafy (phase 2, best quality), then mature, then hayed off. "Grazing it in phase 2 can keep it green and highly nutritious for longer."
- [ ] Ungrazed grass bulks up but loses quality. "The total kilograms of dry matter go up, but the quality will go down."
- [ ] Grass left to go to seed goes rank and "will kind of stay like that" the next year "until it's been smashed down quite low and can get some sun on the roots".
- [ ] Knock-down depends on density. A big mob on a small area (for example tape strips) can take 5,000 kg DM/ha down to 1,500; a light mob barely touches it.
- [ ] Timing matters as well as amount. "It's not about, overall, how much something's been grazed… It's also about when." Short plants come back greener faster.
- [ ] Ground cover starts going below about 1,500 kg DM/ha. Height is a separate thing from mass.
- [ ] Paddocks start in different conditions from an uneven grazing history, not all the same.
- [ ] Heading and staleness run on realistic timelines for the season and rainfall.

## Cattle and nutrition

- [ ] Intake differs by class and by feed. "They eat lots more when they're eating green feed, and they also put on more weight."
- [ ] Too many cattle "smash the paddock down". Stocking rate is shown as AE and DSE per ha against carrying capacity, and is realistic for the district. Don't let a player think 59 head on 260 ha of Central Qld native is normal.
- [ ] Weight gain follows the grass phase and quality. You can look at an animal and see if it's fat or thin.
- [ ] Animals die when they don't get the nutrition they need, mostly the very poor ones.
- [ ] **Water:** every animal dies after 4 days without water, not just the poor ones. Warn before +1 week or +1 month if any mob has no water, and stop the clock.
- [ ] **Warnings explain why.** Never just "losing weight". Give the cause: not enough feed, low ME, protein under 7%, milking for a calf, or late pregnancy. "We need to know why."
- [ ] Supplements (lick, hay, pellets) and a feedlot are available, and they cost money.
- [ ] Profit is shown per animal, and you can see which cattle are making money. The stock book is in Herd.

## Breeding

- [ ] Bulls join with cows. Condition score drives the chance each cow gets back in calf, on a realistic cycle and timeline, with some random dry cows.
- [ ] Bull calves stay entire until marked. You are prompted to mark them. Unmarked young bulls get cows in calf ("you wouldn't have any dry cows").
- [ ] With no bull: "Your cows are ready to get back in calf. You need a bull."
- [ ] Joining reports every 3 weeks, then a preg test result compared with what you'd expect for their condition ("fewer getting in calf than you would expect").

## Water and fencing

- [ ] There is a bore at a random spot, and a trough on the bore needs no pipe. Pipe joins the bore, other pipe or troughs.
- [ ] Fences are permanent, electric (cheaper) or temporary tape (cheap). Fencing and water give higher density, more even grazing and better utilisation.
- [ ] Temporary tape is reusable: $45 for a new length, $10 to roll it up and $10 to put it back out. Show metres on the roll, with new tape to buy shown in red.
- [ ] Portable troughs need no pipe. They empty with a visible level, cost $45 to refill, and can be moved.
- [ ] Water hubs: a trough with 4 gates on a square, or a hub on a fence line or corner that waters the 2–4 paddocks touching it.
- [ ] Any area fully enclosed by fences or gates is a paddock ("it needs to know when it's fully enclosed"). Open gates join paddocks for grazing only.
- [ ] Gates go only on fences, and they can be removed. Every starting paddock has at least one gate.
- [ ] Fences snap to the drawn wire and show whether each end is on a fence. Splitting an existing paddock works.
- [ ] Cattle stay inside their paddock and never look like they're on the wrong side of a fence.
- [ ] **Breakouts only through temporary tape**, only when the mob is actually hungry or thirsty ("not for no reason"), one tape at a time. *(Reversed: v3 let cattle break electric fences. Claudia: "cattle shouldn't get out of the permanent fencing… They should only get through the temporary tape.")*
- [ ] **One mob per paddock.** Cattle that share a grazing area (including through open gates) become one mob. You move some of them by class and number.
- [ ] A small fee to move a trough.

## Market and money

- [ ] The market moves over time following real yearly prices (2019–2025), then a realistic random path.
- [ ] Each class has its own price, and an animal's price changes as it moves class (weaner to yearling and so on). Chart classes match the buy list exactly.
- [ ] Buy: a modal with a price per class. Your own cattle and their profit sit beside it for selling.
- [ ] **Confirm before spending, then show the result right where you clicked**: "You have bought these cows. You'll now see them on the map." No double buys into debt on a narrow screen.
- [ ] Saleyard buttons: "Close" and "Keep shopping" / "Keep selling", not "Watch".
- [ ] Net worth is explained (cash, plus stock at sale value after costs, plus 80% of what's been spent on infrastructure).
- [ ] Money, overdraft and the game-over level scale with district and farm size, set by difficulty (easy/medium/hard). The setup screen shows no dollar figures; they appear once you take the farm. *(History: $20k in the brief, then $50k, then scaled. Game over was always the bank limit or running completely out of feed.)*
- [ ] Scoring covers profit, utilisation (kg of grass eaten), weight gained, ground cover and deaths.

## Crops and pastures

- [ ] Each district offers only what is realistic to plant there ("you're not going to plant rye and clover in the NT"). Options include a multi-species mix, cheaper monocultures, annual forage and crops, with realistic $/ha establishment costs.
- [ ] Improved pasture thins out and needs renovating (about every 5 years for temperate pastures).
- [ ] An annual forage gives one good year. About 10% may come back from seed the next year, for one year only.
- [ ] Cattle prefer crop or improved pasture over native in a mixed paddock, and the warning says so in plain words ("This paddock is a mix… cattle will go for the crop first").
- [ ] Grazing affects grain: grazing after lock-up eats the heads, grain-only crops lose yield if grazed, and grazing before establishment damages the stand. Warn first, with an option to go ahead.
- [ ] Harvest costs money. An on-map **Harvest** button appears when the crop is ready.
- [ ] **Fallow only appears when a crop finishes** (or on rotation blocks at the start). Never at random. It looks like "brown, kind of bare paddock, maybe with a few dots".
- [ ] **After harvest there is stubble:** a set amount of low-value feed that breaks down to fallow. *(Reversed: first "later", then wanted now.)* Message along the lines of "you're putting them on stubble that's not very nutritious, but go for it".
- [ ] **A finished crop never regrows.** No warnings about a crop once it's harvested.
- [ ] Sowing prompts when a window opens ("If you want to plant oats, now's the time").
- [ ] A feed graph forecasts the rest of the year, with crops showing as spikes.
- [ ] Mixed-farm setup: choose grazing or mixed, then % arable land (realistic per district, tiny in the NT), then % actively cropped. Warn that more cropping means more of the farm starts in fallow. Converting pasture to cropping costs extra and asks first. Plant only on arable land, and highlight it.
- [ ] Arable land is a natural patch, "not just small bits everywhere". The rotation sits in square blocks, at a stage that suits the start month.

## Map and pictures (detail in VISUALS.md)

- [ ] An angled 3D view so height can be seen ("not pure top view"). The bore is easy to find. Fences are easy to see. Zoom in and out.
- [ ] Grass visibly changes height and colour: short or tall, green or mature, rank grass tall with "the green only down the bottom".
- [ ] Ungrazed paddocks must not look bare. Dry grass shows as straw.
- [ ] Rank grass looks clearly taller ("towards hitting 40 cm… that is better than just hitting 20").
- [ ] Hover a paddock name for a side-view picture. Click a paddock for "then vs now". Crop + pasture paddocks show a split picture.
- [ ] A pasture-quality layer shows the best feed by quality, not quantity.
- [ ] Big mobs don't hide the pasture.

## Controls and screens

- [ ] Help is hidden by default behind a help button, in an info section that can be reopened. It never covers the map on a small screen.
- [ ] The Paddocks tab shows the quick list first (with water ✓/✗), and details and sorting on demand.
- [ ] Tools snap back to Look after each build.
- [ ] Clicking the map opens the paddock, never a cow ("I don't want to be able to click on the cows at this point").
- [ ] One "Move cattle in here" chooser by class and number, not long per-mob button lists. It shows a no-water warning before you move them.
- [ ] A status panel after each time skip shows nutrition, gain and pasture changes, so it's "quick, fast, and easy to see what happened".
- [ ] On-map buttons for ready jobs (Harvest, Mark calves), each with a confirm.
- [ ] Feedback appears where you clicked on narrow screens. No horizontal scroll.
- [ ] Day by day, +1 week, +1 month, and fast-forward with plans running.

## Grazing plans

- [ ] Plans have their own tab. Click paddocks in order, then pick an obvious rule: move every N days (down to 4 moves a day), or move when grazed down to X kg DM/ha (for example 1,500), with an optional maximum.
- [ ] It reports when they didn't move and why ("didn't get to 1,500").
- [ ] It checks water when you save ("Do you want to change it?") and warns about weight or condition loss.
- [ ] Legs: "keep going in this block until… then go to these ones". Rounds per leg, then repeat or stay.
- [ ] A plan report: what they ate, how many rounds and moves, and kg gained.

## Setup

- [ ] Each district offers small, medium and large farms at realistic sizes. The NT is huge.
- [ ] Two obvious start modes: take over a running business (random paddocks and waters, at least one water, a random herd), or start from scratch (minimal fencing, one water, no cattle).
- [ ] Game-like steps with picture cards, where the next step is obvious.

## Wording

- [ ] Plain Australian English, short sentences, no jargon without explanation, no em-dash asides. Use her terms: kg DM/ha, AE, DSE, CS, PTIC, ME (MJ/kg), CP %, weaners, joining, marking, lick, stubble, fallow.
- [ ] "Paddock 1", not "P1", in anything a player reads first.
- [ ] **Neutral paddock labels: Green, Mixed, Dry & rank, Short.** No "green zone / buffer / haystack" or any three-zone wording or commentary. *(Rejected: "that's kind of enforcing the three-zone adaptive grazing". "Buffer" was also wrong; it sat on short dry pasture.)*
- [ ] **Don't say "overgrazed"** until rest history is modelled ("you can graze it short as long as it has a long rest"). Say short or very short. Say "bare" only when ground cover is actually being lost.
- [ ] Commentary describes, it doesn't judge, and it only appears on paddocks with cattle in them. For example: "The grass is growing away from them", "They're having a high impact", grazing evenly or patchily, picking the best bits, down to eating what they'd normally leave, getting short.

## Not built yet (raised by Claudia or offered)

- An "overgrazed" judgement that combines grazing pressure with rest periods. Claudia: "which we'll build in later."
- Stubble detail: value by crop, and cattle not choosing it over pasture.
- Phone and touch testing.
- A gate added automatically when a new fence closes a paddock (offered; no answer).
- Heading timing by species (medics, ryegrass about 3 months to seed). This is currently per district for natives.
- Real MLA market data to replace the approximate price series.

## Rebuild requests (13 Nov 2026, detail in PRD.md)

These came from planning the phone and PC rebuild. Full detail and open questions are in [PRD.md](PRD.md).

- [ ] Two ways to play: a real-time daily mode ("what you could achieve on a farm in the day") and the current self-paced game ("the fast version with a better name"), with up to 3 self-paced farms going.
- [ ] Jobs take realistic time. The day starts at first light and "the time only moving as you did things". If you only look, it stays first light. You can only do what fits before dark, so "they can't just build all their fencing in one day". This applies to both modes.
- [ ] Daily mode: at midnight in the player's time zone the day is simulated with the cattle where they were left. Daily dry matter, intake and gain must be "as dialed in as we can get it to reality", especially at high density and with several moves a day.
- [ ] Self-paced mode keeps +1 day, +1 week, +1 month skips, with the time controls along the top and the paddock filling the screen.
- [ ] Game over means starting again.
- [ ] Visuals more polished: "that retro feel but not be so pixelly", like the Ship or Die art in docs/reference/.
- [ ] Grass, saleyard, messages and paddock views must work well on every screen size.
- [ ] Anyone can join; date of birth at sign-up; the social side is hidden for under 16s.
- [ ] Ad slots (banners, videos between days and years, sponsor cards) are built in-house so Claudia can run her own business's ads or sell them. No Google game video ads for now.
- [ ] Build everything now (ads, Stripe, subscriptions, community) and turn each on from an admin back end when ready. The admin shows analytics, connects Stripe, sets subscriptions and manages ads.
- [ ] Community: overall leaderboard, groups to compete with friends, profiles (photo, where from, years farming, education, what and how much they farm, real farm, links to socials and website), posts with photos, comments and likes, a feed of friends and others, friends' daily activity (daily mode only), a view of anyone's farm as it is now, and a live activity ticker like Ship or Die ("Tom1998 moved 4000 head into a 4ha paddock").
- Later, not now: hiring workers or contractors to get more done in a day.
- [ ] Fast and solid, "not glitchy", ideally a 100 Lighthouse score.
- [ ] No saleyard or feedlot drawn on the map ("we don't need that").
- [ ] Phones can be flipped to landscape, "likely how it will be played". Farms stay wide rectangles; in portrait you move left to right. In landscape the panels go full screen "because they need to be tall enough to read".
- [ ] Cattle and grass in a less pixelly style: with lots of grass and cows "it's really hard to tell and it's all blurry together".
- [ ] Activity pop-ups on the website pages, not in the game view.
- [ ] Ads in different spots on different pages "so it doesn't feel too spammy"; on the farm view, ads on the left.
- [ ] On PC the game header sits at the top of the game and the website header at the top of the site; they must not blend together. Community and other pages get big headings and sensible spacing.
- [ ] Light and dark versions.
- [ ] Map style: the "clear map with detail on zoom" (S5 in the mockups). Clean paddocks and one marker per mob when zoomed out, individual cattle and grass when zoomed in.
