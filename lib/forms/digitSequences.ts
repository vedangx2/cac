// lib/forms/digitSequences.ts
//
// ⚠️ READ THIS FIRST — WHO WROTE THIS FILE
// ═════════════════════════════════════════════════════════════════════════════════════
// The session brief said this file was already in the repo and told the AI session not to
// edit its contents. It was NOT in the repo: not in the working tree, not in any commit on
// any branch, not in the v1-three-module tag, not in a stash, and nowhere on the machine.
//
// Rather than leave the digit-span module unbuildable, the AI session generated the pool
// below to the exact shape the brief specified. So:
//
//   • This is AI-GENERATED STIMULUS CONTENT. The students did not write these sequences.
//   • It is a STAND-IN, meant to be replaced. Overwrite the whole file with your own pool if
//     you have one; nothing that consumes it looks at the digits themselves, only the shape.
//   • The construction rules below are machine-checked by lib/forms/select.test.ts.
//
// See AI-USAGE.md and SESSION-REPORT.md for the disclosure.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
// ═════════════════════════════════════════════════════════════════════════════════════
// Digit span BACKWARD. The athlete is given a sequence of digits and repeats it in REVERSE
// order. Reversing is the point: holding a sequence still while walking it backwards is more
// demanding than simply echoing it, so it is more sensitive to someone struggling to
// concentrate than a straight repeat would be.
//
// FIXED-TRIAL, not a staircase (an approved project decision). Every athlete gets all nine
// sequences in the same order at the same nine lengths, and the score is simply how many of
// the nine they got completely right, out of 9. No partial credit inside a trial: a sequence
// recalled with two digits swapped is not "mostly right", it is a failed trial.
//
// Why fixed-trial rather than climbing until they fail: a staircase's length depends on the
// athlete's own answers, so two sittings can end up different lengths and are then awkward to
// compare. This app's entire job is comparing one athlete's sitting to their own earlier
// sitting, and a fixed set of trials makes those two numbers directly comparable. It also
// takes a predictable amount of time, which matters on a sideline.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// CONSTRUCTION RULES — every one of these is enforced by select.test.ts
// ═════════════════════════════════════════════════════════════════════════════════════
// 1. NOT COPIED FROM ANY PUBLISHED ASSESSMENT. Written from scratch against these rules. No
//    sequences, wording or scoring taken from SCAT5, the SAC, ImPACT or any other instrument.
//
// 2. Nine sequences per form, at lengths 3, 3, 4, 4, 5, 5, 6, 6, 7 — in that order. Two
//    trials at each length except the longest, so a single unlucky lapse at one length does
//    not decide the whole score. Ascending so the athlete meets the easy ones first.
//
// 3. Digits 1-9 only. Zero is excluded because it is read aloud two different ways ("zero"
//    and "oh"), and a stumble over what to call it would score as a memory failure.
//
// 4. No digit repeats within a sequence. A repeat invites "was that two fours, or did I hear
//    it twice?", which measures the athlete's confidence in our delivery rather than recall.
//
// 5. No three consecutive digits form a run, up or down (no 4-5-6, no 7-6-5). A run collapses
//    into a single chunk, so a seven-digit sequence containing one is materially easier than
//    its length suggests — which would make that trial not comparable with the other trials
//    at the same length.
//
// 6. No sequence is repeated anywhere in the pool, across all six forms. Forms must be
//    genuinely independent for alternate-form testing to mean anything.

/** One interchangeable digit-span form. */
export type DigitForm = {
  /** Stable id, stored on the result so we know which sequences produced a score. */
  id: string;
  /**
   * The nine sequences, in presentation order, at lengths 3,3,4,4,5,5,6,6,7.
   * Each inner array is the sequence as PRESENTED; the athlete answers it reversed.
   */
  sequences: readonly (readonly number[])[];
};

/** How many trials each form holds. Also the maximum score, since scoring is trials correct. */
export const DIGIT_TRIALS_PER_FORM = 9;

/**
 * The length of each trial, in order. Exported so the module can show "3 digits" before a
 * trial and so the tests can check every form matches without repeating the list.
 */
export const DIGIT_TRIAL_LENGTHS: readonly number[] = [3, 3, 4, 4, 5, 5, 6, 6, 7];

export const DIGIT_FORMS: readonly DigitForm[] = [
  {
    id: 'digits-a',
    sequences: [
      [4, 1, 7],
      [2, 9, 5],
      [8, 3, 6, 1],
      [5, 2, 7, 4],
      [3, 9, 1, 6, 2],
      [7, 4, 8, 2, 5],
      [6, 2, 9, 4, 1, 7],
      [1, 8, 3, 5, 9, 2],
      [5, 1, 8, 3, 9, 2, 6],
    ],
  },
  {
    id: 'digits-b',
    sequences: [
      [7, 2, 5],
      [1, 6, 9],
      [4, 9, 2, 7],
      [3, 8, 5, 1],
      [9, 3, 7, 1, 4],
      [2, 6, 1, 8, 5],
      [5, 9, 2, 6, 3, 8],
      [7, 1, 4, 9, 2, 6],
      [8, 2, 5, 1, 7, 3, 9],
    ],
  },
  {
    id: 'digits-c',
    sequences: [
      [9, 4, 1],
      [3, 7, 2],
      [6, 1, 8, 3],
      [2, 5, 9, 4],
      [8, 4, 9, 2, 6],
      [1, 7, 3, 8, 5],
      [4, 8, 1, 6, 9, 3],
      [9, 5, 2, 7, 1, 4],
      [3, 9, 6, 2, 8, 4, 1],
    ],
  },
  {
    id: 'digits-d',
    sequences: [
      [5, 8, 3],
      [2, 4, 9],
      [7, 3, 9, 5],
      [1, 6, 2, 8],
      [4, 1, 7, 9, 3],
      [6, 2, 8, 5, 1],
      [2, 7, 4, 1, 8, 5],
      [3, 6, 9, 2, 7, 4],
      [9, 1, 6, 3, 7, 2, 8],
    ],
  },
  {
    id: 'digits-e',
    sequences: [
      [6, 9, 2],
      [4, 7, 1],
      [9, 2, 6, 4],
      [5, 1, 8, 2],
      [7, 2, 9, 5, 1],
      [3, 8, 4, 9, 6],
      [8, 3, 6, 2, 9, 5],
      [1, 4, 7, 3, 8, 2],
      [4, 8, 1, 5, 9, 3, 7],
    ],
  },
  {
    id: 'digits-f',
    sequences: [
      [8, 1, 4],
      [5, 3, 9],
      [2, 8, 5, 9],
      [6, 4, 1, 7],
      [5, 9, 3, 7, 2],
      [8, 1, 6, 4, 9],
      [3, 7, 1, 9, 4, 6],
      [2, 5, 8, 1, 6, 3],
      [7, 3, 8, 2, 6, 1, 5],
    ],
  },
];
