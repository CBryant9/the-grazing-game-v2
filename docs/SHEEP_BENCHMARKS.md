# Sheep benchmarks (draft for Claudia)

**Status: draft, 14 Nov 2026. Not yet agreed.** This is milestone 2.3's first step (BUILD_PLAN 2.3, PRD 5.12): the sheep figures from published sources, and the benchmark table the sheep model will be built to. Once Claudia agrees it, the table at the end goes into `docs/CALIBRATION.md` and each row becomes an automated engine test, the same way the cattle benchmarks did. Nothing in the engine uses these figures yet.

Sheep are offered in three districts: Northern Tablelands NSW (Armidale), Central West NSW (Dubbo) and Western Victoria (Hamilton). Not Central Queensland (PRD 5.12, section 21 row 24).

## How to read this file

- **Every figure has a source.** The sources are numbered (S1, S2 ...) in the list at the end. A figure's line names the source, and the page or table where the source is a PDF.
- **All sources were read on 14 Nov 2026**, either as the web page or as the PDF's text.
- **Only figures read on the page are used.** Figures seen only in a search summary were left out, or marked "search summary only, not used".
- **Other regions are marked.** "WA source", "SA source", "Tas source" or "international" means the figure is not from the eastern states.
- **"Not found"** means the figure was searched for and not found on a page that could be read. What was tried is given. Many NSW DPI pages refused automatic reading (403), so several NSW figures come from the same material on nsw.gov.au, Making More From Sheep or MLA.
- **"My arithmetic"** marks a figure worked out here from a sourced one. It is not in the source.
- Where sources disagree, each is given and one is recommended. Each recommendation is also in "Calls for Claudia".

## 1. Classes and DSE

### What a DSE is

| Source | Reference animal | Energy |
|---|---|---|
| MLA, "Why is calculating forage demand important?" (S1) | 50 kg wether at maintenance, walking 7 km a day | 1 AE = 8.4 DSE. 1 AE is a 450 kg steer at maintenance, 73 MJ ME a day |
| Agriculture Victoria, Drought Feeding and Management of Sheep, ch. 3, pp. 30–31 (S4) | 2-year-old dry sheep at CS 3, "generally 45–50 kg" | 7.6 to 9.7 MJ ME a day. A dry 50 kg wether is 1 DSE at 8.3 MJ |
| Making More From Sheep, Tool 12.14 (S6) | 50 kg wether at CS 3 | not given |
| NSW Government, "Stocking rates" (S5) | not stated | "One DSE requires 1.1 kg of dry feed per day to survive" |
| WA DPIRD, "What are Animal Equivalents?", p. 2 (S2). **WA source** | 45 kg Merino wether, no weight gain | 8.4 DSE to 1 AE |
| Hyder 2006, Lifetime Wool (S3). **WA source** | 50 kg wether in good condition | about 8.6 MJ a day |

- Beef Central, 28 June 2017 (S51, a news article, secondary): NSW DPI uses a 50 kg wether, Victoria 45 kg and MLA 50 kg.
- **Recommended:** a 50 kg dry wether at CS 3, at maintenance, is 1 DSE, and 1 AE = 8.4 DSE. MLA, NSW and MMFS say 50 kg, and Agriculture Victoria's own guide now says 45 to 50 kg with a 50 kg worked example. Only WA says 45 kg alone. Two sources (S1, S2) give 8.4.
- **The game now uses 8.** MODEL.md says `DSE = AE × 8` for the cattle display. 8.4 is the published figure. See call C3.
- **Cross-check (my arithmetic):** the game's 1 AE eats 3,285 kg DM a year (CALIBRATION.md). That is 9.0 kg a day. Divided by 8.4, one DSE eats 1.07 kg a day, which matches NSW's 1.1 kg a day (S5).

### DSE ratings by class

NSW Government, "Stocking rates" (S5): wether 1.0; dry ewe 1.0; ram 2.0; ewe in late pregnancy 1.5; ewe with a single lamb at foot 2.5. There is no separate lamb, weaner or hogget row.

Making More From Sheep, Tool 12.14 (S6), Merino ewes. It credits Alchin and others 2008, adapted by AWI and MLA. The page does not say which stage of pregnancy the pregnant columns mean.

| Live weight | Dry | Pregnant, single | Pregnant, twins | Lactating, single | Lactating, twins |
|---|---|---|---|---|---|
| 40 kg | 0.9 | 1.1 | 1.3 | 2.1 | 2.9 |
| 45 kg | 0.9 | 1.2 | 1.4 | 2.3 | 3.2 |
| 50 kg | 1.0 | 1.3 | 1.5 | 2.5 | 3.4 |
| 55 kg | 1.1 | 1.4 | 1.5 | 2.7 | 3.7 |
| 60 kg | 1.2 | 1.4 | 1.6 | 2.9 | 4.1 |
| 65 kg | 1.2 | 1.5 | 1.7 | 3.1 | 4.3 |

Making More From Sheep, Tool 12.14 (S6), Merino weaners, DSE by growth after weaning. The page also showed a 65 kg weaner row identical to the 65 kg ewe row, which looks like a page error and is left out.

| Live weight | 0 g/day | 50 g/day | 100 g/day | 150 g/day |
|---|---|---|---|---|
| 15 kg | 0.4 | 0.5 | 0.6 | 0.8 |
| 20 kg | 0.5 | 0.6 | 0.8 | 1.0 |
| 25 kg | 0.6 | 0.7 | 0.9 | 1.1 |
| 35 kg | 0.7 | 0.9 | 1.3 | 1.5 |
| 40 kg | 0.8 | 1.0 | 1.3 | 1.5 |

(The 30 kg row read 0.6, 0.9, 1.2, 1.4, which is out of step with the rows either side. Left out until checked.)

Agriculture Victoria, Drought Feeding and Management of Sheep, table 3.1, p. 31 (S4). The PDF's columns came out scrambled and were matched by row order, so check against the printed table before any of these becomes a test.

| Class | DSE | MJ ME a day |
|---|---|---|
| Dry, 50 kg, CS 3 | 1.0 | 8 |
| Dry, 60 kg, CS 3 | 1.1 | 9 |
| Last 4 weeks of pregnancy, single, 50 kg, CS 2 | 1.5 | 12 |
| Last 4 weeks of pregnancy, single, 60 kg, CS 3 | 1.8 | 14.5 |
| Single lamb at foot, 50 kg, CS 3 | 2.2 | 18.5 |
| Single lamb at foot, 60 kg, CS 3 | 2.6 | 21.5 |
| Weaner, 25 kg, 0 g/day | 0.7 | 6 |
| Weaner, 25 kg, 100 g/day | 1.0 | 8 |
| Weaner, 15 kg, 200 g/day | 1.2 | 10 |

- **Lambs at foot** are counted inside the ewe's rating ("ewe with lamb at foot", S4, S5, S6). No source gives a lamb its own DSE before weaning. The cattle model does the same with calves under 90 days (MODEL.md).
- **Hoggets:** not found as a separate class. Searched NSW, MMFS and Agriculture Victoria DSE tables. The weaner table by weight and growth covers them up to 40 kg.
- **Rams:** only NSW's 2.0 (S5) was found.
- **Standard reference weight (SRW) by breed:** not found as a table. Searched MMFS, Lifetime Wool and NSW pages. Lifetime Wool's lamb survival table uses "a medium Merino of 50 kg SRW" (S19, p. 26). MMFS ch. 8.2 uses a ewe of 55 kg SRW (S10). See call C29.

## 2. Intake and energy needs

### Energy by stage

Agriculture Victoria, "Nutrition and health of ewes after the break", 16 May 2025, from Lifetimewool (S7). Ewes at CS 3, MJ ME a head a day:

| Ewe | Merino size | Not pregnant | Pregnant, day 130 | Mid-lactation |
|---|---|---|---|---|
| Single | Medium | 8 | 13 | 21 |
| Single | Large | 10 | 15 | 23 |
| Twins | Medium | 8 | 16 | 26 |
| Twins | Large | 10 | 18 | 30 |

- Lifetime Wool, cereal-sheep zone handbook, p. 12 (S18, **WA source**): by lambing, energy needs are up 50% for a single and 80% for twins.
- Agriculture Victoria, "Feed intake: how much can they eat" (S8), worked examples: a 60 kg ewe needs 9 MJ dry, 14.4 MJ pregnant and at least 21.5 MJ lambing. A 25 kg lamb needs about 8 MJ.
- MLA triplet ewe factsheet (S35): a triplet-bearing ewe needs more than twice maintenance in the last few weeks.
- Growth: Agriculture Victoria table 3.1 (S4) gives a 25 kg weaner 6 MJ at no gain and 8 MJ at 100 g a day. The AWI weaner feed budget tables (S21) give energy and protein for 50 to 250 g a day, but were not copied out.
- **The two sources agree well:** a 50 kg ewe needs about 8 MJ dry (S4, S7). In late pregnancy a single needs 12 to 13 MJ and twins need 16 (S4, S7). At mid-lactation a single needs 18.5 to 21 and twins need 26.

### Intake as a share of live weight

Agriculture Victoria, "Feed intake: how much can they eat" (S8), and the same wording in S4, p. 32:

- Dry adult sheep eat "2–3% of their body weight".
- Growing lambs eat about 4%.
- Lactating ewes eat 4 to 5.5% "on good quality feed".
- On fibrous feed the most they can eat is 120 ÷ NDF%. At 50% NDF that is 2.4% of live weight. Low-quality, fibrous feed lowers intake.
- **Intake on dry, stemmy feed as a % of live weight: not found** for sheep. Searched Agriculture Victoria, MMFS and Lifetime Wool.

### Feed it takes: green mass and digestibility

MLA Pasture Ruler (S9) and ProGraze 9th edition, table 2.1 (S58), worked out with GrazFeed. These are the least kg of **green** DM/ha for each class to do as listed. "No" means the class cannot do it at that digestibility.

| Class | 75% digestible | 68% | 60% |
|---|---|---|---|
| Dry sheep, maintain | 400 | 600 | 1,200 |
| Ewes, mid-pregnancy | 500 | 700 | 1,700 |
| Ewes, last month of pregnancy | 700 | 1,200 | no |
| Ewes lactating, single | 1,000 | 1,700 | no |
| Ewes lactating, twins | 1,500 | no | no |
| Weaners growing 125 g/day | 600 | 1,000 | no |
| Weaners growing 175 g/day | 800 | 1,700 | no |
| Weaners growing 225 g/day | 1,600 | no | no |
| Dry cow, for comparison | 700 | 1,100 | 2,600 |

