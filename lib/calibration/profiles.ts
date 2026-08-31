// lib/calibration/profiles.ts
//
// WHAT EACH MEASUREMENT LOOKS LIKE, and how to describe how much it wobbles.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE ONE IDEA THIS FILE EXISTS FOR
// ═════════════════════════════════════════════════════════════════════════════════════
// A threshold answers: "how big a change is big enough to be worth a human's attention?" You
// cannot answer that without knowing how much a HEALTHY athlete's score moves between two
// sittings all by itself. Below that natural wobble you flag everybody; far above it you flag
// nobody.
//
// So a "noise profile" describes that wobble, and there are TWO different wobbles in play. Getting
// them mixed up is the single easiest way to make this whole harness answer the wrong question:
//
//   • BETWEEN athletes — Sam is naturally faster than Alex. This is large, and it is IRRELEVANT
//     to the false-positive rate, because this app never compares Sam to Alex. It is here only so
//     that simulated scores land in a believable part of the scale, which matters for the
//     count-based measurements where the spread depends on where you are on the scale.
//
//   • WITHIN one athlete — Sam on Tuesday versus Sam on Friday, both healthy. THIS is the number
//     that decides the false-positive rate, and it is the number `/tools/noise-floor` exists to
//     collect.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// NOTHING IN HERE IS A MEASUREMENT OF ANYBODY
// ═════════════════════════════════════════════════════════════════════════════════════
// The placeholder profiles at the bottom are invented round numbers, labelled as such, so the
// dev page has something to draw before you paste real data in. They are not estimates, they are
// not derived from anything, and no number produced from them says anything about a real athlete.
// Replace them with your own collected values and the output becomes about your numbers.

import {
  DIGIT_TRIALS_PER_FORM,
  GO_NO_NOGO_PER_FORM,
  GO_NO_TRIALS_PER_FORM,
  PATTERN_TRIALS_PER_FORM,
  RECOGNITION_GRID_SIZE,
  WORDS_PER_FORM,
} from '../forms';
import { MEASUREMENT_DIRECTIONS, type MeasurementKey } from '../engine';

/* ═══════════════════════════════════════════════════════════════════════════════════
   WHICH MEASUREMENTS THIS HARNESS COVERS
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every measurement the simulation can generate.
 *
 * BALANCE IS DELIBERATELY ABSENT. The balance module does not exist, so there is no such thing as
 * collected balance data, and simulating it would produce a curve for a test nobody can take.
 * When balance is built, add it here and to MEASUREMENT_SHAPES below.
 */
export const CALIBRATED_MEASUREMENTS = [
  'symptomTotal',
  'wordLearningCorrect',
  'wordLearningFalseAlarms',
  'wordRecognitionCorrect',
  'wordRecognitionFalseAlarms',
  'digitSpanCorrect',
  'patternSpanCorrect',
  'goNoGoMedianMs',
  'goNoGoCommissionErrors',
  'goNoGoOmissionErrors',
] as const satisfies readonly MeasurementKey[];

export type CalibratedMeasurement = (typeof CALIBRATED_MEASUREMENTS)[number];

/** Which module's flag a measurement can set — mirrors the table in lib/engine/compare.ts. */
export type ModuleKey =
  | 'symptom'
  | 'wordLearning'
  | 'wordRecognition'
  | 'digitSpan'
  | 'patternSpan'
  | 'goNoGo';

/** How many go trials a form has — the ceiling on omission errors. */
const GO_TRIALS_PER_FORM = GO_NO_TRIALS_PER_FORM - GO_NO_NOGO_PER_FORM;

/**
 * The fixed facts about a measurement: what it is called, what it belongs to, what values are
 * even possible, and which statistical shape fits it.
 *
 * `kind` is not decoration — it decides which generator runs, and the wrong choice produces a
 * curve that looks fine and is answering a different question. See random.ts for why counts get a
 * binomial and error tallies get a Poisson.
 */
