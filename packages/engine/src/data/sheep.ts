/**
 * Sheep figures (milestone 2.3).
 *
 * Every figure comes from docs/SHEEP_BENCHMARKS.md (sources S1 to S74, read
 * 14 Nov 2026) or from a source recorded in docs/DATA.md, "Sheep". A figure
 * marked FITTED was worked out here so the model hits a sourced benchmark;
 * the benchmark it was fitted to is named. A figure marked STAND-IN has no
 * source yet: each is listed under "Calls for Claudia" in
 * docs/DEVELOPMENT_LOG.md (m2.3 Sheep model). A change to any figure here is
 * a model change: re-run the sheep calibration (docs/CALIBRATION.md).
 *
 * Server only, like every engine table (PRD 5.16).
 */

import type { DistrictId } from '@gg/shared';

/** Merino, or crossbred: first-cross and maternal composite ewes, terminal rams and prime lambs. */
export type SheepBreed = 'merino' | 'xb';

/**
 * Districts that run sheep (PRD 5.12, section 21 row 24). Sheep are never
 * offered in Central Queensland.
 */
export const SHEEP_DISTRICTS: readonly DistrictId[] = ['nsw', 'cw', 'wv'];

/** True when sheep can be run in the district. */
export const sheepDistrict = (d: DistrictId): boolean => SHEEP_DISTRICTS.includes(d);

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

/**
 * Standard reference weight (SRW), kg: the mature weight of a ewe at CS 3.
 * Medium Merino 50 kg: the Lifetime Wool tables are built on it (S19, call
 * C29). Large Merino 65 kg is FITTED to S7 (a large Merino ewe needs 10 MJ
 * dry against a medium one's 8). Crossbred 60 kg is a STAND-IN: no SRW table
 * by breed was found.
 */
export const SRW = { merino: 50, largeMerino: 65, xb: 60 } as const;

/** Live weight for one condition score: 0.19 × SRW (van Burgel and others 2011, S27; call C28). */
export const KG_PER_CS_SHARE = 0.19;

/**
 * Rams: mature weight as a multiple of the ewes' SRW, and their maintenance
 * as a multiple of a ewe's of the same metabolic weight. Both STAND-INS,
 * chosen together so a mature ram is NSW's 2.0 DSE (S5, SB-12). No ram
 * weight or ram energy figure was found.
 */
export const RAM = { srwFactor: 1.8, maintFactor: 1.25 } as const;

// ---------------------------------------------------------------------------
// Energy (MJ ME a day)
// ---------------------------------------------------------------------------

/**
 * One DSE: a 50 kg dry wether at CS 3 at maintenance, walking about 7 km a
 * day (calls C1, C2). It needs 8.3 MJ ME a day (Agriculture Victoria, S4).
 */
export const DSE_MJ = 8.3;

/** DSE to the AE: the one figure for every display, 8.4 (`data/stocking.ts`, call C3). */
export { DSE_PER_AE } from './stocking';

/**
 * The walk in the reference DSE, as the cattle walk factor reads it
 * (0.05 + 0.12 × distance ÷ 3000): 0.10 is about 1.25 km out to water.
 */
export const REF_WALK = 0.1;

/**
 * Maintenance: `MAINT_K × LW^0.75 × (1 + walk)`. FITTED so the reference
 * DSE needs `DSE_MJ`: 8.3 ÷ (50^0.75 × 1.10).
 */
export const MAINT_K = DSE_MJ / (Math.pow(50, 0.75) * (1 + REF_WALK));

/**
 * Young sheep need more for maintenance: × (1 + 0.12 × (1 − age ÷ 730)),
 * gone by two years old. FITTED to the weaner rows of the DSE tables (S4,
 * S6: a 25 kg weaner is 0.6 to 0.7 DSE at no gain; SB-13).
 */
export const YOUNG_MAINT = { lift: 0.12, days: 730 } as const;

/**
 * Pregnancy, on top of maintenance, for a single: rises from day 70 to
 * `single` MJ at day 130, then 1% a day to lambing. FITTED to S7 (a medium
 * Merino ewe needs 13 MJ at day 130 with a single) and S4, S5, S6 (1.3 to
 * 1.5 DSE in the last month). Twins need `twinFactor` times as much
 * (S7: 16 MJ at day 130), triplets `tripletFactor` (STAND-IN: MLA S35 says a
 * triplet ewe needs more than twice maintenance).
 */
