# The Grazing Game: Product Requirements (v1.1)

Status: **v1.1, ready to build.** Section 1A lists what changed from v1.0 and overrides any older wording left elsewhere in this document. Open questions have defaults (section 21); build those until Claudia changes them.
Tags: **[Decided]** Claudia has agreed. **[Proposed]** recommended, not yet confirmed (build it this way unless told otherwise). **[Open]** needs Claudia's answer before that part is built.

Last updated: 13 November 2026

> **v1.1 (13 Nov 2026).** Claudia widened the build after v1.0. Her words are in [REQUIREMENTS.md](REQUIREMENTS.md) ("Rebuild requests, second round"). The build order is in [BUILD_PLAN.md](BUILD_PLAN.md). Section 1A below is the summary, sections 5.10 to 5.16 hold the new systems, and section 21 lists the defaults still to be checked.

Companion files:
- Screen mockups: [mockups/index.html](mockups/index.html) (open in a browser; phone, PC and admin tabs).
- Visual references: [reference/](reference/) (see section 7).
- Project memory from the MVP (must be carried into the rebuild): [README.md](README.md), [REQUIREMENTS.md](REQUIREMENTS.md), [VISUALS.md](VISUALS.md), [MODEL.md](MODEL.md), [DATA.md](DATA.md), [CALIBRATION.md](CALIBRATION.md), [LESSONS.md](LESSONS.md).

---

## 0. Read this first (for whoever builds it)

1. This is a rebuild of the MVP in `grazing-game.html` into a web app that works on phones and PCs, with accounts, two game modes, a community, ads, subscriptions and an admin back end.
2. **Realism comes first.** Every rule in `REQUIREMENTS.md`, every visual rule in `VISUALS.md` and every benchmark in `CALIBRATION.md` must still hold. If a new feature conflicts with one, stop and ask. Never drop a rule to make the code pass.
3. **Build everything, switch on later.** Ads, subscriptions, the community and Daily Farm are all built now, but each sits behind a switch in the admin back end so Claudia turns it on when ready (section 11.7). **[Decided]**
4. Writing in the game and the site: plain Australian English, short sentences, no em-dash asides, Claudia's terms (kg DM/ha, AE, DSE, CS, PTIC, ME, CP %, weaners, joining, marking, lick, stubble, fallow). Describe, don't judge.

## 1. What we are building

The Grazing Game becomes a free web game and community for Australian graziers. It plays on phone and PC from one codebase, installs to the home screen as a PWA, and needs no app store.

Three parts share one account:

1. **The game**, in two modes:
   - **Daily Farm:** real time. One game day per real day. You get the daylight hours to work, and the farm keeps running overnight whether you log in or not. Something to do every day, like Wordle.
   - **Fast Farm:** the current game, at your own pace, with day, week, month and year skips. Up to 3 farms at once.
2. **The competition:** leaderboards (overall, by mode, district, farm size, time lasted) and private groups to compete with friends.
3. **The community:** profiles, posts, photos, comments and likes, a feed of what friends did on their farm today, a live activity ticker, and a look at anyone's farm as it stands now.

It makes money from:
- **Ad slots** (banners, videos between days or years, sponsor cards, sponsored posts). Claudia can fill them with her own businesses, sell them directly to ag businesses, or later plug in Google. **[Decided]** No Google game video ads for now.
- **A subscription** that removes ads and adds extras.

An **admin back end** shows the analytics, manages ads and sponsors, connects Stripe and sets plans, moderates the community, and turns each feature on or off. **[Decided]**

## 1A. What changed in v1.1 (read this first)

All **[Decided]** by Claudia on 13 Nov 2026 unless marked. **Where older wording elsewhere in this document disagrees with this section, this section wins.**

| Topic | v1.0 | v1.1 |
|---|---|---|
| The MVP | The engine reproduces the MVP | The grass and cattle formulas match the MVP. Everything around them is rebuilt to suit, MVP bugs are fixed, and prices and costs can change |
| Districts | Five | **Four.** The Top End is removed for now and comes back later as a properly built northern game. Its figures stay in DATA.md |
| Where the simulation runs | Fast Farm in the browser (offline), Daily Farm on the server | **On the server for both modes**, so the rules can't be read or copied. Fast Farm needs a connection to do jobs. Looking at the farm works offline (5.16) |
| Fair leaderboards | Server replays ranked Fast Farm runs | Every farm is already run by the server, so no replay check is needed |
| Years in Fast Farm | A start year, then a random market | **Real years** from 1997, played in order or at random, each with its real prices and real weather (5.14) |
| Market prices | An approximate series | Real MLA data, baked in for past years and fetched daily for Daily Farm (5.14) |
| Weather | Random seasons | Real weather from SILO for the district, past and daily (5.14) |
| Daily Farm date | Game day per real day | The farm runs on today's real date |
| Sale days | Weekly, 2-day delivery | The real yard's own sale timing. Stock arrive the next day in the farm's yards (5.13) |
| Job times | Permanent fence 250 m a day, cattle walk at 3 km/h | 500 m a day, 1.5 km/h, and the rest of the table in 5.4 |
| Workers and contractors | Later | **In the build:** farm hands, a labour pool, contractor fencing (5.11) |
| Sheep | Not at launch | **In the build:** sheep and wool, where they are realistic (5.12) |
| The farm's buildings | None drawn | A homestead and stock yards on every farm. Sheds, silos, extra yards and a feedlot can be built (5.13) |
| Gates | One kind | Three kinds, and stock move along a route through gates (5.13) |
| Supplements | Charged per head per day | Stock you hold. Lick runs down and is topped up. Feeding out is a job (5.13) |
| Grazing plans | Fast Farm only | Both modes. In Daily Farm a hand does the moves, or the player is offered them on a plan card (5.15) |
| Farms per account | 1 Daily, 3 Fast | **2 Daily and 2 Fast** free. 5 of each after a purchase |
| Paying | Monthly or yearly subscription | **One-off purchases**, and paying to keep going after game over. Nothing that gives an edge in play (10.3) |
| Minimum age | 13 | **14** to make an account. No community under 16 |
| Cattle look | Breeds by class | Brahman style in Central Qld, British breeds in NSW and Victoria |

## 2. Decisions so far

| Date | Decision |
|---|---|
| 13 Nov 2026 | One web app: the website and the game together. The game is a page of the site; the PWA opens straight into it. |
| 13 Nov 2026 | Stack: Next.js on Vercel, Supabase, TypeScript, PixiJS map, React UI, Stripe, PostHog (section 14). |
| 13 Nov 2026 | Two modes: Daily Farm (real time) and Fast Farm (current game, renamed). Names still working titles. |
| 13 Nov 2026 | Both modes use a daylight work budget: jobs take realistic time and you can only do what fits before dark. |
| 13 Nov 2026 | Fast Farm: max 3 farms going at once. |
| 13 Nov 2026 | Game over means starting a new farm. The old one is kept in your farm history. |
| 13 Nov 2026 | Anyone can join. Date of birth asked at sign-up; under 16s don't see the community. |
| 13 Nov 2026 | Video and banner slots are built in-house. Claudia may run her own business's ads in them. Google game video ads are not used for now. |
| 13 Nov 2026 | Everything is built now and switched on from the admin back end when ready (ads, Stripe, subscriptions, community). |
| 13 Nov 2026 | Visuals: more polished retro pixel art like Ship or Die (clear, detailed, not chunky). |
| 13 Nov 2026 | Community: overall leaderboard, groups, profiles, feed (friends and everyone), friends' daily activity, posts with photos, comments and likes, view a friend's farm today, live activity ticker on PC and in the community. |
| 13 Nov 2026 | Claudia accepted the v0.1 defaults she didn't comment on (scoring approach, launch phases, portrait-first phones, price to test). |
| 13 Nov 2026 | Fast and solid, not janky: Lighthouse 100 target with speed budgets checked on every change (section 14.10). |
| 13 Nov 2026 | No saleyard or feedlot drawn on the map. The saleyard is reached through Market. |
| 13 Nov 2026 | Phones work in portrait and landscape. Farms are wide rectangles: in portrait you pan left and right; landscape is likely how most people play. In landscape every panel opens full screen. |
| 13 Nov 2026 | Cattle and grass must stay readable with big mobs and lots of grass. The chunky pixel style is replaced by a cleaner style; five render styles are being compared (section 7). |
| 13 Nov 2026 | The live activity toast shows on website pages only (Community, Profile, Leaderboard, Landing), never on the farm. |
| 13 Nov 2026 | Ads sit in a different spot on each page so it never feels spammy (section 10.1). Farm view: left rail only. |
| 13 Nov 2026 | On PC the website header and the game header are separate bars. Website pages get big page headings and generous spacing. |
| 13 Nov 2026 | Light and dark themes. |
| 13 Nov 2026 | Render style: S5 "clear map with detail on zoom" (confirmed by Claudia). Zoomed out, clean paddock fields and one marker per mob; zoomed in, individual cattle and grass clumps in the S3 clean illustrated style. |

## 3. Goals, non-goals and measures

### Goals
- G1. A phone player can do everything a PC player can, with touch-first controls.
- G2. Daily Farm makes people come back every day and share what they did.
- G3. The MVP's realism is kept, and daily grass and cattle numbers are accurate enough that each day feels like a real decision.
- G4. Leaderboards can't be faked.
- G5. Honest audience numbers for advertisers.
- G6. $0 hosting during the build; cheap until there's revenue.
- G7. Every money and community feature can be switched on or off without a code change.
- G8. Fast and solid: Lighthouse 100 on website pages, smooth 60 fps play on a mid-range phone, nothing janky (section 14.10).

### Non-goals for the first launch
- App store apps (can wrap later, section 14.9).
- Two players on the same farm.
- The Top End and other northern districts (removed for now, to be built properly later).
- Species other than cattle and sheep.
- Playing Fast Farm with no connection (the simulation runs on the server, 5.16).
- Freight in proportion to distance, and today's live prices from the yard nearest the player (both wanted later).
- Direct messages between players.
- An advertiser self-serve checkout (sponsors are added by Claudia in admin first).