export type MeasurementShape = {
  label: string;
  module: ModuleKey;
  /** 'count' = out of a fixed number of chances. 'tally' = rare events. 'continuous' = ms. */
  kind: 'count' | 'tally' | 'continuous';
  /** Lowest value the measurement can take. */
  min: number;
  /** Highest value it can take, or null when there is no ceiling (a response time). */
  max: number | null;
  /** For 'count' measurements: how many chances there are. */
  trials?: number;
  /** How a value is written for a human, e.g. "7 out of 9". */
  unit: string;
};

export const MEASUREMENT_SHAPES: Record<CalibratedMeasurement, MeasurementShape> = {
  symptomTotal: {
    label: 'Symptom score',
    module: 'symptom',
    // Ten items rated 0-3. It behaves like a tally of complaints rather than a count of
    // successes: mostly low, occasionally much higher, never negative.
    kind: 'tally',
    min: 0,
    max: 30,
    unit: 'points out of 30',
  },
  wordLearningCorrect: {
    label: 'Word learning — correct',
    module: 'wordLearning',
    kind: 'count',
    min: 0,
    max: RECOGNITION_GRID_SIZE,
    trials: RECOGNITION_GRID_SIZE,
    unit: `out of ${RECOGNITION_GRID_SIZE}`,
  },
  wordLearningFalseAlarms: {
    label: 'Word learning — false alarms',
    module: 'wordLearning',
    kind: 'tally',
    min: 0,
    // The distractors are the half of the grid that were never studied.
    max: RECOGNITION_GRID_SIZE - WORDS_PER_FORM,
    unit: `out of ${RECOGNITION_GRID_SIZE - WORDS_PER_FORM}`,
  },
  wordRecognitionCorrect: {
    label: 'Word recall — correct',
    module: 'wordRecognition',
    kind: 'count',
    min: 0,
    max: RECOGNITION_GRID_SIZE,
    trials: RECOGNITION_GRID_SIZE,
    unit: `out of ${RECOGNITION_GRID_SIZE}`,
  },
  wordRecognitionFalseAlarms: {
    label: 'Word recall — false alarms',
    module: 'wordRecognition',
    kind: 'tally',
    min: 0,
    max: RECOGNITION_GRID_SIZE - WORDS_PER_FORM,
    unit: `out of ${RECOGNITION_GRID_SIZE - WORDS_PER_FORM}`,
  },
  digitSpanCorrect: {
    label: 'Numbers backwards — trials correct',
    module: 'digitSpan',
    kind: 'count',
    min: 0,
    max: DIGIT_TRIALS_PER_FORM,
    trials: DIGIT_TRIALS_PER_FORM,
    unit: `out of ${DIGIT_TRIALS_PER_FORM}`,
  },
  patternSpanCorrect: {
    label: 'Tapped patterns — trials correct',
    module: 'patternSpan',
    kind: 'count',
    min: 0,
    max: PATTERN_TRIALS_PER_FORM,
    trials: PATTERN_TRIALS_PER_FORM,
    unit: `out of ${PATTERN_TRIALS_PER_FORM}`,
  },
  goNoGoMedianMs: {
    label: 'Go / no-go — median response',
    module: 'goNoGo',
    kind: 'continuous',
    // A response faster than this was discarded as an anticipation by the module itself, so the
    // simulation must not produce one either.
    min: 150,
    max: null,
    unit: 'ms',
  },
  goNoGoCommissionErrors: {
    label: 'Go / no-go — tapped on hold',
    module: 'goNoGo',
    kind: 'tally',
    min: 0,
    max: GO_NO_NOGO_PER_FORM,
    unit: `out of ${GO_NO_NOGO_PER_FORM}`,
  },
  goNoGoOmissionErrors: {
    label: 'Go / no-go — missed a tap',
    module: 'goNoGo',
    kind: 'tally',
    min: 0,
    max: GO_TRIALS_PER_FORM,
    unit: `out of ${GO_TRIALS_PER_FORM}`,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════════════
   NOISE PROFILES
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * How one measurement behaves in a healthy population.
 *
 * `centre` and `spreadBetweenAthletes` place an athlete on the scale. `spreadWithinAthlete` is
 * the one that decides false positives — see the header of this file.
 *
 * For 'count' and 'tally' measurements, `spreadWithinAthlete` is IGNORED and may be left at zero:
 * their sitting-to-sitting wobble comes out of the binomial/Poisson draw itself, which is the
 * honest model. A count out of nine does not have a free-floating standard deviation; the spread
 * is a consequence of where the athlete sits on the scale.
 */
export type NoiseProfile = {
  /** The population average for this measurement. */
  centre: number;
  /** How much athletes differ from each other. Does not affect the false-positive rate. */
  spreadBetweenAthletes: number;
  /** How much ONE healthy athlete moves between two sittings. Continuous measurements only. */
  spreadWithinAthlete: number;
};

export type NoiseProfiles = Record<CalibratedMeasurement, NoiseProfile>;

/**
 * How much worse an impaired athlete is, in the measurement's own units, always positive.
 *
 * ALWAYS SUPPLIED BY THE PERSON RUNNING THE SIMULATION. There is no default anywhere in this
 * codebase, and there must not be: an assumed effect size is exactly the kind of invented number
 * that would end up quoted as though it meant something. If you have not decided how much
 * slowing you want to be able to detect, the harness cannot tell you a false-negative rate,
 * because "how often would we miss it" has no meaning until you say what "it" is.
 *
 * The sign is handled by the engine's own direction table, so a positive number always means
 * "this much worse" whichever way worse runs for that measurement.
 */
export type Degradations = Partial<Record<CalibratedMeasurement, number>>;

/**
 * Move a value in the WORSE direction by `amount`.
 *
 * Goes through the engine's own direction table rather than doing the arithmetic here, for the
 * same reason the engine does: one reversed sign would make a degraded athlete come out better
 * than baseline, the simulation would report a wonderful false-negative rate, and the number
 * would be exactly backwards.
 */
export function applyDegradation(
  measurement: CalibratedMeasurement,
  value: number,
  amount: number,
): number {
  return MEASUREMENT_DIRECTIONS[measurement] === 'higher-is-worse' ? value + amount : value - amount;
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE PLACEHOLDER PROFILE — invented, and labelled as invented
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Obviously synthetic starting numbers, so the dev page can draw something before any real data
 * exists.
 *
 * READ THIS BEFORE USING ANY OUTPUT PRODUCED FROM IT. Every number below is a round number
 * somebody typed. None of them is a measurement, an estimate, or a value taken from anywhere.
 * They exist so the page is not blank and so the machinery can be seen working end to end.
 *
 * A curve drawn from these describes THIS MADE-UP MODEL and nothing else. It is not evidence
 * about athletes, about concussion, or about what any threshold should be.
 *
 * TODO(NEEDS_SOURCE): replace by pasting real repeated-sitting data into
 * /tools/calibration. Nothing here may ever be copied into lib/engine/thresholds.ts.
 */
export const PLACEHOLDER_PROFILES: NoiseProfiles = {
  symptomTotal: { centre: 2, spreadBetweenAthletes: 2, spreadWithinAthlete: 0 },
  wordLearningCorrect: { centre: 16, spreadBetweenAthletes: 2, spreadWithinAthlete: 0 },
  wordLearningFalseAlarms: { centre: 2, spreadBetweenAthletes: 1, spreadWithinAthlete: 0 },
  wordRecognitionCorrect: { centre: 15, spreadBetweenAthletes: 2, spreadWithinAthlete: 0 },
  wordRecognitionFalseAlarms: { centre: 2, spreadBetweenAthletes: 1, spreadWithinAthlete: 0 },
  digitSpanCorrect: { centre: 5, spreadBetweenAthletes: 1, spreadWithinAthlete: 0 },
  patternSpanCorrect: { centre: 5, spreadBetweenAthletes: 1, spreadWithinAthlete: 0 },
  goNoGoMedianMs: { centre: 400, spreadBetweenAthletes: 60, spreadWithinAthlete: 30 },
  goNoGoCommissionErrors: { centre: 2, spreadBetweenAthletes: 1, spreadWithinAthlete: 0 },
  goNoGoOmissionErrors: { centre: 1, spreadBetweenAthletes: 1, spreadWithinAthlete: 0 },
};

/** The label shown wherever the placeholder profile is in use. Kept in one place on purpose. */
export const PLACEHOLDER_LABEL =
  'PLACEHOLDER — invented round numbers, not measurements of anybody';