- **MMFS ch. 8.2, table 8.1 (S10)** gives the same classes as **feed on offer**. Dry sheep need 700, 900 and 1,500. Ewes lactating a single need 1,300 and 2,000. Weaners at 125 g a day need 900 and 1,300.
- **The two tables agree.** Lifetime Wool (S19) defines feed on offer as herbage mass + 300 kg DM/ha. Add 300 to the Pasture Ruler figures and they match table 8.1 in every cell checked: 400 becomes 700, 600 becomes 900, 1,200 becomes 1,500 and 1,000 becomes 1,300 (my arithmetic). The game keeps green feed (G) apart from dead feed (D), so the Pasture Ruler's green figures are the ones to test against.
- **Height:** ProGraze (S58, p. 9) and the Pasture Ruler (S9) say "close to maximum intake is achieved once a pasture reaches about 6 cm for sheep and 14 cm for cattle". ProGraze table 2.4 (S58) turns height into green mass: 2 cm is 700 kg, 4 cm 1,200, 6 cm 1,600, 8 cm 2,000 and 10 cm 2,400 kg green DM/ha.
- **Short feed:** EverGraze, "Grazing management systems explained" (S61): sheep intake is "severely limited" below 800 kg DM/ha feed on offer, and cattle intake below 1,200.
- **Sheep graze closer:** MLA, "Animal selection" (S12): "Sheep are more effective in achieving the desired grazing height than cattle because they graze closer to the ground." No numeric comparison of sheep and cattle diet quality was found.
- **Weaner growth points from MMFS ch. 10.4 (S17):**
  - Figure 10.4: a 30 kg second-cross wether lamb in November grows 225 g a day at 750 kg DM/ha at 75% digestibility, or at 1,900 at 65%.
  - Figure 10.5: a 20 kg Merino ewe lamb in December, with 500 kg dead at 45%, grows 150 g a day at 600 kg DM/ha at 75%, or at 1,450 at 65%.
  - These are for one animal and one month. They differ from the Pasture Ruler's 1,600 for 225 g a day, because the lambs and conditions differ.
- **Minimum grazing levels:**
  - MMFS ch. 7.2 (S11): dry sheep 500 kg DM/ha. Late pregnancy 1,000 for singles and 1,200 for multiples. Lambing and lactation 1,200 for singles and 1,500 for multiples.
  - EverGraze (S61): take stock off at 1,000 kg DM/ha or 70% ground cover.
  - EverGraze Hamilton (S54): destock at 800 kg DM/ha feed on offer or 70% ground cover.

## 3. Lamb and weaner growth

- **Weaners on good green pasture:** Lifetime Wool cereal-sheep zone handbook, p. 17 (S18, **WA source**). "Weaners on good green pasture (>2000 FOO) should grow at more than 200 g/head/day for large Merinos and crossbreds."
- **Minimum after weaning:** MMFS ch. 10.4 (S17).
  - Weaners should grow at least 50 g a head a day, until 12 months of age.
  - Weaners under their target weight need at least 1 kg a month.
  - An extra 0.25 to 0.5 kg a month cuts the risk of death by 74%.
- **Other minimums:**
  - Thompson and others 2011 (S20) say weaners need to grow 30 g a day or more for good survival after weaning.
  - A Central Tablelands NSW trial (S43) aimed for at least 0.5 kg a month, which is about 16 g a day (my arithmetic).
- **Weaning weight:** MMFS ch. 10.4 (S17).
  - Wean at 45% of SRW or more.
  - Wean no later than 14 weeks from the start of lambing.
  - The "gold standard" weaner pasture is 1,800 to 2,100 kg DM/ha of actively growing green feed of mixed species.
- **Weaning weight and the ewe's feed:** Thompson and others 2011, Animal Production Science 51:784 (S20). Merino lambs from ewes on 800 to 3,000 kg DM/ha feed on offer through lactation weaned at 13.8 to 28.3 kg. In Victoria, survival fell significantly below 20 kg at weaning. (Table 1 of the paper came out garbled, so only the range in the text is used.)
- **Lifetime Wool, southern slopes NSW and north central Victoria (S19):** the target after weaning is 1,000 kg DM/ha feed on offer. The lamb growth curve against feed on offer is a graph only, with no numbers in the text.
- **Lamb growth before weaning:** Kelly 1992, Australian Journal of Agricultural Research 43:1399 (S68, **WA source**, commercial Merino flocks, read from the abstract). From marking to weaning, singles grew 198 g a day and twins 193 g a day.
- **Crossbred and prime lambs before weaning (g a day): not found.** Searched MMFS ch. 10.4 and tool 3.1, Lifetime Wool handbooks, MLA and WA DPIRD. The Lifetime Wool curve of lamb growth against feed on offer (S18, p. 16) is a graph only.
- **Growth on dry summer feed or stubble:** not found. WA DPIRD's "Growing weaner sheep" page (WA source) showed only a summary. Its figures were seen only in a search summary and are not used.

## 4. Condition score

- **Kilograms per CS:** van Burgel and others 2011, Animal Production Science 51:834 (S27), 15 Merino flocks. "On average 9.2 kg per unit change in condition score or 0.19 times the standard reference weight of the flock." That is 9.5 kg for a 50 kg SRW ewe (my arithmetic).
- NSW Government, "Joining sheep" (S28): one **fat** score is about 7 to 8 kg. That is a different scale, so it is not used for CS.
- Crossbred and maternal ewes: kg per CS not found. Searched Lifetime Wool, MMFS and NSW pages.

### Targets for Merino ewes

| Stage | Southern slopes NSW and north central Vic (S19) | Cereal-sheep zone, May lambing (S18, **WA source**) | AWI 2025 (S22) |
|---|---|---|---|
| Joining | CS 2.6 (text says 2.6–3.0) | 2.7+ | 3 |
| Early to mid pregnancy | 2.3 (a slow loss is allowed) | 2.7+ (hold) | 3 at scanning |
| Lambing | 2.6, back to joining CS | 2.7 singles, 2.7+ twins | 3 singles, 3.3 twins, 3.5 triplets |
| Weaning | 2.4+ | 2.5–2.7 | 3 |

- Agriculture Victoria (S7) says CS 2.7+ from joining to lambing, and that CS 2 or less carries a significant risk of death.
- MMFS pregnancy toxaemia fact sheet (S23) says CS 3+ at lambing for singles and 3.3+ for twins.
- Feed on offer from the same sources:
  - Southern slopes handbook (S19): 900 kg DM/ha green at day 90 of pregnancy. In late pregnancy, 1,000 for singles and 1,200 for twins. At lambing, 1,200 for singles and 1,800 for twins.
  - MMFS fact sheet (S23): 1,300 and 1,800 at lambing on 75% digestible feed.
  - AWI (S22): 1,100 and 1,500 green.
  - Lifetime Wool (S24, **WA source**): wool and twin survival stop improving at 1,500 to 2,000.
- Southern slopes handbook (S19): "A ewe of CS 2.0 at joining will need three months on good green feed (1000 FOO) to gain half a condition score by lambing."

### What CS does

- **Conception:**
  - Lifetime Wool handbooks (S18, S19): "For each extra condition score at joining, on average, 20 more lambs are conceived per 100 ewes joined." It varies from 0 to 40 between Merino strains.
  - MMFS ch. 10.1 (S25): about 20% more lambs for each extra CS, with a range of 7 to 36%. The response is linear from CS 1.5 to 4.5. Above CS 4 the risk of a hard birth rises.
  - **Cross-check:** Ferguson and others 2011 (S26) found 2.4 (Victoria) and 1.7 (WA) more foetuses per 100 ewes for each extra kg at joining. At 9.2 kg per CS that is 16 to 22 per CS (my arithmetic), which matches the 20.
  - NSW Government (S28): about 13 more lambs born per 100 ewes joined for each fat score (Merino).
- **Lamb survival, Lifetime Wool southern slopes handbook, p. 26 (S19):** the baseline is a medium Merino of 50 kg SRW held at CS 3.0 throughout. Lamb survival is 91% for singles and 71% for twins.

  | Ewe CS at lambing | Change in single survival | Change in twin survival |
  |---|---|---|
  | 2.0 | −19 points | −39 points |
  | 2.5 | −9 | −21 |
  | 3.5 | +5 | +16 |
  | 4.0 | +7 | +23 |

  The PDF text did not make clear which column is which, so check against the printed table before this becomes a test.
- **Same handbook (S19):**
  - Victorian farm cases: "15–20% more lambs survive" from ewes at CS 3.0–3.5 than from ewes at CS 2.0–2.5.
  - A twin-bearing ewe at CS 4.0 rather than 3.0 at lambing gives "an increase in lamb survival of more than 10%".
- **Ewe deaths:**
  - Lifetime Wool (S18, S19): deaths are a serious issue below CS 2.0 in late pregnancy or at lambing. Twin-bearing ewes die at least 2 to 3% more at the same CS. "Ewe mortality doubles at CS 1.5." Ewe deaths at the CS 3.0 baseline are 3.2% (S19, p. 26).
  - MLA triplet ewe factsheet (S35): for Merino triplet-bearing ewes, each CS lower at lambing adds 3.5% to deaths, and losing 1 CS between scanning and lambing adds 3.8%.
- **Birth weight:**
  - The ideal is 4.5 to 6.0 kg. Singles average 4.9 kg and twins 3.7 kg (S19).
  - Losing 1 CS in early to mid pregnancy cuts birth weight by up to 0.30 to 0.35 kg (S18, S19).
- **Progeny wool:** lambs from ewes held in condition to mid-pregnancy cut 0.1 kg more clean wool and up to 0.2 micron finer than lambs from ewes that lost 0.5 CS (S19).
- **Pregnancy toxaemia** (S23, S18, S31 p. 33):
  - It strikes in late pregnancy, "most likely to develop in fat or lean ewes when high energy requirements are not being met or when feed intake is depressed".
  - The triggers listed are low CS, over-fat ewes, twins, drought, a cold snap, a sudden change of feed, and yarding or trucking.
  - 70% of the lamb's growth happens in the last two months (S23).
  - **A rate of cases or deaths against CS: not found.**

## 5. Breeding