### Measures [Proposed]
- Daily active users, weekly, monthly. Daily Farm streaks (days in a row logged in).
- Day-1, day-7 and day-30 return rate.
- % of new players who finish their first game day (Daily) or first year (Fast).
- % of accounts with a filled-in farming profile.
- Free to paid conversion.
- Ad impressions, clicks and click rate per slot and sponsor.

## 4. Who it's for

| Group | What they want | What we give them |
|---|---|---|
| Graziers and farmers | Try ideas without risking real stock, bragging rights, connect | Realism, district boards, a profile that shows their real farm |
| Ag students, advisors, extension officers | Learn and teach grazing decisions | Plain explanations, groups for a class, challenges |
| Curious non-farmers | A different, fun sim | A friendly start, short tutorials |
| Ag businesses | Reach farmers | Slots on PC and phone, audience numbers, view and click reports |
| Claudia (admin) | Run it, grow it | Admin back end, switches, analytics |

## 5. Game modes

### 5.1 Common to both modes: the daylight work budget [Decided]

- Every game day starts at **first light** on the farm and ends at **last light**.
- First and last light come from the farm's district (latitude and longitude) and the date, calculated properly (civil dawn and dusk). Winter days are shorter than summer days, and the Top End differs from Western Vic.
- **Looking is free.** Opening paddocks, checking cattle, reading the market and prices, looking at layers and pictures takes no game time. If you only look, it stays first light.
- **Doing takes time.** Each job (build fence, move cattle, lay pipe, put in a trough, buy at the saleyard, wean, mark, feed lick and so on) has a realistic duration (section 5.4). Starting a job moves the farm clock forward by that much. The daylight bar shows how much is left.
- **Before you confirm a job**, its card shows the time it will take, the cost, and a preview of how much of today's daylight it uses ("Leaves 3 h 20 m").
- **Jobs too big for today** are built in part. The rest becomes a **job in progress** (pegs and a half-built line on the map). It continues the next time you have daylight to spend on it, and you can see it in the jobs list.
- **When daylight runs out**, no more jobs can be started that day. Looking is still allowed.
- **Travel:** each job includes driving from where you are to the job and back to the homestead at the end of the day, at farm-track speed (proposed 25 km/h). Doing nearby jobs one after another saves time. **[Open]** Include travel, or keep it simple and leave it out?
- One worker (you) for now. Workers and contractors come later (5.10).

### 5.2 Daily Farm (real time) [Decided, details Proposed]

**The idea:** one game day for each real day, in your own time zone. A reason to open the game every day.

- **Day start:** whenever you open the farm on a given real day (9 am or 3 pm), the farm is at first light, unless you've already worked that day, in which case it's at the time your last job finished.
- **Time only moves when you do something** (5.1).
- **Midnight rollover:** at midnight in the farm's time zone, the day is simulated on the server. Grass grows or dies, cattle eat where they are, gain or lose weight, drink, calve, die if they must, break through tape if hungry or thirsty. Then a new day begins at first light.
- **Sub-day accuracy:** the day's grazing is split at the times you moved cattle. A mob moved at 11:20 am grazes the old paddock until then and the new paddock after. This matters at high stock density (strip grazing, several moves a day). **[Decided]** Daily dry matter, intake and gain must be as close to reality as we can get; this is where the model gets tested hardest. Moving cattle twice a day or more is allowed if the daylight allows.
- **Missed days:** if you don't log in, the farm keeps running with whatever you left. Cattle stay where they are. Days you miss are simulated in turn. When you come back, a catch-up summary shows what happened each day you were away. **[Open]** See 5.2.1.
- **How many:** two Daily Farms per account free, five after a purchase (5.5). **[Decided]**
- **Time zone lock:** the farm's time zone is set when it's created (from the device). It can be changed at most once every 30 days, and a change never gives extra days. This stops people winding their clock forward to get more days.
- **Grazing plans** are available in Daily Farm (v1.1, section 5.15). A farm hand does the planned moves, or the player is offered them on a plan card.
- **Buying and selling:** **[Proposed]** saleyard sales happen on a set weekday at named yards for each district (for example Roma on Tuesday). Bought cattle arrive after a realistic delay (the mockups use 2 days). An online sale option is available any day with a delay. Selling needs a muster, then the truck, which leaves the day before the sale. **[Open]**
- **Notifications** (section 13): a morning reminder at a time you choose, plus alerts for things that need you (trough low, calving started, a mob running out of feed, cattle got out, rain).
- **Daily history:** a diary of every day: the jobs you did, weather, grass and cattle changes, money in and out. Scroll back through days and see the map on any past day (from a stored daily snapshot).
- **Leaderboards:** Daily Farms are ranked by Grazier Score and by days survived (section 9.8). **[Proposed]** Seasonal Daily leagues: everyone in a league starts the same farm on the same day.
- **Game over:** farm ends (bank limit passed or farm eaten out, as in the MVP). It moves to your farm history with its final scores. You can start a new one straight away.

#### 5.2.1 Missed days [Open]
Three options to choose from:
- A. **Pure:** nothing happens without you. Realistic and tough. Cattle can die of thirst after 4 days without water, as in the MVP.
- B. **Standing orders:** you can leave simple instructions that run only on days you miss (for example "if I don't log in, move this mob to Paddock 7 when it's down to 1,500 kg DM/ha"). Uses your daylight on that day.
- C. **Holiday mode:** pause the farm for up to N days a year.

Recommended: A plus a clear warning in the evening notification, with B added later if players drop off.

### 5.3 Fast Farm (the current game, renamed) [Decided]

- Everything the MVP does, at your own pace.
- **Up to 2 Fast Farms** going at once per free account, 5 after a purchase. Guests get 1 (section 8).
- Years are real years, in order or at random (5.14).
- **Same daylight budget** as Daily Farm. You can't build all your fencing in one day. When you're done for the day (or out of daylight), you tap **Next day**.
- The time controls sit along the top of the screen: **Next day**, **+1 week**, **+1 month**, **+1 year**.
- **Skipping:** when you skip a week or more, each day still has its daylight. Jobs in progress keep going, using each day's daylight in turn, and grazing plans keep running (as in the MVP). Skips stop early for anything the MVP stops for (for example a mob with no water).
- Grazing plans are available (as in the MVP).
- Ranked runs and challenges use a seed from the server, and the server replays them to check the score (section 14.5).
- **Game over:** as now. The farm moves to history.

### 5.4 How long jobs take [Proposed, Claudia to check every figure]

One person, a ute or quad bike, normal gear. These go into `DATA.md` with sources once agreed.

| Job | Proposed time |
|---|---|
| Look at anything (paddocks, cattle, prices, layers) | Free |
| Travel on the farm | Distance ÷ 25 km/h. Real driving is faster, but this suits the game's scale **[Decided]** |
| Permanent fence, on your own | **500 m per working day [Decided]** |
| Permanent fence, contractor team | 1-man team 500 m a day, 2-man team 1,000 m a day. Uses none of your daylight **[Decided]** (5.11) |
| Electric fence, single wire | Fast: about 1 km per hour (posts to hit in). "Really fast if it's just one wire or tape" |
| Temporary tape: put out or roll up | About walking pace, 3 km per hour |
| Proper swing gate | 1 h |
| Wire gate | 30 min, and 5 min each time stock go through it |
| Tape gate handle | 5 min |
| Poly pipe with a pipe layer | About 400 m per hour |
| Trough with fittings | 3 h |
| Move or refill a portable trough | 30 min plus travel |
| Move a mob | Drive out + 15 min + walking the route through gates at about **1.5 km/h [Decided]** (faster with dogs) + 1 min per 100 head. Next door is quick |
| Lick run or feed run | Load at the shed or silo + drive + 5 min per mob |
| Move delivered stock out of the yards | As a move, from the yards |
| Muster a whole paddock | 30 min + about 1 h per 200 ha |
| Feed lick or hay to a mob | 30 min + travel |
| Wean | Muster + 30 min + 0.5 min per head |
| Mark calves | Muster + 2 min per calf |
| Preg test (vet) | Muster + 1 min per cow, plus vet fee |
| Go to the saleyard to buy | Most of the day (6 h including travel) |
| Buy online | 30 min (delivery takes longer) |
| Sell (muster, draft, load) | Muster + 1 h + 1 min per 10 head |
| Sow or harvest a crop | Contractor: costs money, no time from you, done within a few days of booking |

### 5.5 Number of farms

| | Daily Farm | Fast Farm |
|---|---|---|
| Guest (no account) | Not available | 1 |
| Free account | 2 **[Decided]** | 2 **[Decided]** |
| After a one-off purchase (10.3) | 5 **[Decided]** | 5 **[Decided]** |

Two of each lets a player run "one where they start from 0 and one where they start with a lot".

### 5.6 Starting a farm (setup flow)

Game-like steps with picture cards, as in the MVP (REQUIREMENTS: Setup).
1. **Mode:** Daily Farm or Fast Farm (short explanation on each card).
2. **District** (four: Central Queensland, Northern Tablelands NSW, Central West NSW, Western Victoria).
3. **Farm size** (small, medium, large, realistic per district).
4. **Stock:** cattle, sheep or a mix. This sets which market classes show first. The player can still buy either later. Sheep are only offered in districts where they are realistic.
4a. **Enterprise:** grazing or mixed farming, then arable % and cropped % (as in the MVP).
4b. **Years (Fast Farm):** real years in order, or at random.
5. **Start:** take over a running business, or start from scratch.
6. **Difficulty** (sets money, overdraft and game-over level, scaled to the farm). No dollar figures shown until you take the farm.
7. **Name your farm.**

Ranked and challenge farms skip choices that are fixed for that category.

### 5.7 Messages and alerts in the game

- A bell icon with a count. Opens an inbox of farm messages: joining reports, preg test results, breakouts, deaths with the cause, market moves, sale reminders, sowing windows.
- Every warning says why (REQUIREMENTS: warnings explain why).
- On the map, a small "things to check" chip lists today's top items. Tapping one jumps to the paddock.
- On-map buttons for ready jobs stay (Harvest, Mark calves), with time and cost shown before you confirm.

### 5.8 Scoring

**[Proposed]** One headline **Grazier Score**, made so farms of different sizes and districts can be compared:
- Profit per ha compared with what is realistic for that district.
- Beef produced per ha compared with the district's carrying capacity.
- Pasture: average ground cover and how much of the farm stayed above 1,500 kg DM/ha. (No "overgrazed" judgement until rest history is modelled.)
- Animal: deaths %, weaning %, average condition.
- Time survived.

