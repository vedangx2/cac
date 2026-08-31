// lib/calibration/index.ts
//
// One front door for the threshold-calibration harness.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS WHOLE FOLDER IS FOR, AND WHAT IT IS NOT
// ═════════════════════════════════════════════════════════════════════════════════════
// Every threshold in this app is `null` because nobody has collected the data yet. Thresholds
// cannot be guessed — that is a hard rule of the project. But the MACHINERY that turns collected
// data into a threshold can be built before the data exists, so that the day real measurements
// arrive the answer falls out of them immediately instead of a fortnight of work starting.
//
// That is all this is. It takes a description of how much a healthy athlete's scores wobble, plus
// a degradation size YOU choose, invents thousands of athletes with those properties, pushes every
// one of them through the real comparison engine, and reports how often each candidate threshold
// would raise a false alarm and how often it would miss.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// IT WRITES NOTHING. Nothing in this folder imports thresholds.ts for writing, nothing generates
// a threshold value, and no output of it may be copied into thresholds.ts by anything other than
// a human who has looked at the curve and decided. Every threshold stays `null` until then.
// ─────────────────────────────────────────────────────────────────────────────────────
//
// AND THE THING TO SAY OUT LOUD EVERY TIME: the output is a property of the MODEL you fed it. It
// is arithmetic about made-up athletes, not evidence about concussion. If the noise profile is
// wrong, the curve is wrong in exactly the same way, and it will look just as convincing.

export {
  CALIBRATED_MEASUREMENTS,
  type CalibratedMeasurement,
  type Degradations,
  MEASUREMENT_SHAPES,
  type MeasurementShape,
  type ModuleKey,
  type NoiseProfile,
  type NoiseProfiles,
  PLACEHOLDER_LABEL,
  PLACEHOLDER_PROFILES,
  applyDegradation,
} from './profiles';

export {
  SIMULATED_FORM_ID,
  type MeasurementValues,
  type SimulatedPair,
  buildModuleScores,
  generateHealthyPair,
  generateImpairedPair,
} from './generate';

export {
  DEFAULT_PAIRS,
  FLAG_RULES,
  FLAG_RULE_LABELS,
  type FlagRule,
  type RuleResult,
  type Sample,
  type SampleSet,
  type SimulationConfig,
  type ThresholdPoint,
  type ThresholdSet,
  applyFlagRule,
  compareFlagRules,
  crossCheck,
  defaultThresholdCandidates,
  generateSamples,
  moduleFlags,
  ratesAtThreshold,
  sweepMeasurement,
  unjudgedMeasurements,
} from './simulate';

export { type ParsedSeries, parseSeries, profileFromSeries } from './parse';

export { type Rng, binomial, makeRng, normal, poisson } from './random';