export const PREGNANCY = {
  fromDay: 70,
  fullDay: 130,
  single: 3.95,
  lateRise: 0.01,
  twinFactor: 1.85,
  tripletFactor: 2.4,
} as const;

/** Gestation, days: 147 (MSD, S29, international; fits Lifetime Wool's day 150 lambing; call C12). */
export const GESTATION_DAYS = 147;

/** The last third of pregnancy, from this day: wool grows 20 to 40% slower (Hinch, S46). */
export const LATE_PREGNANCY_DAY = 98;

/**
 * Milk, as ME the ewe spends on it at the top of her lactation, on good feed
 * at CS 3. A single takes `single`; twins add `secondLamb` × SRW ÷ 50 (a
 * bigger ewe has bigger lambs). FITTED to S7 (mid-lactation: medium single
 * 21, twins 26; large 23 and 30) and the DSE tables (S5, S6: 2.2 to 2.5 for
 * a single, 3.1 to 3.4 for twins). Triplets add `thirdLamb` (STAND-IN).
 */
export const MILK = {
  single: 12.1,
  secondLamb: 7.0,
  thirdLamb: 2,
  /** Full milk to this day of lactation, then falling... */
  peakDays: 42,
  /** ...to this share of the peak by... */
  lateShare: 0.5,
  /** ...this day, and holding there. STAND-IN shape (the cattle curve, shortened to 14 weeks). */
  lateDays: 100,
  /**
   * Energy a lamb gets for each MJ the ewe spends on milk (cattle: 0.65).
   * FITTED with `LAMB_GRAZING` to Thompson and others 2011 (S20: Merino
   * lambs weaned at about 14 and 28 kg; SB-48) and Kelly 1992 (S68: singles
   * 198 and twins 193 g a day from marking to weaning; SB-48a).
   */
  efficiency: 0.45,
  /**
   * A ewe that can't eat what she needs milks less: × the share of her full
   * needs she eats, never under this. FITTED to Thompson and others 2011
   * (S20: lambs weaned at about 14 kg from ewes on 800 kg DM/ha feed on
   * offer, 28 kg on 3,000; SB-48).
   */
  feedFloor: 0.5,
  /** ...raised to this power. FITTED with `feedFloor`. */
  feedPower: 1.5,
} as const;

/**
 * Energy in a kg of gain: `2 + 50 × LW ÷ SRW` MJ. FITTED to the weaner rows
 * of the MMFS DSE table (S6: about 17 MJ a kg at 15 kg, 25 at 25 kg, 41 at
 * 40 kg, for a 50 kg SRW Merino).
 */
export const GAIN_MJ = { base: 2, perShare: 50 } as const;

/** MJ a kg of weight lost: the cattle model's 22 (MODEL.md, section 3). */
export const LOSS_MJ = 22;

/**
 * Sheep younger than this, days, put most of a gain into frame, not
 * condition (× 0.3 of a gain goes to CS, the cattle rule's share). STAND-IN:
 * cattle use 900 days; sheep reach mature size younger (MMFS S25 joins
 * maiden Merinos at 75 to 80% of SRW, ewe lambs at 7 to 10 months), so 18
 * months is used. No figure was found.
 */
export const YOUNG_FRAME_DAYS = 540;

/** The most a sheep gains in a day, kg. STAND-IN: a ceiling, not a target. */
export const GAIN_CAP = 0.4;
/** The most a sheep loses in a day from feed alone, kg. STAND-IN. */
export const LOSS_CAP = 0.4;

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

/**
 * Appetite as a share of live weight, before feed quality and short feed
 * cut it. On green leafy feed (the quality factor is 1.05) a dry adult eats
 * 2.7%, a weaner 4.2%, a ewe milking a single 4.4% and one milking twins
 * 4.8%: inside Agriculture Victoria's ranges (S8: 2 to 3%, about 4%, 4 to
 * 5.5%; SB-14 to SB-16). The exact shares are FITTED to the Pasture Ruler
 * rows (S9, SB-18 to SB-23).
 */
