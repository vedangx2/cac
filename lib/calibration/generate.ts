// lib/calibration/generate.ts
//
// SYNTHETIC ATHLETES. Given a noise profile, invent an athlete, give them a baseline sitting and
// a second sitting, and package both as real `TestResult` records the engine will accept.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY REAL TestResult RECORDS AND NOT A SHORTCUT
// ═════════════════════════════════════════════════════════════════════════════════════
// The point of this whole harness is to drive the ACTUAL comparison engine rather than a
// simplified copy of it. That only works if what we hand the engine is the same shape the app
// hands it: same schema version, same athlete on both sides, baseline genuinely earlier than the
// check, every module filled in the way the real screens fill it in. If we fed it a convenient
// stand-in shape, the harness would be measuring a model of the engine, and the day the engine
// changed the curves would quietly stop describing it.
//
// So `symptom` gets an itemScores array that really sums to its total, `wordLearning` gets hits
// and false alarms that are really arithmetically consistent with its correct count, and the span
// modules get a trialsCorrect array whose trues really number `correct`.
//
// Every generated record is stamped with a form id of 'simulated' so that a number from here can
// never be mistaken for a reading from a real sitting.

import type { ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { WORDS_PER_FORM } from '../forms';
import {
  CALIBRATED_MEASUREMENTS,
  type CalibratedMeasurement,
  type Degradations,
  MEASUREMENT_SHAPES,
  type NoiseProfiles,
  applyDegradation,
} from './profiles';
import { type Rng, binomial, clamp01, clampInteger, normal, poisson } from './random';

/** Written into every generated record so simulated data is identifiable on sight. */
export const SIMULATED_FORM_ID = 'simulated';

/** One athlete's values for every measurement, for one sitting. */
export type MeasurementValues = Record<CalibratedMeasurement, number>;

/** A baseline and a second sitting from the same simulated athlete. */
export type SimulatedPair = {
  baseline: TestResult;
  check: TestResult;
  baselineValues: MeasurementValues;
  checkValues: MeasurementValues;
};

/* ═══════════════════════════════════════════════════════════════════════════════════
   ONE MEASUREMENT AT A TIME
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Where this athlete personally sits on the scale for one measurement.
 *
 * This is the BETWEEN-athlete draw, and it happens once per athlete. Both of their sittings are
 * then generated around this point, which is what makes the pair a comparison of somebody with
 * themselves rather than with the population.
 */
function drawAthleteCentre(
  measurement: CalibratedMeasurement,
  profiles: NoiseProfiles,
  rng: Rng,
): number {
  const shape = MEASUREMENT_SHAPES[measurement];
  const profile = profiles[measurement];
  const drawn = normal(rng, profile.centre, profile.spreadBetweenAthletes);

  if (shape.max === null) return Math.max(shape.min, drawn);
  return Math.min(shape.max, Math.max(shape.min, drawn));
}

/**
 * One sitting for an athlete whose personal centre is `centre`.
 *
 * THIS IS WHERE THE WITHIN-ATHLETE WOBBLE COMES FROM, and it comes from a different place
 * depending on the kind of measurement:
 *
 *   • 'count'      — a binomial draw. The athlete has a true success rate; each sitting is a
 *                    fresh set of nine (or twenty) chances. The wobble is a consequence of that,
 *                    not a number we set, which is the honest model for a bounded count.
 *   • 'tally'      — a Poisson draw around their personal rate. Same idea for rare events.
 *   • 'continuous' — a normal draw with the within-athlete spread, which for a response time is
 *                    a free parameter and has to be measured (that is what /tools/noise-floor is
 *                    for).
 */
function drawSitting(
  measurement: CalibratedMeasurement,
  centre: number,
  profiles: NoiseProfiles,
  rng: Rng,
): number {
  const shape = MEASUREMENT_SHAPES[measurement];

  if (shape.kind === 'count') {
    const trials = shape.trials ?? 1;
    return binomial(rng, trials, clamp01(centre / trials));
  }

  if (shape.kind === 'tally') {
    const drawn = poisson(rng, Math.max(0, centre));
    return clampInteger(drawn, shape.min, shape.max ?? drawn);
  }

  const drawn = normal(rng, centre, profiles[measurement].spreadWithinAthlete);
  const floored = Math.max(shape.min, drawn);
  return Math.round(shape.max === null ? floored : Math.min(shape.max, floored));
}

/** Keep a generated value inside what the measurement can actually take. */
function clampToShape(measurement: CalibratedMeasurement, value: number): number {
  const shape = MEASUREMENT_SHAPES[measurement];
  const max = shape.max ?? Number.MAX_SAFE_INTEGER;
  return clampInteger(value, shape.min, max);
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   BUILDING A REAL RECORD
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Spread a total across ten symptom items, each 0-3, so `itemScores` really sums to `total`.
 *
 * The engine only reads `.total`, so this could have been ten zeroes — but a record whose parts
 * do not add up to its whole is a trap for whoever reads it next, and it would export as obvious
 * nonsense.
 */
function spreadSymptomItems(total: number): number[] {
  const items = new Array<number>(10).fill(0);
  let remaining = Math.max(0, Math.min(30, Math.round(total)));

  for (let index = 0; index < items.length && remaining > 0; index += 1) {
    const take = Math.min(3, remaining);
    items[index] = take;
    remaining -= take;
  }

  return items;
}

/** Per-trial pass/fail with exactly `correct` passes, so the array agrees with the count. */
function spreadTrials(correct: number, total: number): boolean[] {
  const capped = Math.max(0, Math.min(total, Math.round(correct)));
  return Array.from({ length: total }, (_, index) => index < capped);
}

/**
 * Turn a set of measurement values into the ModuleScores shape the app really stores.
 *
 * The word modules are the fiddly bit. `correct` counts every grid word classified correctly:
 * the studied words you picked (hits) plus the unstudied words you left alone (correct
 * rejections). So given `correct` and `falseAlarms`:
 *
 *     correctRejections = distractors - falseAlarms
 *     hits              = correct - correctRejections
 *
 * That is arithmetic, not an assumption, and it keeps the stored record internally consistent.
 */
export function buildModuleScores(values: MeasurementValues): ModuleScores {
  const distractors = MEASUREMENT_SHAPES.wordLearningFalseAlarms.max ?? WORDS_PER_FORM;

  const wordModule = (correct: number, falseAlarms: number) => {
    const correctRejections = distractors - falseAlarms;
    const hits = Math.max(0, Math.min(WORDS_PER_FORM, correct - correctRejections));
    return { formId: SIMULATED_FORM_ID, hits, falseAlarms, correct };
  };

  return {
    symptom: {
      itemScores: spreadSymptomItems(values.symptomTotal),
      total: values.symptomTotal,
    },
    wordLearning: wordModule(values.wordLearningCorrect, values.wordLearningFalseAlarms),
    wordRecognition: wordModule(
      values.wordRecognitionCorrect,
      values.wordRecognitionFalseAlarms,
    ),
    digitSpan: {
      formId: SIMULATED_FORM_ID,
      trialsCorrect: spreadTrials(
        values.digitSpanCorrect,
        MEASUREMENT_SHAPES.digitSpanCorrect.max ?? 9,
      ),
      correct: values.digitSpanCorrect,
    },
    patternSpan: {
      formId: SIMULATED_FORM_ID,
      trialsCorrect: spreadTrials(
        values.patternSpanCorrect,
        MEASUREMENT_SHAPES.patternSpanCorrect.max ?? 9,
      ),
      correct: values.patternSpanCorrect,
    },
    goNoGo: {
      formId: SIMULATED_FORM_ID,
      medianMs: values.goNoGoMedianMs,
      commissionErrors: values.goNoGoCommissionErrors,
      omissionErrors: values.goNoGoOmissionErrors,
    },
    // Balance is not built, so a simulated athlete does not have one. See profiles.ts.
    balance: null,
  };
}

/** A baseline recorded a week before its check — the ordering the engine's rule 6 requires. */
const BASELINE_TIME = 1_700_000_000_000;
const CHECK_TIME = BASELINE_TIME + 7 * 24 * 60 * 60 * 1000;

function buildResult(
  athleteId: string,
  kind: 'baseline' | 'check',
  values: MeasurementValues,
): TestResult {
  return {
    id: `${athleteId}-${kind}`,
    athleteId,
    takenAt: kind === 'baseline' ? BASELINE_TIME : CHECK_TIME,
    kind,
    scores: buildModuleScores(values),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE TWO GENERATORS
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * A healthy athlete: a baseline and a second sitting drawn from the SAME distribution.
 *
 * Nothing has happened to this athlete between the two sittings. Any difference the engine finds
 * is pure noise, so every flag raised on one of these pairs is a FALSE POSITIVE by construction.
 */
export function generateHealthyPair(
  index: number,
  profiles: NoiseProfiles,
  rng: Rng,
): SimulatedPair {
  const athleteId = `sim-healthy-${index}`;
  const baselineValues = {} as MeasurementValues;
  const checkValues = {} as MeasurementValues;

  for (const measurement of CALIBRATED_MEASUREMENTS) {
    const centre = drawAthleteCentre(measurement, profiles, rng);
    baselineValues[measurement] = clampToShape(
      measurement,
      drawSitting(measurement, centre, profiles, rng),
    );
    checkValues[measurement] = clampToShape(
      measurement,
      drawSitting(measurement, centre, profiles, rng),
    );
  }

  return {
    baseline: buildResult(athleteId, 'baseline', baselineValues),
    check: buildResult(athleteId, 'check', checkValues),
    baselineValues,
    checkValues,
  };
}

/**
 * An impaired athlete: the same, plus a degradation applied to the second sitting only.
 *
 * THE DEGRADATION IS ENTIRELY THE CALLER'S. There is no default and no fallback — a measurement
 * missing from `degradations` is simply not degraded, and the harness will report that its
 * false-negative rate is undefined rather than quietly assuming an effect size. See the comment
 * on `Degradations` in profiles.ts for why that matters.
 *
 * Note the model this makes explicit: impairment SHIFTS the whole distribution by a fixed amount
 * and leaves its shape alone. Real impairment might also make an athlete more erratic, which
 * would widen the spread as well. This harness does not model that, and the report says so.
 */
export function generateImpairedPair(
  index: number,
  profiles: NoiseProfiles,
  degradations: Degradations,
  rng: Rng,
): SimulatedPair {
  const athleteId = `sim-impaired-${index}`;
  const baselineValues = {} as MeasurementValues;
  const checkValues = {} as MeasurementValues;

  for (const measurement of CALIBRATED_MEASUREMENTS) {
    const centre = drawAthleteCentre(measurement, profiles, rng);
    baselineValues[measurement] = clampToShape(
      measurement,
      drawSitting(measurement, centre, profiles, rng),
    );

    const healthyCheck = drawSitting(measurement, centre, profiles, rng);
    const amount = degradations[measurement] ?? 0;
    checkValues[measurement] = clampToShape(
      measurement,
      applyDegradation(measurement, healthyCheck, amount),
    );
  }

  return {
    baseline: buildResult(athleteId, 'baseline', baselineValues),
    check: buildResult(athleteId, 'check', checkValues),
    baselineValues,
    checkValues,
  };
}
