// lib/engine/direction.ts
//
// WHICH WAY IS WORSE.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AT ALL
// ═════════════════════════════════════════════════════════════════════════════════════
// The original three-module battery had a convenient property: every measurement in it got
// worse by getting BIGGER. Slower reaction, longer scan time, more wrong taps, higher symptom
// score. So the engine could hard-code one rule — "flag when the check exceeds the baseline by
// the threshold" — and it was right every time. thresholds.ts even said so in a comment.
//
// The new battery breaks that. Digit span, pattern span and both word scores are COUNTS OF
// THINGS DONE RIGHT, so they get worse by getting SMALLER. Go/no-go's reaction time and error
// counts get worse by getting bigger. Symptom score gets worse by getting bigger. The two
// directions now sit side by side in the same comparison.
//
// The failure this file prevents is precise and severe: get a direction backwards and an
// athlete who has DECLINED reads as improved. A kid who could hold seven digits at baseline and
// four after a hit would produce a difference of -3, the engine would see a negative number,
// conclude "not worse", never flag, and print the most reassuring screen it has. That is the
// exact outcome the whole project exists to prevent, and it would be caused by a minus sign.
//
// So direction is not left implicit in the arithmetic at nine separate call sites. It is
// declared once, per measurement, in the table below, and every comparison goes through one
// function. There is exactly one place to check that we got it right, and it is tested
// exhaustively in direction.test.ts.

/** Which way a measurement moves when an athlete does worse. */
export type Direction =
  /** Bigger is worse: symptom score, reaction time, error counts. */
  | 'higher-is-worse'
  /** Smaller is worse: anything that counts things done correctly. */
  | 'lower-is-worse';

/**
 * Every comparable measurement in the battery and which way it goes.
 *
 * Keys are per MEASUREMENT, not per module, because one module can produce several numbers that
 * do not all run the same way. Word recognition is the clearest case: `correct` is a count of
 * successes (lower is worse) while `falseAlarms` counts mistakes (higher is worse). A per-module
 * direction would be wrong for one of them.
 *
 * If you add a measurement, add it here first. The engine reads its direction from this table
 * and nowhere else.
 */
export const MEASUREMENT_DIRECTIONS = {
  /** Total symptoms reported, 0-30. More symptoms than their own normal is worse. */
  symptomTotal: 'higher-is-worse',

  /** Grid words classified correctly, immediate. Fewer right is worse. */
  wordLearningCorrect: 'lower-is-worse',
  /** Distractors wrongly claimed as seen, immediate. More is worse. */
  wordLearningFalseAlarms: 'higher-is-worse',

  /** Grid words classified correctly, delayed. Fewer right is worse. */
  wordRecognitionCorrect: 'lower-is-worse',
  /** Distractors wrongly claimed as seen, delayed. More is worse. */
  wordRecognitionFalseAlarms: 'higher-is-worse',

  /** Digit-span trials reproduced exactly, out of 9. Fewer is worse. */
  digitSpanCorrect: 'lower-is-worse',

  /** Pattern-span trials reproduced exactly, out of 9. Fewer is worse. */
  patternSpanCorrect: 'lower-is-worse',

  /** Median response time on correct go trials. Slower is worse. */
  goNoGoMedianMs: 'higher-is-worse',
  /** Responding on a no-go trial — failing to hold back. More is worse. */
  goNoGoCommissionErrors: 'higher-is-worse',
  /** Not responding on a go trial — losing attention. More is worse. */
  goNoGoOmissionErrors: 'higher-is-worse',

  /** Balance sway. More sway is worse. (Module not built; P1.) */
  balanceSway: 'higher-is-worse',
} as const satisfies Record<string, Direction>;

export type MeasurementKey = keyof typeof MEASUREMENT_DIRECTIONS;

/**
 * How much WORSE the check is than the baseline. Positive means worse, always.
 *
 * This is the one function that knows about signs, and every comparison in the engine goes
 * through it. Normalising to "positive is worse" here means the caller can compare against a
 * threshold with a plain `>=` and cannot get the direction wrong, because it never sees the
 * direction at all.
 *
 * Returns:
 *   > 0  the check is worse than the baseline, by this much
 *   = 0  no change
 *   < 0  the check is BETTER than the baseline, by this much
 *
 * Note what it does NOT do: it does not clamp negatives to zero. An athlete genuinely improving
 * is real information worth reporting, and throwing the sign away would leave the results screen
 * unable to tell "no change" from "better than baseline".
 */
export function worseningAmount(
  direction: Direction,
  baselineValue: number,
  checkValue: number,
): number {
  return direction === 'higher-is-worse'
    ? checkValue - baselineValue // bigger check = worse
    : baselineValue - checkValue; // smaller check = worse
}

/** Convenience: look the direction up by measurement key and normalise in one call. */
export function worseningFor(
  measurement: MeasurementKey,
  baselineValue: number,
  checkValue: number,
): number {
  return worseningAmount(MEASUREMENT_DIRECTIONS[measurement], baselineValue, checkValue);
}

/**
 * The word for a change in the worse direction, e.g. "slower", "fewer".
 *
 * Wording lives beside the direction it belongs to so a sentence can never describe a number as
 * moving the opposite way to how the engine judged it.
 */
export type ChangeWords = {
  /** Describes a change in the WORSE direction. */
  worse: string;
  /** Describes a change in the BETTER direction. */
  better: string;
};