export const APPETITE = {
  adult: 0.026,
  young: 0.04,
  /** Young sheep eat at the young rate up to this share of SRW, then fall to the adult rate at SRW. */
  youngToShare: 0.6,
  lactating: 0.042,
  /** Added for each lamb after the first, while she milks. */
  perExtraLamb: 0.004,
} as const;

/**
 * Lambs start to graze: a lamb's appetite rises from nothing at `fromDays`
 * old to the young rate at `fullDays`. The cattle calves' shape, brought
 * forward for lambs; `fullDays` FITTED with `MILK.efficiency` (SB-48,
 * SB-48a).
 */
export const LAMB_GRAZING = { fromDays: 14, fullDays: 110 } as const;

/**
 * Short feed: sheep get `1 − exp(−reach ÷ 480)` of what they would eat,
 * where reach is the green plus the dead kg DM/ha. FITTED to the MLA
 * Pasture Ruler and ProGraze table 2.1 (S9, S58; SB-17 to SB-23, which are
 * all green feed). Near full intake at 1,600 kg green (6 cm, S58; SB-25).
 */
export const SHEEP_AVAIL_KG = 480;

/**
 * Dead feed in a sheep's reach counts in full, as cattle availability counts
 * all the feed (MODEL.md, section 2): EverGraze gives the sheep's limits in
 * feed on offer, green and dead (S61). Poor dead feed lowers intake through
 * its digestibility, not its bulk.
 */
export const DEAD_IN_REACH = 1;

/**
 * Sheep pick greener: the green share of what they take off a square is
 * `G ÷ (G + 0.1 × D + 1)`, against cattle's `G ÷ (G + 0.25 × D + 1)`.
 * STAND-IN: MLA S12 says sheep graze closer; no number was found.
 */
export const SHEEP_GREEN_PICK = 0.1;
/**
 * Under this much green, kg DM/ha, sheep find less of it in proportion
 * (cattle: 150). And squares under `bareKg` total are mostly passed over
 * (cattle: 350). Both STAND-INS, from S12's "graze closer to the ground".
 */
export const SHEEP_SHORT = { greenKg: 100, bareKg: 200 } as const;

/** Sheep graze down to this, kg DM/ha (cattle 250). STAND-IN: S12 says closer to the ground. */
export const SHEEP_RESIDUAL = 150;

// ---------------------------------------------------------------------------
// Breeding
// ---------------------------------------------------------------------------

/** Oestrous cycle, days (MMFS S25, NSW S28; SB-28). */
export const CYCLE_DAYS = 17;
/** Joining, days: two cycles, 5 weeks (S25, S28; call C14). */
export const JOIN_DAYS = 35;

/**
 * Rams needed: 1% of the ewes plus one (mature ewes, MMFS S25; call C13).
 * Fewer rams lower conception in proportion.
 */
export const RAM_RATIO = { share: 0.01, plus: 1 } as const;

/** A ewe joins from this age, days (S25: ewe lambs from 7 to 10 months). */
export const JOIN_MIN_AGE = 210;
/** ...and this share of SRW (S25: maiden Merinos at 75 to 80% of SRW). */
export const JOIN_MIN_SHARE = 0.75;

/**
 * Ewes pregnant after a 5-week joining, in season, at CS 3: Merino 91.5%,
 * crossbred 95.5% (MMFS S25: at least 90%, up to 98%; SB-30, SB-31). Each
 * CS changes it by `perCs` (STAND-IN split of the CS response below).
 */
export const PREGNANT_5WK = { merino: 0.915, xb: 0.955, perCs: 0.05, min: 0.3, max: 0.98 } as const;

/**
 * Foetuses per ewe joined at CS 3: Merino 1.25, non-Merino 1.55 (MLA
 * L.LSM.0027, S31; SB-33, SB-34). Each CS at joining adds 0.20, in a
 * straight line from CS 1.5 to 4.5 (Lifetime Wool S18, S19; MMFS S25;
 * SB-32).
 */
export const SCANNING = { merino: 1.25, xb: 1.55, perCs: 0.2, csLo: 1.5, csHi: 4.5 } as const;

/**
 * Triplets as a share of pregnancies: 10% of the litter size above 1.25.
 * STAND-IN: no table of litter shares by breed was read.
 */
export const TRIPLET_SHARE = { per: 0.1, above: 1.25, max: 0.15 } as const;

