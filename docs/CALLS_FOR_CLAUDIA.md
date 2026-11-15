# Calls for Claudia: everything decided for you during the build

This is the one list of every call made on your behalf, so you can rule on them in one sitting. It was written from `docs/DEVELOPMENT_LOG.md`, `docs/BUILD_PLAN.md`, `docs/PRD.md` section 21, `docs/GRASS_QUALITY_REVIEW.md`, `docs/SHEEP_BENCHMARKS.md`, `docs/CALIBRATION.md`, `docs/DATA.md`, `docs/LESSONS.md` and `.env.example`. Where the log and another document differ, the log entry is the later record and is the one used.

How to read it:

- Each item says what the call was, why it was made and what the other choice is, and where it is easy to change.
- "Recommended:" appears only where the builder gave a recommendation in the log. Where it is missing, the log recorded the default that was built and asked for your ruling, with no recommendation.
- Ids in square brackets trace an item back to the log. For example `[m2.3 call 18]` is call 18 in the "m2.3 Sheep model" entry, and `[C18]` is the sheep benchmark question number used in `docs/SHEEP_BENCHMARKS.md`.
- Nothing was stopped for a question. Every open question was built at the default in `docs/PRD.md` section 21, or at the builder's default where the PRD had none.

## Summary

### What is built

- The grass and cattle model, proven against the MVP for the same inputs, with every benchmark in `docs/CALIBRATION.md` as an automated test. Four districts: Central Queensland, Northern Tablelands, Central West NSW and Western Victoria.
- Real years (SILO weather and MLA prices from 1997) or random seasons. Sale days, the working day, grazing plans, farm hands and contractor fencing, crops, the market, scores and the diary.
- Sheep (Merino and crossbred) in the three southern districts, with a wool and sheep market, netting fence, shearing and crutching.
- The PixiJS map and all the play screens for phone upright, phone on its side and PC. Help, a guided first day, install to the home screen and offline viewing of the last farm.
- Accounts, sign-in, database saves, the admin area, Daily Farm, notifications, leaderboards, groups, challenges, profiles, posts, the ticker, farm viewing and moderation.
- Ad slots, house ads and sponsor reports. One-off purchases through Stripe Checkout and paying to keep going.
- The public website: home, pricing, advertise, about, privacy, terms, community rules.
- Milestones 5.3 (dashboard and analytics) and 5.5 (launch check) are still being built. They are not covered here.

### What is switched off, and why

Everything that needs a key, an outside account or your ruling is built and held behind a feature switch or a missing key. With no keys the game plays as a guest on farm files.

- **Daily Farm:** off. The PRD table 11.7 says on. It is off because you said off by default and because its live data feed has never been run (items in Daily Farm).
- **Sheep:** off. Sheep are held back until you rule on the open sheep winter and money gaps (items in Sheep).
- **Community and its parts, ads, every ad slot, purchases, maintenance mode:** off, as in PRD 11.7.
- **AdSense:** nothing is wired. It needs your own AdSense account and a consent banner.
- **Sign-ups, Fast Farm, leaderboards and push notifications:** on, as in PRD 11.7. Push sends nothing until the push keys exist.
- **Website sections** about features that are off are hidden. They read `SITE_SWITCHES_ON` when the site is built.

### The rulings that matter most

1. **Calves, cows and the grass.** Calves grow slower than published figures. Cows now milk off their backs and fewer get back in calf. The Tablelands winter feed is too poor for ewes and dry cows. The grass review recommends three sourced changes and asks six questions. These change how the game plays more than anything else (Cattle and grass items on grass, calves and steer bands).
2. **When a cow shows as in calf.** The game uses 50 days, the day the price pays the premium. Agriculture Victoria says about 42 days. Moving to 42 changes sale values (first item in Cattle and grass).
3. **Sheep.** Whether to switch sheep on, and how to settle the Tablelands winter, ewe deaths, wool price and the margin gaps (Sheep).
4. **Daily Farm.** Whether to switch it on, with real data running 5 days behind the real date, and how missed days work (Daily Farm).
5. **Legal and privacy risk.** A lawyer has not read the privacy page, terms or community rules. Buying age is set at 18. A refused under-14 can retry with a new email. A ban record survives a deleted account. Analytics run only with consent. Admins cannot read dates of birth (Website, Accounts and privacy, Purchases).
6. **Money.** The rescue (paying to keep going) sets cash to the hard-difficulty starting cash. Refunds after a rescue do not undo it. Keep-going prices under 6 months are not set (Purchases).

## 1. Needs your ruling

### Cattle and grass

**1. When a cow shows as PTIC.** The record and the price both use 50 days in calf. Agriculture Victoria gives reliable palpation from about 6 weeks (42 days). Moving both to 42 changes sale values against the MVP. Change: `PTIC_DAYS` and the premium's `fromDays`. [m1.7f second pass Q1]

**2. Booked cows are paid the PTIC premium on sale day.** A cow booked in "Cows" who reaches 50 days in calf by the sale day is paid the premium. The price is set on the sale day by the record, not at booking. [m1.7f third pass, coordinator call 3]

**3. Late pregnancy shows.** Cows more than 190 days in calf add 10% to AE and give a "late pregnancy" reason on the mob card. A grazier can usually see it by then. [m1.7f second pass Q2]

**4. Joining counts follow the record.** The "ready to join" counts follow what is on the record. A note can stay silent when every female is in calf but under 50 days. This is a small give-away that was accepted. [m1.7f third pass]

**5. Herds calve November to March in every district.** The start herd has PTIC cows 100 to 210 days in calf on whatever day the farm starts, so a 1 September start calves from late November. Central Queensland usually calves in the wet. Western Victoria calves in autumn, spring or both. No source was read for the Tablelands or Central West. A May start calves August to November and gives much thinner Tablelands cows. Change: a calving window per district in `startHerd` and the `ptic` and `cowCalf` sale classes, then rerun the herd benchmarks. [m2.5 call 5]

**6. Cows milk off their backs.** On poor feed a cow keeps milking, gets thin and fewer get back in calf. Over three years with no action, calves per 100 cows fall to about 55 in Central Queensland and on the Tablelands. A player can lick, hay, wean early or sell. The mob card says "milking" but does not say her condition is falling because of it. A "cows getting thin" line in Things to do was not built. [m2.5 call 1]

**7. Milk falls with condition (stand-in).** Full milk at CS 2.25, none at CS 1.5. No published figure was found. 2.5 and 1.6, 3.0 and 1.8, and 2.25 and 1.5 all keep every herd benchmark in band. With no fall at all, Tablelands herd deaths are 4.4% against a band of 1.5 to 3.6%. Change: `MILK` in `packages/engine/src/data/cattle.ts`. [m2.5 call 2]

**8. Calf cost of gain.** Stock under 100 kg pay 0.52 MJ per kg of live weight to the 0.75 for each kg gained, moving to the MVP figure by 200 kg. It comes from Holstein calves in Japan on milk and concentrate. The CSIRO 2007 nutrient requirements book would settle it. Change: `YOUNG_GAIN_COST`. [m2.5 call 3]

**9. Calf rows stay open.** Weight at 100 days passes everywhere. Daily gain and weight at 200 days are open in the southern districts, and daily gain in Central Queensland. The grass looks like the binding limit, and the milk rule holds the rest. The next step proposed is a look at the milk rule. See "Known gaps in realism". [m2.5 call 4, grass review question 6]

**10. Herd figures that moved with the calf fix.** Herd gain a head rose 5 to 15 kg. Central West's worst single herd lost 3.85% (was 3.37). Tablelands preg tests run 7.17 points over the expected rate (band up to 9). All stay in band. [m2.5 call 6]

**11. Grass review, question 1: the steer bands.** None of the steer bands has an outside source. The recommended package puts Tablelands steers at 126 kg and Central West at 143 kg, over bands of 90 to 105 and 115 to 130. Keep the bands and tune something else, or replace them with sourced figures. Change: the band constants in `calibration/steers.test.ts`. Recommended: the review found no sourced steer gains by district, so it asks for your ruling and gives no pick. [grass review, ruling 1]

