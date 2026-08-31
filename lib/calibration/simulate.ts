// lib/calibration/simulate.ts
//
// THE SIMULATION. Generate many synthetic athletes, push every one of them through the REAL
// comparison engine, and count how often a candidate threshold gets the answer wrong.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT "DRIVES THE REAL ENGINE" MEANS HERE, EXACTLY — read this before trusting a number
// ═════════════════════════════════════════════════════════════════════════════════════
// Two things are imported from lib/engine and NOT reimplemented:
//
//   1. `worseningFor` — the function that turns a baseline value and a check value into "how much
//      worse", normalised so positive always means worse. This is the piece with a reversed-sign
//      failure mode severe enough to have its own file (lib/engine/direction.ts), and it is the
//      last thing that should exist in two copies.
//
//   2. `compareToBaseline` — the whole engine. Every simulated pair is run through it. That is
//      what proves the pairs are ones the engine will actually accept: same athlete, baseline
//      genuinely earlier, matching schema version, all seven refusal rules satisfied. A pair the
//      engine would refuse must never end up in a rate.
//
// What this file ADDS, and why it has to:
//
//   • THE CANDIDATE THRESHOLD. Every threshold in thresholds.ts is `null` and stays `null` — that
//     is a hard rule of this project and this harness never writes one. So the engine cannot be
//     asked "what would you decide if the cut-off were 3?"; it has no cut-off to be asked about.
//     The harness therefore applies the candidate itself, using the same comparison the engine
//     uses: `worsening >= threshold`.
//
//   • THE FLAG RULE. The engine hard-codes "any module flagging flags the screen". Comparing that
//     against alternatives is the entire point of the rules section below, so the rule has to be
//     a parameter here.
//
// AND THE CROSS-CHECK THAT KEEPS THOSE TWO ADDITIONS HONEST: the symptom threshold is the one
// threshold in the app that has a real value. So for symptom, and only for symptom, we can ask
// the engine directly and compare its answer to ours on every single simulated pair. If they ever
// disagree, this harness has drifted away from the engine and the run says so loudly instead of
// reporting a confident number. See `crossCheck` below.

import { SYMPTOM_INCREASE, compareToBaseline, worseningFor } from '../engine';
import {
  CALIBRATED_MEASUREMENTS,
  type CalibratedMeasurement,
  type Degradations,
  MEASUREMENT_SHAPES,
  type ModuleKey,
  type NoiseProfiles,
} from './profiles';
import { generateHealthyPair, generateImpairedPair } from './generate';
import { makeRng } from './random';

/** How many pairs of each kind a run uses unless told otherwise. */
export const DEFAULT_PAIRS = 10_000;

/**
 * One simulated athlete, reduced to what a threshold decision needs.
 *
 * Storing the worsening per measurement rather than the whole record is what makes sweeping
 * cheap: the pairs are generated and run through the engine ONCE, and then every candidate
 * threshold is just a comparison against numbers we already have. A threshold cannot change what
 * the worsening was, only what we conclude from it.
 */
export type Sample = {
  worsening: Record<CalibratedMeasurement, number>;
  /** What the real engine concluded about the symptom module. Used only for the cross-check. */
  engineSymptomFlagged: boolean;
};

export type SampleSet = {
  healthy: Sample[];
  impaired: Sample[];
  /** Pairs the engine REFUSED. Should always be zero; a non-zero count invalidates the run. */
  refusedByEngine: number;
  /** Pairs where our symptom decision disagreed with the engine's. Must be zero. */
  crossCheckDisagreements: number;
  seed: number;
};

export type SimulationConfig = {
  profiles: NoiseProfiles;
  /** Supplied by the person running the simulation. No defaults exist — see profiles.ts. */
  degradations: Degradations;
  pairs?: number;
  seed?: number;
};

/* ═══════════════════════════════════════════════════════════════════════════════════
   GENERATING AND RUNNING THE PAIRS
   ═══════════════════════════════════════════════════════════════════════════════════ */

