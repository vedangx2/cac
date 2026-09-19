/**
 * Parallel forms for the digit-span-backward module (module 4).
 *
 * SCORING MODEL: fixed-trial, not a staircase. Every athlete sees all 9
 * sequences in order. Score is the number entered correctly, 0-9.
 *
 * Why fixed-trial: a staircase reports longest correct span, which in practice
 * lands between 3 and 7. A score with five possible values cannot register a
 * small degradation. Nine values still is not many, but it moves. A staircase
 * also runs longer because it has to climb.
 *
 * ADMINISTRATION: each sequence is shown one digit at a time, then the athlete
 * enters it in REVERSE order. A trial is correct only if the full reversed
 * sequence matches. No partial credit -- partial credit on a 3-digit trial and
 * a 7-digit trial are not the same thing and averaging them means nothing.
 *
 * CONSTRUCTION RULES (enforced by lib/forms/select.test.ts -- keep them when
 * adding forms):
 *   - digits 1-9 only, never 0 (0 and O are confusable at a glance outdoors)
 *   - every digit in a sequence distinct, no repeats anywhere in it
 *   - no three-digit constant-step run, which covers ascending (4-5-6),
 *     descending (8-7-6), and skip patterns (2-4-6)
 *   - lengths per form follow DIGIT_TRIAL_LENGTHS exactly
 *   - all 54 sequences unique across all forms
 *
 * PROVENANCE: generated for this project under the constraints above, then
 * validated. Not copied from any published battery.
 *
 * UNVERIFIED ASSUMPTION: the six forms are treated as equally difficult.
 * Nothing in the app checks that. `formId` is recorded on every result so it
 * can be checked against real data later.
 * TODO(NEEDS_SOURCE): form-difficulty equivalence is asserted, not measured.
 */

export type DigitFormId =
  | 'digits-a'
  | 'digits-b'
  | 'digits-c'
  | 'digits-d'
  | 'digits-e'
  | 'digits-f';

export type DigitForm = {
  id: DigitFormId;
  /** Presented in this order. Athlete enters each one reversed. */
  sequences: readonly (readonly number[])[];
};

/**
 * The ladder every form follows, in order. Two trials at each length from 3 to
 * 6, then one at 7. Nine trials total.
 */
export const DIGIT_TRIAL_LENGTHS: readonly number[] = [3, 3, 4, 4, 5, 5, 6, 6, 7] as const;

export const DIGIT_FORMS: readonly DigitForm[] = [
  {
    id: 'digits-a',
    sequences: [
      [7, 8, 4],
      [4, 5, 7],
      [5, 3, 7, 4],
      [6, 4, 9, 3],
      [1, 2, 4, 5, 9],
      [9, 8, 3, 6, 5],
      [1, 9, 7, 2, 4, 3],
      [3, 5, 6, 4, 8, 9],
      [1, 7, 3, 5, 4, 8, 6],
    ],
  },
  {
    id: 'digits-b',
    sequences: [
      [6, 1, 5],
      [6, 5, 1],
      [7, 3, 1, 2],
      [8, 2, 5, 4],
      [2, 4, 5, 7, 8],
      [6, 4, 3, 1, 2],
      [2, 8, 6, 3, 9, 7],
      [7, 9, 4, 3, 1, 6],
      [3, 5, 2, 9, 1, 7, 8],
    ],
  },
  {
    id: 'digits-c',
    sequences: [
      [3, 8, 6],
      [4, 9, 5],
      [2, 1, 7, 5],
      [4, 6, 2, 7],
      [5, 9, 6, 4, 7],
      [6, 3, 4, 7, 8],
      [4, 6, 2, 8, 7, 5],
      [9, 5, 4, 7, 1, 2],
      [4, 8, 7, 1, 6, 2, 3],
    ],
  },
  {
    id: 'digits-d',
    sequences: [
      [5, 4, 7],
      [5, 3, 8],
      [8, 9, 7, 1],
      [1, 8, 9, 4],
      [9, 2, 7, 3, 8],
      [7, 1, 3, 6, 8],
      [8, 6, 1, 9, 2, 3],
      [5, 7, 1, 3, 2, 8],
      [4, 1, 3, 7, 6, 8, 9],
    ],
  },
  {
    id: 'digits-e',
    sequences: [
      [4, 3, 9],
      [3, 4, 2],
      [2, 1, 6, 3],
      [2, 1, 4, 3],
      [2, 7, 5, 9, 4],
      [5, 9, 8, 6, 2],
      [1, 9, 7, 2, 3, 6],
      [7, 3, 2, 9, 1, 6],
      [2, 8, 5, 4, 9, 7, 6],
    ],
  },
  {
    id: 'digits-f',
    sequences: [
      [7, 8, 6],
      [3, 8, 4],
      [6, 9, 3, 4],
      [3, 4, 8, 2],
      [4, 1, 8, 3, 6],
      [2, 4, 3, 5, 1],
      [3, 9, 1, 8, 7, 5],
      [3, 9, 4, 5, 8, 2],
      [1, 4, 2, 6, 9, 8, 5],
    ],
  },
] as const;

/** Trials per form. Max score. */
export const DIGIT_TRIALS_PER_FORM = DIGIT_TRIAL_LENGTHS.length;

/**
 * DEMO SEQUENCES — added 2026-09-20. Two unscored, unstored practice rounds shown before the
 * nine real trials, so an athlete meets the "watch it, then type it backwards" format on a
 * round that carries no consequence rather than on trial 1.
 *
 * DELIBERATELY A SEPARATE, FIXED POOL, NOT DRAWN FROM DIGIT_FORMS:
 *   - A demo round must never double as a scored trial or borrow a sequence that could appear
 *     in one, so it cannot inflate or deflate a real score by pre-exposing part of it.
 *   - It runs identically at baseline and at check — the same two sequences every sitting, for
 *     every athlete. A gate that is easier at one sitting than the other would give whichever
 *     sitting got the easier gate a head start that has nothing to do with the athlete.
 *   - Shorter than the shortest real trial (length 3) on purpose: two digits is enough to teach
 *     the mechanics — watch, then reverse — without rehearsing the task itself.
 */
export const DIGIT_DEMO_SEQUENCES: readonly (readonly number[])[] = [
  [4, 8],
  [7, 3],
];