| Figure | Value | Source |
|---|---|---|
| Oestrous cycle | 17 days | MMFS ch. 10.1 (S25); NSW Government "Joining sheep" (S28) |
| Joining length | 5 weeks, two cycles ("rams in at 2% for 35 days") | S25, S28 |
| Gestation | 147 days (MSD Veterinary Manual, **international**). Lifetime Wool's Australian handbooks plan lambing at "day 150" counted from the start of joining, which fits 147 days plus the days it takes ewes to conceive. No Australian source giving gestation itself in days could be read | S29, S18, S19 |
| Rams, mature ewes | 1% plus one extra ram | S25 |
| Rams, maiden ewes | at least 1.5% | S25 |
| Rams, ewe lambs | 2% | S25 |
| Rams, other figures | NSW: 2% (S28). NSW sheep calendar, first-cross example: 1 ram to 35–50 ewes (S30). MSD: 1 to 40, 1 to 150 in very large flocks (S29, international) | |
| Pregnant after two cycles, in season | at least 90% of Merino ewes; up to 98% of crossbred ewes. About 10% lower out of season. Look into it if more than 15% are empty | S25 |
| Maiden Merinos at joining | 75–80% of SRW | S25 |
| Ewe lambs at joining | 7–10 months old (crossbred, shedder and some Merino lines), at least 45 kg | S25, S17 |
| Ewe hoggets before joining | 80% of SRW | S17 |
| Weight at joining and weaning rate | about 3% more weaned for each extra kg between 35 and 45 kg | S25 |

### Scanning, marking and weaning

- **Industry averages:** MLA final report L.LSM.0027, Jacobson and others, April 2020, p. 39 (S31), using the Trompf 2018 averages.
  - Merino ewes scan 125% and mark 86%.
  - Non-Merino ewes scan 155% and mark 112%.
  - These are lambs per 100 ewes joined.
- **Targets, SheepConnect SA (S32, SA source):**
  - Conception of 120% for Merinos and 150% or more for crossbreds.
  - Survival of 92% for Merino singles and 75% for twins.
  - Survival of 97% for first-cross singles and 87% for twins.
- **Survival "better than", MMFS ch. 10.3 (S33):** Merino singles 90% and twins 70%. Crossbred singles 90% and twins 80%.
- **Triplets, MLA triplet lamb factsheet, April 2025 (S35):**
  - Merino triplet survival is 52.9%, against 75.5% for twins.
  - Maternal triplet survival is 60.1%, against 81.4% for twins.
- **Marking by state:** MLA B.LSM.0055, Curtis, June 2014, table 11, p. 23 (S34), from ABS data. Lambs marked as a % of ewes mated:

  | State | All ewes 2010–11 | All ewes 2011–12 | Merino 2010–11 | Merino 2011–12 |
  |---|---|---|---|---|
  | NSW | 90 | 90 | 81 | 82 |
  | Vic | 92 | 94 | 75 | 81 |
  | Australia | 89 | 90 | 80 | 82 |

  Same report, p. 5: pure Merino 80%, Merino cross 88%, other breeds 98%. NSW all ewes read 79% in 2005–06 and 2006–07 (drought years) and 85% in 2008–09.
- **Weaning at Hamilton** (S55):
  - Merino ewes weaned about 92% and Coopworth composites about 141% at the EverGraze site.
  - The farm monitor averages were 80% and 118%.
- **Scanning or marking for the Northern Tablelands, Central West or Western Victoria on their own:** not found. Searched MLA, MMFS, ABARES and NSW pages. The state figures above stand in.

### When joining happens

- **NSW sheep calendar (S30):** one first-cross example. Join in March, scan in May to June, lamb in August, mark in September, wean in mid-November.
- **Hamilton (S54, S55):** lambing in September from 2006 to 2008, moved to mid-August in 2009.
- **Lifetime Wool, southern slopes NSW and north central Victoria (S19):** this zone lambs in late winter to spring, which "provides the best match" with its feed.
- **MMFS ch. 10.1 (S25):** aim to lamb about a month before peak pasture growth. Spring suits Merinos best.
- **Worked from the game's own growth curves (my arithmetic, DATA.md):**
  - Native growth in Western Victoria and the Central West both peaks in October. A month before is September lambing, so joining in April at 150 days.
  - The Northern Tablelands peaks from November to January (highest in December). A month before is October to November lambing, so joining in May to June.
  - Hamilton's real lambing (August to September, S54) fits this.
- **Northern Tablelands and Central West joining dates from a source: not found.** Searched NSW Government, MMFS, Lifetime Wool and CSIRO. A Hamilton trial joined on 5 April or 8 May, and a Central Tablelands trial preferred March to April joining, but both were seen only in search summaries and are not used.

## 6. Wool

### Cut per head

- **National average:** the Australian Wool Production Forecasting Committee (AWPFC), August 2026 (S45), estimates 2025/26 at 4.29 kg greasy a head. The April 2026 report (S44) forecast 4.31 kg. The national mean fibre diameter is 20.5 micron and the yield is 63.6% (S45). Victoria's July 2026 test data average 21.3 micron, coarser with more crossbred wool (S45).
- **By class and breed.** The NSW DPI gross margin budgets, which give cut per head by enterprise, refused automatic reading on every host tried (403). Their figures were seen only in search summaries and are not used. What was read:

  | Class | Clean fleece | Micron | Where | Source |
  |---|---|---|---|---|
  | Merino wethers, average of 59 bloodlines | 4.2 kg | 19.0 | NSW trial sites, Northern Tablelands among them; live weight 53.7 kg | NSW Government, Merino bloodline comparison (S64) |
  | Merino ewes, 2015 drop, fine-wool sires, first shearing after weaning (8 months of wool) | 1.2 kg | 15.3 | Balmoral, western Victoria | AWI Merino Lifetime Productivity, Beyond the Bale June 2020, table 1 (S62) |
  | Same ewes as adults, ages 2 to 5 | 3.3, 3.9, 3.8, 3.5 kg | 16.4, 17.8, 16.9, 16.6 | Balmoral | S62 |
  | Merino ewes, 2018 drop, lifetime average | 4.7 kg a year | not given | Macquarie, Trangie NSW (central west, 496 mm) | AWI, Beyond the Bale issue 104, Spring 2025 (S63) |