Separate boards also show each part (profit, beef per ha, ground cover, days survived). Weights to be set by running calibration farms (good, average and poor management in each district) so the score feels fair to a grazier. The formula goes into `MODEL.md` once agreed.

### 5.9 Model work needed for daily accuracy
- Sub-day grazing split by move times (exists in part in `simMob`; check it handles several moves a day and very high densities).
- Daylight calculation by latitude and date.
- Job durations and jobs in progress.
- Sale days and delivery delays.
- Calibration tests must also cover high-density daily moves (for example 500 head on 4 ha moved daily) and check intake, residual and gain look right to a grazier.

### 5.10 Later (not now)
- The Top End and other northern districts, built with northern specifics.
- Water sensors and cameras (see troughs without driving there).
- A player's own location for weather, and live prices from the real yard nearest them.
- Freight in proportion to distance.
- Stock sharing a paddock across species, if not at launch (5.12).

### 5.11 Farm hands and contractors [Decided, figures Proposed]

**The labour pool.** A short list of people looking for work in the district. It changes over time and people leave. Each person has a name, a type (day-rate casual, short contract such as 3 months at a day rate, or salaried), a rate, the days they work, skill ratings (fencing, stock work, water and pipe, feeding and machinery), and a limit on how hard they can be worked before they quit. Some have a team of dogs, which makes moving stock quick. Salaried hands don't work weekends. Some long-term hands do.

**What hands do.** Farm hands can do every task.
- **Standing duties** from their own hours: grazing plan moves, the lick run, checking waters. These still happen on Daily Farm days the player misses.
- **Helping on the player's jobs.** When the player draws a fence, the first part of the line is the hands' share for that day and uses none of the player's daylight (about 500 m of permanent fence for an average hand, more or less by skill). The line then carries on into the player's own daylight. One hand takes a day's permanent fencing from 500 m to about 800 m.
- **The line stops when the day is used up**, with a warning that this is the full day and that moving cattle as well means doing less fence.

**Contractor fencing (permanent fence only).** The fencing tool offers: yourself, a 1-man team (500 m a day) or a 2-man team (1,000 m a day). Contractors cost more and use none of the player's daylight. They keep going day after day until the run is finished. The player's hands can help them. The player can draw extra fence of their own at the same time. On the map, the contractor's fence and the player's own fence are drawn in different colours while being built.

**Pay, leaving and reputation.** Wages come out on a regular pay day. If the player can't pay, or works people past their limit, they leave. The farm's reputation in the workforce drops and the choice of workers gets worse and dearer. Paying on time brings it back.

**Messages.** The inbox keeps the player up to date ("John's contract has finished. Consider hiring someone else.").

**Injury.** Rare, and more likely after long days or risky jobs. The person is off for a time and there is a workers comp cost. The message says what happened.

**Wording.** People are described by facts (skills, days, rate). No judging words.

**The worker report.** When the player opens a Daily Farm, a worker character appears with a speech bubble for each thing done while they were away ("I moved the cows from Paddock 3 to Paddock 4 as planned"). One tap for the next, or skip all. Each is also in the inbox.

### 5.12 Sheep and wool [Decided, model Proposed]

- Sheep are a second species through the whole game: classes (ewes, wethers, lambs, hoggets, rams), joining, lambing, marking, weaning, deaths, intake and condition, with their own real figures.
- Wool grows with feed and is income. Shearing and crutching are jobs, done by contractors.
- Sheep graze shorter and pick harder than cattle.
- A cattle fence doesn't hold sheep. Sheep-proof fence costs more per metre.
- Sheep are only offered where they are realistic: Northern Tablelands, Central West NSW and Western Victoria. **[Proposed]** Not Central Queensland.
- Markets: lamb, mutton and store sheep from MLA. Wool uses a stand-in price for now (5.14).
- **[Proposed]** Merino wool and prime lamb both at launch. One species per paddock at launch.
- Before any sheep code, a benchmark table like CALIBRATION.md is drafted from published sources and agreed with Claudia (lamb growth, wool cut per head, lambing percentage, DSE per ha by district, deaths).

### 5.13 The homestead, yards, buildings, gates and feed [Decided, figures Proposed]

