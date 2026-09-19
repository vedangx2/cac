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
import { type SpanScore, isExactMatch, scoreSpanTrials } from './span';

// Re-exported so the screen and the tests import span scoring from the module they are about,
// while the arithmetic itself stays in one place shared with pattern span.
export { type SpanScore, scoreSpanTrials };

/**
 * How long each digit stays on screen, in milliseconds.
 *
 * NOT A THRESHOLD — it decides nothing about flagging, so it does not belong in
 * lib/engine/thresholds.ts. It is a presentation parameter and lives beside its module.
 *
 * Fixed rather than adjustable for the same reason the word exposure is: the whole app rests on
 * comparing one athlete's sitting against their own earlier sitting, and a pace that varied
 * between the two would make the difference partly about the pace.
 *
 * CHANGED 2026-09-20, from 900 to 2400 (+1.5s). Same reasoning and same moment as
 * WORD_EXPOSURE_MS in lib/modules/words.ts: no real baseline existed yet, so this was the free
 * window to move it before the change would break comparability with an existing record — see
 * CURRENT_SCHEMA_VERSION in lib/schema.ts, bumped in the same session for this reason.
 */
export const DIGIT_EXPOSURE_MS = 2400;

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
  return isExactMatch(reversedSequence(sequence), entered);
}

/** The best possible score, for showing "x out of 9". */
export const MAX_DIGIT_CORRECT = DIGIT_TRIALS_PER_FORM;

/** Convenience for the screen: the length of trial `index` in a form. */
export function trialLength(form: DigitForm, index: number): number {
  return form.sequences[index]?.length ?? 0;
}
