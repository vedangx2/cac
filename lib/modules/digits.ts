// lib/modules/digits.ts
//
// The pure logic for digit span BACKWARD.
//
// Lives in lib/ rather than beside the screen so it can be unit-tested with no React and no fake
// DOM — the same reason the engine lives here (see vitest.config.ts).
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE TASK
// ═════════════════════════════════════════════════════════════════════════════════════
// The athlete is shown a sequence of digits one at a time, then types it back in REVERSE order.
// Reversing is the point: echoing a sequence forward is close to automatic, while holding it
// still and walking it backwards takes active concentration, which is what makes it sensitive to
// someone struggling to think clearly.
//
// FIXED-TRIAL, not a staircase (an approved project decision). All nine sequences, in the same
// order, at the same nine lengths, every time. The score is how many of the nine were reproduced
// EXACTLY, out of nine.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// NO PARTIAL CREDIT WITHIN A TRIAL — and why that is the honest choice
// ═════════════════════════════════════════════════════════════════════════════════════
// A sequence recalled with two digits swapped is a failed trial, not most of a pass. Any
// per-digit part-marking scheme would be a formula we invented — "how many digits in the right
// place" and "how many digits present but misplaced" are different measures with different
// meanings, and picking a weighting between them would put a made-up number into a comparison we
// ask people to trust. All-or-nothing needs no justification beyond the task itself.

import { type DigitForm, DIGIT_TRIALS_PER_FORM } from '../forms';

/**
 * How long each digit stays on screen, in milliseconds.
 *
 * NOT A THRESHOLD — it decides nothing about flagging, so it does not belong in
 * lib/engine/thresholds.ts. It is a presentation parameter and lives beside its module.
 *
 * Fixed rather than adjustable for the same reason the word exposure is: the whole app rests on
 * comparing one athlete's sitting against their own earlier sitting, and a pace that varied
 * between the two would make the difference partly about the pace.
 */
export const DIGIT_EXPOSURE_MS = 900;

/** A blank beat between digits, so two digits never read as one number. */
export const DIGIT_GAP_MS = 250;

/** The sequence as the athlete must type it back: reversed. */
export function reversedSequence(sequence: readonly number[]): number[] {
  return [...sequence].reverse();
}

/**
 * Did the athlete reproduce this trial exactly?
 *
 * Compares against the REVERSED sequence, since that is what was asked for. Length must match
 * too: a partial answer that happens to start correctly is still a failed trial.
 */
export function isTrialCorrect(sequence: readonly number[], entered: readonly number[]): boolean {
  const expected = reversedSequence(sequence);
  if (entered.length !== expected.length) return false;

  return expected.every((digit, index) => entered[index] === digit);
}

export type SpanScore = {
  formId: string;
  trialsCorrect: boolean[];
  correct: number;
};

/**
 * Turn per-trial pass/fail into the stored score.
 *
 * `trialsCorrect` is kept in presentation order rather than collapsed to a count alone, because
 * the pattern carries information the total does not: "failed both sixes and the seven" and
 * "failed two threes" are the same score of 6 and very different sittings. That detail survives
 * into the JSON export, where it is the kind of thing threshold work actually needs.
 */
export function scoreSpanTrials(formId: string, trialsCorrect: readonly boolean[]): SpanScore {
  return {
    formId,
    trialsCorrect: [...trialsCorrect],
    correct: trialsCorrect.filter(Boolean).length,
  };
}

/** The best possible score, for showing "x out of 9". */
export const MAX_DIGIT_CORRECT = DIGIT_TRIALS_PER_FORM;

/** Convenience for the screen: the length of trial `index` in a form. */
export function trialLength(form: DigitForm, index: number): number {
  return form.sequences[index]?.length ?? 0;
}