- **First-cross against Merino ewes, greasy:** MLA PIRD S98/W01, November 2005 (S65, **WA source**). Over four shearings Merino ewes cut 4.14 kg greasy and Poll Dorset × Merino first-cross ewes 2.99 kg. (The Border Leicester × Merino figure, about 3.47 kg, is uncertain because the table's columns were garbled.) First-cross wool was coarser and yielded higher than Merino. No yield or micron figures were given.
- **Older figures:** MLA SCSB.051 (Hassall, March 2004, S66) lists clean cuts of 2.8 to 4.1 kg for its Merino classes, but the PDF's rows could not be matched to classes with confidence, so they are not used.
- **Clean yield by class, and micron for crossbred and lamb's wool: not found.** Only the national yield (63.6%, S45) was read.
- **The Balmoral flock** is superfine to fine (15 to 18 micron). Medium-wool Merinos (19 to 21 micron), the wool most of the three districts grow, are better matched by the NSW wether average.

### What feed and breeding do to wool

Hinch, University of New England WOOL412/512, lecture 5, 2013 (S46):

- Fleece weight peaks at about 3 to 4 years of age.
- Males cut more wool and are 1 to 3 micron coarser (about 12%).
- Merino ewes turn feed into wool about 40% less efficiently across pregnancy and lactation.
- In the last third of pregnancy wool growth is 20 to 40% lower.
- Fibre diameter falls through pregnancy and is lowest near lambing.
- In lactation wool growth rises even while the ewe loses weight.
- A dry ewe grows 14.5 g of wool per kg of feed, and a ewe rearing a lamb grows 8.8 g.
- Tender wool is under 30 N/ktex. Weaners, two-tooths and breeding ewes are the most at risk, and over 40% of WA tender wool comes from breeding ewes (**WA figure**).

Lifetime Wool (S18, S19): a change of one CS over pregnancy is about 0.7 kg of clean fleece weight and 0.9 micron.

**Not found:**

- Micron change per kg of live weight change.
- Where the break sits along the staple after a dry spell.
- Searched Agriculture WA (the page was gone, 404) and CSIRO (search summaries only).

### Shearing and crutching

- **Timing:** Tasmanian government sheep health and welfare guide, July 2019 (S48, **Tas source**). Shearing is once a year, and crutching comes "some six to eight months after shearing".
- **Fly protection:** Flock & Herd (S38): shearing or crutching gives "6 weeks protection" from flystrike.
- **Pre-lamb or spring shearing by district:** not found.
- **Pastoral Award rates from 1 July 2024:** Fair Work Ombudsman pay guide (S47). These are award rates from 2024. The 2025 and 2026 rates were not read.

  | Job | Rate |
  |---|---|
  | Machine shearing, flock sheep, not double-fleeced | $381.58 a 100 |
  | Shearing, rams | $763.16 a 100 |
  | Shearing, double-fleeced flock sheep | $508.76 a 100 |
  | Full crutch at sheds, flock sheep | $110.66 a 100 |
  | Full crutch not at sheds | $95.40 a 100 |
  | Wool classer | $438.56 a 1,000 sheep |
  | Wool presser, by hand | $23.16 a bale |
  | Wool presser, by power | $15.44 a bale |

  That is $3.82 a head for the shearer and $1.11 for a full crutch at the shed (my arithmetic), before shed hands, pressing, classing and contractor margins.
- **All-in cost per head:** not found for a current year.
  - The NSW budgets' per-head shearing and crutching costs were seen only in search summaries, so they are not used.
  - MLA SCSB.051 (S66) used $4.60 a head for shearing in 2004, which is too old to use.
  - Sheep Central, 5 August 2026 (S74), on NSW DPIRD's 2026 budgets: wool harvesting is about 28% of total costs in Merino breeding and wether enterprises.
- **Mulesing and marking cost: not found.**

## 7. Deaths

| Figure | Value | Source |
|---|---|---|
| Ewe deaths, a year | "2–10% in New Zealand and Australia", highest around lambing and for multiple-bearing ewes | L.LSM.0027, section 1.2 (S31) |
| Ewe deaths at CS 3.0 baseline | 3.2% | Lifetime Wool, southern slopes, p. 26 (S19) |
| Ewe deaths, scanning to marking | singles 1.6% (10th–90th percentile 0.5–3.0%); twins 3.3% (1.2–5.0%); triplets 6.4% (1.8–14.5%) | MLA triplet ewe factsheet, April 2025, table 1 (S35) |
| Ewe deaths during lambing, national survey of 160 farms, 2024 | self-replacing Merino flocks 1.95%; prime lamb and first-cross flocks 3.25%. Across all types under 3.5% at lambing and under 4.5% a year. Lowest with autumn lambing (2.2%), highest with spring (2.8%) | AWI and MLA, Merino ewe mortality survey, GD5229 (S67) |
| Ewe deaths on single farms | 1.1%, 2.3%, 1.7% and 12.0% on four farms (S18, **WA source**); 1 to 9% a year on a Queensland farm with wild dogs (S69) | S18, S69 |
| Wether deaths, a year | **not found.** The NSW wether budget's figure was seen only in a search summary. Searched NSW budgets, MLA, AWI and Holmes Sackett | |
| Lambs dying before weaning | 20–30%, 74% of them within 3 days of birth. Singles lose 6–30%, twins 19–63% | L.LSM.0027 (S31) |
| Lamb deaths in the first 48 hours | more than 80% of all losses. Twins lose 2 to 2.5 times what singles do | Flock & Herd, "Neonatal lamb mortality" (S36) |
| Lamb deaths from 3 days to weaning | should be under 3%. Marking to weaning normally under 1% | MMFS ch. 10.3 (S33) |
| Causes of newborn deaths, southern NSW, 3,198 lambs (Refshauge 2015) | starvation and mismothering 25%, stillbirth 21%, birth injury 18%, death before birth or premature 10%, hard birth 9%, predators 7%, cold 5% | S36 |
| Foxes | 5–10% of lambs, up to 22% | S33 |
| Weaner deaths after weaning, national | 4.6% average over 1,410 farms. 44% of farms over a benchmark of 4% a year. High deaths on 50% of mainly-Merino farms and 32% of mainly-crossbred farms. Highest in Qld and WA, lowest in NSW, Vic and SA | Campbell and others 2014, Animal Production Science 54:783 (S42) |
| Weaner deaths, Central Tablelands NSW trial, 11 farms, 2008 | target 5% or less; average 7.7% (2.9–21.1%) | Flock & Herd, "Eryvac project" (S43) |
| Weaner deaths by weight and growth | see table below. Deaths are highest in the 3 months after weaning. A 14 kg weaner has 34% less risk than a 12 kg one | MMFS ch. 10.4, table 10.1 (S17) |

MMFS ch. 10.4, table 10.1 (S17), from AWI's "Winning with Weaners":

| Group | Weaning weight | Growth after weaning | Share of flock | Deaths |
|---|---|---|---|---|
| 1 | 23.9 kg | 62.9 g/day | 36.5% | 0.8% |
| 2 | 18.1 kg | 135.8 g/day | 10.5% | 0.0% |
| 3 | 22.0 kg | −9.7 g/day | 14.1% | 11.2% |
| 4 | 17.1 kg | 65.9 g/day | 38.9% | 7.6% |

### Flystrike

- **Horton and others 2018** (S37), Animal Production Science 58:1289, eight well-run unmulesed flocks:
  - 17% of Merino ewes and 5% of crossbred ewes were struck.
  - 2% of struck ewes died within 7 days.
  - A strike cost up to 2.7 kg (Merino) or 5.2 kg (crossbred) of body weight and 0.3 CS.
- **Flock & Herd (S38):**
  - Shearing or crutching protects for 6 weeks.
  - All NSW blowfly samples tested to date resist cyromazine and dicyclanil.
- **Not found:**
  - The months of the fly season by district.
  - How much a crutch cuts strikes, as a number.

### Worms

WormBoss:

- **Tablelands and Slopes (S39):** summer weaning coincides with high worm-risk weather. Routine drenches go to ewes before lambing and to lambs at weaning. Worm test every 4 to 6 weeks in summer from weaning.
- **NSW (S40):** barber's pole worm comes in very wet years and in summer-rainfall country above 700 mm, "generally sporadic and of short duration".
- **Victoria (S41):** winter-rainfall country has black scour worm, small brown stomach worm and Nematodirus. "Very wet years generally cause higher burdens", and heavy burdens can kill before scouring shows.
- **Not found:** death rates or growth losses from worms as numbers.

## 8. Stocking rates by district

| District | Pasture | DSE/ha | Source |
|---|---|---|---|
| Northern Tablelands | Unimproved native | 5 | MLA L.PDS.2003, "Restoring pasture productivity in the Northern Tablelands", p. 12 (S57) |
| Northern Tablelands | Sown and fertilised | 12–17.5 (one farm); 13.3 over 12 months to Feb 2024 (another, about 8.3 above unimproved); 15 after improvement (p. 12) | S57 |
| Northern Tablelands | Fine wool Merinos, little super, Ebor (1,000 mm) | 5, estimated 14 after improvement | S57 |
| Western Victoria | District, long-term average (41 years) | 13.2 | EverGraze, Hamilton key message, livestock systems (S55) |
| Western Victoria | District, 2007–2011 | 16 | S55 |
| Western Victoria | Top 20% of producers | about 20 | S55 |
| Western Victoria | Regional potential | 20–23 | S55 |
| Western Victoria | EverGraze proof site, improved, 2006–2010 | 25–31 (Merino × terminal 14–16 ewes/ha, 25–30 DSE/ha) | S54, S55 |
| Western Victoria | Modelled, ryegrass and triple pastures | 20.3 and 19.7; extra feed costs outweigh income above about 30 | EverGraze, "Right plant, right place" (S56) |
| Central West | Whole mixed farm | 1.09 and 1.48 DSE/ha for each 100 mm of rain (top 20% and the rest; the PDF's columns were garbled, so check the printed table) | MMFS Central West fact sheet, "Profitable integration of cropping and livestock", table 2 (S59) |
| Central West | Modelled optimum (GrassGro) | 5 head/ha at Dubbo and Peak Hill, 4 at Trangie, 8 at Mudgee, 12 at Bathurst | Farrell 2009, Australasian Agribusiness Review 17(7) (S60) |

- **Rainfall from the sources:** Hamilton site 683 mm, "winter dominant rainfall, cold winters", with pasture growth of 8 to 12 t DM/ha a year (S54). Ebor 1,000 mm and Glen Innes 825 mm (S57). Trangie 496 mm (S63).
- **Rainfall at the three towns.** The Bureau of Meteorology's own pages refused automatic reading (403), so these were read on Wikipedia's town pages, which quote the Bureau's tables (S71, S72, S73, secondary). Confirm them on the Bureau's site.
  - Armidale Airport AWS, 1994–2023: 792.1 mm.
  - Dubbo Airport AWS, 1993–2026: 594.3 mm.
  - Hamilton Airport, 1983–2022: 617.3 mm.
- **Central West worked out (my arithmetic):** 1.09 to 1.48 DSE/ha for each 100 mm (S59) at Dubbo's 594 mm gives 6.5 to 8.8 DSE/ha. That is a whole mixed farm with sown pasture and lucerne, not native pasture.
- **Wheat-sheep zone model:** MLA SCSB.051 (S66, 2004) assumed 3.5 DSE/ha in the wheat-sheep zone and 10 DSE/ha in the high-rainfall zone.
- **Native pasture in the Central West and Western Victoria (DSE/ha): not found.** Searched NSW DPI, LLS, Agriculture Victoria, EverGraze and MLA. Most Western Victoria figures are for farms that are mostly improved pasture.
- **A rule of DSE per 100 mm with a rainfall threshold:** not found. The Central West figure above is the only per-100 mm figure read.

**What the game's native pasture carries now, for comparison** (my arithmetic, from DATA.md and the carrying capacity rule in CALIBRATION.md: annual growth × 0.65 × safe use ÷ 3,285 kg):

| District | Annual native growth | Safe use | AE/ha | DSE/ha at 8 | DSE/ha at 8.4 |
|---|---|---|---|---|---|
| Northern Tablelands | 6,101 kg | 0.35 | 0.42 | 3.4 | 3.5 |
| Central West | 5,496 kg | 0.30 | 0.33 | 2.6 | 2.7 |
| Western Victoria | 7,326 kg | 0.40 | 0.58 | 4.6 | 4.9 |

The Tablelands figure (3.4 to 3.5) sits under the one native figure found (5 DSE/ha, S57). The Western Victoria figure is for native pasture, and the district figures in the table above are for mostly improved farms, so the two can't be compared directly. See call C18.

### Enterprises

- **Northern Tablelands (S57):** fine wool Merinos have historically been the base. On one Ebor property they gave way to composite prime lamb ewes and Hereford cattle.
- **Western Victoria (S54, S55):** Merino ewes joined to terminal rams, and composite (Coopworth) ewes.
- **Central West:** not found from a page read. A Dubbo-area mixed Merino, prime lamb and cattle business, and DPI's note of winter (June) lambing in the wheat-sheep zone, were seen only in search summaries and are not used.
- **Sheep against cattle share by district:** not found.

## 9. Water

| Class | Average L/day | Summer L/day | Source |
|---|---|---|---|
| Weaners | 4 | 6 | Agriculture Victoria, "Stock water requirements" (S13) |
| Adult dry sheep | 6 | 10 | S13 |
| Ewes with lambs | 10 | 14 | S13 |

- **MMFS Tool 5.2 (S14):**
  - Weaners drink 2 to 4 L.
  - Dry sheep on grassland drink 2 to 6 L, and 4 to 12 on saltbush.
  - Ewes with lambs on dry feed drink 4 to 10 L, and rams 4 to 10.
  - Intake rises up to 80% in extreme heat, and about 40% more in summer than in winter.
  - Intake rises 50 to 80% when water is over 2,000 ppm salt.
- **NSW Government, "Water for livestock" (S16):**
  - Dry sheep drink up to 6 L and ewes with lambs up to 10.
  - In summer and drought they drink up to twice the normal amount.
  - Young, pregnant, lactating or stressed sheep tolerate less salt.
- **SheepConnect SA (S15, SA source):** a lactating female needs at least 50% more than a dry one. On dry feed in summer, sheep drink 2.5 to 3 times the weight of dry matter they eat.
- **The game's cattle rule** (10% of live weight, × 1.3 in summer, × 0.8 in winter, DATA.md) gives a 50 kg sheep 5 L, or 6.5 L in summer (my arithmetic). That is under Victoria's 10 L summer figure. See call C17.
- **How long sheep last with no water: not searched.** It is needed for the "dies without water" rule. See call C30.

## 10. Sheep-proof fencing

- **What makes a fence hold sheep:** Tasmanian government guide (S48, **Tas source**). A plain-wire fence that suits cattle "will not be adequate for sheep". It needs hinge-joint or similar prefabricated netting. Sheep push under gaps, and a netting skirt on the ground fixes small ones.
- **Cost:**
  - WA DPIRD station fence cost model, July 2026 (S49, **WA source**): a 10 km fence of 7/90/30 heavy hinge-joint netting with 1 plain and 2 barbed wires and steel posts every 20 m comes to $4,186 a km. That is materials and freight only (930 km), with no labour or gates. It is a planning model, not a quote.
  - Kondinin Group report 288, "Exclusion fencing", January 2016 (S50): $4,000 to $5,000 a km for materials and $7,000 to $8,000 a km in all. This is for wild-dog exclusion fence, not a plain sheep fence.
  - Leading Sheep case study, Banff Downs, Queensland, built 2012 (S69): $2,850 a km for materials plus $2,000 a km to build, about $4,850 a km. This is an exclusion fence.
  - Beef Central, 7 July 2025 (S70): Queensland cluster fences cost "over $8000 per km" in 2015, and a predator-proof fence now costs $15,000 to $20,000 a km, labour and materials.
- **A cattle fence cost to set against it, from the same kind of source: not found.** No dated Australian source read gives cattle and sheep fence costs side by side. Searched NSW DPI, LLS, Agriculture Victoria, Qld DAF and Kondinin. The federal 2004 fencing catalogue timed out.
- **The game's own cattle fence** is $7 a metre ($7,000 a km) new (DATA.md). That is the MVP's figure, with no source recorded. It is already above the sheep netting fence costs read here ($4,186 a km for materials in WA, about $4,850 a km built in Queensland in 2012).
- **How many electric wires a sheep fence needs, and how low the bottom wire goes:** not found from an Australian source. The figures seen came from UK and US product sheets and extension pages in search summaries, and are not used.

## 11. Prices

MLA's National Sheep and Lamb Indicators, June 2025, pp. 1–2 (S52). All in c/kg **carcase** weight, every fat score:

| Game class | Indicator | Covers |
|---|---|---|
| Lambs to the works, light | Light lamb | 12–20 kg carcase |
| Lambs to the works | Trade lamb | 20–26 kg carcase |
| Lambs to the works, heavy | Heavy lamb | 26–30+ kg carcase |
| Merino lambs | Merino lamb | all weights |
| Store lambs | Restocker lamb | 0–22 kg carcase |
| Cull ewes and wethers | Mutton | ewes and wethers, 14–30+ kg carcase |
| Store and breeding ewes | Online Sheep (AuctionsPlus), $ a head | Merino and crossbred ewes and wethers, all weights. The only restocker ewe indicator |
| Store lambs, online | Online Lamb, $ a head | 0–24 kg, not station mated |
| Rams | not found | |

- The MLA sheet gives fat scores by GR depth: 1 is 0 to 5 mm, 2 is 5 to 10, 3 is 10 to 15, 4 is 15 to 20 and 5 is over 20 mm.
- The indicators are carcase weight. Turning live weight into carcase weight needs a dressing percentage, which was **not searched** (call C31).
- **Yards:** Dubbo, Armidale and Hamilton sheep reports were not found as readable pages. The game's real-year data comes from MLA's statistics service already (DATA.md), so these can be pulled the same way as the cattle.
- **Lamb and mutton price levels: not found from a page read this session.** One figure (mutton 819 c/kg carcase, 14 August 2026) was seen in a search summary only and is not used.

**Wool, stand-in, dated.** AWI weekly price report, sales week 10, auctions 1 and 2 September 2026 (S53). Prices are c/kg clean, AWEX micron price guides:

| Micron | 17 | 18 | 19 | 20 | 21 | 26 | 28 | 30 |
|---|---|---|---|---|---|---|---|---|
| c/kg clean | 2,569 | 2,443 | 2,178 | 1,914 | 1,786 | 852 | 642 | 605 |

- **Eastern Market Indicator:** the sale commentary gives 1,890 c/kg clean (up 37). The page's ticker, which carries no date, showed 1,722 (up 24). See call C20.
- **Micron guides not on the page:** 16.5, 22, 23 and 32 micron were not given.
- **The ticker's date:** the micron figures are from the ticker too, which carries no date.

These are stand-ins only. Real wool prices need the AWEX agreement (PRD 5.14, BUILD_PLAN).

## Benchmark table

One row per test. **Kind** says what the test needs. "Unit" means a sheep and a feed, with no paddock or farm. "Paddock" means one mob on one paddock held at a set mass and quality. "Mob" means a mob through a joining, lambing or season. "Year" means a block run for a year in the district, judged on the average year, as the cattle are. Where a source gives one figure, the band is that figure ±10% unless the row says otherwise (call C6).

| ID | Class | District | Season or feed | Measure | Range to hit | Kind | Source |
|---|---|---|---|---|---|---|---|
| SB-01 | Dry Merino wether, 50 kg, CS 3 | any | maintenance | ME needed | 7.6–9.7 MJ/day | Unit | S4 |
| SB-02 | Dry Merino wether, 50 kg, CS 3 | any | maintenance | DSE | 0.9–1.1 | Unit | S1, S4, S6 |
| SB-03 | Dry Merino ewe, 40 kg and 60 kg | any | maintenance | DSE | 0.8–1.0 and 1.1–1.3 | Unit | S6, S4 |
| SB-04 | Medium Merino ewe, single, CS 3 | any | day 130 of pregnancy | ME needed | 12–14 MJ/day | Unit | S7, S4 |
| SB-05 | Medium Merino ewe, twins, CS 3 | any | day 130 of pregnancy | ME needed | 14.5–17.5 MJ/day | Unit | S7 |
| SB-06 | Medium Merino ewe, single | any | mid-lactation | ME needed | 18.5–23 MJ/day | Unit | S7, S4 |
| SB-07 | Medium Merino ewe, twins | any | mid-lactation | ME needed | 23.5–28.5 MJ/day | Unit | S7 |
| SB-08 | Large Merino ewe | any | each stage in SB-04 to SB-07 | ME above a medium ewe | 1.5–2.5 MJ/day more (2) at every stage, except twins in lactation: 3–5 more (4) | Unit | S7 |
| SB-09 | Merino ewe, 50 kg | any | last month of pregnancy, single | DSE | 1.3–1.5 | Unit | S5, S6, S4 |
| SB-10 | Merino ewe, 50 kg | any | lactating, single | DSE | 2.2–2.5 | Unit | S5, S6, S4 |
| SB-11 | Merino ewe, 50 kg | any | lactating, twins | DSE | 3.1–3.4 | Unit | S6, S7 |
| SB-12 | Ram | any | maintenance | DSE | 1.8–2.2 | Unit | S5 |
| SB-13 | Merino weaner, 25 kg | any | no gain, and 100 g/day | DSE | 0.6–0.7, and 0.9–1.0 | Unit | S6, S4 |
| SB-14 | Dry adult sheep | any | green leafy feed, plenty of it | intake | 2–3% of live weight | Unit | S8 |
| SB-15 | Weaner | any | green leafy feed, plenty of it | intake | 3.5–4.5% of live weight | Unit | S8 |
| SB-16 | Ewe, lactating | any | green leafy feed, plenty of it | intake | 4–5.5% of live weight | Unit | S8 |
| SB-17 | Dry sheep | any | green 400 kg/ha at 75%; 600 at 68%; 1,200 at 60% | live weight change | −20 to +20 g/day at each; losing weight at 60% of each mass | Paddock | S9, S58 |
| SB-18 | Ewe, last month of pregnancy, single | any | green 700 at 75%; 1,200 at 68% | needs met | 90–110% of needs at each; under 90% at any mass at 60% | Paddock | S9 |
| SB-19 | Ewe lactating a single | any | green 1,000 at 75%; 1,700 at 68% | needs met | 90–110% at each; under 90% at any mass at 60% | Paddock | S9 |
| SB-20 | Ewe lactating twins | any | green 1,500 at 75% | needs met | 90–110%; under 90% at any mass at 68% | Paddock | S9 |
| SB-21 | Weaners | any | green 600 at 75%; 1,000 at 68% | growth | 100–150 g/day (125) | Paddock | S9 |
| SB-22 | Weaners | any | green 800 at 75%; 1,700 at 68% | growth | 150–200 g/day (175) | Paddock | S9 |
| SB-23 | Weaners | any | green 1,600 at 75% | growth | 200–250 g/day (225); under 200 at any mass at 68% | Paddock | S9 |
| SB-24 | Weaners, large Merino or crossbred | any | good green pasture over 2,000 kg/ha feed on offer | growth | over 200 g/day | Paddock | S18 (WA) |
| SB-25 | Dry sheep and dry cattle | any | green 1,600 kg/ha (6 cm) | intake as a share of potential | sheep 90% or more; sheep higher than cattle | Paddock | S9, S58 |
| SB-26 | Dry sheep and dry cattle | any | sheep at 800 kg/ha feed on offer, cattle at 1,200 | intake as a share of potential | within 10 points of each other | Paddock | S61 |
| SB-27 | Merino ewe, SRW 50 kg | any | any | live weight for one CS | 8.5–10.5 kg (0.19 × SRW) | Unit | S27 |
| SB-28 | Ewe | any | any | oestrous cycle | 17 days | Unit | S25, S28 |
| SB-29 | Ewe | any | any | gestation | 144–150 days (147); first lambs about day 150 from the start of joining | Unit | S29 (international), S18, S19 |
| SB-30 | Merino ewes, CS 3 at joining | any | 5-week joining, in season, rams at 1% + 1 | ewes pregnant | 88–95% | Mob | S25 |
| SB-31 | Crossbred ewes, CS 3 at joining | any | 5-week joining, in season | ewes pregnant | 93–98% | Mob | S25 |
| SB-32 | Merino ewes | any | joined at CS 2, 3 and 4 | foetuses per 100 ewes for each extra CS | 15–25 more, close to a straight line from CS 1.5 to 4.5 | Mob | S18, S19, S25, S26 |
| SB-33 | Merino ewes, CS 3 at joining | any | 5-week joining | scanning | 115–135% (125) | Mob | S31 |
| SB-34 | Non-Merino ewes (first-cross, maternal), CS 3 at joining | any | 5-week joining | scanning | 145–165% (155) | Mob | S31 |
| SB-35 | Merino ewes, CS 3 at lambing, feed on offer at target | any | lambing | lamb survival to marking | singles 88–93%, twins 68–75% | Mob | S19, S33 |
| SB-36 | Crossbred ewes, CS 3 at lambing, feed on offer at target | any | lambing | lamb survival to marking | singles 90–97%, twins 80–87% | Mob | S32 (SA), S33 |
| SB-37 | Merino ewes | any | lambing at CS 2.0–2.5 against CS 3.0–3.5 | lambs surviving | 10–25 more per 100 at the higher CS; twins gain more than singles | Mob | S19 |
| SB-38 | Lambs | any | birth to weaning | share of deaths in the first 3 days | 70% or more (74%) | Mob | S31, S36 |
| SB-39 | Lambs | any | marking to weaning | deaths | under 1% | Mob | S33 |
| SB-40 | Merino ewes, self-replacing | Tablelands, Central West, Western Vic | average year | lambs marked per 100 ewes joined | 75–90% | Year | S31, S34 |
| SB-41 | First-cross ewes to terminal rams | Tablelands, Central West, Western Vic | average year | lambs marked per 100 ewes joined | 100–120% | Year | S31, S34 |
| SB-42 | Ewes by litter | any | scanning to marking | ewe deaths | singles 0.5–3.0%, twins 1.2–5.0%, triplets 1.8–14.5% | Mob | S35 |
| SB-43 | Breeding ewes held near CS 3 | Tablelands, Central West, Western Vic | average year | ewe deaths | 2–4% a year (and never over 4.5% in an average year) | Year | S19, S67 |
| SB-43a | Self-replacing Merino ewes; prime lamb and first-cross ewes | any | lambing, average year | ewe deaths during lambing | Merino 1.5–2.5% (1.95); first-cross 2.8–3.7% (3.25) | Mob | S67 |
| SB-44 | Breeding ewes | any | late pregnancy at CS 1.5 against CS 2.5–3 | ewe deaths | about twice (1.6–2.5 times) | Mob | S18, S19 |
| SB-45 | Merino weaners, about 24 kg at weaning, growing about 60 g/day | any | first year after weaning | deaths | 0–2% (0.8) | Mob | S17 |
| SB-46 | Merino weaners losing about 10 g/day | any | first year after weaning | deaths | 8–15% (11.2) | Mob | S17 |
| SB-47 | Merino weaners, grown to target | Tablelands, Central West, Western Vic | average year | deaths after weaning | 2–6% (national 4.6) | Year | S42, S43 |
| SB-48 | Merino lambs | any | ewes on 800 against 3,000 kg/ha feed on offer through lactation, weaned about 14 weeks | weaning weight | about 14 kg (11–17) against about 28 kg (25–31) | Mob | S20 |
| SB-48a | Merino lambs, singles and twins | any | ewes on adequate feed, marking to weaning | growth | 175–220 g/day (singles 198, twins 193) | Mob | S68 (WA) |
| SB-49 | Merino ewe | any | last third of pregnancy, against a dry ewe on the same feed | wool growth | 20–40% lower | Unit | S46 |
| SB-50 | Merino ewe | any | loses 1 CS over pregnancy, against one that holds CS | clean wool and micron | 0.5–0.9 kg less clean wool; 0.6–1.2 micron finer | Mob | S18, S19 |
| SB-51 | Merino wethers or rams against ewes, same flock | any | same feed | fibre diameter | 1–3 micron coarser | Unit | S46 |
| SB-52 | Adult Merino wethers, medium wool | Tablelands, Central West | average year, shorn once | clean fleece; micron | 3.8–4.6 kg (4.2); 18–20 micron (19.0) | Year | S64 |
| SB-52a | Adult Merino breeding ewes | Tablelands, Central West, Western Vic | average year, shorn once | clean fleece | 3.3–4.7 kg (fine-wool flocks at the low end) | Year | S62, S63 |
| SB-52b | Merino weaners | any | first shearing, about 8 months of wool | clean fleece | 1.0–1.5 kg (1.2) | Year | S62 |
| SB-52c | First-cross ewes against Merino ewes | any | same feed, a year | greasy fleece | 65–85% of the Merino ewes' cut (72% for Poll Dorset crosses) | Year | S65 (WA) |
| SB-53 | Unmulesed Merino ewes | any | a year, normal care | ewes struck by flies | 10–25% (17); 2% of those struck die within 7 days | Year | S37 |
| SB-54 | Unmulesed crossbred ewes | any | a year, normal care | ewes struck | 2–8% (5) | Year | S37 |
| SB-55 | Any sheep | any | first 6 weeks after shearing or crutching | flystrike risk | lower than an unshorn, uncrutched mob | Unit | S38 |
| SB-56 | Weaners | any | average day; summer day | water | 3–5 L; 5–7 L | Unit | S13, S14 |
| SB-57 | Dry adult sheep | any | average day; summer day | water | 4–7 L; 8–12 L | Unit | S13, S16 |
| SB-58 | Ewes with lambs | any | average day; summer day | water | 8–11 L; 12–15 L | Unit | S13, S14 |
| SB-59 | Sheep flock | Northern Tablelands | unimproved native pasture | long-term carrying capacity | 4–6 DSE/ha | Year | S57 |
| SB-60 | Sheep flock | Northern Tablelands | sown, fertilised pasture | long-term carrying capacity | 12–17.5 DSE/ha | Year | S57 |
| SB-61 | Sheep flock | Western Victoria | improved perennial pasture | long-term carrying capacity | 13–23 DSE/ha | Year | S55 |
| SB-62 | Sheep flock | Central West | whole farm | carrying capacity per 100 mm of rain | 1.0–1.5 DSE/ha | Year | S59 |
| SB-63 | Sheep | any | cattle fence (plain, barbed or electric) | holds sheep | no | Unit | S48 |
| SB-64 | Sheep | any | sheep-proof (netting) fence | holds sheep | yes | Unit | S48 |
| SB-65 | Fence | any | new, per metre | sheep-proof price against cattle fence price | higher (PRD 5.12); the amount is Claudia's call (C26) | Unit | PRD 5.12 |

## Calls for Claudia

Every judgement made in this draft, one line each, with the reason.

- **C1.** One DSE is a 50 kg dry wether at CS 3 at maintenance, not 45 kg. MLA, NSW and MMFS say 50 kg, and Victoria's guide works its example at 50 kg; only WA says 45 alone.
- **C2.** One DSE needs about 8.3 MJ ME a day, and the test band is 7.6 to 9.7 MJ. That is Agriculture Victoria's worked figure inside its own range, and it is close to MLA's 73 ÷ 8.4 = 8.7.
- **C3.** Use 8.4 DSE to the AE for sheep, which MLA and WA give. The cattle display now says DSE = AE × 8 (MODEL.md). Both screens should use one figure, so Claudia should decide whether the cattle display moves to 8.4. It changes no cattle benchmark.
- **C4.** Test pregnant and lactating ewes on energy (MJ, the Lifetimewool table) first and on DSE second. The DSE tables disagree a little (MMFS 1.3 against NSW 1.5 for a 50 kg pregnant ewe) and MMFS does not say which stage it means. The energy table names its stage.
- **C5.** Test feed limits against green herbage mass (the Pasture Ruler), not feed on offer. The game keeps green and dead feed apart. Feed on offer is herbage mass plus 300, so the two tables agree once converted.
- **C6.** Where a source gives one figure, the band is that figure ±10%. Ranges a source gives are used as they are. That is close to how wide the cattle bands are.
- **C7.** Adult ewe deaths are 2 to 4% a year in an ordinary year. Lifetime Wool's baseline is 3.2%, the 2024 national survey says under 4.5% a year, and MLA's scanning-to-marking figures are 1.6 to 3.3%. The "2–10%" in L.LSM.0027 is too wide to test. Wethers have no sourced figure, so they take the ewes' death rate outside lambing, with no benchmark of their own. The lambing death bands in SB-43a are about ±25% around the survey averages, wider than ±10%, because survey averages vary from farm to farm.
- **C8.** Weaner deaths after weaning are 2 to 6% in an average year for weaners grown to target. The national average is 4.6% with a 4% benchmark. The one Central Tablelands trial averaged 7.7%.
- **C9.** Merino marking is 75 to 90% and first-cross 100 to 120% in an average year. These bands sit around the industry averages (86% and 112%) and the NSW and Victorian state figures (75 to 94%).
- **C10.** Scanning is 115 to 135% for Merinos and 145 to 165% for non-Merinos, which is ±10 points around the industry averages of 125% and 155%.
- **C11.** For crossbred lamb survival, the bands span both sources: 90 to 97% for singles and 80 to 87% for twins. The South Australian figures (97 and 87) are higher than MMFS's (90 and 80).
- **C12.** Gestation is 147 days, from an international veterinary manual. No Australian page that could be read gave it in days, but Lifetime Wool's plan of first lambs at about day 150 from the start of joining fits it.
- **C13.** Ram ratios follow MMFS: 1% plus one for mature ewes, 1.5% for maidens and 2% for ewe lambs. NSW gives a flat 2%. MMFS is more detailed and comes from the industry's own manual.
- **C14.** Joining is 5 weeks (two 17-day cycles) by default. MMFS and NSW agree.
- **C15.** Wool cut is benchmarked in **clean** kg. The figures that could be read are clean, and turning them into greasy needs a yield by class that was not found. Medium-wool wethers come from the NSW bloodline average (4.2 kg, 19 micron). Ewes span the Balmoral fine-wool flock (3.3 to 3.9 kg) and Trangie (4.7 kg). The first-cross share (65 to 85% of a Merino ewe's greasy cut) comes from one WA trial. The NSW budget cuts per head would be better, but they could not be read. The weaner band (1.0 to 1.5 kg) is wider than ±10% because it rests on one fine-wool flock.
- **C16.** Shearing and crutching costs use the July 2024 award rates as dated stand-ins until a 2026 rate or an all-in contractor rate is read. The 2025 and 2026 award rates were not read.
- **C17.** Sheep get their own water table (Agriculture Victoria) rather than the cattle rule. The cattle rule (10% of live weight) gives a 50 kg sheep 6.5 L on a summer day, against Victoria's 10 L.
- **C18.** The game's native carrying capacity gives 3.4 DSE/ha on the Tablelands, against the one native figure found (5 DSE/ha). It was not changed here, because it is the cattle model's grass. If SB-59 fails, the grass or the safe-use figure needs Claudia's ruling, not the sheep model. The Central West's whole-farm figure (1.09 to 1.48 DSE/ha a 100 mm) works out at 6.5 to 8.8 DSE/ha at Dubbo, against the game's 2.6 on native pasture. That gap is mostly sown pasture and lucerne, so SB-62 can only be tested on a farm that has them.
- **C19.** Sheep graze shorter: tests SB-25 and SB-26 read "close to maximum intake at 6 cm" as 90% or more, and "severely limited below 800 FOO" for sheep against 1,200 for cattle as the same share of potential. Both are readings of words, not figures.
- **C20.** For prices, Online Sheep stands for store and breeding ewes, because it is MLA's only restocker ewe indicator. For the wool stand-in, use the sale commentary's EMI (1,890 c/kg clean, 1–2 Sep 2026), not the undated ticker (1,722).
- **C21.** Flystrike: the game's Merinos are taken as unmulesed. That needs Claudia's ruling, because it changes strike rates (17% of Merino ewes a year in the one study read). The study was of eight flocks, so the band is wide (10 to 25%).
- **C22.** Worms are left out of the first sheep model. No source read gives death or growth rates for worms. WormBoss gives only the seasons and districts of risk.
- **C23.** Pregnancy toxaemia is modelled as part of the extra death risk for ewes under CS 2 or losing condition in late pregnancy, with twins and triplets worse. There is no separate disease, because no case rate was found.
- **C24.** Lamb and weaner growth is tested mainly against the Pasture Ruler's feed rows (SB-21 to SB-23). The other weaner figures found are single animals in one month, or from WA. Pre-weaning growth (SB-48a) uses the one figure read, from WA Merino flocks in 1987 to 1989, because no eastern figure was found.
- **C25.** Lambs at foot have no DSE of their own; they are inside the ewe's rating. Hoggets use the weaner table by weight and growth up to 40 kg, then the adult table. This is how every DSE table read treats them, and it matches the cattle model's calves.
- **C26.** The sheep-proof fence price is Claudia's to set. The PRD says it costs more than cattle fence, but no source read gives the two side by side. The game's cattle fence ($7 a metre, the MVP's figure with no source) is already above the sheep netting fences read ($4,186 a km for materials in WA in 2026; about $4,850 a km built in Queensland in 2012). One way would be to source the cattle fence price first, then set the sheep fence above it.
- **C27.** Default lambing is a month before the district's peak growth (MMFS), with joining 150 days earlier: Western Victoria and Central West join in April and lamb in September; Northern Tablelands joins in May to June and lambs in October to November. Hamilton's real August to September lambing fits. The NSW calendar's first-cross example (join in March, lamb in August) is one month earlier. No Tablelands or Central West dates were read from a source.
- **C28.** One CS is 0.19 × SRW for every breed. It was measured on Merinos, and no crossbred figure was found.
- **C29.** A medium Merino's SRW is 50 kg, the figure Lifetime Wool's tables are built on. No SRW table by breed was found, so first-cross and prime lamb SRWs are still open.
- **C30.** How many days sheep last without water was not searched. Until it is sourced, sheep use the cattle rule (die on day 4).
- **C31.** A dressing percentage, to turn live weight into the carcase weight MLA prices are quoted in, was not searched. It is needed before sheep can be sold.
- **C32.** The Agriculture Victoria DSE table (table 3.1) and the Lifetime Wool lamb survival table (p. 26) are used only where the scrambled PDF text could be matched with confidence. Check both against the printed page before the rows that use them (SB-03, SB-37) are final.

## What a simple sheep model needs

- **Energy drives everything.** Each class's daily need is energy for maintenance, walking, growth, pregnancy and milk. DSE is worked out from it for the screens.
- **Pregnancy and milk raise needs a lot.** Twins in late pregnancy need about twice maintenance, and twins in lactation more than three times.
- **Appetite has a ceiling as a share of live weight.** It is about 2 to 3% for dry adults, about 4% for growing sheep and 4 to 5.5% for milking ewes. Poor, stemmy feed brings it down.
- **Sheep get their fill from shorter feed than cattle.** They reach near full intake at about 6 cm (1,600 kg green) and are held back below about 800 kg/ha. They graze closer to the ground and pick greener feed, so they need a lower residual and a stronger pick of green than cattle.
- **Feed quality limits what a class can do.** At 60% digestibility a dry sheep can hold weight, but a milking ewe or a fast-growing weaner can't, at any mass.
- **Weight and CS move together.** One CS is about a fifth of the flock's mature weight.
- **Breeding follows the cattle pattern, with sheep figures.**
  - A 17-day cycle and a 5-week joining.
  - Conception rises with CS at joining, about 20 more lambs per 100 ewes for each CS.
  - Twins and triplets come at breed-typical scanning rates.
- **Lambs die mostly in the first 3 days.** Twins and triplets die more, and more again when the ewe is thin at lambing.
- **Ewes die more around lambing.** Twin and triplet ewes die more, and deaths climb steeply below CS 2.
- **Weaners need to keep growing.** Light weaners that lose weight die at many times the rate of weaners growing 50 g a day or more.
- **Wool grows with feed.** It slows in late pregnancy, and fibre gets finer when feed is short. Males are coarser. A hard check in feed leaves a tender spot in the staple.
- **Shearing and crutching are contractor jobs on a date.** Each gives about 6 weeks of cover from flystrike.
- **Water needs depend on class and season.** Milking ewes need about half as much again as dry sheep, and every class needs more in summer.
- **Fences:** a cattle fence doesn't hold sheep. A netting fence does, and it costs more.
- **Prices:** lambs and mutton sell by MLA's carcase-weight indicators, store ewes by the head, and wool by the micron at a dated stand-in price.

## Sources

All read 14 Nov 2026.

- S1. MLA eLearning, "Why is calculating forage demand important?" (Northern forage budgeting). https://elearning.mla.com.au/lessons/why-is-calculating-forage-demand-important/
- S2. WA Department of Primary Industries and Regional Development, "What are Animal Equivalents?", p. 2. **WA source.** https://www.dpird.wa.gov.au/siteassets/documents/soil/what-are-animal-equivalents.pdf
- S3. Hyder, M.W., "Calculation of dry sheep equivalents", Lifetime Wool, 2006. **WA source.** https://www.wool.com/globalassets/wool/other/lifetime-wool/research-papers/calculation-of-dry-sheep-equivalents.pdf
- S4. Agriculture Victoria, "Drought Feeding and Management of Sheep", chapter 3, pp. 30–32, table 3.1. https://www.feedinglivestock.vic.gov.au/wp-content/uploads/2025/06/CS-1717-Drought-Feeding-and-Management-of-Sheep_V4_Chapter-3.pdf
- S5. NSW Government (Local Land Services), "Stocking rates". https://www.nsw.gov.au/regional-and-primary-industries/livestock/production/stocking-rates
- S6. AWI and MLA, Making More From Sheep, Tool 12.14, "Calculate DSEs for your property". https://www.makingmorefromsheep.com.au/manual/module-12-efficient-pastoral-production/tool-12-14-calculate-dses-for-your-property/
- S7. Agriculture Victoria, Feeding Livestock, "Nutrition and health of ewes after the break", 16 May 2025. https://www.feedinglivestock.vic.gov.au/2025/05/16/nutrition-and-health-of-ewes-after-the-break
- S8. Agriculture Victoria, Feeding Livestock, "Feed intake: how much can they eat", 30 Dec 2024. https://www.feedinglivestock.vic.gov.au/2024/12/30/feed-intake-how-much-can-they-eat
- S9. MLA, "Pasture Ruler" (CC BY-SA 4.0). https://www.mla.com.au/globalassets/mla-corporate/extensions-training-and-tools/creative-commons/pasture-ruler---cc.pdf
- S10. Making More From Sheep, chapter 8.2, table 8.1. https://www.makingmorefromsheep.com.au/link/fa081b2532354c9fa72ab2a756538796.aspx
- S11. Making More From Sheep, chapter 7.2, "Graze to keep desirable species productive and dominant". https://makingmorefromsheep.com.au/manual/module-7-grow-more-pasture/chapter-7-2-graze-to-keep-desirable-species-productive-and-dominant
- S12. MLA eLearning, "Animal selection". https://elearning.mla.com.au/lessons/animal-selection/
- S13. Agriculture Victoria, Feeding Livestock, "Stock water requirements". https://www.feedinglivestock.vic.gov.au/?p=1459
- S14. Making More From Sheep, Tool 5.2, "Stock water requirements". https://www.makingmorefromsheep.com.au/manual/module-5-protect-your-farms-natural-assets/tool-5-2-stock-water-requirements/
- S15. SheepConnect SA, "Livestock water requirements", 2025. **SA source.** https://www.sheepconnectsa.com.au/water-security/livestock-water-requirements
- S16. NSW Government (Local Land Services), "Water for livestock". https://www.nsw.gov.au/regional-and-primary-industries/livestock/production/water-for-livestock
- S17. Making More From Sheep, chapter 10.4, "Manage weaners for lifetime productivity", figures 10.4 and 10.5, table 10.1. https://www.makingmorefromsheep.com.au/manual/module-10-wean-more-lambs/chapter-10-4-manage-weaners-for-lifetime-productivity/
- S18. Lifetime Wool, "Ewe Management Handbook for the cereal-sheep zone" (Curnow and Thompson, 2008), pp. 12, 16–17. **WA source.** https://www.wool.com/globalassets/wool/other/lifetime-wool/grower-resources/ewe-management-handbook-for-the-cereal-sheep-zone.pdf
- S19. Lifetime Wool, "Ewe Management Handbook, southern slopes NSW and north central Victoria", p. 26 and the targets tables. https://www.wool.com/globalassets/wool/other/lifetime-wool/grower-resources/ewe-management-handbook-southern-slopes-nsw-and-north-central-victoria.pdf
- S20. Thompson and others 2011, "Improving the nutrition of Merino ewes during pregnancy and lactation increases weaning weight and survival of progeny", Animal Production Science 51:784–793 (Victorian and WA sites). https://connectsci.au/an/article/51/9/784/16713/Improving-the-nutrition-of-Merino-ewes-during
- S21. AWI, "Weaner feed budget tables". https://wool.com/globalassets/wool/sheep/reproduction/weaning/awi_weaner-feed-budget-tables.pdf
- S22. AWI, "Setting up for reproductive success" (news, undated, about 2025). https://www.wool.com/news-events/news/setting-up-for-reproductive-success/
- S23. Making More From Sheep, fact sheet GD4986, "Pregnancy toxaemia", 2024. https://makingmorefromsheep.com.au/globalassets/mmfs/resources/gd4986-mmfs-fact-sheet-pregnancy-toxaemia.pdf
- S24. Oldham and others 2005, "Lifetime Wool: the best bet optimum condition score profile for Merino ewes lambing in winter", Sheep Updates. **WA source.** https://www.wool.com/globalassets/wool/other/lifetime-wool/research-papers/lifetime-wool-the-best-bet-optimum-condition-score-profile-for-merino-ewes-lambing-in-winter.pdf
- S25. Making More From Sheep, chapter 10.1, "Ensure most ewes get in lamb". https://www.makingmorefromsheep.com.au/manual/module-10-wean-more-lambs/chapter-10-1-ensure-most-ewes-get-in-lamb/
- S26. Ferguson and others 2011, "The wool production and reproduction of Merino ewes ...", Animal Production Science 51:763 (Victorian and WA sites). https://www.wool.com/globalassets/wool/other/lifetime-wool/research-papers/the-wool-production-and-reproduction-of-merino-ewes....pdf
- S27. van Burgel and others 2011, "The merit of condition score and fat score as alternatives to liveweight for managing the nutrition of ewes", Animal Production Science 51:834–841. https://www.wool.com/globalassets/wool/other/lifetime-wool/research-papers/the-merit-of-condition-score-and-fat-score-as-alternatives....pdf
- S28. NSW Government, "Joining sheep". https://www.nsw.gov.au/regional-and-primary-industries/livestock/sheep/joining-sheep
- S29. MSD Veterinary Manual, "Breeding, parturition and common lamb diseases of sheep". **International.** https://www.msdvetmanual.com/management-and-nutrition/preventative-health-care-and-husbandry-of-sheep/breeding-parturition-and-common-lamb-diseases-of-sheep
- S30. NSW Government, "Sheep calendar". https://www.nsw.gov.au/regional-and-primary-industries/livestock/sheep/calendar
- S31. MLA final report L.LSM.0027, Jacobson and others (Murdoch University), April 2020, sections 1.1, 1.2, 5.9 (p. 33), 6.2.1 (p. 39), table 6. https://www.mla.com.au/contentassets/7d138f6ee4c04de48a76b9cd862d7baf/l.lsm.0027_final_report.pdf
- S32. SheepConnect SA, "Lambing percentages". **SA source.** https://www.sheepconnectsa.com.au/management/livestock-management/lambs/lambing-percentages
- S33. Making More From Sheep, chapter 10.3. https://www.makingmorefromsheep.com.au/link/510858e857d540a39a049a0acd5836fe.aspx
- S34. MLA final report B.LSM.0055, "Stocktake of the Australian sheep flock", Curtis, June 2014, table 11 (p. 23) and p. 5. https://www.mla.com.au/contentassets/9862d4831bd141bca86abcb7cba814aa/b.lsm.0055_final_report.pdf
- S35. MLA sheep factsheets, "Triplet ewe survival (Merino)" table 1, and "Triplet lamb survival (Merino)", April 2025. https://www.mla.com.au/globalassets/mla-corporate/research-and-development/program-areas/livestock-production/mla-sheep-factsheet-triplet-ewe-survival-merino-0425.pdf and https://www.mla.com.au/globalassets/mla-corporate/research-and-development/program-areas/livestock-production/mla-sheep-factsheet-triplet-lamb-survival-merino-0425.pdf
- S36. Flock & Herd, "Neonatal lamb mortality". https://www.flockandherd.net.au/sheep/reader/neonatal-lamb-mortality.html
- S37. Horton, Corkrey and Doughty 2018, Animal Production Science 58(7):1289–1296. https://connectsci.au/an/article-pdf/58/7/1289/135661/an16153.pdf
- S38. Flock & Herd, "Flystrike prevention". https://flockandherd.net.au/sheep/ireader/flystrike-prevention.html
- S39. WormBoss, Tablelands and Slopes, "When to WormTest and when to drench". https://tools.wormboss.com.au/sheep-goats/programs/sheep/tablelands-slopes/when-to-wormtest-and-when-to-drench.php
- S40. WormBoss, NSW, introduction. https://tools.wormboss.com.au/sheep-goats/programs/sheep/nsw/introduction.php
- S41. WormBoss, Victoria, introduction. https://tools.wormboss.com.au/sheep-goats/programs/sheep/vic/introduction.php
- S42. Campbell and others 2014, "A survey of post-weaning mortality of sheep in Australia ...", Animal Production Science 54:783. https://connectsci.au/an/article/54/6/783/17596/A-survey-of-post-weaning-mortality-of-sheep-in
- S43. Flock & Herd, "Eryvac project", August 2008. https://www.flockandherd.net.au/sheep/reader/eryvac-project.html
- S44. AWI, Australian Wool Production Forecast Report, April 2026. https://www.wool.com/market-intelligence/wool-production-forecasts/australian-wool-production-forecast-report-april-2026/
- S45. AWI, Australian Wool Production Forecast, August 2026. https://www.wool.com/market-intelligence/wool-production-forecasts/australian-wool-production-forecast-august-2026/
- S46. Hinch, University of New England, WOOL412/512 lecture 5, 2013. https://www.woolwise.com/wp-content/uploads/2017/07/WOOL-412-512-12-T-05.pdf
- S47. Fair Work Ombudsman, Pastoral Award pay guide, rates from 1 July 2024. https://calculate.fairwork.gov.au/payguides/pact/MA000035/20240701
- S48. Tasmanian Department of Primary Industries, Parks, Water and Environment, sheep health and welfare guide, July 2019. **Tas source.** https://nre.tas.gov.au/Documents/BTFactsheet_sheep_healthwelfare.pdf
- S49. WA DPIRD, station fence estimation tool overview, July 2026. **WA source.** https://www.dpird.wa.gov.au/siteassets/documents/grants/srrp-station-fence-estimation-tool-overview.pdf
- S50. Kondinin Group, research report 288, "Exclusion fencing", January 2016, p. 2. https://www.wool.com/link/8c3b7a1d2c7d47d7b533a3f3999e26b1.aspx
- S51. Beef Central, 28 June 2017, on DSE and AE definitions (secondary). https://www.beefcentral.com/?p=133763
- S52. MLA, "National Sheep and Lamb Indicators" specification sheet, June 2025, pp. 1–2. https://www.mla.com.au/globalassets/mla-corporate/prices--markets/documents/indicator-specifications/nlrs-national-sheep-indicators-spec-sheet.pdf
- S53. AWI, weekly price report, sales week 10, 1–2 September 2026. https://www.wool.com/market-intelligence/weekly-price-reports/20262027/week-10-september-2026/
- S54. EverGraze, Hamilton proof site. https://www.evergraze.com.au/research-and-demonstration/hamilton-proof-site/index.html
- S55. EverGraze, Hamilton key message, livestock systems. https://www.evergraze.com.au/library-content/hamilton-key-message-livestock-systems-for-maxi/index.html
- S56. EverGraze, Hamilton key message, "Right plant, right place". https://www.evergraze.com.au/library-content/hamilton-key-message-right-plant-right-place-ri/index.html
- S57. MLA final report L.PDS.2003, "Restoring pasture productivity in the Northern Tablelands", p. 12 and the farm reports. https://www.mla.com.au/globalassets/mla-corporate/research-and-development/final-reports/l.pds.2003-final-report.pdf
- S58. NSW DPI and MLA, ProGraze, 9th edition, tables 2.1, 2.2, 2.4 and p. 9. https://www.mla.com.au/globalassets/mla-corporate/extensions-training-and-tools/creative-commons/prograze-ninth-edition-cc.pdf
- S59. Making More From Sheep, Central West fact sheet, "Profitable integration of cropping and livestock", p. 2, table 2. https://makingmorefromsheep.com.au/link/a18c064e76ae4a38a15471addbe38e74.aspx
- S60. Farrell 2009, Australasian Agribusiness Review 17(7). https://blog.une.edu.au/australasian-agribusiness-review/?p=369
- S61. EverGraze, "Grazing management systems explained". https://makingmorefromsheep.com.au/globalassets/mmfs/manual/module-7/chapter-7.2/signposts/evergraze-exchange-grazing-management-lr.pdf
- S62. AWI, Merino Lifetime Productivity project update, Beyond the Bale, June 2020, pp. 46–47, table 1 (Balmoral site). https://www.wool.com/globalassets/wool/sheep/genetics/merino-lifetime-productivity/btb_june2020_p46-47.pdf
- S63. AWI, Beyond the Bale issue 104, Spring 2025, Merino Lifetime Productivity article, graph 1 (Macquarie site, Trangie). https://www.wool.com/globalassets/wool/beyond-the-bale/issue-104-spring-2025/mlp/03-unlocking-genetic-potential-the-importance-of-quality-raw-data-in-breeding.pdf
- S64. NSW Government, "Comparison of Merino bloodlines: fibre diameter, clean fleece weight, liveweight", summary table for 59 bloodlines. https://www.nsw.gov.au/regional-and-primary-industries/livestock/sheep/comparison-of-merino-bloodlines/fibre-diameter-clean-fleece-weight-liveweight
- S65. MLA final report PIRD S98/W01, "Prime Lamb Production and Marketing", November 2005. **WA source.** https://mla.com.au/contentassets/8560b89bb9c3409ab73a0da94e9a1442/pird.s98.w01_final_report.pdf
- S66. MLA final report SCSB.051, "Economic Analysis of Sheep Production Systems" (Hassall), March 2004, tables 1 and 2, appendix 2. https://www.mla.com.au/contentassets/eb976dbe80354451b7fcf670b077ea24/scsb.051_final_report.pdf
- S67. AWI and MLA, "National survey of Merino producers to determine prevalence and suspected causes of Merino ewe mortality", GD5229, 2024. https://mla.com.au/globalassets/mla-corporate/research-and-development/documents/gd5229-awi-mla-merino-ewe-mortality-survey-6.pdf
- S68. Kelly 1992, "Lamb mortality and growth to weaning in commercial Merino flocks in Western Australia", Australian Journal of Agricultural Research 43(6):1399–1416 (abstract). **WA source.** https://connectsci.au/cp/article/43/6/1399/32261/Lamb-mortality-and-growth-to-weaning-in-commercial
- S69. AWI Leading Sheep case study, Banff Downs, Queensland. https://www.wool.com/globalassets/wool/people/education-and-leadership/bestprac/bestprac-case-study-leading-sheep-tim-williams.pdf
- S70. Beef Central, 7 July 2025, on cluster and predator-proof fencing costs. https://www.beefcentral.com/?p=242097
- S71. Wikipedia, "Armidale", climate table quoting the Bureau of Meteorology (secondary). https://en.wikipedia.org/wiki/Armidale
- S72. Wikipedia, "Dubbo", climate table quoting the Bureau of Meteorology (secondary). https://en.wikipedia.org/wiki/Dubbo
- S73. Wikipedia, "Hamilton, Victoria", climate table quoting the Bureau of Meteorology (secondary). https://en.wikipedia.org/wiki/Hamilton,_Victoria
- S74. Sheep Central, 5 August 2026, on NSW DPIRD's 2026 sheep enterprise analysis. https://www.sheepcentral.com/?p=168454