/**
 * Birth weight, kg: singles 4.9, twins 3.7 (Lifetime Wool, S19); triplets
 * 3.0 (STAND-IN). For a 50 kg SRW Merino; other sizes in proportion to SRW
 * (STAND-IN). Each CS lost in early to mid pregnancy (from joining to the
 * ewe's day 80, her scanning) takes 0.32 kg off (S18, S19: 0.30 to 0.35).
 */
export const BIRTH_KG = { single: 4.9, twin: 3.7, triplet: 3.0, perCsLost: 0.32 } as const;

/**
 * Lamb survival to marking at CS 3 at lambing (Lifetime Wool S19 for
 * Merinos: 91% and 71%; call C11 for crossbreds: 93.5% and 83.5%, the middle
 * of the bands; MLA S35 for triplets: 52.9% Merino, 60.1% maternal).
 */
export const LAMB_SURVIVAL = {
  merino: { 1: 0.91, 2: 0.71, 3: 0.529 },
  xb: { 1: 0.935, 2: 0.835, 3: 0.601 },
} as const;

/**
 * The change in lamb survival for each CS at lambing, below and above CS 3
 * (points a CS; twins and triplets take the twin figure). FITTED between
 * S19's table (call C32, still to be checked against the printed page) and
 * S19's own text (15 to 20% more lambs survive from ewes at CS 3.0 to 3.5
 * than at 2.0 to 2.5; more than 10% for a twin ewe at CS 4 against 3;
 * SB-37).
 */
export const SURVIVAL_PER_CS = {
  single: { below: 0.12, above: 0.06 },
  twin: { below: 0.24, above: 0.16 },
  max: 0.98,
  min: 0.05,
} as const;

/**
 * Of the lambs that die before marking, this share die in their first 3
 * days (L.LSM.0027 S31: 74% of deaths to weaning; Flock & Herd S36: more
 * than 80% in 48 hours; SB-38). The rest die from day 3 to `markDays` old.
 */
export const LAMB_EARLY_SHARE = 0.8;
export const MARK_DAYS = 42;

/** Daily death risk for a lamb from marking to weaning (MMFS S33: under 1% from marking to weaning; SB-39). */
export const LAMB_LATE_DAILY = 0.00009;

/** Marking is counted this many days after the first lamb of a joining, weaning done at `weanDays`. */
export const LAMBING_TIMES = {
  /** Lambs alive this many days after lambing started are the marking count: all are 14 days or more. */
  markDays: JOIN_DAYS + 14,
  /** Weaning: 14 weeks from the start of lambing (MMFS ch. 10.4, S17). */
  weanDays: 98,
  /** The scanning count is taken this many days after joining started (S30: scan in May to June after a March join). */
  scanDays: 80,
  /**
   * No lamb stays at foot past this age, days: a mob is weaned when any lamb
   * reaches it (lambs with no joining record, or born late). STAND-IN: the
   * oldest lamb at the usual weaning is 98 days plus the 35 days of joining;
   * 150 days (5 months) leaves room past that.
   */
  weanByAge: 150,
} as const;

/** An orphan lamb this old or more is weaned; younger ones die at the cattle orphan rate, 2% a day. */
export const ORPHAN = { weanDays: 56, daily: 0.02 } as const;

/**
 * Default joining start, by district, so lambing starts 147 days later at
 * the district's usual time (call C27, sourced 15 Nov 2026):
 * - Central West (wheat-sheep zone): June lambing is typical (NSW DPIRD,
 *   "Sheep | Merino" climate vulnerability page, no date: "June lambing ...
 *   typical of production in the wheat-sheep zone"), so joining starts on
 *   5 January and lambing on 1 June;
 * - Northern Tablelands (high rainfall zone): September lambing is typical
 *   (same page), so joining starts on 7 April and lambing on 1 September;
 * - Western Victoria: Hamilton lambed in August and September (EverGraze,
 *   S54), so joining starts on 1 April and lambing on 26 August.
 * Month is 0 for January.
 */
export const JOIN_START: Partial<Record<DistrictId, { month: number; date: number }>> = {
  wv: { month: 3, date: 1 },
  cw: { month: 0, date: 5 },
  nsw: { month: 3, date: 7 },
};

// ---------------------------------------------------------------------------
// Deaths
// ---------------------------------------------------------------------------