function measureOnePair(
  pair: ReturnType<typeof generateHealthyPair>,
): { sample: Sample | null } {
  // THE REAL ENGINE. If it refuses this pair for any of its seven reasons, the pair is not one
  // the app would ever have judged, so it must not contribute to a rate.
  let engineSymptomFlagged = false;
  try {
    const outcome = compareToBaseline(pair.baseline, pair.check);
    engineSymptomFlagged = outcome.modules.symptom;
  } catch {
    return { sample: null };
  }

  const worsening = {} as Record<CalibratedMeasurement, number>;
  for (const measurement of CALIBRATED_MEASUREMENTS) {
    // The engine's own direction-aware subtraction. Positive means worse, every time.
    worsening[measurement] = worseningFor(
      measurement,
      pair.baselineValues[measurement],
      pair.checkValues[measurement],
    );
  }

  return { sample: { worsening, engineSymptomFlagged } };
}

/**
 * Build the sample set: N healthy pairs and N impaired pairs, all run through the engine.
 *
 * One seeded generator drives the whole run, so the same config always produces the same numbers
 * and a change in the output is always a change you made.
 */
export function generateSamples(config: SimulationConfig): SampleSet {
  const pairs = config.pairs ?? DEFAULT_PAIRS;
  const seed = config.seed ?? 1;
  const rng = makeRng(seed);

  const healthy: Sample[] = [];
  const impaired: Sample[] = [];
  let refusedByEngine = 0;
  let crossCheckDisagreements = 0;

  const record = (sample: Sample | null, into: Sample[]) => {
    if (!sample) {
      refusedByEngine += 1;
      return;
    }
    // THE CROSS-CHECK. Symptom is the one measurement with a real threshold, so it is the one
    // place our arithmetic can be held against the engine's on every single pair.
    const ours = sample.worsening.symptomTotal >= SYMPTOM_INCREASE;
    if (ours !== sample.engineSymptomFlagged) crossCheckDisagreements += 1;
    into.push(sample);
  };

  for (let index = 0; index < pairs; index += 1) {
    record(measureOnePair(generateHealthyPair(index, config.profiles, rng)).sample, healthy);
    record(
      measureOnePair(
        generateImpairedPair(index, config.profiles, config.degradations, rng),
      ).sample,
      impaired,
    );
  }

  return { healthy, impaired, refusedByEngine, crossCheckDisagreements, seed };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   ONE MEASUREMENT, ONE THRESHOLD
   ═══════════════════════════════════════════════════════════════════════════════════ */

export type ThresholdPoint = {
  threshold: number;
  /** Healthy pairs this threshold would have flagged. Every one is a false alarm. */
  falsePositiveRate: number;
  /**
   * Impaired pairs this threshold would have MISSED.
   *
   * Null when no degradation was supplied for this measurement: with nothing wrong to detect,
   * "how often would we miss it" has no answer, and printing 0% or 100% would both be lies.
   */
  falseNegativeRate: number | null;
  healthyFlagged: number;
  impairedMissed: number;
  healthyTotal: number;
  impairedTotal: number;
};

/** Would this threshold flag this sample? The same comparison the engine makes. */
function flags(sample: Sample, measurement: CalibratedMeasurement, threshold: number): boolean {
  return sample.worsening[measurement] >= threshold;
}

export function ratesAtThreshold(
  samples: SampleSet,
  measurement: CalibratedMeasurement,
  threshold: number,
  degradations: Degradations,
): ThresholdPoint {
  const healthyFlagged = samples.healthy.filter((s) => flags(s, measurement, threshold)).length;
  const impairedMissed = samples.impaired.filter((s) => !flags(s, measurement, threshold)).length;

  const degraded = (degradations[measurement] ?? 0) > 0;

  return {
    threshold,
    falsePositiveRate: samples.healthy.length ? healthyFlagged / samples.healthy.length : 0,
    falseNegativeRate:
      degraded && samples.impaired.length ? impairedMissed / samples.impaired.length : null,
    healthyFlagged,
    impairedMissed,
    healthyTotal: samples.healthy.length,
    impairedTotal: samples.impaired.length,
  };
}

/**
 * The whole curve for one measurement, so the tradeoff can be LOOKED AT rather than a single
 * number picked out of it.
 *
 * That framing is deliberate. A harness that returned "the best threshold" would be choosing the
 * balance between missing a concussion and crying wolf, and that is not a choice code gets to
 * make on its own.
 */
export function sweepMeasurement(
  samples: SampleSet,
  measurement: CalibratedMeasurement,
  thresholds: readonly number[],
  degradations: Degradations,
): ThresholdPoint[] {
  return thresholds.map((threshold) =>
    ratesAtThreshold(samples, measurement, threshold, degradations),
  );
}

/**
 * Sensible candidate thresholds to sweep for a measurement.
 *
 * For counts and tallies: every whole number from 1 up to the scale's ceiling, because a
 * threshold on "trials correct out of nine" can only sensibly be a whole number.
 *
 * For a response time: a range covering the worsening actually observed in the healthy sample, in
 * round steps. Derived from the data rather than fixed, so pasting slower or noisier numbers moves
 * the range with them.
 */
export function defaultThresholdCandidates(
  samples: SampleSet,
  measurement: CalibratedMeasurement,
): number[] {
  const shape = MEASUREMENT_SHAPES[measurement];

  if (shape.kind !== 'continuous') {
    const ceiling = shape.max ?? 10;
    return Array.from({ length: ceiling }, (_, index) => index + 1);
  }

  // A plain loop, NOT Math.max(...worsenings).
  //
  // Spreading an array into a call puts one stack slot per element, so it throws RangeError once
  // the array is large enough. Measured on the Node build this repo uses, that limit is around
  // 125,000 elements; the dev page caps a run at 50,000 pairs, so the spread version was NOT
  // actually failing today. It was within a factor of about two and a half of failing, on a
  // limit that depends on the JS engine and the stack the browser happens to give the tab. A
  // loop has no such limit and costs nothing, so the margin is not worth keeping.
  let widest = 0;
  for (const sample of samples.healthy) {
    const value = sample.worsening[measurement];
    if (value > widest) widest = value;
  }
  // No samples, or every simulated athlete came out better than baseline. Either way there is no
  // observed worsening to size the axis from, so fall back to a plain range.
  if (widest <= 0) widest = 100;
  // Round the top of the range up to a whole step so the axis reads in tidy numbers.
  const step = Math.max(5, Math.ceil(widest / 20 / 5) * 5);
  const top = Math.max(step * 20, Math.ceil(widest / step) * step);

  const candidates: number[] = [];
  for (let value = step; value <= top; value += step) candidates.push(value);
  return candidates;
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE MULTI-MODULE FLAG RULE
   ═══════════════════════════════════════════════════════════════════════════════════ */

/** A candidate threshold for each measurement. A measurement left out is simply not judged. */
export type ThresholdSet = Partial<Record<CalibratedMeasurement, number>>;

/**
 * How the whole screen decides to flag, given which modules flagged.
 *
 *  • 'any'              — what the engine does today: one module is enough. A smoke alarm.
 *  • 'two-or-more'      — at least two modules must agree.
 *  • 'symptom-weighted' — symptom alone is enough; anything else needs two.
 *
 * THE THIRD ONE IS OUR OWN DEFINITION and is not taken from anywhere. It is on the list because
 * symptom is the only module with a real threshold today, so "does treating symptom differently
 * help?" is a question somebody will ask, and it is better answered with a curve than with an
 * opinion.
 */
export type FlagRule = 'any' | 'two-or-more' | 'symptom-weighted';

export const FLAG_RULES: readonly FlagRule[] = ['any', 'two-or-more', 'symptom-weighted'];

export const FLAG_RULE_LABELS: Record<FlagRule, string> = {
  any: 'Any one module flags (what the engine does today)',
  'two-or-more': 'Two or more modules must flag',
  'symptom-weighted': 'Symptom alone is enough; otherwise two or more',
};

/**
 * Which modules flag for one sample under a threshold set.
 *
 * A module flags if ANY of its measurements does — the same rule the engine applies when it
 * writes `modules[item.module] = true`. A measurement with no threshold in the set cannot flag,
 * which mirrors the engine's null-threshold rule: no cut-off means no verdict, and no verdict is
 * NOT the same as "fine". The count of unjudged measurements is reported alongside every rate for
 * exactly that reason.
 */
export function moduleFlags(sample: Sample, thresholds: ThresholdSet): Set<ModuleKey> {
  const flagged = new Set<ModuleKey>();

  for (const measurement of CALIBRATED_MEASUREMENTS) {
    const threshold = thresholds[measurement];
    if (threshold === undefined) continue; // not judged — never contributes a flag
    if (sample.worsening[measurement] >= threshold) {
      flagged.add(MEASUREMENT_SHAPES[measurement].module);
    }
  }

  return flagged;
}

/** Apply a whole-screen rule to the set of modules that flagged. */
export function applyFlagRule(rule: FlagRule, flagged: Set<ModuleKey>): boolean {
  if (rule === 'any') return flagged.size > 0;
  if (rule === 'two-or-more') return flagged.size >= 2;
  return flagged.has('symptom') || flagged.size >= 2;
}

export type RuleResult = {
  rule: FlagRule;
  label: string;
  falsePositiveRate: number;
  falseNegativeRate: number | null;
  healthyFlagged: number;
  impairedMissed: number;
  healthyTotal: number;
  impairedTotal: number;
};

/**
 * Compare the whole-screen rules against each other at one threshold set.
 *
 * This is the comparison nobody has looked at yet, and it decides more about how the app behaves
 * than any single threshold does: with ten measurements, a rule that flags on any one of them
 * accumulates ten separate chances to raise a false alarm on a perfectly healthy athlete.
 */
export function compareFlagRules(
  samples: SampleSet,
  thresholds: ThresholdSet,
  degradations: Degradations,
): RuleResult[] {
  // Whether ANY degraded measurement is actually being judged. If the person supplied a
  // degradation for a measurement they left un-thresholded, the impaired athletes are impaired in
  // a way the rule cannot see, and a false-negative rate would be describing that mistake rather
  // than the rule.
  const judgedAndDegraded = CALIBRATED_MEASUREMENTS.some(
    (m) => thresholds[m] !== undefined && (degradations[m] ?? 0) > 0,
  );

  const healthyFlagSets = samples.healthy.map((s) => moduleFlags(s, thresholds));
  const impairedFlagSets = samples.impaired.map((s) => moduleFlags(s, thresholds));

  return FLAG_RULES.map((rule) => {
    const healthyFlagged = healthyFlagSets.filter((set) => applyFlagRule(rule, set)).length;
    const impairedMissed = impairedFlagSets.filter((set) => !applyFlagRule(rule, set)).length;

    return {
      rule,
      label: FLAG_RULE_LABELS[rule],
      falsePositiveRate: samples.healthy.length ? healthyFlagged / samples.healthy.length : 0,
      falseNegativeRate:
        judgedAndDegraded && samples.impaired.length
          ? impairedMissed / samples.impaired.length
          : null,
      healthyFlagged,
      impairedMissed,
      healthyTotal: samples.healthy.length,
      impairedTotal: samples.impaired.length,
    };
  });
}

/**
 * Which measurements a threshold set leaves unjudged.
 *
 * Reported everywhere a rate is, because a rule that looks wonderfully specific may simply not be
 * looking at anything. The same distinction the engine's `unevaluated` field exists to protect.
 */
export function unjudgedMeasurements(thresholds: ThresholdSet): CalibratedMeasurement[] {
  return CALIBRATED_MEASUREMENTS.filter((m) => thresholds[m] === undefined);
}

/** Did this run stay faithful to the engine? Anything but `true` invalidates the numbers. */
export function crossCheck(samples: SampleSet): {
  ok: boolean;
  refusedByEngine: number;
  disagreements: number;
} {
  return {
    ok: samples.refusedByEngine === 0 && samples.crossCheckDisagreements === 0,
    refusedByEngine: samples.refusedByEngine,
    disagreements: samples.crossCheckDisagreements,
  };
}