**12. Grass review, question 2: Tablelands native pasture.** Should "native" there mean red grass with winter-active natives (microlaena, wallaby grass) as the district list says, or pure red grass with winter green only on sown paddocks? Recommended: give the native pasture its winter-active natives (winter growth from PROGRAZE's microlaena curve and half the frost loss). [grass review, ruling 2]

**13. Grass review, question 3: intake on poor feed.** Accept the measured Central Queensland intake (1.4 to 1.5% of live weight at 49 to 51% digestibility) as the target for every district? The game gives 1.0 to 1.2%. Recommended: raise intake at 50% digestibility from about 1.1% to about 1.4% of live weight for a dry cow. [grass review, ruling 3]

**14. Grass review, question 4: carrying capacity.** Accept published 5 DSE/ha for unimproved Tablelands native and 12 to 17.5 for sown as targets, and raise the safe-use share to fit? The game gives 3.5 on Tablelands native and 5.5 to 7.7 on sown. Recommended: a separate decision after the three grass changes. Raise the share of growth eaten, give sown pasture its own share and growth in the paddock figure, and add the published figures as benchmarks. [grass review, ruling 4; sheep C18]

**15. Grass review, question 5: Central West peak digestibility.** It was tuned from 0.70 to 0.68 to fit the steer band. With the package in, should it go back toward 0.70? [grass review, ruling 5; m1.3]

**16. Grass review, question 6: calves and the milk rule.** The grass is not what holds calves back. Look at the milk rule next as separate work? [grass review, ruling 6]

**17. Grass review: dead feed quality.** The game's dead feed is 50% digestible all year (51% in Western Victoria). PROGRAZE assumes 47% (45% tropical). Recommended: set dead feed to 47% (45% in Central Queensland) and slow the summer breakdown of standing dead feed to about half gone by autumn. [grass review, recommendation 2]

**18. How a benchmark is judged.** The build plan fails any average-or-better year outside its band. The model cannot meet that as written. The tests hold bands on the average of twelve blocks, accept Central Queensland with lick up to 2 kg over the top, hold the oats figures to one fortnight and count herd deaths over all herds together. These are marked "proposed" in the tests and in `docs/CALIBRATION.md`. Change: the judging rule in `docs/CALIBRATION.md` and the calibration tests. [m1.3, CALIBRATION "How a benchmark is judged"]

**19. Other calibration questions.** `docs/CALIBRATION.md` lists ten more questions from milestone 1.3 and further "CHECK" items from real years (CHECK 8 to 10). They are not repeated here. [m1.3, m1.4 realism check]

**20. Real data pulled: yards and grid points.** The brief named Emerald, Inverell and Ballarat as fill-in yards. Are they right? Armidale's own history is long, so Inverell may not be needed. Are the four SILO grid points where each district's weather should come from? They came from the brief and were not checked on a map. Should the rest of the MLA pull (6 to 9 more hours) run in full or only for what is needed? [m1.4a Q1 to Q3]

**21. Soil water.** One soil of 100 mm for all four districts, chosen against AussieGRASS. The comparison leans to a smaller soil for Western Victoria and a larger one for Central Queensland. Should each district have its own, and what water-holding figures would you trust? [m1.4b Q1]

**22. Growth ceiling.** Rain out of season lifts growth to at most 1.9 times the curve for the time of year, so a wet Central Queensland winter and spring (1998, 2022) grows little. About a third of Central Queensland days sit at the ceiling. Raising it for native pasture only is possible. [m1.4b Q2]

**23. Starting after a dry time.** Should a farm starting 1 January 2003 start on the pasture the 2002 season left, or on the lifted run-up (at least 85% of average) as built? [m1.4b Q3]

**24. Years at random and in order.** Is the farm's anniversary the right place to change year? Should the first year be picked or a surprise? After the newest year, go back to 1997 (built) or stop? [m1.4b Q4 and Q5]

**25. Season labels.** Six labels from the MVP, set by the last 12 months' growth (under 60% of average is "Drought"). Are the edges right, and is "Drought" a fair word? Should the label lean on the last few months? [m1.4b Q6, m1.4 Q10]

**26. District variation.** Western Victoria varies least (year factors 0.71 to 1.25). Western Victoria never drops under its steer band, even from April 2006. Central West with nothing done loses 5 to 54% of set-stocked weaners in its four worst years. Do these look right? Check the dry and wet year tables in `docs/CALIBRATION.md`, Central West from April 2002, 2006, 2018 and 2019 first. [m1.4b Q7 and Q8, m1.4 Q7 to Q9]

**27. Real prices: class mapping.** Each class is on an MLA indicator. Weaners are 1.08 times the restocker yearling figure, heifers of 280 kg and over use the feeder heifer figure, and bulls are 0.906 of the cow price. Change: the mapping in `market/realPrices.ts` and `DATA.md` "Real prices: indicators to classes". [m1.4 Q1]

**28. Yard price or national price.** A yard's own weekly figure jumps about. Built: the yard's figure where it has enough rows, else the national figure times the yard's usual premium. The other choice is the yard's figure as it is. [m1.4 Q2]

**29. Thin yard histories.** Western Victoria young cattle play on national prices because Mortlake's rows are too thin (is Ballarat wanted?). Central Queensland before October 2014 and Western Victoria before 2018 play on national prices times the yard's later premium (are Emerald and Ballarat wanted?). [m1.4 Q3 and Q4]

**30. Today's dollars.** Past prices are lifted by the CPI so a 1997 sale reads about 200 c/kg, not 90. "Today" is fixed at the September quarter 2026. The other choice is the prices of the day with costs left at today's level. Change: `REAL_PRICE_DOLLARS`. Whether to use a different quarter and whether a farm starting in 1997 can pay its way are also open. [m1.4 Q5, realism check CHECK 8 to 10]

**31. Sale days where there are no records.** Mondays at Gracemere from 1997 to 1999 and 2004 to 2014, and at Mortlake before 2018. No sale from 16 December to 7 January. Do you know the days those yards really sold? [m1.4 Q6]

**32. A 366-day year.** A real leap year costs one more day of overheads. Leave it? [m1.4 Q11]

**33. Moving a running farm to new data.** A new data pull stops every running real-year farm. How data versions should work once Daily Farm fetches data every day is open. How the 1 July "new season" message should read on a real-year farm is also open. [m1.4 realism check]

**34. Working day: what "500 m a working day" means.** A working day is that day's light, so a full day of permanent fence is 500 m in June and in December, and other jobs come off it. The other choice is a pace by the hour. Change: `data/jobTimes.ts`. [m1.5a Q1]

**35. Fence building rules.** A line is built one map-square side at a time, so on a big farm a day can be one 340 m segment. A job longer than the day's light is done at first light and takes the whole day. The bank must cover the whole line as drawn, though only today's part is built. Should permanent fence scale with the farm? Electric fence is 1 km an hour (built) while the mockup shows 150 m an hour. [m1.5a Q2 to Q5, second review (b)]

**36. Times for taking things out and for gates.** Taking out takes as long as putting in (a gate 1 h, a trough or hub 3 h, moving a fixed trough 3 h). Opening or shutting a gate and buying take none of the day. [m1.5a Q6, Q7, Q11]

**37. Husbandry times.** Marking is 2 min per calf (every calf at foot counted), weaning 30 min plus 0.5 min a head (every head), selling 60 min plus 1 min per 10 head (calves at foot counted). No mustering time. A switch to a supplement takes none of the day. [m1.5a Q8 to Q10, second review (a)]

**38. Skips and evening.** A skip started part-way through a year stops at the year's end. A month is 30 days. The farm is lit as evening when less than 15 minutes of light is left. The red part of a line and the "uses the rest of the day" flag are built as one thing. [m1.5a Q12 to Q14]

**39. Things to do.** It lists five kinds of fact. Should it also list a crop to lock up or grain shedding, no bull with the cows, a sowing window open or low condition? These were left off as closer to advice than a job. [m1.5a Q15, second review (c)]

**40. Sale days and delivery.** Built: buying only on a sale day, with the next one named. Stock arrive in the yards at first light the next day. Cattle in the yards have water and the yards' own grazing but no hay. Weekdays for farms not on real years are Central Queensland Wednesday, Tablelands Thursday, Central West Thursday and Western Victoria Monday. The other choices are buying any day, no yard feed rule and different weekdays. [m1.5b Q1, Q3, Q4]

**41. Booking a sale.** On a day with no sale, stock is booked onto the next one and sold at first light that day at that day's price. It can be cancelled. The other choice is selling only on the sale day. [m1.5b Q2]

**42. Grazing plans: joining and daylight.** A plan that reaches a paddock with another mob joins the two (the bigger keeps its name). The other way keeps them apart, so a plan waits. Plan moves take none of the day's light (as in the old game). PRD 5.15 proposed they use daylight. [m1.5c Q1 and Q2]

**43. Plans: setting, editing and hand moves.** Setting or resuming a plan costs the ordinary move time if the mob has to be moved. Editing a plan resets the round and waiting state of the other mobs on it. A move by hand pauses a plan (the old game ended it). A move to the feedlot ends it. [m1.5c Q3 to Q6]

**44. Plan limits.** Up to 8 legs, 30 stops in a leg, 20 plans, 0.25 to 60 days, 300 to 5,000 kg DM/ha. The old game had none and clamped low figures up. Here a low figure is refused with the reason. Change: `DATA.md`. [m1.5c Q7]

**45. Map: big mobs and where mobs stand.** A big mob in a big paddock is drawn as a sample (a marker with the true count and up to three cattle a square on four squares in ten). A mob stands round the square it was put on, usually the trough. Should it follow where the model says it grazed lately, or should every beast be drawn? [m1.6a Q1 and Q2]

**46. Map: how it looks.** Grass at 90 cm is drawn about twice a cow's height so height reads. Cattle colours are by district and class. A pale rim keeps a black cow readable on dark ground. Labels use the full paddock name and a dot. Trees are not drawn because the model has no shade. Do you want trees back as decoration? [m1.6a Q3 to Q7]

**47. Colours: red means one thing.** Red on the map picture is only for the part of a line that does not fit today. A knocked-down fence is amber, no water is purple, a hub tool no-water key is purple, a team fence is hot pink. The site's panels keep red (the main button, the Short chip, the chart). The profit marker, not yet built, must not be red on the map. The "Short" label is the same colour as danger. [m1.7f call 6, second pass Q4 and Q5, m1.7f coordinator calls 1 and 2, m1.6a note]

**48. Play screen: setup and start.** Setup has no start month, so every farm starts 1 September (random seasons start in 2026, real years from 1997). Should the player pick? [m1.7a Q1]

**49. Marking calves.** The banner counts bull calves of 60 days or more but the job marks every bull calf and young bull in the mob. Should the job mark only the ones old enough? [m1.7a Q2, m1.7b Q4]

**50. Phone panels and dusk.** On a phone held upright the paddock sheet covers the bottom 58% of the map. The map goes dark as soon as less light is left than the shortest job needs. [m1.7a Q3 and Q4]

**51. Mob card words.** The "why" note shows for any mob under +0.05 kg/head/day, not only a mob losing weight. The sell picker offers Steers, Heifers and Cows (calves go with their mothers). The cards show exact figures (cattle with no water die on the fourth day, the milking MJ a day, "week N of 9"). Are exact figures right, or should they be vaguer (project rule 14)? [m1.7b Q1 to Q3]

**52. Build tools.** The fence tool starts on permanent. No tool zooms the map by itself, so pipe on a phone needs a pinch first. The gate sentence says mobs in them will join if both hold stock. Removing a fence gives nothing back. [m1.7c Q1 to Q4, m1.7f items 8 and 9]

**53. Market, plans and crops screens.** $ a head uses the middle of each class's sale weight range. Births fill the inbox in calving season (one line a day). The plan card says "Moves into Paddock 2 after 2 more days here", which is the plan's own rule and not a forecast. The sow cards name squares that cannot take a crop but the map does not mark them red. [m1.7d Q1 to Q4]

**54. Fence materials and hubs.** Taken-down fence is kept as materials, and reused fence is half price (your ruling). Materials on hand count for nothing in net worth. Fence built over by another kind is lost. Taking out a hub on a square leaves the gates. Moving a hub costs $300. [m1.7x Q1 to Q4, m1.7f second pass Q3]

**55. Unused farms removed after 90 days.** A farm file not used for 90 days is removed (the session cookie also lasts 90 days). Change: `FARM_STALE_DAYS`. [m1.7f Q4 and second pass Q6]

**56. Help and the guided first day.** The tour strip sits above the map. A step done early counts. The move step is dropped on a farm with no cattle now. Help is a bottom sheet on a phone so the map stays visible. An existing farm a day or more old gets no tour until replayed. [m1.7e calls, m1.8 calls]

**57. Install and offline.** The service worker starts 8 seconds after `/play` loads. It keeps only `/` and `/play`. The offline last-farm copy was per browser, and is per player once accounts are on. Change: `PwaRegister` delay in `apps/web`. [m1.8 calls, m3.2 build item 7]

**58. Stored farm size.** The stored farm is 191 KB at the start and 339 KB after about 1.5 years. The build plan said "a few tens of KB". [m1.8 calls]

### Sheep

All sheep screens are behind the `sheep` switch, off by default. Never offered in Central Queensland.

**59. The Tablelands winter.** Unfed ewes on native pasture lamb at CS 1.4 and 31.7% die (eight seeds), whatever the stocking rate. Marking is 48.8% there and 71.1% in the Central West. The grass model was not changed. Three fixes are open: the grass winter (see the grass review), a sheep supplement, or running the benchmark on sown pasture. [m2.3 calls 1 and 18, C18]

**60. Carrying capacity.** The rule gives 3.55 DSE/ha on Tablelands native and 5.5 to 7.7 on sown pasture against 5 and 12 to 23 sourced. The rule's 26% of growth eaten is far under what improved pasture really carries (45 to 80%). SB-59 to SB-62 are skipped for this. [m2.3 call 2, C18]

**61. One DSE figure: 8.4 per AE.** Every DSE shown is AE times 8.4. The cattle screens' DSE figures moved by 5%. To go back, set `DSE_PER_AE` to 8. [m2.3 call 3 (C3), second pass call 19]

**62. Merinos are unmulesed.** 17% of Merino ewes are struck a year with one shearing and one crutch. For mulesed Merinos lower `FLYSTRIKE.daily.merino`. Strikes apply to every weaned sheep, though only ewes were measured. The fly season is the same in every district because no district page was read. A ewe struck twice counts twice. [m2.3 call 4 (C21), calls 31 and 42]

**63. Netting fence: $10 a metre.** A stand-in for the sheep-proof fence price. SB-65 holds netting $10 against permanent $7. Change: the fence price constant in the engine. [m2.3 call 5 (C26), call 27]

**64. Joining dates.** Central West 5 January (June lambing), Tablelands 7 April (September lambing), Western Victoria 1 April. The NSW calendar's generic March joining was not used. Each mob keeps its own date. Change: `JOIN_START`. [m2.3 call 6 (C27), second pass call 22]

**65. No water days for sheep.** No source gives how long a sheep lives without water, so the cattle rule stands (dead on day 4). The transport standard's 48 hours is kept as `WATER_WELFARE_HOURS` for screens. [m2.3 call 7 (C30)]

**66. Dressing percentage and fat score.** Sourced now (lambs 45 to 50%, mutton by fat score, table dated 2001). Fat score is taken as CS rounded (stand-in). [m2.3 call 8 (C31)]

**67. Worms left out.** Western Victoria weaners grown to target lose 1.65% a year, under SB-47's 2 to 6% (the survey figure takes in worm deaths). Held as a known gap of 0.4 points. [m2.3 call 9 (C22)]

**68. Two lamb survival tables disagree.** S19's table gives 48% more lambs at CS 3.0 to 3.5 than 2.0 to 2.5, the text says 15 to 20%. The slopes sit between them. Please check the printed page. Change: `SURVIVAL_PER_CS`. [m2.3 call 10 (C32)]

**69. Dead feed in the sheep's reach counts in full.** As for cattle. A quarter (the first build) starved sheep on dry winter feed. [m2.3 call 11]

**70. No chores for the sheep life cycle.** Rams work only in the 5 joining weeks. Scanning is counted on day 80. Ram lambs become wethers at the marking count. Lambs wean at 14 weeks into an empty watered paddock. All automatic. [m2.3 call 12]

**71. Breakouts across species.** Cattle never push into a paddock with sheep and sheep never into one with cattle. They take another fence or stay. The other choice was letting them box up together. Sheep get through permanent, electric and tape fences when hungry or thirsty. Only netting, gates and the boundary hold them. A cattle fence says "A cattle fence does not hold sheep." on a sheep farm. Whether gates should hold sheep is the builder's call. [m2.3 calls 15, 20, 21, m2.7 review note 12]

**72. Sheep in the year score.** Sheep deaths score by size, (live weight divided by 450) to the 0.75 AE a death, so a lamb is about 0.03 of a beast and a ewe 0.2. Cattle still count one each. A dead newborn calf costs 60 points, a ewe about 11.6 and a newborn lamb 1.9. Weighing cattle deaths by size would change every cattle score. [m2.3 calls 13, 25, 32, m2.7 review call 1]

**73. Ewe deaths.** Adult and wether deaths are 0.91% a year (derived). First-cross ewes die 4.95, 5.36 and 5.35% against 2 to 4%. Merino adult deaths miss in some blocks. Old ewes die at the same rate as young ones and are cast for age only if the player sells them. See "Known gaps in realism". [m2.3 calls 14, 28 to 30, 33, review calls 2 and 5]

**74. Shearing, crutching and shed costs.** Crutch 60 days before lambing, shear 80 days after (NSW calendar). Shearing is $9.81 a head all in, crutching $1.92 a head, from the DPIRD budget as read in search summaries. Shed hands, classer and presser are not separately charged. [m2.3 call 23, review items 13 and 14]

**75. Wool income and price.** Wool income is its own line. Wool sells by itself at shearing. The wool price is a dated September 2026 stand-in on every farm because there is no real-year wool series (an AWEX agreement is not in place). It is why Tablelands and Western Victoria sit over the margin band. [m2.3 call 24, review call 6, PRD 21 row 27]

**76. Wool selling costs.** Shed staff $1.50 a head (not charged since 0.17.0), levy 1.5%, $40 a bale selling, $16 cartage, $14 pack, 180 kg bales, oddments 22% of the clip at 0.9 of the fleece price. The pages refused automatic reading. [m2.3 call 40]

**77. Sheep feeding.** Feeding fills the energy gap up to Agriculture Victoria's full ration. Grain is charged at the game's pellet price and hay at its hay price. The Tablelands winter costs about $19.76 a ewe a year in feed at $330 a tonne. [m2.3 calls 26 and 34]

**78. Ewe micron 17.8.** The coarsest that keeps SB-51's 1-micron gap, since the districts grow medium wool. C15 says the districts grow 19 to 21 micron, but SB-52 holds wethers at 18 to 20. Ewes at 19 need one of those rows to move. Which row moves is your call. [m2.3 call 35, review call 4]

**79. Sheep in net worth.** Wool on backs counts in net worth net of the levy and the cost to shear. Lambs at foot are priced on their own (MLA lamb indicators) because MLA has no ewe-and-lamb unit. Sheep on their way count at what was paid. [m2.3 calls 36 and 37, review item 3]

**80. Overdraft and sheep costs.** Past the overdraft a day's sheep costs come off cash as cattle supplements do, and the bank's limit ends the game. Buying sheep is refused. [m2.3 call 38]

**81. Start flock.** Ewes 1.5 to 5.5 years, cast for age at 6 (stand-in). This year's wether lambs are counted as sold before the start. Start-flock first-year profit per DSE is a known gap (see Known gaps). [m2.3 calls 39 and 43]

**82. Sheep plan moves.** Several plan moves a day move sheep once a day. [m2.3 call 41]

**83. Thirsty sheep.** Sheep get out by the cattle rule (the cattle odds, then a 21-day wait). One that breaks into another dry paddock can still die before its next try. [m2.7 review call 8]

**84. DSE a ewe.** The model's DSE from energy is 1.6 to 2.0 a ewe joined. The DPIRD budget rates 2.32. A screen showing "per DSE" on the model's figure reads 20 to 45% higher than budgets. [m2.7 review call 5]

**85. The margin band (SB-GM).** The band is plus or minus 25% of DPIRD's $50.46 a DSE. It is the builder's choice. A tighter band would test the price date. Whether cattle against sheep should become a managed benchmark is open (unmanaged year 2: Western Victoria cattle minus $96 and sheep plus $101 a DSE, Central West minus $97 and plus $59). [m2.7 review calls 9 and 10]

**86. Sheep and cattle rules stay apart.** The calf fix does not apply to lambs. Sheep have their own cost of gain and milk, fitted to the sheep benchmarks. If a lamb growth row ever opens, look at the sheep rules. [m2.7 call 1]

**87. Weaners on a mixed farm.** Weaners go where the other species is not, because of the one-mob-a-paddock rule. A mixed farm's weaning destinations depend on where the cattle are. [m2.7 call 4]

**88. A neglected mixed farm.** On the probe farm (Western Victoria, 86 cattle and 659 sheep, left alone) 579 sheep died in two years, mostly lambs, and profit fell from $192,435 to $25,757. Year 1 counts its lamb crop as new worth. This is what neglect looks like, not a benchmark. [m2.7 call 3]

**89. Sheep screens: switch and display rules.** A farm that already has sheep keeps showing them if the switch goes off. The farm view version stays 4. Sheep part moves are one class at a time. Sheep sell on a sale day only. Only the shearing day can be moved on screen. The summary's Head, Calves and Live weight rows stay the cattle's. Paddock "days of feed" counts cattle only. The start flock text is general. Gain shows in g a head a day for sheep. [m2.8 calls 1 to 9]

**90. Sheep calls with no other home.** Sheep have no overhead costs by the year, marking has no cost, freight beyond the $3 head fee and pasture are not charged, animal health is $3.57 a head. [m2.3 call 17, review call 7]

### Farm hands and contractors

**91. A hand's share: about 500 m or 800 m a day.** On 13 Nov you said both "about 800 m a day instead of 500 m" with a hand on, and a worker's share of "about 500 m". A 500 m share means player plus hand build 1,000 m. 800 m a day means the hand's share is about 300 m. Built: 800 m (share about 300 m). Change: `handDayShare` in `packages/engine/src/data/labour.ts` (0.6 now, 1 for a 500 m share). [m2.1 call 1]

**92. Hands help on every kind of job.** By the skill the job needs, not only fence. To limit to fence, `skillFor` in `labour/help.ts` returns null for other jobs. Hands help a team whenever the farm has a hand, with no switch, because a checkbox is one more thing to decide. [m2.1 call 2, m2.2 call 2]

**93. No overwork limit.** Hands leave only when let go, when a contract ends or when not paid. [m2.1 call 3]

**94. Contractor labour is $5 a metre (stand-in).** Either team costs the same. Price guides list installed rural fence at about $8 to $25 a metre with materials at $7. Please give a contractor's quote. Change: `labourPerMetre`. [m2.1 call 4, m2.2 call 3]

**95. Contractor days.** They start the next working day and work Monday to Friday (`contractorDays`). The bank must cover the whole run when ordered. "Done on" is at the team's pace without hands. A contractor's run is the one job that carries on day to day. [m2.1 calls 5 to 7]

**96. Pay.** Pay day every 14 days. Casual hands are paid the casual day rate for days worked, contract hands the weekly rate over 5 days, salaried hands the weekly rate. Weekend penalties, overtime, leave and allowances are not modelled. Notice on letting go is not modelled. Wages are 2026 Pastoral Award rates (1 July 2026 guide) on every farm, which match prices only under `REAL_PRICE_DOLLARS = 'today'`. [m2.1 calls 8 to 10, 18]

**97. Wages owed.** Wages the farm cannot pay are kept as wages owed, never forgiven. The hand still leaves and the standing still drops. The debt is paid in full at the first first light the bank covers all of it. [m2.1 call 15]

**98. Injury.** 1.5 times likelier on a fencing day. The farm pays one week of the hand's wages as its share of a claim. Safe Work Australia's rate for agriculture is sourced. No workers compensation premium is charged. [m2.1 call 11]

**99. Standing and the pool.** Standing starts at 80, loses 20 per missed wage, gains 5 per full pay day. At 0 the list keeps 40% of its people and asks 20% above the award. The pool adds 1 to 3 people a week, listed 14 to 42 days, at most 6 hands. All stand-ins. Standing shows to players as a level (Top, High, Middling, Low, Very low). [m2.1 call 12, m2.2 call 4]

**100. Skips and hiring days.** A skip does not stop for anything about the workforce. A hand hired today starts tomorrow. Change: add events to `stopsIn` in `day/days.ts`. [m2.1 calls 13 and 14, m2.2 call 9]

**101. Dogs.** A hand with dogs takes a 2.5 divided by 1.5 bigger share of stock jobs. With walking and mustering cut, they make nothing else quicker. Keep dogs as a stat, or drop them? [m2.1 call 16]

**102. Lick-run duty not built.** There is no lick-run job to hand over. A supplement is a daily price in Fast Farm. The duty and the "feeding and machinery" skill can come with Daily Farm feeders. [m2.1 call 17]

**103. Plan moves in the worker report.** Credited to the hand who worked that day. A move on a day no hand worked is not in the report. [m2.1 call 19]

**104. Workforce screens.** The mockup has no workforce screens, so they were built in the existing style. The worker report is a modal at the start of the day summary, capped at 24 bubbles, with repeats merged. The owed-wages line only offers "See workforce". There is no "started" message. Every working day of a run is an inbox line. Pay "about $X each pay day, with super" is the full week cost over 14 days. [m2.2 calls 1, 5 to 8]

**105. Teams and colours.** A team is offered on permanent fence only. The team's line is hot pink `#ff5cc8` with a cross-tick pattern, since the map has no key. The contract's spend shows in the cash change only, not the money list. [m2.2 calls 10 to 12]

### Scores and leaderboards

**106. Year score and the Grazier Score.** The headline is the engine's year score from five parts (Profit, Weight gain, Pasture use, Ground cover, Deaths). The PRD's Grazier Score has no agreed weights, so it is not shown. Change: `headline` in `server/boards/score.ts`, and the labels in `YearBlocks.tsx` and `MorePanel.tsx`. [m1.7g call 1, m4 call 1]

**107. Parts show points.** The year score shows each part's points beside its facts as the mockup does, so a player could work the weights back. Part scores are rounded one by one, so the five can differ from the total by a point. Kept for now. [m1.7g calls 11 and 14]

**108. Game over card.** It counts the year under way as a last year, so the total adds every score earned. The part year's score is as if it closed that day. [m1.7g call 10, call 13]

**109. Diary rules.** The diary keeps the last 400 days (`DIARY_DAYS`). Day numbers count from Day 1 (the farm's own day starts at 0). A real-year farm titles a year "Year 3 · 1997". Births and deaths are left out of the day summary because the inbox says them. A job's own inbox messages are not filed, the result line is. Money rows on a year are signed. [m1.7g calls 4 and 6 to 9, 12]

**110. Leaderboard headline.** The headline board ranks the year score averaged over a farm's finished years. The page says it is a stand-in. [m4 call 1]

**111. Other boards.** Profit per ha is the average yearly change in net worth per ha. "Beef per ha" is the average yearly live-weight gain per ha. Ground cover is the average of yearly averages. Days survived is the farm's day. [m4 call 2]

**112. Real-year board.** It ranks on the change in net worth over that game year, per hectare, so a farm that started small and grew a lot beats one that started big and grew a little. [m4 call 3]

**113. Period boards.** A week, month or season board lists farms that closed a year in that period, each with its figure over all its finished years. Periods are by Sydney time. [m4 call 4]

**114. Action log check.** What the tables allow: at least one day or skip run by the server, no step after the farm's day, no gap in the numbering. No replay. [m4 call 5]

**115. Private and under-16 rows.** They show on the main boards (username and district only) but not on a group or friends board. A banned or deleted account shows as "Former player". A block hides both ways, including on boards. [m4 call 6, m3.1 calls 11 and 12]

**116. Boards not linked.** Leaderboards are not in the header or sitemap yet. The community pages link to it. The boards page cannot show the leaderboard banner ad because it sends no script. [m4 call 15, m6]

### Daily Farm

Daily Farm is off by default (the switch `daily_farm`).

**117. Off by default.** The brief says off. PRD 11.7 says on. Flip it in admin or with `update public.feature_switches set enabled = true where key = 'daily_farm'`. [m3.3 call 1 and second pass]

**118. Data runs 5 days behind.** Game day D runs on the real weather and prices of D minus 5. This lets the night run at midnight on settled data and a late feed never holds a farm. Missing rows use long-term average rain and the last price carried forward, with a diary line. The Help page says so. Change: `DAILY_DATA_LAG_DAYS`. The lag of 5 rests on the repo's own pull, not a SILO figure. [m3.3 second pass call 3]

**119. A new farm starts on today as Day 1.** There is no run-up with stock. The pasture is run up as a Fast Farm's start does it. [m3.3 second pass item 6]

**120. Plan moves with no hand.** With no hand working that day the plan is held for the night and the plan card offers the move ("Yes", "Not yet"). "Yes" uses `planMove`, takes the ordinary move time and keeps the plan's rounds. [m3.3 call 5, second pass item 2]

**121. A missed day.** A night after a date the player never opened the farm on. Opening and doing nothing counts as playing. A missed day runs with no jobs but the hands' standing duties and plan moves a working hand makes. [m3.3 calls 6]

**122. Done for today.** A fact on the farm card and the picker. It does not skip, end or lock anything. [m3.3 call 7]

**123. Sale days past the tables.** Real rows are used where they exist, with the district's usual weekly sale after them until real yardings are fetched. SILO's provisional days (code 75) are used as served and never revised. [m3.3 calls 8 and 9, second pass item 10]

**124. Time zone.** Taken from the device once and locked. Eight zones are supported (the launch districts' Brisbane, Sydney and Melbourne, other Australian zones, Auckland). A device in another zone cannot start a Daily Farm. A change function exists (once every 30 days, a later date makes the farm wait a day) but no screen offers it. [m3.3 call 10, second pass, m3.1 call 20]

**125. Slots and plan setup.** 2 Daily Farms for each account, counted apart from the 2 Fast Farms. The plan setup screen does not yet say "you have no staff, so you will need to remember to move them". The data version label is `daily-lag5`. [m3.3 calls 11, 13, 15]

**126. The live feed has never been run.** It is built from the requests the data scripts make and tested on recorded answers. Run it on a preview first with `GG_DAILY_FEED=live`. See "Not checked". [m3.3 call 14]

**127. Evening warning.** It has words and a queue rule but no job sends it. [m6]

### Accounts and privacy

**128. Guests are sessions the server makes.** A hashed cookie secret in `guest_sessions`, not Supabase anonymous sign-ins. No CAPTCHA. A guest's farm moves into the account on sign-up. A guest whose account has no room is refused and nothing moves. [m3.1 calls 2 and 3]

**129. Guest farm removal.** A guest not seen for 30 days is removed with their farm (database). With files the farm stays 90 days. The guest cookie lasts 30 days with the database. PRD 8.1 says the guest farm lives on the device only. Change: `prune_housekeeping`. [m3.1 call 4, m3.2 calls 2 and build item 4]

**130. Under-16 rule.** Worked out live from the date of birth on today's Sydney date. It opens on the 16th birthday. A 29 February birthday counts from 1 March in other years. [m3.1 calls 5 and 31]

**131. Admins cannot read a date of birth.** Only the player can. Admin sees "under 16" as Yes or No, role, bans, farms, scores, reports and ads. [m3.1 call 7, m3.5 build item 6]

**132. Admins use the community with switches off (database), but not on the site.** The database lets admins in. The site shows nothing with the switch off. [m3.1 call 6, m4.2 call 1]

**133. Moderators.** Moderators read reports, the history, the word filter and every post (removed too) in the database. All changes go through the server and the audit log. Moderators cannot open `/admin`. [m3.1 call 8, m4 call 7]

**134. Privacy defaults.** Profile Public, farm view Followers only, ticker activity off until turned on. A followers-only or private profile still shows its card (username, display name, checked photo, district). A private profile cannot be followed. Change: column defaults on `profiles` and `app.can_find_profile_for`. [m3.1 calls 9 and 10]

**135. Rate limits per account.** Posts 20 an hour (5 for the first 7 days), comments 60 (15), likes 300 an hour, follows 100 a day (30), reports 20 a day (5), new groups 5 a day (1), sign-ups 3 an hour, jobs 1,200 an hour, farm starts 10 an hour, ticker lines 6 an hour. Stand-ins. Change: `rate_limit_rules` rows. [m3.1 call 13]

**136. Download my data and delete my account.** The download leaves out the engine save and action log because they hold the hidden rules. It includes farm days, diary and scores. Worth a word with the lawyer about the Privacy Act. Deleting an account hands each group it owns to the longest-standing member 16 or over in good standing, otherwise the group stays ownerless until an admin assigns one. Reports other people wrote about a deleted player stay. [m3.1 calls 15, 16, 32, 35]

**137. Under-14 refusal.** The refusal is final for that sign-in only. A different email is a fresh sign-in with a fresh try, and the database cannot tell it is the same person. Date of birth alone may not be "reasonable steps" (PRD 18). A refused under-14 can still play as a guest and can delete their sign-in. An admin can clear a mistyped refusal. [m3.1 call 27, m3.2 calls 7 and 18, third pass call 34]

**138. Ban hash survives deletion.** A banned or suspended player who deletes their account leaves a row with only a peppered one-way hash of their sign-in email and the ban's end date, used only to refuse a new sign-up with that email. The moderation history is deleted. A different email gets past it. Gmail dots and googlemail are normalised and Fastmail `+tags`. Gmail `+tags` and Outlook, Apple and Yahoo aliases are not, because no provider page was found. This is a privacy call for you and your lawyer. [m3.1 calls 28 and 33, m3.2 call 14]

**139. Audit log and tables.** The audit log takes ids and action names only and refuses anything that looks like an email. Not made from PRD 15: `farm_jobs`, `farm_messages`, `subscriptions`, `plan_features`. Avatars and group photos are in private buckets and are checked like post photos, so a new avatar shows initials until checked. Seed accounts have no email. [m3.1 calls 17, 22, 23, 30]

**140. Sign-up and sign-in details.** Sign-up checks the sign-ups switch. The username check says only "free" or "not available". After sign-in only `/`, `/play`, `/account`, `/about`, `/pricing` and `/store` are allowed as next pages. Link limits are 3 an hour for one address and 10 tries a minute, held in memory per server instance. An account whose sign-up is not finished plays as a guest. The sign-in pages are about 144 KB of script. [m3.1 call 24, m3.2 calls 6, 8 to 10, 13]

**141. Saves.** The database store uses a `pg` pool, not the Supabase JS client, because it needs transactions (new variable `SUPABASE_DB_POOLER_URL`). Picture of a day: every day for 14 days then weekly to 182 days, gzipped (about 180 KB a farm). Files keep 14 days. A refused job keeps its version. The picker shows at `/play` only for an account with more than one farm. Change: `PAST_DAILY_DAYS` and `PAST_MAX_DAYS` in `server/game/store.ts`. [m3.2 calls 1, 3 to 5, 16]

**142. Production needs two settings.** `GG_SITE_URL` and `GG_TRUSTED_IP_HEADER` are required for accounts in production. Without them accounts stay off with a start-up warning. [m3.2 calls 12 and 17]

**143. Apple sign-in is not built.** PRD 8.2 lists it. The milestone asked for the emailed link and Google. [m3.2 call 15]

**144. Token lifetime.** Game routes accept an access token for up to its lifetime after "sign out everywhere". Set the Supabase JWT expiry to 900 seconds so that is within 15 minutes. [m3.2 second pass call 19, hand-set setting]

**145. Views with owner rights.** Three views run with their owner's rights (`public_profiles`, `leaderboard_rows`, `public_farms`). The Supabase linter flags this (lint 0010). It is the column-safe view the brief asked for. [m3.1 call 25]

### Community and moderation

All of it is behind the `community` switch (and `feed_posts`, `groups`, `activity_ticker`, `farm_viewing`), off by default.

**146. Staff see the community like any member.** Moderators and admins get the plain not found for an under-16 profile and see a private profile's card only. Staff powers are in `/admin`. [m4.2 review fix 1]

**147. Photos.** Photos are stripped of metadata but not re-compressed (adding `sharp` would re-encode and changes the lock file). They upload through the server (6 MB post photo, 2 MB profile photo). An animated WebP is refused. [m4.2 calls 2 and 3]

**148. No image-check service.** Every photo waits for manual review in `/admin/photos`. Nobody but its author sees a photo before approval. `IMAGE_CHECK_API_KEY` is listed and does nothing until an adapter is written for the service you choose. Decisions are audited. [m4.2 calls 4 and 14]

**149. Posts.** A post needs some words (a photo-only post is not allowed). Everyone is newest first and popular ordering is not built. Search is by the start of a username only. Comments show 5 replies then "Show more". [m4.2 calls 5, 6, 11]

**150. Private profiles.** A private profile's posts are its author's alone, whatever the post's own setting (PRD 9.1). Share my farm from a private profile is refused. Comments a private-profile player writes on other people's posts still show. [m4.2 call 8, review fix 2]

**151. Share my farm and day cards.** Share my farm shows farm and district, date, season, head, average pasture, ground cover and net worth. Day cards are made at the Daily Farm rollover. [m4.2 calls 7 and 9, m6]

**152. Where the community sits.** The Community link is in the More tab, not the bottom bar and not the public site header. Groups, the Groups tab and the screens were built in Stage 4. [m4.2 calls 10, 13]

**153. Word filter.** Matches whole words in text and letters in usernames. "Block" refuses, "flag" lets it through and queues it. The seed has two placeholder words only. The real list is yours to supply in `/admin/words`. [m3.1 call 14]

**154. Hidden characters and flags.** Hangul fillers, the braille blank, invisible maths signs, the grapheme joiner and tag characters are removed. Emoji flags that use tag characters (Scotland, Wales) show as a plain black flag. [m4.2 review fix 6, calls]

**155. Like counts.** A like count counts every like, including from someone the viewer blocked. [m4.2 calls, m4 call 8]

**156. Photo and ticker limits.** Photos 24 an hour and 80 a day (8 and 20 for a new account). `/api/ticker` 30 calls a minute per address. Group and challenge routes 30 and 6 a minute per member. Stand-ins. [m4.2 review fix 4, m4 call 12]

**157. Groups, challenges and leagues.** Ownerless groups can read and post, and an admin gives them an owner on `/admin/challenges`. Group challenges start when set and end on the date given or never. Daily leagues can be set but not entered until Daily Farms exist. A group cannot be removed by moderation, only kept or warned. [m3.1 call 32, m4 calls 9, 13, 16]

**158. The ticker.** Live lines on website pages only (landing page, `/leaderboards`, community pages), never on the farm screen. Visitors see it on the landing page. Lines: started a farm, reached Day 100, 365, 500, 1,000 or 2,000, finished a year. No farm names. Rate 6 an hour each. Signed-in under-16s, banned players and anyone who hid it see nothing. [m4 calls 10 and 11]

**159. Farm viewing.** The read-only farm view is Daily Farm only (PRD 9.5). Every farm in a database today is a Fast Farm, so nobody can be looked at until Daily Farm is on. It is a list of paddocks with no map. A farm name the word filter refuses shows as "A farm". Fast Farms viewable too is one line in `app.can_view_farm_for` and a migration. [m4 call 14, m6]

**160. Moderation.** Remove on a profile clears its bio and display name. Removed content shows as removed to its author and to nobody else. [m4 call 16]

### Purchases

Behind the `purchases` switch (off) and a product switch (off). Nothing is for sale unless both Stripe keys are set.

**161. Buying age is 18.** PRD 10.3 only says to check "purchases by under 18s" with a lawyer, so 18 is the safe default (the first pass said 16). Change: `MIN_PURCHASE_AGE` in `products.ts`. Recommended: 18 until a lawyer advises. [m5.2 call 1]

**162. No Stripe library.** The server calls Stripe's REST API with `fetch` and checks signatures by hand. Swapping to the library changes one file (`stripe.ts`). Say if you would rather use the library. [m5.2 call 2]

**163. Card only.** Hosted Checkout takes cards only, so a payment is not pending for days. Delayed-payment events are still handled. [m5.2 call 3]

**164. Refunds and disputes.** A full refund takes the entitlement away. A dispute raised takes it away until it is won. A lost dispute keeps it away. A part refund changes nothing. PRD 10.3 is silent. A won dispute before its raised event is remembered. An inquiry closed without a dispute never takes anything away. [m5.2 calls 4 and 8]

**165. A refund after a rescue does not undo it.** A refunded paid rescue stays applied to the farm. [m5.2 call 5]

**166. Keep-going tiers and prices.** By days run: under 183 days (price Open, never shown, cannot be switched on), 183 to 364, 365 to 729, 730 and over. PRD gives three points and these are the nearest. The under-6-months price is A$15 until set. [m5.2 call 6, PRD 21 row 30]

**167. Packs.** A second pack is refused. The pack with no ads is refused to an account with the pack (the upgrade is the one to buy). Products are seeded inactive at the PRD 10.3 prices (Fast A$5, Daily A$15, A$25, A$50 and A$100 by age for keep-going; A$30 and A$50 packs and A$20 upgrade). The A$30 pack gives the farm pack, supporter badge and full diary. [m5.2 call 7, m3.1 call 18]

**168. Stripe details.** Checkout creates a Stripe customer for each buyer and only the `cus_` id is kept. Stripe holds the email and name and sends its own receipt if the dashboard setting is on. No price ids or publishable key are needed (inline prices), unlike the BUILD_PLAN list. [m5.2 calls 9, keys list]

**169. Rescue cash.** PRD 10.3 is silent. All stock is sold. Cash is the hard-difficulty starting cash for that farm with no herd, or what the sale leaves after the debt if more, so a rescue never takes away money its own sale raised. Stock already bought and on the way still arrives. [m6 For Claudia]

**170. A rescue needs a free farm slot.** With none, no offer is shown. [m6]

### Ads

All slots off (`ads` master switch plus each slot). The AdSense switch does nothing.

**171. No-ads owners see no sponsor cards.** PRD 10.1 proposes subscribers still see sponsor cards, while PRD 10.3 and the mockups say no ads. Built: no ads at all. Change: `adSlotsFor` and `viewerFor` in `server/ads/serve.ts`. [m5.1 call 1]

**172. Ads for under 16.** The PRD has no rule that bans ads for an under-16 account. Built: allowed, only campaigns for everyone, never aimed. AdSense must never be personalised for them. Guests are shown ads like a free player. [m5.1 call 2]

**173. Slots not placed.** `landing_sponsors` (the home page is static with no script, so views could not be counted), `pc_leaderboard_banner` (the leaderboard page sends no script), `video_between_days` (its cap is by game days, which means reading the farm). Say if the home page should rebuild every few minutes, or the boards page send a script, or how the game-day cap should be counted. [m5.1 calls 3, 4, 5, m6]

**174. Phone banner.** Upright only, floating above the tool bar inside the stack, never over the map on a phone on its side. 30 to 60 seconds on screen, 44 px close button, comes back after a 300-second gap in real time. [m5.1 call 6]

**175. PC banner and rail.** The banner is a strip under the map that appears and goes, so the map changes height a little each time (alternative: a strip that always keeps its room). The farm rail shows from 1280 px wide. [m5.1 calls 7 and 8]

**176. Video limits.** MP4 only, up to 3 MB and 30 seconds, because Vercel limits a request to 4.5 MB and the page sends base64. Pictures up to 1 MB. Longer videos need a signed direct upload to Storage (not built). [m5.1 call 9]

**177. Video break.** It starts muted with a "Sound on" button, skip after 5 seconds, holds "Start year" until it ends or is skipped, and never holds more than 40 seconds. A video that errors or does not start in 6 seconds is dropped. [m5.1 call 12, build item 10]

**178. Counting and dates.** A view counts after 1 second with half the ad on screen (constant in `useSeen.ts` and `events.ts`). Dates are Sydney days, the last day included. The sponsor report shows counts and nothing else. Rate limits are rows you can change (`ad_view` 300 an hour, `ad_click` 60 an hour). [m5.1 calls 10, 11, 13, 16]

**179. Other ad settings.** "Spots left" is a setting (`advertise_spots`, 20) and is not counted. Ads live only when accounts are on. Slots for pages that are not built are ready and not placed. [m5.1 calls 14, 17, 4]

**180. AdSense.** No publisher or unit id fields in admin and no script. It needs your own AdSense account and a consent banner. Add the fields when you decide. [m5.1 call 15, build item 12]

### Notifications

Behind the Push notifications switch. Nothing is sent without keys.

**181. Quiet hours.** Morning reminder, later reminder and evening warning are dropped inside quiet hours. Everything else is held until quiet hours end and dropped if still unsent after 12 hours. The PRD does not say. Change: `expires` in `lib/notify/kinds.ts`. [m3.4 call 1]

**182. Defaults.** Nothing is sent until a device is added or email is turned on. The morning reminder is off until the player turns it on. Farm alerts, evening warning, community and challenges default to push on once a device exists. Email is off for every type. [m3.4 call 2]

**183. Email is a fallback.** It goes when there is no working device or push failed for good. One-click unsubscribe is on every notification email. [m3.4 calls 3 and 10]

**184. Reminder timing.** The later reminder goes 6 hours after the morning time within a 3-hour window, and not at all when the morning time is after 5 pm. The morning reminder is made only within 3 hours after its time. Wording: "Kooringa: 3 things to check." or "A reminder for Kooringa." [m3.4 calls 4 and 7]

**185. Under 16.** Community notifications are never made. Challenge and league notices are still made. Say if challenges should also be hidden. [m3.4 call 5]

**186. Daily cap of 6.** Notifications to phones or email for an account in 24 hours (`DAILY_CAP` in `sender.ts`). The inbox always has everything. [m3.4 call 6]

**187. Evening warning.** At most one a day for each farm, never if the farm was opened that day. What counts as urgent is for the Daily Farm work to decide. [m3.4 call 8]

**188. Push hosts.** Allowed: Apple, Mozilla, Chrome (`fcm.googleapis.com`) and Edge (`notify.windows.com` and subdomains). Chrome's host is documented only as the origin you see when VAPID works. Edge's page states the domain, not the exact address pattern. Both need one test with a real browser. [m3.1 calls 29 and 37, m3.4 call 9]

**189. Devices and sender.** A device is per browser and moves to the account that signs in on that browser, up to 10 per account. The sender is one route that also makes the reminders (cron every 5 minutes). A message deleted before it is sent is never sent. No `web-push` package was used (about 150 lines of Node crypto, checked against RFC 8291). [m3.4 calls 11 to 14]

**190. Two inboxes.** The account inbox is separate from the farm's game inbox (the bell). No bell with an unread count was added to the top bar. [m3.4]

### Website

**191. Domain.** Not chosen. `NEXT_PUBLIC_SITE_URL` sets canonical links, sitemap and share images. [m5.4 call 1]

**192. Owner name and ABN.** For the terms and privacy page (PRD 18). `SITE_OWNER_NAME`. Until set, the pages say "the owner of The Grazing Game". [m5.4 call 2]

**193. Contact address.** `SITE_CONTACT_EMAIL`. Until set there is no contact link anywhere and no way to make a privacy request or an advertising enquiry. [m5.4 call 3]

**194. Lawyer's review.** The privacy page, terms and community rules are plain-English drafts from the PRD, not legal advice. Review them, including the under-16 wording and purchases by under 18s. The "Draft. Not yet reviewed." line stays until done. [m5.4 call 4]

**195. Providers and retention.** The privacy page says "hosting and database providers" and that data may be kept outside Australia, and names none. Vercel and Supabase (Sydney) are the plan. Naming them needs your yes once the accounts exist. Stripe is named only when `purchases` is on. Only the guest-farm rule is written for retention. Account data retention is not decided. [m5.4 calls 5 and 6]

**196. Launch switches and prices.** Which switches are on at launch (`SITE_SWITCHES_ON`, none today, read when the site is built). Daily Farm keep-going price under 6 months is "To be set". Audience totals and ad rates are not on Advertise because there is no audience or rate card. [m5.4 calls 7 to 9]

**197. Analytics only with consent.** The privacy page says analytics run only with consent and that players can still play if they say no. That is stricter than PRD 12 ("where needed") and binds the PostHog work (5.3) to a consent gate. [m5.4 call 10]

**198. Wording that matters.** The SILO credit notice ("soil water and pasture growth figures are worked out from it by The Grazing Game"), "removed if it goes unused for a long time" for guest farms, "Looking is free and takes no time", and community rules shown with a note that the game has no community today. [m5.4 call 11]

**199. Privacy complaints link.** The page points to the OAIC's "Privacy complaints" page, looked up 14 Nov 2026. Check it before launch. [m5.4 call 12]

**200. Site pages are static and send no script.** They are Pages Router pages with the runtime off. The light and dark button is plain HTML with a small inline script. Share images use the default font. [m5.4]

### Admin

**201. Switch defaults.** Feature switches start at the PRD 11.7 launch defaults: sign-ups, both modes, leaderboards and push on, the community, ads, purchases and maintenance off. The seed equals `FEATURE_SWITCHES` key for key. `video_ads` and `banner_ads` are in `FEATURE_SWITCHES` but not named in the PRD table (both off). Daily Farm, sheep and the community parts are set off in migrations. [m3.1 call 1, m6 item 6]

**202. Switch timing.** Switches are cached 30 seconds on each server. A change shows at once on the server that made it. The website's static pages read switches when the site is built, so changing them needs a rebuild. [m3.5 build item 4]

**203. Maintenance mode.** Wording is one of three fixed texts chosen by id, so no free text goes to a player. While on, the game is read only (not stopped), so `/play` stays a static page. A player with the farm open sees the message and can do nothing until it ends. Add a wording in `MAINTENANCE_WORDINGS` in `server/admin/info.ts`. [m3.5 calls 1 and 2]

**204. Banned and suspended accounts can still play their own farm.** The game routes do not check status. Their sessions end when banned or suspended and an access token still works until it runs out. Enforcing a ban in the game is one check in `route()` and changes what a banned player can do. [m3.5 call 3]

**205. First admin by SQL.** The first admin is made by a statement you run in the Supabase SQL editor, not by a route or a variable (see section 7). [m3.5 call 4]

**206. Ban and the hash.** Banning writes the hash when the provider can give the email. If it cannot, the ban still applies and the confirm says it will not survive deleting the account. Lifting a ban is refused when the hash cannot be made. [m3.5 call 5]

**207. Sign out everywhere.** For another user it deletes their rows in `auth.sessions` through a security definer function. Whether the owner role is allowed on Supabase is to be confirmed. If it fails the admin sees "Do it in the Supabase dashboard." [m3.5 calls 6, second pass item 9]

**208. Admin and stale sign-in.** An admin page never refreshes the sign-in. An admin who returns after the token ran out gets the plain not found and must open `/play` first. A redirect route or `proxy.ts` would fix it and is not built. [m3.5 call 7]

**209. Admin roles.** A suspended admin is treated as no admin. A moderator cannot open admin. The last admin in good standing cannot lose the role. Ad slot switches are not in the switches list because they belong to the Ads screen. [m3.5 calls 8, 9]

**210. Site settings are saved but not read.** The announcement, districts and community rules text are saved and audited with only a number. Nothing on the site reads them yet. Each says so on its screen. [m3.5 call 10]

**211. Dashboard meanings.** "Saves failing" counts saves kept aside because they could not be opened. "Farms played" counts farms with a save today and in the last 7 days. Suspension lengths are a fixed list (1, 3, 7, 14, 30 days) and a ban has no end date. [m3.5 calls 11, 12, 14]

**212. Admin script size.** The `/admin` line is 150 KB, held at its limit (heaviest page 149.1 KB after the join). A new client component will fail it. [m3.5 call 13, m6]

### Speed targets

**213. `/play` Lighthouse 0.89 against 0.95.** The CI rule is 0.95 and was not loosened, so CI fails on `/play` until the page is lighter. The largest paint is the setup form heading, which waits for the scripts then two requests in order. The fix is in `PlayApp` and `SetupFlow`. LCP is 3.3 s. [m1.8 calls]

**214. Script size targets.** PRD 14.10 asks for under 100 KB on website pages. The public pages now send none. App pages carry about 140 KB of React and Next.js (`/play` 207.2 KB of 250, sign-in and account pages 141.4 to 146.9 of 150, community pages 145.3 to 149.4 of 150). Several pages sit within 1 KB of their limit. The 100 KB target is not reachable for these without cutting the framework. [m1.8, m3.2, m6]

**215. Public page Lighthouse.** `/pricing` has a median of 99 over 8 runs, not 100. Some single runs on other pages fall below 100 on a busy PC with no script to blame. CI asserts performance 1.0 on every public page (median of 3). If CI fails on a busy runner, run it again. [m5.4 call 13]

**216. Speed tests on a shared machine.** The cattle speed test (limit 5 ms a day with 4,000+ head) reads 3.4 to 4.5 ms alone and 5 to 15 ms under load. CI uses a 15 ms limit for the shared machine. Run it on a quiet machine. [m1.8, m2.7 checks]

**217. Map frame rate.** 60 fps was not measured on a phone. A frame's processor time with 4,409 head and 22,664 grass pieces was 1.0 ms at the 95th percentile on the build PC. [m1.6a]

## 2. Stand-in figures

These numbers have no sourced real figure behind them. Each is one constant or setting. "Replaced by" says what would replace it.

| Figure | Value | Stands in for | Replaced by |
| --- | --- | --- | --- |
| Milk against condition | Full at CS 2.25, none at CS 1.5 | Published milk and condition curve | A source for milk output by body condition |
| Calf cost of gain | 0.52 MJ to 100 kg, MVP figure by 200 kg | Australian standard for young cattle | CSIRO 2007, Nutrient Requirements of Domesticated Ruminants |
| Central Queensland calf floors | A quarter under Fordyce et al. 1993 | District calf gain bands | A Central Queensland weaner source |
| Market series for random seasons | The MVP's approximate series and random walk | Real prices | Not needed on real years |
| Feeder prices before June 2003 | Multiple of the geometric mean of two indicators (1.0169 and 0.9990) | MLA feeder indicators (start June 2003) | Older feeder series, if one exists |
| Class price multiples | Weaners 1.08, bulls 0.906 of cows, calves 1.10 | MLA class indicators | An MLA indicator per class |
| Yard fill-in rules | 20 head a row, 14 day hold, 730 usable days | Thin yard series | A fill-in yard (Emerald, Inverell, Ballarat) |
| Sale day stand-ins | Prime sale every Monday at Gracemere and Mortlake where records are missing, none 16 Dec to 7 Jan; weekdays for random farms (Wed, Thu, Thu, Mon) | The yards' real sale days | The yards' real calendars |
| Soil | One 100 mm soil for all districts | Per-district soil water capacity | District soil water figures |
| Season label edges | The MVP's six labels, under 60% of average is "Drought" | A sourced season index | Your ruling on the edges |
| Job times | One gate figure marked Builder; 17 rules; figures marked Proposed in `DATA.md` "Job times" | PRD 5.4 table | Your ruling on each |
| Contractor labour | $5 a metre, either team | A contractor's quote | A quote from a fencing contractor |
| Hand skill by 1 to 5 | 2/3, 5/6, 1, 7/6, 4/3 of average | Skill effect on work | A source or your ruling |
| Hands: most at once, pool, standing | 6 hands; 1 to 3 people a week listed 14 to 42 days; 80, 20, 5, 40%, 20% | Labour market | Your ruling |
| Fencing injury | 1.5 times likelier, one week's wages cost | Fencing injury rate and the farm's claim cost | A source by state |
| Wages | 2026 Pastoral Award rates on every farm | Wages of the year played | Dated award rates |
| Wool price | Dated September 2026 stand-in, 17 micron 2,569 to 30 micron 605 c/kg clean | A real-year wool series | An AWEX agreement and series |
| Wool selling costs | Shed staff $1.50, levy 1.5%, $40 a bale, cartage $16, pack $14, 180 kg bale, oddments 22% | Real selling costs | AWI and levy pages that refused automatic reading |
| Sheep frame and size | Crossbred SRW 60 kg; ram 1.8 times SRW and maintenance times 1.25; 540-day frame; ceiling 0.4 kg a day | Sourced breed figures | A breed SRW table |
| Triplets | Pregnancy times 2.4, third lamb's milk 2 MJ, birth weight 3.0 kg, 10% of litters above 1.25 | Triplet data | Triplet sources |
| Sheep feed rules | Lactation curve full to day 42; green pick 0.1; short green 100 kg; bare 200 kg; residual 150 kg; dead feed in reach in full | Sheep grazing studies | S12 and field trials |
| Lamb and weaner rules | Orphans weaned from 56 days; no lamb past 150 days; starved at half normal weight; ram working life 4 years; joining stage from 42 days before | Survival and husbandry data | Sources for each |
| Sheep wool and fat | Milk counts as wool feed at 1/11 kg a MJ; crossbred micron 28; fat score from CS rounded | Wool and fat tables | Sources for each |
| Sheep prices and costs | Netting $10 a metre; rams $1,200; Merino breeders 1.5 times mutton; freight $3 a head; health $3.57 a head; grain protein 11%; hay $0.28/kg; sheep lick cattle rule divided by 8.4 | Sheep price lists | AuctionsPlus, dated feed prices, freight quotes |
| Sheep start flock | 1.5 DSE a ewe; cast at 6 years; bought defaults by class | Real start flocks | Sources for flock structure |
| Flystrike | 17% a year of unmulesed Merinos; same fly season everywhere | District fly season | A district fly season page |
| Sheep margin band | Band plus or minus 25% of $50.46 a DSE | A tolerance | Your ruling |
| Carrying capacity targets | The model's safe-use share | 5 DSE/ha native Tablelands, 12 to 23 sown | Your ruling (grass review) |
| Rescue cash | Hard-difficulty starting cash, or what the sale leaves | Rescue terms | PRD 10.3 terms |
| Keep-going tiers | 183, 365 and 730 days | PRD's three points | Your ruling |
| Keep-going price under 6 months | A$15 until set | Open price | Your price |
| Daily Farm data lag | 5 days | SILO's delay (no figure on its pages) | A figure from SILO after a few weeks of running |
| Account and ad limits | Posts 20 an hour, photos 24 an hour and 80 a day, ticker 30 a minute, `ad_view` 300 and `ad_click` 60 an hour, daily push cap 6 | Rate limits | Your ruling after real use |
| Ban list normalising | Gmail dots, googlemail and Fastmail `+tags` only | All provider alias rules | Provider help pages for Gmail `+tags`, Outlook, Apple and Yahoo |
| Word filter | Two placeholder words | Your word list | Your list |
| Past-day storage window | 14 days daily then weekly to 182 days | A retention decision | Your ruling |
| Guest and farm life | Guest 30 days (database), farm file 90 days | Retention decisions | Your ruling and the lawyer |
| Advertise spots | 20, not counted | A real count | Community page count |

## 3. Known gaps in realism

These are the open calibration rows and review findings. In each case the model works and the tests hold today's figures, but the numbers sit away from published ones.

**218. Calf weaning weights.** Home-bred calves weighed about 80 kg at weaning (9 months) before the fix. The sources say about 160 to 175 kg at 180 to 200 days. After the fix: birth to 200 days is 0.53 (Central Queensland, band 0.6 to 0.95), 0.54 (Tablelands), 0.57 (Central West) and 0.63 kg a day (Western Victoria), against 0.7 to 1.1. Weight at 200 days is 142, 143, 149 and 163 kg. Central Queensland passes (band 140 to 225). The southern three are under 171 to 256. From 100 to 200 days calves gain 0.33, 0.39, 0.29 and 0.36 kg a day against 0.6 to 1.1. Weight at 100 days passes everywhere. Each open row is an expected failure with a regression floor beside it. [m2.5, CALIBRATION]

**219. Cows milking off their backs.** Calves born per 100 cows and heifers fall to about 55 by year 3 in Central Queensland and the Tablelands, against 72 to 77 weaned per 100 for northern breeder herds (CashCow). About 17% of Tablelands cows sit under CS 2.25 from August to October in years 2 and 3. With a May start 79 to 82% do. Deaths did not rise. The milk condition figures are stand-ins. [m2.5 calls 1, 2, 5]

**220. Grass feed quality and the two steer bands.** On the Tablelands in July and August a paddock holds 35 to 55 kg DM/ha of green and about 900 to 1,000 kg of dead feed. The diet is ME 7.0 and CP 5.2%. A dry cow eats 1.0 to 1.1% of live weight and is 11 to 14 MJ a day short. On dry feed at 50% digestibility game cows eat 1.0 to 1.2% against 1.4 to 1.5% measured in Central Queensland. Carrying capacity is 3.5 DSE/ha on Tablelands native against 5, and 5.5 to 7.7 on sown pasture against 12 to 23. The Tablelands steer band is 90 to 105 kg and Central West 115 to 130 kg, with no outside source. The recommended package would put them at 126 and 143 kg. The Central West peak digestibility was tuned from 0.70 to 0.68. [grass review, m1.3]

**221. Central Queensland with lick.** The average year runs up to 2 kg over the top of its 75 to 130 kg band (held as `averageYearOver`). Herd deaths are counted over all herds together. The real-year herd test holds 1.5 to 3.6% on six herds over fair weather years. [m1.3, m1.4]

**222. Real years.** Central West with nothing done loses steers heavily in four of 29 years and 5 to 54% of set-stocked weaners in its worst four. The season label reads the whole 12 months, so it can say "Below average" in a year unsupplemented steers lost 41%. A farm starting in 1997 may not pay its way (CHECK 8 to 10). [m1.4]

**223. Sheep: Tablelands winter.** Unfed ewes reach lambing at CS 1.4, 31.7% die and marking is 48.8%. Central West marking is 71.1%. With the grass changes tried in the review, ewes reach CS 1.95, deaths fall from 15 to 18% to about 8% and lambs marked rise from about 50 to 62 per 100 ewes. Skipped benchmarks: SB-59 to SB-62 (carrying capacity), and Tablelands and Central West winter rows run with winter feeding. [m2.3, grass review]

**224. Sheep deaths.** SB-43 Merino ewe deaths are 3.33% (highest block 4.67, 5.08), 3.98% (5.26, 5.53) and 4.70% for the Tablelands, Central West and Western Victoria, against 2 to 4% with no block over 4.5%. First-cross ewes are 4.95, 5.36 and 5.35%. SB-47 Western Victoria weaners lose 1.66% against 2 to 6% (worms left out). [CALIBRATION, m2.7 review]

**225. Sheep margins.** Start flock first year (no hands, no sales, no feeding) against DPIRD's $50.46 a DSE: Central West $44.28 passes, Tablelands $5.37 and Western Victoria $135.74 are open. SB-GM (a managed flock, band $37.85 to $63.08): Central West $38.69 passes, Tablelands $71.88 and Western Victoria $90.33 are open, mostly wool at 2026 prices. The model's DSE a ewe (1.6 to 2.0) is below the budget's 2.32. [CALIBRATION, m2.7 review]

**226. Mixed farm left alone.** Western Victoria with 86 cattle and 659 sheep and no action lost 579 sheep in two years and profit fell from $192,435 to $25,757. Not a benchmark. [m2.7]

## 4. Not built

**227. Map.** Trees, cattle walking and grazing animation, time-lapse, frost, dust, heat haze and storm clouds, the profit layer, the selected mob and picked animals on the map, half-built fence lines and pegs, the overview inset for a phone held upright, hover, and the farmer. Sheep sprites exist as code art only. [m1.6a, m1.7c]

**228. Play screens.** Drawing a fence or pipe by keyboard, setup cards with pictures, a "cows getting thin" item and a line saying condition falls because of milking, things to do for crops to lock up and grain shedding, red marks on squares that cannot take a crop, moving the crutching and joining days on screen, booking sheep onto a later sale, a sheep figure for paddock days of feed, a bell with an unread count in the top bar, the drag timeline in the Diary, a leaderboard tab inside the game. [m1.7, m2.2, m2.5, m2.8, m3.4]

**229. Engine.** Temperature in the growth factor. Moving a running farm to new data. The grass changes in the grass review. Overhead costs a year for sheep. Marking cost for sheep. A managed cattle margin beside SB-GM. A calving window per district. [m1.4b, m1.4, m2.3, m2.7, m2.5]

**230. Data.** The rest of the MLA pull (National Young Cattle Indicator, six national sheep indicators, other yard indicators, sheep yardings and the fill-in yards). Real yardings for Daily Farm sale days. The AussieGRASS licence is unconfirmed, so those figures are used for checking only. A DPIRD budget read (the pages refuse automatic reading). [m1.4a, m3.3, m1.4b]

**231. Accounts.** Apple sign-in. A redirect route or `proxy.ts` to refresh an admin's sign-in. Supabase-wide rate limits that survive across server instances. A screen for changing a Daily Farm time zone. [m3.2, m3.5, m3.3]

**232. Daily Farm.** The evening warning job. A read-only view of someone else's Daily Farm for Fast Farms. Daily leagues cannot be entered until Daily Farms exist. [m3.3, m3.4, m4]

**233. Community.** Popular ordering in Everyone, reports of groups from a group page, real farm showcase photos, pull to refresh, a Groups tab list of every group's board, badges and best ranks on profiles, the Grazier Score formula, and weaning %, condition and the "above 1,500 kg DM/ha" share on boards. [m4.2, m4]

**234. Ads and notifications.** `landing_sponsors` on the home page, `pc_leaderboard_banner`, `video_between_days`, AdSense and its admin fields. A real push service and a real email run (see "Not checked"). [m5.1, m6, m3.4]

**235. Website and analytics.** Share images in the display font, audience numbers and ad rates on Advertise, the cookie and consent banner (milestone 5.3). Milestones 5.3 and 5.5 are in progress. [m5.4]

**236. Tests and checks.** Playwright end-to-end tests (planned for the game screens in milestone 1.0, not recorded as built). The `realism-guardian` agent was not run on most milestones. [m1.0, various]

## 5. Not checked

Each item could not be verified without keys, real services or a real phone. "What you need to do" says how to check it.

**237. Real phone play.** Not done: install to the home screen, the iPhone Add to Home Screen steps, offline viewing in airplane mode, the Android install bar, the iPhone status bar in an installed app, going offline mid-request, touch pan and pinch, and frame rate. Do: play on a real iPhone and an Android phone in portrait and landscape, install, go offline, reconnect. BUILD_PLAN 1.8 says Claudia plays it on a real phone. [m1.8, m1.6a]

**238. Screens by eye.** Not looked at: phone on its side in the dark theme for several screens, the game over card, the mixed-farm setup step, keyboard-only runs, the bore's gold ring, a knocked-down fence on screen, the phone plan form and crop sheet, the admin screens on a phone and PC in both themes, the sheep sprites at the far zoom and phone landscape for sheep, the ad cards and video break, the community pages, the notifications page. Do: open each at phone and PC size in both themes. [m1.7 entries, m2.8, m3.5, m5.1, m4.2]

**239. A real Supabase project.** Nothing has run against one. Do: make the project (section 7), apply the migrations, then check: the `pg` pooler and `set local role` inside its transactions, `@supabase/ssr` cookies and refresh, `getClaims()` on a real token, the emailed link end to end (and that it fails in another browser), the Google round trip, `signOut` scopes, `auth.admin.deleteUser`, Storage removal and uploads, two real connections racing on one save, per-instance rate limits, `delete from auth.sessions` by the admin function, `getUserById`, a stale token on an admin page, the first-admin SQL. See `docs/DATABASE.md` "Still owed". [m3.1, m3.2, m3.5, m4.2]

**240. Daily Farm live data.** The live feed has never run against SILO or MLA. Do: set `GG_DAILY_FEED=live` and `SILO_CONTACT_EMAIL` on a preview, check a day arrives, and check the rollover cron fires. Look at the 5-day lag after a few weeks. The catch-up sheet, plan card and time on the top bar were not seen in a browser. [m3.3]

**241. Stripe test purchase.** Not run against Stripe. Do: follow the Stripe steps in section 7, buy the pack with no ads with test card 4242 4242 4242 4242, check the farm limit goes to 5, then refund in admin and check it goes back to 2. If it fails, check: the `v1` signature scheme and 5-minute tolerance, `payment_intent` on dispute events, `customer_creation` with `customer` set, and the `expires_at` repeat. [m5.2]

**242. Notifications.** Nothing was sent through a real push service or Resend. Do: make the VAPID keys and Resend domain (section 7), then test an installed iPhone, Android Chrome, desktop Edge and Firefox. Check the Edge and Chrome hosts. [m3.4]

**243. Ads.** No ad has been seen on screen with real storage. Do: run the migration, make an admin, turn on the Ads switch and one slot, make a house campaign, upload a picture and a real MP4 and play the video break. Run Lighthouse on `/play` with a slot on. [m5.1]

**244. Community photos.** Storage uploads with the secret key, `storage.objects` rows matching what `approve_photo` reads, and photo download. Do: upload as a test account and approve in `/admin/photos`. [m4.2]

**245. Lawyer and links.** The privacy complaints link, the legal drafts and the provider wording. Do: ask a lawyer to read them. [m5.4]

**246. `realism-guardian`.** Not run on several milestones (1.2c, 1.4b, 1.4, 1.5a, 1.6a, m6 join, others). Do: run it on the final branch before merging.

**247. Lighthouse.** Not run on `/play` with the latest changes, on the sign-in and account pages, or after m6. The public pages ran at 99 to 100. Do: run Lighthouse CI on the main pages (mobile) on the final branch. [m3.2, m6]

**248. Calibration judgement.** The real-year tables, the dry and wet years, the 1997 start, and each sheep and calf open row need your eye. Do: read `docs/CALIBRATION.md` and rule on the questions above. [m1.4, m2.5, m2.7]

## 6. Keys and settings you need to provide

Every variable is optional. With none set, the game runs with guest play and farm files, and each part that needs a key says plainly it is not set up. Variable names only are listed. Never put a value in the repo.

| Variable | What it is for | Where to get it | What does not work without it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public address for canonical links, sitemap, robots, share images and the leaderboard page's board read | Your chosen domain | Canonical links and share images use localhost |
| `GG_SITE_URL` | Server's own public address for sign-in links, redirects, email links, Stripe return pages | Your public address, no path | Accounts stay off in production |
| `GG_TRUSTED_IP_HEADER` | Header a trusted proxy sets to the caller's address, for every per-address limit | `x-real-ip` on Vercel | Accounts stay off in production, and every caller shares one limit |
| `GG_FARMS_DIR` | Where farm files live with no database | A folder (default `apps/web/.farms`) | Uses the default folder |
| `GG_SWITCHES_ON` | Switches turned on with no database, for a local check | For example `sheep` | Nothing extra on; ignored whenever a database is set |
| `GG_DEV_PAGES` | Builders' pages under `/dev` in production | Leave unset on the live site | `/dev` pages return 404 in production |
| `SITE_CONTACT_EMAIL` | Enquiry address on the website, read at build time | An address you choose | No contact link; no privacy request or advertising enquiry route |
| `SITE_OWNER_NAME` | Who "we" is on the privacy page and terms | Your business name | Pages say "the owner of The Grazing Game" |
| `SITE_SWITCHES_ON` | Which parts of the game the public pages may talk about, read at build time | Comma list of switch keys | Pages talk only about what is live today |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project address (safe in the browser) | Supabase, Project Settings, API | No accounts or database saves |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key, safe in the browser | Supabase, Project Settings, API Keys | No accounts or database saves |
| `SUPABASE_SECRET_KEY` | Server-only key for deleting users, Storage and sign-in admin | Supabase, Project Settings, API Keys | No accounts, ads media, photos |
| `SUPABASE_DB_URL` | Direct database string to apply migrations from a machine or CI | Supabase, Database, Connection string, URI | Cannot apply migrations from CI |
| `SUPABASE_DB_POOLER_URL` | Pooled connection string for farm saves (server only, has the database password) | Supabase, Database, Connection string, Transaction pooler, URI | No database saves, Daily Farm, ads, purchases, notifications or community |
| `BAN_HASH_PEPPER` | Secret that hashes sign-in emails for the ban list and signs ad impressions | You make it (a long random string) | No accounts; ban list useless if lost |
| `CRON_SECRET` | Secret both scheduled routes check (Daily Farm rollover every 15 minutes, notification sender every 5) | You make it | Both routes answer 404 and run nothing |
| `GG_DAILY_FEED` | `live` fetches each day's weather and prices | Set to `live` | Daily Farm runs only as far as the baked tables (to 12 Nov 2026) |
| `SILO_CONTACT_EMAIL` | The user name SILO asks for | The address you chose for SILO | No live SILO fetch |
| `RESEND_API_KEY` | Sends notification emails (and sign-in mail through Supabase SMTP) | Resend, an API key with sending access | No email |
| `NOTIFY_FROM_ADDRESS` | Sender of notification emails | `Name <address>` on your verified domain | No email |
| `NOTIFY_TOKEN_SECRET` | Locks the unsubscribe link (32 or more random characters) | You make it | No email unsubscribe links |
| `VAPID_PUBLIC_KEY` | Web push public key | Run the command in `.env.example` | No push |
| `VAPID_PRIVATE_KEY` | Web push private key | The same command | No push; changing the pair stops every saved device |
| `VAPID_SUBJECT` | Who push services can contact | `mailto:` an address you read, or the site address | Falls back to `GG_SITE_URL` |
| `STRIPE_SECRET_KEY` | Creates checkouts and refunds | Stripe, Developers, API keys (test mode first) | Nothing is for sale |
| `STRIPE_WEBHOOK_SECRET` | Checks Stripe's signed events | Stripe, Developers, Webhooks, signing secret (test and live differ) | Nothing is for sale |
| `IMAGE_CHECK_API_KEY` | An outside image-check service | You choose a service; an adapter is written then | Every community photo waits in the manual queue |

Needed later, not yet in `.env.example`: a Sentry DSN and upload token (milestone 5.5) and a PostHog project key and host (milestone 5.3). BUILD_PLAN section 8 lists them.

## 7. Settings you set by hand

### Supabase dashboard

- Make the project (Free plan, Sydney region). Apply the migrations in name order (`supabase db push`), including `20261115000400_daily_farm.sql`, `20261115000510_farm_rev.sql`, `20261115000610_sheep_switch.sql` and `20261115003000_notify_cron.sql`.
- Data API: exposed schemas `public` only. Never `app`.
- Authentication, Sign In / Providers: anonymous sign-ins off. Email provider on. Google provider on ("Confirm email" can stay on).
- Google sign-in: make a Google OAuth client (web) in Google Cloud Console. The authorised redirect is the Supabase callback address shown on its Google page. Paste the client id and secret into the Supabase Google page.
- URL Configuration: Site URL is your public address. Redirect URLs include `https://<your address>/auth/callback` and, for local work, `http://localhost:3000/auth/callback`.
- Email template "Magic Link": keep `{{ .ConfirmationURL }}`. Set the sender and SMTP to the Resend settings.
- JWT signing keys: use the default asymmetric keys. Set the access token lifetime ("JWT expiry limit") to 900 seconds. The dashboard page that holds it was not confirmed.
- Authentication, Rate Limits: leave Supabase's email limits on.
- Two-step sign-in on your own Supabase login.
- Daily rollover on the database scheduler instead of Vercel: turn on `pg_net` and Vault, then store `gg_site_url` and `gg_cron_secret` once in Vault (the two `vault.create_secret` lines in `docs/DATABASE.md`).

### Vercel

- Make the project (Hobby), link the repo, lock previews, and paste the variables above as server variables (Production and Preview).
- Crons: `apps/web/vercel.json` holds both (rollover every 15 minutes, notification sender every 5). A 15- and 5-minute cron needs a plan that allows it, since the free plan runs a cron once a day. Or use pg_cron.
- `GG_TRUSTED_IP_HEADER` set to `x-real-ip`. A variable named `CRON_SECRET` is sent by Vercel Cron as the bearer header.

### How the first admin is made

Sign up in the game first, which makes the profile. In the Supabase SQL editor run, with your own username in place of `YOUR_USERNAME`:

```sql
update public.account_status
   set role = 'admin'
 where user_id = (select user_id from public.profiles where username = 'YOUR_USERNAME');
```

It should say `UPDATE 1`. There is no route or variable that makes an admin. If the sign-in has gone stale, open `/play` once, then `/admin`. Later admins are made from the Users page.

### Stripe (test mode first)

1. Make the Stripe account and stay in test mode. Set the business name under Settings, Public details. Switch on "Successful payments" under Customer emails if Stripe should email receipts. Leave the Customer Portal off.
2. Developers, Webhooks, add an endpoint at `https://<GG_SITE_URL>/api/billing/webhook`. Send exactly these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Copy the signing secret.
3. Put `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.
4. In `/admin/switches` turn on Purchases. In `/admin/purchases` switch on the products to sell. The page should say "Stripe is connected (test mode)".

### Other accounts

- Resend: make an account, add a sending domain (a sub-domain is best), add the DNS records Resend lists and wait for "Verified".
- VAPID keys: run the command in `.env.example` once on your PC and paste the two lines into the host's variables.
- A random secret for each of `BAN_HASH_PEPPER`, `NOTIFY_TOKEN_SECRET` and `CRON_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep a copy of `BAN_HASH_PEPPER` somewhere safe. Losing it loses every ban on a deleted account.
- An image-check service, if you want one, and AdSense with a consent banner, if you want it.

## 8. How to review and merge

Open one pull request from `FINAL-BRANCH` into `main`. Merge it only when you are ready. Nothing goes to `main` without your go-ahead. Before merging, run type check, lint, tests, Lighthouse CI on the main pages (mobile) and the `realism-guardian` agent on the final branch.

`FINAL-BRANCH` is expected to contain every milestone branch below. The milestone branches are listed in build order, so you can read the history one piece at a time. Branches named `worktree-agent-...` are builder work areas and can be ignored.

### Planning

- `docs/prd-v1.1-build-plan`: the spec (PRD v1.1), build plan, mockups and the MVP reference.

### Stage 1: engine and the cattle game

- `m1.0-scaffold`: the monorepo, design tokens, shells, seeded random numbers, lint rules.
- `m1.1-grass`: district figures, pasture growth, quality and summaries, matched to the MVP.
- `m1.2a-cattle`: cattle intake, growth, breeding, deaths and the daily cattle step.
- `m1.2b-farm`: paddocks, fences, water, crops and whole-farm generation.
- `m1.2c-whole-farm`: the whole farm as one object, the daily tick, money, actions and saves.
- `m1.2-cattle-and-farm`: joins 1.2a and 1.2b.
- `m1.3-calibration`: every benchmark as an automated test and the Central West tune.
- `m1.4a-real-data`: SILO weather and MLA price tables pulled.
- `m1.4b-weather-growth`: the soil-water growth factor from real weather.
- `m1.4-real-years`: joins the real data and weather lines.
- `m1.4c-real-years-wiring`: real years, real prices, CPI, sale calendars wired into a farm.
- `m1.5a-daylight`: first and last light checked against a published table.
- `m1.5a-the-clock`: the farm clock, job times and the working day.
- `m1.5b-sale-days`: buying and selling on sale days, delivery into the yards.
- `m1.5c-plans`: grazing plans and the 180-day play test.
- `m1.6a-map-core`: the farm view and the PixiJS map.
- `m1.6b-map-on-clock`: the map joined to the clock.
- `m1.7a-play-shell`: the game server, setup flow and first play screen.
- `m1.7b-paddock-and-mob`: paddock sheet, mob card and husbandry.
- `m1.7c-build-tools`: fence, gate, pipe, trough, hub and remove tools.
- `m1.7d-market-and-plans`: Market, Plans, crops and the inbox.
- `m1.7x-engine-rules`: fence materials, hub moves, reads for the web server.
- `m1.7f-review-fixes`: screens review fixes and the engine's pregnancy-on-record change.
- `m1.7f-verified`: bundle check that survives minifying, zoom tests and docs.
- `m1.7g-scores-diary`: Scores and Diary.
- `claude/m1-7e-help-and-tour-795ea8`: Help, the guided first day and empty states.
- `claude/m1-8-stage1-wrap-eafda9`: install, offline, error screens, speed budgets and cost measurement.
- `m1.8-stage1-joined`: Stage 1 joined and reviewed.

### Stage 2: farm hands and sheep

- `m2.1-hands-and-contractors`: farm hands, wages and contractor fencing (engine).
- `m2.2-hands-screens`: workforce screens, worker report and the team fencing tool.
- `claude/m2-3a-sheep-benchmarks-99f42d`: the sheep benchmark table with sources.
- `m2.3-sheep-model`: the sheep model and the engine half of 2.4.
- `m2.5-calf-growth`: calf cost of gain and milk against condition.
- `m2.6-grass-quality-review`: the grass quality review (`docs/GRASS_QUALITY_REVIEW.md`). This branch changes no model or test.
- `m2.7-engine-joined`: sheep and calf lines joined, then a review of the sheep third pass.
- `m2.8-sheep-screens`: sheep screens and map.

### Stage 3: accounts, server and Daily Farm

- `m3.1-database`: Supabase tables, access rules and tests.
- `m3.2-accounts-and-saves`: sign-in, accounts, database saves and the farm picker.
- `m3.5-admin-shell`: the admin area, switches, users, audit log and maintenance mode.
- `m3.3-daily-farm`: Daily Farm and the midnight rollover.
- `m3.4-notifications`: web push, email, inbox and reminders.

### Stage 4: competition and community

- `m4.2-community`: profiles, following, posts, feed, photos, then Stage 4 (boards, groups, challenges, ticker, farm viewing, moderation).

### Stage 5: money and launch

- `m5.1-ad-slots`: ad slots, campaigns, house ads and reports.
- `m5.2-purchases`: one-off purchases through Stripe Checkout and paying to keep going.
- `claude/m5-4-website-363c83`: the public website.
- `m5.3-dashboard`: the admin dashboard and analytics (in progress; at this point it sits at the same commit as `m6-joined`).
- `m5.5-launch-check`: end-to-end flows, restore drill and farm export (in progress).

### The join

- `m6-joined`: joins Stage 1 to Stage 4 and ad slots and purchases (engine 0.18.0, save format 13), with the wiring between Daily Farm, notifications, ads, purchases and community.
- `m6-final-report`: this report.