/**
 * Adult ewe and ram deaths outside lambing and flystrike, a day: 0.91% a
 * year, DERIVED from the document's own figures: Lifetime Wool's 3.2% a
 * year at the CS 3 baseline (S19) less 1.95% at lambing (AWI and MLA S67,
 * SB-43a) leaves 1.25% a year; less flystrike, 17% of unmulesed Merino ewes
 * struck a year (Horton and others 2018, S37; SB-53) × 2% of the struck
 * dying (S37) = 0.34%, leaves 0.91%. (The third pass wrote "about 0.8%";
 * the arithmetic gives 0.91%, used from the review of the third pass. The
 * second pass's 0.4% was fitted to SB-43 and was undone.)
 */
export const ADULT_DAILY = (0.032 - 0.0195 - 0.17 * 0.02) / 365;

/**
 * Wethers' deaths, a day: 0.91% a year, DERIVED as the ewes' deaths outside
 * lambing and flystrike (the working above), since wethers do not lamb and
 * the document found no wether figure of its own (C7: the NSW wether
 * budget's figure was seen only in a search summary).
 */
export const WETHER_DAILY = ADULT_DAILY;

/**
 * A ewe's risk of dying at lambing, by litter: singles 1.35%, twins 3.05%,
 * triplets 6.15%: MLA S35's scanning to marking deaths (1.6%, 3.3%, 6.4%)
 * less the adult rate over those 110 days. Crossbred ewes × 1.35, FITTED to
 * S67 (first-cross flocks 3.25% at lambing against Merino 1.95%; SB-43a).
 */
export const LAMBING_RISK = { 1: 0.0135, 2: 0.0305, 3: 0.0615, xbFactor: 1.35 } as const;

/**
 * Thin ewes die more at lambing: × (1 + (2.5 − CS)) under CS 2.5, so twice
 * at CS 1.5 (Lifetime Wool S18, S19: "ewe mortality doubles at CS 1.5";
 * SB-44). Pregnancy toxaemia (call C23): each CS lost from scanning to
 * lambing adds 3.8% for a triplet ewe (MLA S35), a third of that a lamb.
 */
export const LAMBING_THIN = { from: 2.5, toxaemiaPerCs: 0.038 } as const;

/**
 * Weaner deaths in the first year after weaning, a day:
 * `base × exp(−growth × g/day) × exp(−weight × (weaning kg ÷ SRW − 0.478))`.
 * FITTED to AWI's "Winning with Weaners" groups (MMFS ch. 10.4 table 10.1,
 * S17: 23.9 kg growing 63 g a day lost 0.8%, 22.0 kg losing 10 g a day lost
 * 11.2%, 17.1 kg growing 66 g a day lost 7.6%; SB-45, SB-46). Held to
 * `maxFactor` times the base.
 */
export const WEANER_DEATHS = {
  base: 0.000124,
  growth: 0.02743,
  weight: 17.19,
  refShare: 0.478,
  maxFactor: 40,
  days: 365,
} as const;

/** Low condition: (1.4 − CS) × 1.5% a day under CS 1.4, the cattle rule (MODEL.md, section 3). */
export const THIN_DEATHS = { below: 1.4, perCs: 0.015 } as const;

/**
 * Starved: a sheep whose live weight falls under this share of the weight
 * it is measured against is dead, cause `starved` (`starvedRefKg`: a lamb at
 * foot against the normal weight for its age from a triplet's birth weight;
 * a weaned sheep against the normal weight at weaning, about 22 kg, so a
 * slow weaner is stunted, not starved). STAND-IN, for Claudia: a sheep that has
 * lost half its weight is long past CS 1, and no figure for the weight at
 * which a sheep dies was read. Without it a lamb kept at foot on too little
 * milk could live on at 3 kg (the third pass review found yearlings at 3.3
 * to 3.5 kg).
 */
export const STARVED = { share: 0.5 } as const;

/** No water: every sheep dies on day 4, the cattle rule (call C30), losing 4% of live weight a day. */
export const NO_WATER = { dieOnDay: 4, lossShare: 0.04 } as const;