- **Every farm has a homestead and stock yards**, drawn on the map. Jobs include driving out from the homestead (or from the last job) and home at the end of the day.
- **The saleyard is still never drawn.** It is reached through Market and is called "Saleyards".
- **Selling:** Sell books stock onto the next sale. The Market tab shows days until the next sale.
- **Buying:** stock arrive the next day in the farm's stock yards, which have water. The player moves them out and picks their paddock. **[Proposed]** Stock left in the yards need hay after one day.
- **Yard work [Proposed]:** marking, weaning, preg testing, drafting and loading happen at the yards. The mob is walked to the nearest yards. More yards can be built.
- **Gates:** a proper swing gate, a cheap wire gate, and a tape gate handle. Tape can also be dropped to let stock through. Stock move along a route through gates, so with no gate on the way there is no move until one is built.
- **A long walk costs the day's gain.** Hours walking come off that day's grazing. Paddocks walked through are not grazed.
- **Feed is stock on hand.** Lick, hay and pellets are bought and kept in a shed, silo or feed bin. Lick goes out as blocks or tubs and is eaten at a rate per head per day, so more stock empties it sooner. When it runs out its effect stops and "things to check" says so. A lick run or feed run is a job: load, drive, put out. What the feed does to the animal is unchanged.
- **Buildings the player can add:** sheds, silos and feed bins (closer ones shorten feed runs), extra yards, and a feedlot. **[Proposed]** A feedlot the player builds is drawn on the map. *(v1.0 said no feedlot on the map; that was the MVP's fixed feedlot strip.)*

### 5.14 Real years, markets and weather [Decided]

- **Fast Farm years are real years**, from 1997 to the last full year. The player picks "in order" or "random" at setup, so regular players can't predict the market. The screen shows the real year. The score counts it as year 1, 2, 3.
- **Each real year brings its real prices and its real weather** for the district.
- **Prices:** Meat & Livestock Australia's public data service. It has daily indicators from mid-1996, nationally and for each yard. Past years are baked in. Daily Farm fetches the latest once a day on the server. The game's classes are worked out from the nearest real indicator, and the mapping is recorded in DATA.md. Credit line: "Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au". **Before launch**, Claudia emails MLA for written confirmation of commercial use.
- **Yards behind each district:** Central Queensland: CQLX Gracemere. Northern Tablelands: Armidale. Central West NSW: Dubbo. Western Victoria: Mortlake for cattle and Hamilton for sheep.
- **Sale days match the real yard**, including yards that sell about fortnightly. Past years use the days that yard really sold.
- **Weather:** SILO (Queensland Government), free under an open licence with a credit line. Daily rain, temperature and evaporation for each district town, from 1889 to yesterday. Past years are baked in. Daily Farm fetches yesterday once a day on the server.
- **How weather drives growth:** the district growth curves stay as the average year. Real rain and evaporation feed a simple soil-water tally that gives a growth factor, in place of the MVP's random season. Over many years it averages back to the district curve, so the benchmarks hold in average years. Checked against AussieGRASS and against years Claudia remembers.
- **Wool:** a stand-in price for now. Real wool prices need a paid AWEX agreement, to be sorted before sheep go public.
- **Leaderboard by real year:** who came out best of that year, scored on the change from where they started the year, within a district.

### 5.15 Grazing plans in each mode [Decided]

- **Plans are templates:** the paddocks in order, the rule, the rounds. A mob runs a template from a chosen step. If a manual move breaks the plan it pauses, and the player resumes from any step or resets it.
- **Fast Farm:** the plan moves the stock during the day and during skips. **[Proposed]** It uses the farmer's daylight unless a hand does it.
- **Daily Farm with a hand working that day:** the hand does the move from their own hours. The player sees it in the worker report.
- **Daily Farm with no hand working that day:** nothing moves until the player does it. Setting up the plan says so and that a reminder will be sent. On opening, a plan card says "Your grazing plan said today you would move from Paddock 3 to Paddock 4. Would you like to do that now?" with Yes and Not yet. Not yet leaves a plan strip along the bottom with a Move button.
- **Several moves a day are played in one sitting.** "Run today's plan" plays the day from first light to last light: the light changes, the mob grazes, moves and grazes again. The player can also skip to the next move and fit a job in between. A short run leaves daylight over.
- **Reminders:** one at the player's chosen time (default 7 am), and one more later if they haven't played.
- **Showing time pass:** the clock and light move during a job; a short time-lapse plays when a plan runs or the day ends; days tick by in Fast Farm skips. All of it can be skipped and turns off with "reduce motion".

### 5.16 Where the simulation runs [Decided]

- The simulation runs on the server for both modes. The browser holds the screens and the map drawing, and gets back numbers and the state of each square, never the formulas or data tables.
- Fast Farm needs a connection to do jobs or skip time. Looking at the farm works offline from the last saved state. Skips run a month at a time so the map keeps moving.
- Guests play through an anonymous session on the server.
- The repos, the MVP and the model docs stay private. Preview sites are locked. The terms of use state who owns the game, its rules and its data.

## 6. Game screens on phone and PC

The mockups show each of these: [mockups/index.html](mockups/index.html).

### 6.1 Phone, portrait [Decided]
- **The farm is a wide rectangle** (about 40 × 26 squares, as in the MVP). In portrait the map fills the screen height and the farm runs past the sides, so you drag left and right. A small overview inset in a corner shows which part you're looking at. A hint ("drag to see more") shows the first time.
- **Map fills the screen.** Pinch to zoom, drag to pan. Tap a paddock to open it (never a cow).
- **Top strip:** a house button (back to the app shell), farm name, day and date, cash, the bell with a count, then the **daylight bar** (first light to last light, a marker for now, "time left", and a striped preview of how much of today a job will use), then a thin line with last rain, district and head count.
- **Things to check:** a collapsible list under the top strip with today's alerts, worded neutrally. Tap one to jump to that paddock.
- **Time controls:** Fast Farm shows Next day, +1 week, +1 month, +1 year along the top. Daily Farm shows "Done for today" instead (the day ends at midnight anyway).
- **Bottom bar,** five big buttons: **Build**, **Herd**, **Paddocks**, **Market**, **More** (plans, feed, scores, diary, settings).
- **Bottom sheets:** panels slide up over the map. Half height shows the quick view with the map still visible above. Drag up for full details. Drag down to close.
- **Build:** a tool tray (Permanent, Electric, Tape, Gate, Pipe, Trough, Portable trough). Draw on the map. A job card shows length, time, cost and the daylight preview, with "Build it" and "Cancel". Tool snaps back to Look after each build.
- **Paddock sheet:** label chip (Green, Mixed, Dry & rank, Short), area, water ✓/✗, kg DM/ha, height, % green, ME, CP, the mob and days of feed left, the side-view picture, commentary ("The grass is growing away from them"), **Move cattle in here** and **Details** (then vs now, history).
- **Saleyard:** a full sheet with Buy, Sell, Prices tabs. Prices by class with the change. Number steppers. Confirm and result rows appear right under the row you tapped. Next sale day and delivery delay shown.
- **Herd:** mobs list, stock book, per-animal profit, condition and the reasons behind any warnings.
- **No saleyard or feedlot on the map** (any screen). You buy and sell through Market. **[Open]** Does the feedlot stay as an option inside Herd, or go completely?
- **End of day / catch-up summary:** a full-screen card: what changed in grass and cattle, rain, deaths and why, money. Then the video slot if it's on. Then "Back to the farm".
- **Panels shown in the mockups:** Market (prices chart by class, Buy, Sell), Herd (mobs and stock book), Paddocks list, More menu (Plans, Feed, Scores, Diary, Inbox, Settings, Subscription), and the Inbox.

### 6.1a Phone, landscape [Decided]
Landscape is likely how most people will play, so it gets its own layout, not a stretched portrait one.
- The whole width of the farm fits on screen.
- **Slim top bar in one row:** house button, farm name, day and date, daylight bar, cash, bell, and the time controls (Fast Farm).
- **Tool rail** down the right edge: Build, Herd, Paddocks, Market, More.
- **Every panel opens full screen** in landscape (paddock details, market, herd, saleyard, summaries), so there's enough height to read. Two columns where it helps (numbers and pictures on the left, actions on the right). A clear close button.
- Build mode: tool tray bottom left, job card on the right with the daylight preview.
- Turning the phone keeps your place: same zoom centre, same open panel.
- No ads over the map in landscape. The occasional banner only shows on summaries.

### 6.2 PC and tablet landscape [Decided]
- **Two separate headers.** The **website header** is at the top of every page (logo, Farm, Community, Leaderboard, Groups, search, bell, avatar). On the farm page, below it, the **game header** is attached to the top of the game area (farm name with a switcher for your farms, day and date, daylight bar, cash, time controls). Different backgrounds so they never blend together.
- **Centre:** the map. No saleyard or feedlot drawn.
- **Left:** side panel tabs (Herd, Plans, Paddocks, Feed, Market, Scores, Diary), quick view first. The mockups show each tab.
- **Sponsor rail:** on the farm page, one rail of up to 3 cards on the **left** only, wide screens only.
- **No activity toast on the farm page.** It shows only on website pages (9.4).

### 6.3 Website pages
- **Landing page** (logged out) in the Ship or Die style (references 2 and 3): huge display title, a detailed pixel farm scene, Play free button, a slim announcement bar for the current challenge or league, feature cards, sponsor strip.
- Leaderboards (public read).
- Public profiles (if the player allows).
- Pricing.
- Advertise with us (audience numbers, slot options, contact form).
- About, privacy, terms, community rules.
- Sign in / sign up.
- **Layout of website pages:** a big page heading in the display font with a short subtitle (for example "Community" / "What graziers are up to today"), then generous, consistent spacing. These pages must never look like part of the game screen.

### 6.3a Light and dark themes [Decided]
- Both themes for the whole site, game UI and admin. Follows the device setting by default, with a toggle in settings that is remembered.
- Dark: navy chrome, cream text. Light: warm paper background, cream panels, dark navy text. Coral for main actions and lime/olive for live and selected in both.
- Only the interface changes. The map keeps its natural colours (VISUALS.md), with time-of-day lighting on top.
- Both themes must meet WCAG AA contrast.

### 6.4 App shell navigation (signed in)
- Phone: bottom tabs **Farm**, **Community**, **Leaderboard**, **Profile**. Inside Farm, the game's own bottom bar takes over and a back/menu button returns to the shell.
- PC: a top nav with the same four, plus the bell and avatar.

## 7. Visual direction

References in [reference/](reference/):

| File | What to take from it |
|---|---|
| `trustmrr-sponsor-rails.png` | PC layout: content in the middle, sponsor cards in rails each side, "Advertise, 5/20 spots left" card |
| `shipordie-hero.webp` | Landing page: huge bold display type, cream and coral on dark navy, a detailed pixel scene, chunky bevelled buttons, slim announcement bar on top |
| `shipordie-pixel-scene.png` | The art quality we want: higher-resolution pixel art with clear characters, smooth shading, dithered water and sky. Crafted, not blocky |
| `shipordie-activity-toast.png` | The live activity toast in the corner: avatar, one line of what someone did, time ago |

Requirements:
- **[Decided]** Keep the retro feel in the interface (display font, chunky bevelled buttons, chips, colours), which Claudia likes.
- **[Decided]** The map art must stay **readable with big mobs and lots of grass**. In the first mockups the pixel style blurred together. Cattle must never blur into the grass.
- **[Decided]** Render style: **S5, clear map with detail on zoom**, with the zoomed-in detail drawn in the S3 clean illustrated style (confirmed by Claudia, 13 Nov 2026). For reference, the mockups' "Render styles" tab shows the same scene in five styles, zoomed out and zoomed in: S1 current pixel, S2 hi-bit pixel, S3 clean illustrated, S4 soft painted, S5 clear map with detail on zoom. The chosen style:
  - Smooth, crisp illustrated sprites (not pixels), drawn at high resolution and scaled smoothly.
  - Cattle have an outline and a soft shadow so they stand out from any grass. Breeds read clearly (black Angus, red and white Hereford, grey Brahman). Condition shows in body shape.
  - **Level of detail:** zoomed out, paddocks are clean colour fields with subtle texture by pasture state, and each mob is one marker (cow icon, head count, and a soft footprint showing where they're grazing). Zoomed in, individual cattle and grass clumps appear.
  - **Switch point [Proposed]:** at about 26 screen pixels per square or less, mobs become markers. Above that, cattle are drawn individually; a very big mob draws a sample of its cattle plus a small head-count badge so it stays readable. The hand-over between the two must be smooth (fade, no pop).
  - **Height at farm zoom [Proposed]:** each paddock field is drawn slightly raised in proportion to its grass height, so rank paddocks stand taller than short ones even fully zoomed out.
  - Grass height still has to read at every zoom: rank looks tall with dry tops and green at the base, short looks short (VISUALS.md). At a distance, height shows through shading and texture; up close, through clumps.
- **The picture must still match the model** (VISUALS.md). Grass can't be fixed tiles. Tufts are built from a set of drawn pieces by height, greenness, green-at-the-base, seed heads and dead share, chosen from the model state of each square. Crops in rows, fallow, stubble, bare ground, ground cover, all as VISUALS.md describes, just drawn better.
- **Time of day lighting:** the map is graded from the warm low light at first light, through midday, to dusk, so the daylight budget is something you see. Night (catch-up screens) is dark blue.
- **Weather:** rain, storm clouds, heat haze, frost on winter mornings, dust in dry times, all following the model.
- **Animation:** cattle walk and graze (heads down), a ute or quad drives to the job and you see the fence go up as time passes, the windmill turns, water in troughs.
- **Characters:** a farmer sprite, cattle by class (cows, calves, steers, bulls) with condition you can see (fat or thin), as REQUIREMENTS asks.
- **Type:** a pixel display font for headings and buttons; a clean, readable mono or sans for numbers and body text (small pixel fonts are hard to read on phones).
- **Colours:** dark navy app chrome, cream text, coral for main actions, lime for "live" and highlights. The map keeps natural colours from VISUALS.md.
- **Art source:** **[Open]** commission an illustrator, use AI-assisted art then clean it up, or a mix (see open question 8).
- **Ad creative** in the mockups uses illustrated farm scenes as placeholders, to show how real sponsor images will look in each slot.

## 8. Accounts, guests and age

### 8.1 Guests [Proposed, answers Claudia's question]
Claudia asked whether players without an account should have to start over. Recommendation:
- A guest can play **one Fast Farm**, saved **on that device only**. If they clear the browser or change device, it's gone and they start over. The game says this clearly.
- When a guest makes an account, their farm moves into the account. We don't make them restart: that's the moment they're most hooked, and a forced restart loses them.
- Daily Farm, leaderboards, groups and the community need an account.
- Guests see ads like free players.

### 8.2 Sign up and sign in
- Email magic link, Google, Apple.
- **Date of birth** asked once at sign-up and not shown publicly. **[Decided]**
- Username (unique, shown on boards and in the ticker), display name, optional photo.
- Optional farming questions (used for profiles and the audience report): do you farm, state and district, enterprise, farm size band, role, years farming.

### 8.3 Under 16 [Decided]
- Anyone can join and play.
- Under 16s get the game, cloud saves, both modes and leaderboards.
- The **Community is hidden**: no feed, posts, comments, likes, follows, groups, public profile or activity ticker entries. Their own rows on leaderboards show username and district only (no photo, no profile link).
- When they turn 16, the community opens automatically.
- **[Decided]** Nobody under 14 can make an account (guests any age). Get legal advice (section 18).

## 9. Community

All of section 9 sits behind the **Community** switch in admin, and each part has its own switch.

### 9.1 Profiles
- Photo, display name, username, location (town or district, never an address), short bio.
- How long they've been farming. What they farm (enterprise) and how big (size band or actual ha). Real farm name and photos if they have one.
- Education and courses (for example Grazing for Profit, RCS, TAFE, university). **[Proposed]** a picker with common courses plus free text. Later: course providers can sponsor or verify.
- Links: website, Instagram, Facebook, X, YouTube, TikTok, for themselves or their farm.
- Their posts.
- Their game: **"Their farm today"** (a live read-only view of their Daily Farm, 9.5), quick stats, farm history (finished farms with scores), best ranks and badges.
- Followers and following.
- **Privacy:** profile Public, Followers only, or Private. Activity in the ticker on or off. Farm view Public, Followers only, or Off.

### 9.2 Posts, comments and likes
- Text and up to 4 photos per post. Optional link.
- **Share my farm** posts generated from the game (map snapshot plus key numbers) from the end-of-day or end-of-year screens.
- Comments (one level of replies), likes on posts and comments.
- Edit and delete your own. Report anyone's. Block a user (they can't see or interact with you).
- No direct messages at launch.

### 9.3 The feed
- Tabs: **Friends' days** (what people you follow did today on their Daily Farm), **Everyone** (all public posts, newest and popular), **Groups**.
- The Everyone tab shows posts from friends and others.
- **Day cards:** one card per followed player per Daily Farm day, made automatically at their midnight rollover. Lists the day's jobs in short facts ("Built 10 km of electric fence", "Moved 2 mobs", "Sold 40 steers", "12 mm of rain") with a small map snapshot. Fast Farm jobs don't make day cards (too many). **[Decided]**
- Sponsored posts appear every N posts when that slot is on, marked "Sponsored".

### 9.4 Live activity ticker [Decided]
- Like the Ship or Die toast (reference 4): small card, avatar, one line, time ago.
- **Where:** PC bottom-left on website pages only (Community, Profile, Leaderboard, Groups, Landing). **Never on the farm screen**, on PC or phone. Phone: a strip at the top of the Community tab only.
- **What shows:** notable, factual events, for example:
  - "Tom1998 moved 4,000 head into a 4 ha paddock"
  - "Sarah_M built 10 km of fencing on Day 34"
  - "Jack_R sold 220 steers at Roma"
  - "Mia_W's farm reached Day 100"
  - "Ben_K started a Daily Farm in the Top End"
- Wording describes, never judges (no "smashed" or "great move").
- Only 16+ players with ticker activity switched on. Rate-limited so one player can't flood it. Can be hidden by the viewer.

### 9.5 Look at someone's farm
- From a profile or a day card, open a **read-only** view of their Daily Farm as it is now: map, paddocks with labels, cattle, quick stats (day, head, average kg DM/ha, AE/ha, net worth, Grazier Score). Tap a paddock to see its card. No buttons that change anything.
- Respects their farm-view privacy setting.

### 9.6 Groups
- Anyone 16+ can create a group (name, photo, description). Private (invite link or code) or Public (anyone can join).
- **[Proposed]** Up to 100 members.
- Group page: members, a group leaderboard, a group feed of members' day cards and posts.
- **Group challenges:** the group owner sets a Fast Farm challenge (same farm and seed for everyone) or a Daily league (everyone starts the same farm on the same day).
- Owner can remove members and hand over ownership.

### 9.7 Following
- Follow anyone with a public or followers-only profile (followers-only needs approval).
- "Friends" means people you follow. **[Proposed]** No two-way friend requests.

### 9.8 Leaderboards
- **Overall** board (Grazier Score across all ranked farms).
- Filters: mode (Daily or Fast), district, farm size, start (scratch or take over), enterprise (grazing or mixed), period (this week, this month, this season, all time).
- Boards: Grazier Score, profit per ha, beef per ha, ground cover, days survived.
- **Groups** tab: each of your groups' boards.
- Each row: rank, avatar, username, district, score, days. Tap for their profile and that farm's summary.
- Your own row pinned at the bottom.
- Only server-checked farms count (14.5).
- Under 16s: username and district only (8.3).

### 9.9 Moderation and safety
- Report a post, comment, profile or group, with a reason.
- Automatic image check on upload (nudity, violence) before a photo shows.
- A bad-word filter on usernames and posts.
- Admin moderation queue (11.3). Actions: remove content, warn, suspend for N days, ban.
- Community rules page, linked at sign-up and on report.
- Rate limits on posting and commenting for new accounts.

## 10. Making money

### 10.1 Ad slots [Decided: built in-house, all off by default]

Each slot has an ID, sits in a set place in the layout, and is switched on or off in admin. Any slot can show a campaign (Claudia's own business, a direct sponsor), or later a Google AdSense unit where the slot allows it.

| Slot ID | Where | Format | Behaviour |
|---|---|---|---|
| `pc_farm_rail` | PC farm page, rail on the **left** of the map, wide screens | Up to 3 cards (image, logo, name, one line, link) | Always visible when on |
| `pc_community_side` | PC Community page, right column under "Following today" and "Top graziers" | Up to 3 cards + "Advertise here, X of 20 spots left" card | Always visible when on |
| `pc_profile_side` | PC Profile page, right column | 1 card | Always visible when on |
| `pc_leaderboard_banner` | PC Leaderboard, above the table | 1 wide banner | Always visible when on |
| `phone_banner` | Phone, thin strip above the bottom bar | 320×50 image or text | Shows now and then for 30 to 60 s, then hides. Has a close button. Frequency cap set in admin (default once every 5 min of play). Never covers a confirm button |
| `pc_banner` | PC, thin strip under the map | 728×90 | Same rules as the phone banner |
| `video_between_days` | Fast Farm, after Next day or a skip | Video up to 30 s | Skippable after 5 s. Cap (default no more than once every 10 game days and 5 real minutes) |
| `video_between_years` | Both modes, after the year-end summary | Video up to 30 s | Skippable after 5 s |
| `video_daily_summary` | Daily Farm, on the morning catch-up summary | Video up to 30 s | Once a day at most |
| `summary_sponsor_card` | End of day and end of year summaries | Card ("This season brought to you by...") | Always when on |
| `feed_sponsored` | Community feed | Post-style card marked Sponsored | Every N posts (default 8) |
| `challenge_sponsor` | Challenge and league pages, landing announcement bar | Logo and name | Per challenge |
| `landing_sponsors` | Landing page strip | Logos | Always when on |

Rules:
- **A different spot on each page** so it never feels spammy (Claudia): farm page left rail; Community right column plus a sponsored post; Profile one card; Leaderboard one banner; Landing a logo strip.
- **Never two ad units on one phone screen.** No ads over the map in landscape.
- Ads never appear during a decision, over a confirm, or while a job card is open.
- Ad spaces reserve their size before they load, so the page never jumps (14.10).
- Videos only at natural breaks (end of day, year, catch-up).
- Subscribers don't see banners or videos. **[Proposed]** They still see sponsor cards (rails, summary card, feed sponsored posts are fewer), since sponsors are part of the community.
- Every view and click is logged per slot and campaign (for sponsor reports).
- Clicks open in a new tab with a tracked redirect.
- Videos and images are uploaded in admin and served from our storage.

### 10.2 What banner ads might earn (rough guide only)

Display ad earnings vary a lot. As a rough guide, small Australian sites earn something like A$1 to A$4 per 1,000 banner views through Google, often less on phones and with ad blockers. These are ballpark figures, not verified for this audience.

| Daily players | Banner views a month (3 a day each) | Rough Google banner income a month |
|---|---|---|
| 500 | 45,000 | A$45 to A$180 |
| 2,000 | 180,000 | A$180 to A$720 |
| 10,000 | 900,000 | A$900 to A$3,600 |

Direct sponsors usually pay much more for a niche audience like farmers. For example, 20 rail slots at A$150 to A$500 a month would be A$3,000 to A$10,000 a month, if the audience numbers back it up. That's why the slots are built in-house and the audience report matters (section 12). Using the slots for Claudia's own business costs nothing and can start on day one.

### 10.3 One-off purchases and paying to keep going [Decided, prices Proposed, switched off until ready]

This replaces the v1.0 subscription. The old wording is kept below under "v1.0 subscription (replaced)" for reference only.

- **Free:** both modes, ads (when switched on), 2 Daily Farms and 2 Fast Farms.
- **Farm pack, about A$30, one-off:** 5 of each farm, plus perks.
- **Farm pack with no ads, about A$50, one-off:** 5 of each farm, no banners or videos, more perks. **[Proposed]** A$20 to upgrade from the first pack.
- **Perks [Proposed]:** full diary history, extra charts, a supporter badge, early access to new districts.
- **Nothing that gives an edge in play is for sale.**
- **Paying to keep going.** Offered only at game over. It clears the debt and puts the farm back to modest funds, with a penalty that fits the situation. The offer shows exactly what the player keeps and gets.
  - **[Proposed]** Stock are sold to clear the debt first. Cash is then set to the hard-difficulty starting cash for that farm.
  - Fast Farm: A$5.
  - Daily Farm, by how long the farm has run: about A$25 at 6 months, A$50 at 1 year, A$100 over 2 years. **[Open]** the price under 6 months (A$15 until set).
  - **[Proposed]** A farm can be rescued more than once. Its leaderboard score stops at the game over and it shows a "continued" mark.
- All prices in Australian dollars with GST included, set in admin and Stripe.
- Stripe Checkout takes the payment. Webhooks record what the account owns. No Customer Portal is needed.
- A Daily Farm shouldn't reach game over in its first 3 to 6 months of ordinary play. This is tested with the engine.
- Check with a lawyer or accountant: refunds and clear wording under consumer law, GST, purchases by under 18s. App stores have their own rules if the game is wrapped later.

#### v1.0 subscription (replaced)
- **Free:** both modes, ads (when switched on), 1 Daily Farm, 3 Fast Farms.
- **Pro** (name **[Open]**): no banners or videos, advanced stats and charts, full diary history (free keeps, say, the last 30 days), Pro badge, early access to new districts and features. **[Open]** More Fast Farm slots?
- **Price to test:** A$4.99 a month or A$39 a year, GST included. Set in Stripe and admin, so it can change.
- Stripe Checkout to buy, Stripe Customer Portal to manage or cancel. Webhooks keep the account status up to date.
- Future: "Play your own farm" (load your own paddock layout).

## 11. Admin back end [Decided]

At `/admin`, only for admin accounts. Works on PC first; usable on a tablet.

### 11.1 Dashboard
- Daily, weekly and monthly active users; sign-ups; average minutes a day; Daily Farm streaks; return rates.
- Mode split (Daily vs Fast), farms started and game overs.
- Audience mix (from profiles): farmer or not, state and district, enterprise, farm size, age bands.
- Subscribers and income (when on). Ad views, clicks and click rate (when on).
- **Game health:** active Daily and Fast Farms, game overs this week and their causes, ranked runs failing the replay check, rollover job status.
- Charts over time. Export to CSV.
- **Audience snapshot** for advertisers: a one-page summary that can be shown on the Advertise page or downloaded.

### 11.2 Users
- Search, view a user (profile, farms, reports, subscription), change role (player, moderator, admin), suspend, ban, delete (with data removal), reset a farm.

### 11.3 Moderation
- Queue of reports and auto-flagged images. See the content and context. Remove, keep, warn, suspend, ban. Notes and history per user.

### 11.4 Ads and sponsors
- **Slots:** every slot from 10.1 with its on/off switch, frequency settings, current campaigns, views, clicks.
- **Sponsors:** name, logo, contact, notes.
- **Campaigns:** sponsor, creative (image or video upload, headline, one line, link), slots, start and end dates, targeting (everyone, farmers only, by state), weight if several share a slot, preview on phone and PC.
- **House ads:** campaigns for Claudia's own businesses, used to fill empty slots.
- **Google AdSense:** a field for the publisher ID and per-slot unit IDs, off until switched on.
- **Sponsor report:** per campaign, views and clicks by day, downloadable.
- Spots-left count for the "Advertise here" card.

### 11.5 Subscriptions and Stripe
- Shows whether Stripe keys are set (test or live) and the webhook is working. Keys are set as environment variables in Vercel, not typed into the admin page.
- Plans pulled from Stripe (prices and intervals). Admin sets which features each plan includes (a features table).
- Subscriber list, cancellations, income.
- Coupon codes (from Stripe).

### 11.6 Challenges and leagues
- Create a Fast Farm challenge (seed, district, size, start, money, dates, sponsor) or a Daily league (start date, farm settings, sponsor).
- See entries and results.

### 11.7 Feature switches
Each switch takes effect without a new release. Default state at launch is in brackets.

| Switch | Default |
|---|---|
| Sign-ups open | On |
| Daily Farm | On |
| Fast Farm | On |
| Community (master) | Off |
| Feed and posts | Off |
| Groups | Off |
| Activity ticker | Off |
| Farm viewing by others | Off |
| Leaderboards | On |
| Ads (master) | Off |
| Each ad slot | Off |
| Google AdSense | Off |
| Subscriptions | Off |
| Push notifications | On |
| Maintenance mode (game read-only, message shown) | Off |

### 11.8 Site settings
- Announcement bar text and link (the lime bar on the landing page).
- Districts available.
- Market data upload (to replace the approximate price series with real MLA data, DATA.md).
- Community rules, privacy and terms text.
- **Audit log** of every admin action.

## 12. Analytics

- **PostHog** for product analytics and funnels, plus our own database for exact counts used in the admin dashboard and sponsor reports.
- Cookie and consent banner where needed (Google ads and some analytics need consent).
- Events to track (minimum):
  - `signup`, `login`, `profile_completed`, `age_band`
  - `farm_started` (mode, district, size, start, difficulty), `farm_ended` (reason, days, score)
  - `day_completed` (mode), `skip_used` (length), `job_done` (type, time, cost)
  - `daily_streak` (length), `notification_opened`
  - `saleyard_buy`, `saleyard_sell`
  - `post_created`, `comment_created`, `like`, `follow`, `group_joined`, `farm_viewed`
  - `ad_view`, `ad_click` (slot, campaign), `video_completed`, `video_skipped`
  - `checkout_started`, `subscribed`, `cancelled`
  - `pwa_installed`
- Advertisers only ever get totals, never personal details.

## 13. Notifications

- **Channels:** web push (Android, desktop, and iPhone once added to the home screen), and email as a fallback. In-app inbox always.
- **iPhone:** there's no automatic install prompt, so the app shows a short "Add to Home Screen" guide when someone turns on Daily Farm reminders.
- **Types (each can be turned off):**
  - Morning reminder at a time the player picks: "First light at Kooringa. 3 things to check."
  - Farm alerts: trough low or empty, no water, a mob with about 2 days of feed left, cattle through the tape, calving started, deaths and why, rain.
  - Evening warning if Daily Farm hasn't been opened and something urgent is happening (for example a mob has no water).
  - Social: new follower, comment, like (bundled), group invite.
  - Challenge and league start and finish.
- Wording describes, never nags or judges.
- Quiet hours setting.

## 14. Technical approach

### 14.1 Shape
One Next.js app is the website and the game. The game page (`/play`) runs only in the browser: React for all panels and menus, PixiJS for the map, the simulation in a Web Worker. The PWA opens to `/play`.

### 14.2 Stack [Decided]

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | Shared engine for browser and server; types catch mistakes |
| Web app | Next.js (App Router) on Vercel | Claudia knows it; good for public pages and sharing |
| Simulation | `packages/engine`: plain TypeScript, no screen code, seeded random numbers | Runs in a Web Worker, in server functions and in tests |
| Map | PixiJS v8 (WebGL) with sprite sheets at 2× resolution, level-of-detail switching by zoom, colour grading for time of day, particles for weather, `pixi-viewport` for pinch and pan | Draws thousands of grass clumps and cattle smoothly on phones, in whichever render style is chosen |
| Game UI | React + Zustand store linking the engine and panels | The game is mostly panels, sheets and tables |
| Art pipeline | Source art (vector or high-res) exported to WebP/AVIF texture atlases at 1× and 2× | Small downloads, crisp on high-density phone screens |
| PWA | Web app manifest + Serwist service worker | Install and offline Fast Farm |
| Local saves | IndexedDB | Bigger and safer than localStorage |
| Backend | Supabase: Postgres, Auth, Storage, Row Level Security, Edge Functions, scheduled jobs (pg_cron) | Claudia knows it; relational data suits boards, follows and feeds |
| Payments | Stripe Billing, Checkout, Customer Portal, Stripe Tax | Web subscriptions with no app store cut |
| Ads | In-house slot and campaign system; AdSense as an optional provider later | Full control; same on phone and PC |
| Analytics | PostHog + own tables | Funnels and feature flags; exact counts for sponsors |
| Push | Web Push (VAPID) from a server function | Works for installed PWAs on iPhone and Android |
| Email | Resend | Sign-in links, alerts, receipts |
| Errors | Sentry | Crashes on real phones |
| Image check | A moderation API on upload (to choose) | Required for a public feed |

**Why PixiJS fits whichever render style is chosen:** it draws sprite sheets very fast, whether pixel art or smooth illustrated art, and handles level-of-detail switching (mob markers zoomed out, individual cattle zoomed in). It also does colour grading (dawn to dusk) and particles (rain, dust), and leaves menus to React, which is much better at them. Phaser would also draw the art well, but its menus are weak, and this game is mostly menus around one map.

### 14.3 Who runs the simulation
- **v1.1: both modes run on the server (5.16).** The Daily Farm points below apply to Fast Farm too, except the midnight rollover.
- **Fast Farm:** on the server. The browser sends each job or skip and shows what comes back. Looking works offline from the last saved state.
- **Daily Farm:** on the server, so no one can cheat time.
  - The browser sends each job to the server. The server checks it (daylight left, money, rules), applies it and returns the new state. The browser shows the result straight away and corrects if the server disagrees.
  - Midnight rollover: a scheduled job runs every 15 minutes and simulates the day for every Daily Farm whose local midnight has just passed. As a safety net, any farm that is opened or viewed with missed days is caught up first.
  - Capacity check: at about 5 ms a simulated day, 10,000 farms take under a minute of compute a night.
  - Daily Farm needs a connection to do jobs. Looking works offline from the last saved state.
- **Same engine version everywhere.** Every farm records the engine version it runs on. Model changes are released carefully: a Daily Farm is moved to a new engine version only at rollover.

### 14.4 Daylight
- Civil dawn and dusk from latitude, longitude and date (standard solar calculation). Each district has a set location (for example the district's main town).
- Stored per farm per day so the client and server agree.

### 14.5 Fair leaderboards
- Every farm's random numbers come from a seed.
- v1.1: every farm in both modes is run by the server, so scores can't be changed from the browser and no replay check is needed. The action log is still kept for each farm, for support and for checking engine changes.
- Daily Farms are already on the server.
- Replays run in a background queue, and only for runs that would place on a board.

### 14.6 Repository layout
```
apps/web            Next.js app: website, game page, admin, PWA
packages/engine     Simulation (pure TypeScript) + calibration tests
packages/render     PixiJS map renderer and sprite loading
packages/shared     Types, constants, feature-switch names, slot IDs
art/                Aseprite sources and exported atlases
supabase/           Migrations, row level security policies, edge functions, cron jobs
docs/               This PRD, project memory, mockups, references
```
pnpm workspaces, Turborepo if builds get slow.

### 14.7 Testing
- `CALIBRATION.md` benchmarks become automated engine tests run on every change, plus new high-density daily-move tests (5.9).
- The engine gives identical results in the browser and on the server for the same seed and actions.
- Daylight and job-time tests (a winter day in Western Vic is shorter than a summer day in Central Qld).
- Phone-size end-to-end tests for: setup, build a fence with the daylight preview, move cattle, buy and sell, next day, Daily rollover and catch-up, post, follow, join a group, subscribe (Stripe test mode), turning slots on in admin.
- The `realism-guardian` agent runs before each release.

### 14.8 Porting the MVP
Split `grazing-game.html` into engine (constants, pasture, cattle, crops, daily tick, actions, scoring) and UI. Translate module by module, checking each against the MVP's numbers. The MVP stays as the reference until the new build matches it.

### 14.9 App stores later
Capacitor can wrap the same app. Check Apple's subscription rules first.

### 14.10 Speed and quality: fast, solid, never janky [Decided]

**Targets**

| Where | Target |
|---|---|
| Website pages (landing, leaderboards, community, profiles, pricing, advertise) | Lighthouse **100** in Performance, Accessibility, Best Practices and SEO, on the mobile test |
| Game page (`/play`) | Lighthouse 100 in Accessibility, Best Practices and SEO; Performance 95 or more, aiming for 100 (the game's art and engine load after the page is usable) |
| Admin | Accessibility and Best Practices 100 (not public, so speed matters less) |
| Real users (Core Web Vitals, 75th percentile) | Largest Contentful Paint under 2.0 s, Interaction to Next Paint under 200 ms, Cumulative Layout Shift under 0.05 |
| Playing | 60 frames a second on a mid-range Android phone about 3 years old, with 4,000+ head on the farm; no main-thread task over 50 ms; +1 month skip doesn't freeze the screen |
| Downloads | Website page JavaScript under 100 KB compressed on first load; game page usable under 250 KB before the art loads; art and engine loaded in the background |

**How**
- Website pages are rendered on the server (React Server Components) and cached at the edge, with as little browser JavaScript as possible.
- The game code (PixiJS, engine, art) loads only on `/play`, in separate chunks, after the page shell shows.
- The simulation runs in a Web Worker so the screen stays smooth during skips.
- Images through Next.js image optimisation (AVIF/WebP, right size for the screen). Fonts self-hosted with `next/font`, only the weights used.
- Every ad space, image and panel reserves its size before content arrives, so nothing jumps.
- Analytics and any third-party scripts load after the page is interactive. Our own sponsor cards are served first-party.
- Note: switching on Google AdSense will likely cost Lighthouse points, because its scripts are heavy. House and sponsor ads don't have that problem. Show Claudia the score impact in admin before AdSense goes on.
- The PWA caches the game shell and art, so second visits open almost instantly and work offline.
- Animations use transforms only and respect the "reduce motion" setting.

**Checking it**
- Lighthouse CI runs on every pull request for the main pages on mobile settings. A change that drops below target doesn't merge.
- A speed test in CI: frame time and simulated-day time with a 4,000-head farm.
- Real-user Web Vitals tracked in production (Vercel Speed Insights or PostHog) and shown on the admin dashboard.
- Error tracking (Sentry) with a target of zero unhandled errors in a normal session.
- Tested on real devices: a mid-range Android phone, an iPhone, a tablet, and a laptop, in both orientations and both themes.

## 15. Data model [Proposed]

Supabase Postgres. Every table has `id`, `created_at`, `updated_at`. Row Level Security on everything: players can only change their own rows; public reads follow privacy settings; under 16 flags hide community rows.

**Accounts and profiles**
- `profiles`: user_id, username (unique), display_name, avatar_url, bio, town, district, state, dob (private), is_under_16 (computed daily), farms_yn, enterprise, farm_size_band, farm_size_ha, real_farm_name, years_farming, role, privacy_profile (public/followers/private), privacy_farm_view, ticker_opt_in, reminder_time, timezone, is_admin, is_moderator, suspended_until, banned
- `profile_links`: profile, kind (website, instagram, facebook, x, youtube, tiktok), url
- `experience`: profile, role, enterprise, place, from_year, to_year
- `education`: profile, course_name, provider, year, verified
- `farm_showcase_photos`: profile, url, caption, order

**Game**
- `farms`: owner, mode (daily/fast), name, district, size, enterprise, start_type, difficulty, seed, engine_version, status (active/ended), started_at, ended_at, end_reason, timezone (daily), current_day, ranked (bool), challenge_id, league_id
- `farm_states`: farm, day, compressed state (latest only for fast; daily keeps latest)
- `farm_snapshots`: farm, day, compressed map summary (for history and day cards; daily keeps every day, fast keeps month ends)
- `farm_days`: farm, day, date, first_light, last_light, time_used, weather, rain_mm, summary (JSON: grass, gains, deaths with causes, money)
- `farm_jobs`: farm, day, type, params (JSON), started_at_game_time, duration_min, cost, status (done/in_progress/cancelled), progress
- `farm_actions`: farm, seq, day, action (JSON) (full action log for replay)
- `farm_messages`: farm, day, kind, text, read
- `farm_scores`: farm, grazier_score, profit_per_ha, beef_per_ha, ground_cover, deaths_pct, days_survived, verified, verified_at
- `challenges`: name, type (fast_challenge/daily_league), settings (JSON), seed, starts, ends, sponsor_campaign, group_id (null for public)

**Community**
- `follows`: follower, followee, status (accepted/pending)
- `blocks`: blocker, blocked
- `posts`: author, kind (post/share_farm/day_card), text, link_url, farm_id, farm_day, visibility, removed
- `post_photos`: post, url, order, moderation_status
- `comments`: post, author, parent_comment, text, removed
- `likes`: user, post or comment
- `groups`: name, photo, description, visibility, owner, invite_code
- `group_members`: group, user, role (owner/member), joined_at
- `activity_events`: user, farm, kind, text, created_at, public (feeds the ticker)
- `reports`: reporter, target_type, target_id, reason, status, moderator, action, notes

**Leaderboards**
- `leaderboard_entries`: farm, user, mode, district, size, start_type, enterprise, period keys, board (grazier/profit/beef/cover/days), score. Refreshed when scores are verified; materialised views for fast reads.

**Money and ads**
- `subscriptions`: user, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end
- `plan_features`: plan, feature_key, enabled
- `sponsors`: name, logo_url, contact, notes
- `campaigns`: sponsor, is_house_ad, headline, body, link_url, media_url, media_type, starts, ends, targeting (JSON), weight, active
- `campaign_slots`: campaign, slot_id
- `ad_slots`: slot_id, enabled, settings (JSON: frequency caps, every N posts), provider (house/adsense), adsense_unit_id
- `ad_events`: slot_id, campaign, user (nullable), kind (view/click/video_complete/skip), created_at (rolled up nightly into `ad_daily`)

**System**
- `feature_switches`: key, enabled, note, updated_by
- `site_settings`: key, value (JSON)
- `push_subscriptions`: user, endpoint, keys, device
- `notification_prefs`: user, kind, enabled, quiet_hours
- `admin_audit_log`: admin, action, target, details

## 16. Server functions [Proposed]

- `daily/job`: check and apply a Daily Farm job; return new state.
- `daily/rollover` (scheduled every 15 min): simulate days for farms past local midnight; write farm_days, snapshots, day cards, activity events, notifications.
- `daily/catchup`: simulate missed days on open or view.
- `fast/sync`: save a Fast Farm state from the browser.
- `ranked/submit`: receive seed and actions; queue replay; write verified score.
- `leaderboards/refresh`.
- `ads/serve`: pick a campaign for a slot for this viewer (switches, caps, targeting, subscriber status).
- `ads/event`: log view or click; click redirect.
- `stripe/checkout`, `stripe/portal`, `stripe/webhook`.
- `push/send`, `email/send`.
- `moderation/scan-image` (on upload).
- `admin/*`: switches, campaigns, users, reports, challenges, exports (all checked for admin role).

## 17. Security and fair play
- Row Level Security on every table.
- Daily Farm jobs only through the server function.
- Time zone lock (5.2).
- Ranked replays (14.5).
- Rate limits on jobs, posts, comments, follows, reports.
- Admin routes check the role on the server, not just in the page.
- Stripe and other secret keys only in environment variables.

## 18. Legal and compliance (get advice before launch)
- **Privacy Act and Australian Privacy Principles:** privacy policy, collect only what's needed, consent for marketing, let people download and delete their data. Date of birth kept private.
- **Children:** a Children's Online Privacy Code is being developed under the Privacy Act. Check what it requires for under-18 accounts before launch.
- **Social media minimum age (under 16):** in force since 10 December 2025. Online games are excluded, but the rules were amended in March 2026, and a feed with posts and follows may count as social media. Hiding the community from under 16s (8.3) is designed to handle this, but confirm with a lawyer, including whether date of birth alone is "reasonable steps".
- **Ads:** label sponsored content clearly. Don't make claims about products in game mechanics.
- **Subscriptions:** Australian Consumer Law (clear prices, easy cancel, refunds). GST once turnover passes A$75,000 (Stripe Tax).
- **Ownership:** decide whether this is Claudia's own business or AgriProve's (company, ABN, brand, who owns code and data).

## 19. Running costs

- **While building:** about $0 (free tiers; Stripe in test mode).
- **At launch:** about A$75 to A$100 a month: Vercel Pro about US$20 (required for commercial use), Supabase Pro about US$25, domain about A$25 a year, Stripe about 1.7% + 30c per domestic card payment. PostHog, Resend and Sentry free tiers.
- **As it grows:** photo storage and bandwidth, server time for Daily rollovers and ranked replays, push and email volume. Compress images, replay only runs that would place, roll up ad events nightly.
- Prices from November 2026 research. Check each provider's pricing page before signing up.

## 20. Build order and acceptance

Everything is built before launch; switches control what players see.

**v1.1 build order.** Five stages. The milestones and what "done" means for each are in [BUILD_PLAN.md](BUILD_PLAN.md).

| Stage | What |
|---|---|
| 1 | Engine and the cattle game on all screens, with real years, the new job times, homestead and yards, gates, feed as stock and sale days |
| 2 | Farm hands, contractor fencing, then sheep and wool |
| 3 | Accounts, the simulation on the server for both modes, Daily Farm with live weather and prices, notifications, admin shell |
| 4 | Competition and community |
| 5 | Ads, one-off purchases, paying to keep going, website, launch |

The v1.0 stages below are kept for their acceptance tests. Read "subscription" as one-off purchases, "offline Fast Farm" as looking offline, and the replay check as not needed.

**Stage 1: Engine and game on all screens**
- Monorepo, engine ported to TypeScript with seeds, all calibration tests passing.
- PixiJS map with the new art direction, time-of-day lighting, model-driven grass.
- Phone and PC game layouts; Fast Farm with the daylight budget, jobs in progress, skips.
- PWA install, offline Fast Farm, local saves.
- Done when: a phone player can set up a farm, build, move, buy, sell and skip a year in portrait and landscape with no horizontal scroll, the game page meets the 14.10 speed targets, and the calibration tests pass.

**Stage 2: Accounts and Daily Farm**
- Sign up with date of birth, guest farm moves into account, cloud saves, 3 Fast Farm slots.
- Daily Farm on the server: jobs, rollover, catch-up, time zone lock, diary, notifications.
- Admin shell with feature switches and users.
- Done when: a Daily Farm runs for 7 real days (including 2 missed days) and the catch-up summary and daily gains look right to Claudia.

**Stage 3: Competition and community**
- Ranked runs with replay check, leaderboards and filters, groups and group challenges.
- Profiles, posts, photos, comments, likes, follows, day cards, ticker, farm viewing, moderation, under 16 rules.
- Done when: two test accounts can follow each other, see each other's day cards and farms, and an under 16 test account sees no community.

**Stage 4: Money and launch**
- Ad slots, campaigns, house ads, video player, sponsor reports, AdSense provider (off).
- Stripe subscriptions, plan features, customer portal.
- Admin dashboard, analytics, audience snapshot, Advertise page, landing page, legal pages.
- Done when: Claudia can switch on a slot, upload a house ad and see views; and a test subscription in Stripe test mode removes ads.

## 21. Open questions and the default to build

**Rule for the builder:** don't stop on an open question. Build the default below, keep it easy to change (a setting, a constant or a feature switch), and list it in your stage report so Claudia can confirm or change it.

| # | Question | Default to build until Claudia says otherwise |
|---|---|---|
| 1 | Mode names | "Daily Farm" and "Fast Farm", kept in one constants file so they can be renamed everywhere at once |
| 2 | Real weather and prices in Daily Farm | Simulated weather and the MVP market series. Design the engine's weather input as a swappable source so real BOM/SILO rain can be plugged in later |
| 3 | Missed days | Pure: nothing happens without you. Evening warning notification when something urgent is happening |
| 4 | Travel time | Included, at 25 km/h, behind a setting so it can be turned off |
| 5 | Job times | The table in 5.4, all values in one data file (and DATA.md) |
| 6 | Sale days | Weekly sale day per district yard, 2-day delivery, online buying any day with a 3-day delivery |
| 7 | Daily Farms per account; Fast Farm slots for subscribers | 1 Daily Farm; 3 Fast Farms for free and paid (limits in plan_features so they can change) |
| 8 | Art source | Build with placeholder art drawn in code in the S3 style from the mockups, structured so real art can replace it sprite by sprite |
| 9 | Minimum account age | 13+ for accounts, guests any age. Under 16s get no community |
| 10 | Grazing plans in Daily Farm | Not available in Daily Farm |
| 11 | Render style | **Decided:** S5 clear map with detail on zoom, zoomed-in detail in the S3 style. No longer open |
| 12 | Feedlot | Kept as an option inside Herd (send a mob to a feedlot for a daily fee, as in the MVP), never drawn on the map |

### v1.1: what is settled, and the defaults still to check

**Settled in v1.1** (these replace rows 2, 3, 5, 6, 7, 9, 10 and 12 above): real weather and prices (5.14); a hand's standing duties run on missed days, otherwise nothing happens without you (5.11); job times (5.4); sale days follow the real yard with next-day delivery (5.13, 5.14); 2 Daily and 2 Fast Farms free, 5 after a purchase (5.5); minimum account age 14; grazing plans in both modes (5.15); a feedlot is something the player builds (5.13).

**Defaults Claudia accepted "for now"**, to be perfected later. Each is a setting or one line in a data file.

| # | Topic | Default built |
|---|---|---|
| 13 | Working hours | The player can work from first light to last light. A hand gives a fixed day's work by skill |
| 14 | Electric and tape rates | Single-wire electric about 1 km an hour; tape about 3 km an hour |
| 15 | Contractor fencing price | Materials plus a labour charge per metre, the same rate for either team. Figure to be sourced |
| 16 | Gate costs and times | Proper gate $450 and 1 h; wire gate about $150 and 30 min, plus 5 min each use; tape handle about $20 and 5 min |
| 17 | Walking with dogs | Up to about 2.5 km/h with a hand who has dogs |
| 18 | Yard work | Marking, weaning, preg testing, drafting and loading happen at the yards |
| 19 | Stock in the yards | Water in the yards; hay needed after one day |
| 20 | Building costs and times | Sheds, silos, yards, feedlot: figures to be sourced |
| 21 | Lick, hay and pellet figures | Product sizes, prices and intake per head to be sourced and recorded in DATA.md |
| 22 | Plan moves in Fast Farm | Use the farmer's daylight unless a hand does them |
| 23 | Hands | No limit on how many. Wages from award rates, to be sourced. Injuries are rare and tied to long days |
| 24 | Sheep districts | Northern Tablelands, Central West, Western Victoria. Not Central Queensland |
| 25 | Sheep and cattle in one paddock | Not at launch |
| 26 | Sheep enterprises | Merino wool and prime lamb |
| 27 | Wool price | A stand-in figure until an AWEX agreement is in place |
| 28 | Cattle look | Brahman style in Central Queensland, British breeds elsewhere |
| 29 | Purchases | A$30 and A$50 packs, A$20 to upgrade, perks as in 10.3 |
| 30 | Keep going | Prices and rescue terms as in 10.3; under 6 months A$15 |
| 31 | Reminders | 7 am by default, one more later if not played |
| 32 | Earliest real year | 1997 |
| 33 | Built feedlot | Drawn on the map |
| 34 | Fences longer than a day | When building yourself, the line stops at what fits today. Contractors carry on over days |

Original wording of the v1.0 questions, for context:

1. **Mode names.** Working titles are "Daily Farm" and "Fast Farm". Alternatives: "Real Time" / "Quick Play", "Day by Day" / "Fast Track", "Daily" / "Seasons".
2. **Daily Farm weather and prices.** Simulated (as now), or the real weather for that district each day (from Bureau of Meteorology or SILO data) and real cattle prices? Real weather would be a strong hook ("it rained in Roma today and my farm got it too") but needs a soil water and growth model that responds to daily rain rather than the monthly curve.
3. **Missed days in Daily Farm.** Pure (nothing happens without you), standing orders, or holiday mode (5.2.1)?
4. **Travel time** between jobs: include it, or leave it out to keep it simple (5.1)?
5. **Job times.** Please check every figure in 5.4.
6. **Sale days.** Real weekly sale days with delivery delays, plus an online option any day (5.2)?
7. **One Daily Farm per account?** And do subscribers get more Fast Farm slots?
8. **Art.** Commission a pixel artist, AI-assisted art cleaned up by hand, or a mix? Budget?
9. **Minimum account age:** 13+ (recommended) or any age?
10. **Grazing plans in Daily Farm:** none (every move is a daily job), as proposed?
11. **Render style:** which of S1 to S5 (mockups, Render styles tab)? Recommended S3 with S5 behaviour.
12. **Feedlot:** it's gone from the map. Keep it as an option inside Herd (send cattle to a feedlot for a fee), or drop it completely?

## 21a. Other build details

### First-time experience
- A short guided first day for new players: open a paddock, move cattle, build a short fence and watch the daylight bar move, open the market, end the day. Can be skipped and replayed from More.
- Help stays hidden behind a help button and never covers the map on a phone (REQUIREMENTS).
- Empty states everywhere (no farms yet, no posts yet, no followers yet) with one clear next step.

### Accessibility
- Every button and control has a text label for screen readers. Paddock chips always show their word, not just colour.
- Full keyboard use on PC (Tab through panels, Escape closes sheets, arrow keys pan the map, + and − zoom).
- Touch targets at least 44 px. Text can be enlarged without breaking layouts.
- Respects "reduce motion" and the device's light or dark setting.

### Search engines and sharing
- Page titles, descriptions and Open Graph images on every public page.
- Generated share images for profiles, farm snapshots, day cards and leaderboard ranks, so links look good when shared to Facebook, Instagram or messages.
- Sitemap and robots file. Private profiles are never indexed.

### Errors and offline
- A clear banner when offline. Fast Farm keeps working offline. Daily Farm shows the last saved state and says jobs need a connection.
- Failed saves retry automatically and never lose a job silently.
- A friendly error screen with a "try again" button, and every error is reported to Sentry.
- Server and client disagree on a Daily Farm job: the server wins, and the player sees a short message explaining what changed.

### Saves and versions
- Every save records its format version and engine version. Old saves are upgraded with defaults (LESSONS: old saves need defaults).
- Daily Farms move to a new engine version only at rollover (14.3).

### Your data
- Players can download their data and delete their account from Settings. Deleting removes their profile, posts, photos and farms (leaderboard entries are anonymised).

### Environments
- **Local** (developer machine), **Preview** (every pull request gets a Vercel preview linked to a Supabase branch or a staging project), **Production**.
- Seed data for local and preview: test accounts (adult, under 16, admin, subscriber), sample farms in each mode, sample posts and groups, sample sponsors and campaigns.
- Secrets only in environment variables, never in the repo. A `.env.example` lists every variable with a comment.

### Accounts Claudia sets up (the builder must not create accounts or enter payment details)
- GitHub repository (private).
- Vercel (Hobby during the build; Pro before launch).
- Supabase project (Free during the build; Pro before launch).
- Stripe (test mode during the build).
- PostHog, Resend, Sentry (free tiers).
- Domain name.
- The builder asks Claudia when it needs one of these, says exactly which keys to copy into the environment variables, and never handles passwords or card details.

## 22. Change log

| Version | Date | What changed |
|---|---|---|
| v1.1 | 13 Nov 2026 | Four districts (Top End removed for now). Simulation on the server for both modes. Real years with MLA prices and SILO weather. New job times. Farm hands and contractor fencing. Sheep and wool. Homestead, yards, buildings, gate types, feed as stock. Grazing plans in both modes with the worker report and plan card. 2 + 2 farms free. One-off purchases and paying to keep going in place of the subscription. Minimum age 14 |
| v0.1 | 13 Nov 2026 | First draft: product, stack, costs, phases |
| v1.0 | 13 Nov 2026 | Ready to build: defaults set for every open question, first-time experience, accessibility, sharing, errors and offline, saves, data deletion, environments, accounts Claudia sets up |
| v0.3 | 13 Nov 2026 | Speed targets (Lighthouse 100), phone landscape layout and wide farms, no saleyard or feedlot on the map, readable render styles with level of detail, ticker on website pages only, ads in a different spot per page, separate website and game headers on PC, light and dark themes, game panels shown in mockups |
| v0.2 | 13 Nov 2026 | Added Daily Farm and Fast Farm, daylight work budget, job times, guests and under 16 rules, full community spec (profiles, feed, day cards, ticker, farm viewing, groups), in-house ad slots, admin back end with switches, notifications, data model, server functions, build stages, visual direction with references, mockups |