/**
 * Flystrike (call C21: Merinos taken as unmulesed). A day's strike risk
 * when not protected: Merino 0.066%, crossbred 0.018%, so with one shearing
 * and one crutch a year (84 days protected) 17% of Merino ewes and 5% of
 * crossbred ewes are struck in a year (Horton and others 2018, S37;
 * SB-53, SB-54). Shearing or crutching protects for 42 days (Flock & Herd
 * S38; SB-55). A strike costs 2.7 kg (Merino) or 5.2 kg (crossbred) and
 * 0.3 CS, and 2% of struck sheep die within 7 days (S37). Applied to every
 * weaned sheep (only ewes were measured).
 */
export const FLYSTRIKE = {
  daily: { merino: 0.000663, xb: 0.000183 },
  protectDays: 42,
  kg: { merino: 2.7, xb: 5.2 },
  cs: 0.3,
  dieWithin: 7,
  dieShare: 0.02,
} as const;

// ---------------------------------------------------------------------------
// Wool
// ---------------------------------------------------------------------------

/**
 * Clean wool grown, g a kg DM eaten, for a dry Merino at its peak age.
 * FITTED to the NSW bloodline average (S64: Merino wethers 4.2 kg clean a
 * year; SB-52). Crossbreds grow `xbFactor` as much a kg of feed: FITTED so
 * first-cross ewes, which are bigger and eat more, cut about 72% of the
 * Merino ewes' wool on the same feed (MLA PIRD S98/W01, S65: 72% of the
 * greasy cut, taken at the same yield; SB-52c). A milking ewe turns feed into wool at 8.8 ÷ 14.5 of a
 * dry ewe's rate, and in the last third of pregnancy wool grows 30% slower
 * (Hinch, S46: 20 to 40%; SB-49).
 */
export const WOOL = {
  gPerKgDm: 10.4,
  xbFactor: 0.57,
  lactating: 8.8 / 14.5,
  latePregnancy: 0.7,
  /**
   * Weight gain or loss moves wool growth: × (1 + gainK × kg a day), held
   * between `min` and `max`. FITTED to Lifetime Wool (S18, S19): a ewe that
   * loses 1 CS over pregnancy cuts about 0.7 kg less clean wool (SB-50).
   */
  gainK: 5.5,
  min: 0.4,
  max: 1.5,
  /**
   * Age: a lamb grows `ageFrom` of an adult's rate, rising to the full rate
   * at `ageDays` (fleece weight peaks at 3 to 4 years, S46). FITTED to the
   * first fleece of AWI's Balmoral ewes (S62: 1.2 kg clean from 8 months of
   * wool; SB-52b).
   */
  ageFrom: 0.45,
  ageDays: 1095,
  /** Milk counts as this many kg DM for each MJ, so a suckling lamb grows wool: 1 ÷ 11 MJ/kg (STAND-IN). */
  milkKgPerMj: 1 / 11,
} as const;

/**
 * Fibre diameter, micron, when a sheep grows its reference fleece: Merino
 * wethers and rams 19.0 (NSW bloodlines, S64); Merino ewes 17.8. Males are 1
 * to 3 micron coarser (S46; about 12% would put ewes at 17.0, as the first
 * pass had), but the document says the three districts grow mostly medium
 * wool, 19 to 21 micron (section 6), and the 17-micron ewes came from a
 * fine-wool flock (Balmoral, S62). So ewes are set at the coarsest micron
 * that keeps SB-51's 1-micron gap (third pass, 15 Nov 2026). Crossbreds 28
 * (STAND-IN: no crossbred micron was found). The reference fleece, kg clean a year: Merino males 4.2 (S64),
 * Merino ewes 4.0 (S62, S63: 3.3 to 4.7), crossbreds 72% of the ewes'.
 */
export const MICRON = {
  merino: { F: 17.8, M: 19.0, W: 19.0 },
  xb: { F: 28, M: 28, W: 28 },
  refKg: { merinoF: 4.0, merinoM: 4.2, xb: 2.9 },
  /**
   * Each kg a year that wool grows faster or slower than the reference
   * fleece moves its micron by this much. FITTED to Lifetime Wool (S18, S19:
   * one CS over pregnancy is about 0.7 kg clean and 0.9 micron), read as the
   * wool grown over the pregnancy: 0.7 kg in 147 days is a growth rate 1.7 kg
   * a year slower, so about 0.9 ÷ 1.7 = 0.53, raised to 0.6 for the way a
   * fleece's micron is averaged by weight (SB-50).
   */
  perKg: 0.6,
  min: 11,
  max: 40,
} as const;

/** Clean yield of greasy wool: the national 63.6% (AWPFC, S45). Used for every class (call C15). */
export const CLEAN_YIELD = 0.636;

// ---------------------------------------------------------------------------
// Water (litres a head a day)
// ---------------------------------------------------------------------------

/**
 * Sheep water by class (Agriculture Victoria, S13; call C17): average days,
 * and summer (December to February) days. Lambs at foot drink inside their
 * ewe's figure.
 */
export const SHEEP_WATER_L = {
  weaner: { average: 4, summer: 6 },
  dry: { average: 6, summer: 10 },
  ewesWithLambs: { average: 10, summer: 14 },
} as const;

/**
 * The longest a sheep over 4 months should go without water, hours, under
 * the land transport standards (as quoted by RSPCA Australia, read 14 Nov
 * 2026; docs/DATA.md). For the screens: it is not how long a sheep lives.
 */
export const WATER_WELFARE_HOURS = 48;

// ---------------------------------------------------------------------------
// Supplements (milestone 2.4, engine half)
// ---------------------------------------------------------------------------

/** What a sheep mob is fed on top of the pasture. */
export type SheepFeed = 'none' | 'lick' | 'grain' | 'hay';
export const SHEEP_FEEDS: readonly SheepFeed[] = ['none', 'lick', 'grain', 'hay'];

/**
 * Grain and hay are fed to fill the gap between what the pasture gives and
 * what the sheep needs (Agriculture Victoria, "Drought Feeding and
 * Management of Sheep", ch. 4, read 15 Nov 2026: a ration is worked out
 * from the sheep's energy needs), never more than the full ration with no
 * paddock feed in that guide's table 4.5 (kg a head a day, for a 45 kg
 * sheep; 10% more for each 5 kg over, the same guide):
 * - wheat: dry 3.8 kg a week (0.54 a day), last 4 to 6 weeks of pregnancy
 *   5.2 (0.74), with lambs at foot 7.5 (1.07); 12 MJ ME a kg (same guide);
 * - good hay alone: dry 5.4 kg a week (0.77 a day), late pregnancy 8 to 10
 *   (1.29 a day, the middle), with lambs at foot 10 to 14 (1.71); ME 8.5
 *   MJ a kg, worked out from the guide's 46 MJ a week for 5.4 kg (my
 *   arithmetic).
 * Grain protein 11% and the prices are STAND-INS: no dated feed price was
 * read (only search summaries); grain is charged at the game's pellet price
 * and hay at its hay price (FEED_COST, the MVP's figures).
 * The lick is the cattle lick's rule (intake × 1.25 when diet CP is under
 * 7%, × 1.08 at 7 to 9%, no protein penalty; MODEL section 3) at the cattle
 * cost a head a day ÷ 8.4 (one DSE's share of an AE). STAND-IN: no sheep
 * lick intake or price was read.
 */
export const SHEEP_RATION = {
  grain: { me: 12, cp: 11, kgDay: { dry: 3.8 / 7, latePreg: 5.2 / 7, lactating: 7.5 / 7 } },
  hay: { me: 46 / 5.4, cp: 9, kgDay: { dry: 5.4 / 7, latePreg: 9 / 7, lactating: 12 / 7 } },
  /** The table's sheep weight, kg, and 10% more for each 5 kg over it. */
  refKg: 45,
  perFiveKg: 0.1,
  /**
   * Young sheep are fed for growth too: 50 g a head a day, the least a
   * weaner should grow to 12 months old (MMFS ch. 10.4, S17).
   */
  youngGrowthKg: 0.05,
  /** Late pregnancy for the ration: the last 6 weeks, from this day. */
  latePregDay: 147 - 42,
} as const;

// ---------------------------------------------------------------------------
// Sheep put on a farm (start flocks, and `addSheepMob` until the market)
// ---------------------------------------------------------------------------

/**
 * A group put on the farm, when its age and weight are not given. All
 * STAND-INS except the weaning weight:
 * - age, days: adults 3 years, hoggets 15 months, weaners 5 months;
 * - live weight as a share of mature weight at that CS: weaners 0.6,
 *   hoggets 0.8 (adults are their mature weight);
 * - weaned this many days ago: weaners 40, hoggets 300;
 * - weaned at 45% of SRW (MMFS ch. 10.4, S17: wean at 45% of SRW or more).
 */
export const BOUGHT = {
  ageDays: { adult: 1095, hogget: 455, weaner: 150 },
  wtShare: { weaner: 0.6, hogget: 0.8 },
  weanedDaysAgo: { weaner: 40, hogget: 300 },
  weanShareOfSrw: 0.45,
} as const;

/**
 * A running farm's start flock: Merino ewes worked out at this many DSE
 * each over a year (lambs inside her). STAND-IN: the same figure the sheep
 * year benchmarks stock at (a dry ewe is 1.0, late pregnancy 1.3 to 1.5,
 * milking a single 2.2 to 2.5, by the DSE tables S5, S6).
 */
export const START_FLOCK = {
  eweYearDse: 1.5,
  /** CS at the start: AWI's target of CS 3 at joining, scanning, lambing (singles) and weaning (S22). */
  cs: 3,
  /**
   * The CS the start flock's lambs are taken to have been born at, by
   * district, for their survival: DERIVED from the model's own Merino ewe
   * year runs with the district's winter feeding (SB-43, CS at lambing,
   * third pass: Tablelands 2.66, Central West 2.69, Western Victoria 2.92),
   * so the lambs at foot are what the model's flocks mark (review of the
   * third pass: at CS 3 the Central West start flock carried 101 lambs a
   * 100 ewes against the model's own 87).
   */
  csAtLambing: { nsw: 2.66, cw: 2.69, wv: 2.92 } as Partial<Record<DistrictId, number>>,
  /** Maidens are joined at about 1.5 years (MMFS S25: maiden Merinos joined at 75 to 80% of SRW). */
  maidenYears: 1.5,
  /**
   * Ewes are cast for age at 6 years. STAND-IN: no page read (search
   * summaries put cast for age at 5 to 6 years).
   */
  castForAge: 6,
  /**
   * The mean day of the joining a ewe conceives on: DERIVED from the model's
   * own conception, about 70% on the first heat (mean day 8 of a 17-day
   * cycle) and the rest 17 days later, so about day 12.
   */
  meanConceptionDay: 12,
  /** Lambs grow 198 g a day to weaning (Kelly 1992, S68: singles 198, twins 193). */
  lambGrowthKg: 0.198,
  /** Weaners grow 50 g a day after weaning (MMFS S17: the least to 12 months). */
  weanerGrowthKg: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------

/**
 * Which fences hold sheep (Tasmanian government guide, S48; SB-63, SB-64): a
 * plain-wire fence that suits cattle "will not be adequate for sheep"; it
 * needs hinge-joint or similar netting. The game's cattle fences
 * (permanent, electric, tape, standing or knocked down) do not hold sheep;
 * a netting fence, a gate and the boundary do. Hungry or thirsty sheep get
 * through a cattle fence by the cattle breakout rule (`sheepBreakouts` in
 * sim/tick.ts). The netting price is a stand-in (call C26).
 */
export function fenceHoldsSheep(kind: 'permanent' | 'electric' | 'tape' | 'netting'): boolean {
  return kind === 'netting';
}

// ---------------------------------------------------------------------------
// Carcase (for selling, next milestone)
// ---------------------------------------------------------------------------

/**
 * Dressing percentage, hot standard carcase weight as a share of live
 * weight (call C31, docs/DATA.md):
 * - lambs 45 to 50% (MMFS ch. 3.2), taken as 47.5% for second-cross lambs;
 *   Merino lambs dress 1.5 to 3.5% less (same page), taken as 2.5% less;
 * - mutton by fat score 1 to 5 (MLA "Making the most of mutton", 2001,
 *   table 3): wethers 39, 41, 43, 45, 47%; ewes 38, 40, 42, 44, 46%.
 * The fat score is taken as the CS rounded (STAND-IN: no CS to fat score
 * table was read).
 */
export const DRESSING = {
  lambXb: 0.475,
  merinoLambLess: 0.025,
  mutton: { W: [0.39, 0.41, 0.43, 0.45, 0.47], F: [0.38, 0.4, 0.42, 0.44, 0.46] },
} as const;
