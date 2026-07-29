// lib/forms/patternGrids.ts
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
// ═════════════════════════════════════════════════════════════════════════════════════
// Pattern span. Cells on a small grid light up one at a time; the athlete then taps them back
// in the same order. It is the spatial counterpart to digit span — same idea of holding a
// short sequence, but nothing to say out loud, which makes it usable when a sideline is too
// loud to hear a spoken answer reliably.
//
// FIXED-TRIAL, not a staircase (an approved project decision). Every athlete gets all nine
// sequences in the same order at the same nine lengths, and the score is how many of the nine
// they reproduced exactly, out of 9. No partial credit inside a trial — a sequence with two
// taps transposed is a failed trial, not most of a pass. Same reasoning as digit span: a
// staircase's stopping point depends on the athlete's own answers, so two sittings end up
// different lengths and are then awkward to compare, and this app exists to compare one
// athlete's sitting against their own earlier one.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE GRID
// ═════════════════════════════════════════════════════════════════════════════════════
// Three by three, nine cells, numbered row-major from zero:
//
//        0 1 2
//        3 4 5
//        6 7 8
//
// WHY 3×3 AND NOT BIGGER: this is used on a phone, outdoors, possibly by someone with cold or
// wet hands. Nine cells on a phone screen gives tap targets comfortably above the accessible
// minimum. A 4×4 grid would allow longer spans but shrinks every target, and a mis-tap caused
// by a small button would score as a memory failure — measuring our layout instead of the
// athlete.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// CONSTRUCTION RULES — every one of these is enforced by select.test.ts
// ═════════════════════════════════════════════════════════════════════════════════════
// 1. NOT COPIED FROM ANY PUBLISHED ASSESSMENT. These sequences were written from scratch
//    against the rules below. No layout, sequence or scoring is taken from any published
//    instrument. (See CLAUDE.md — this is a hard project requirement.)
//
// 2. Nine sequences per form at lengths 2, 2, 3, 3, 4, 4, 5, 5, 6 — in that order. Two trials
//    at each length except the longest, so one unlucky lapse does not decide the score.
//
//    Shorter than digit span's ladder on purpose: remembering a path across a grid is harder
//    than remembering digits at the same length, so matching digit span's 3-to-7 would have
//    produced a floor where almost nobody passes the long trials and the module stops
//    discriminating. Where the real ceiling sits is a question for collected data, not for a
//    guess in this comment.
//
// 3. No cell repeats within a sequence. A repeat invites "did that one flash twice, or did I
//    blink?", which measures confidence in our animation rather than recall.
//
// 4. No three consecutive taps fall on the same straight line — no row, column or diagonal.
//    Three cells in a line collapse into one remembered stroke ("down the left side"), so a
//    six-cell sequence containing one is materially easier than its length suggests, and would
//    not be comparable with the other trials at the same length. This is the spatial
//    equivalent of the no-runs rule on digit sequences.
//
// 5. No sequence is repeated anywhere in the pool, across all six forms, so the forms are
//    genuinely independent for alternate-form testing.

/** One interchangeable pattern-span form. */
export type PatternForm = {
  /** Stable id, stored on the result so we know which sequences produced a score. */
  id: string;
  /**
   * The nine sequences, in presentation order, at lengths 2,2,3,3,4,4,5,5,6.
   * Each number is a cell index, 0-8, row-major. The athlete taps them in the SAME order.
   */
  sequences: readonly (readonly number[])[];
};

/** Grid dimensions. Exported so the screen and the tests cannot disagree about the shape. */
export const PATTERN_GRID_COLUMNS = 3;
export const PATTERN_GRID_ROWS = 3;

/** Total cells on the grid. Every sequence entry must be a valid index below this. */
export const PATTERN_GRID_SIZE = PATTERN_GRID_COLUMNS * PATTERN_GRID_ROWS;

/** How many trials each form holds. Also the maximum score, since scoring is trials correct. */
export const PATTERN_TRIALS_PER_FORM = 9;

/**
 * The length of each trial, in order. Exported so the module can show progress and the tests
 * can check every form matches without repeating the list.
 */
export const PATTERN_TRIAL_LENGTHS: readonly number[] = [2, 2, 3, 3, 4, 4, 5, 5, 6];

export const PATTERN_FORMS: readonly PatternForm[] = [
  {
    id: 'pattern-a',
    sequences: [
      [4, 0],
      [7, 2],
      [1, 5, 6],
      [3, 8, 0],
      [2, 6, 1, 8],
      [5, 0, 7, 3],
      [0, 5, 7, 2, 4],
      [8, 1, 3, 6, 2],
      [1, 8, 3, 5, 0, 7],
    ],
  },
  {
    id: 'pattern-b',
    sequences: [
      [2, 3],
      [5, 1],
      [8, 4, 2],
      [0, 7, 5],
      [6, 1, 8, 3],
      [4, 2, 7, 0],
      [3, 8, 1, 5, 6],
      [7, 0, 5, 2, 4],
      [6, 2, 7, 1, 8, 3],
    ],
  },
  {
    id: 'pattern-c',
    sequences: [
      [1, 6],
      [3, 5],
      [0, 4, 7],
      [8, 2, 3],
      [5, 3, 1, 7],
      [2, 8, 4, 6],
      [7, 1, 8, 0, 5],
      [6, 4, 3, 8, 1],
      [0, 7, 2, 6, 3, 5],
    ],
  },
  {
    id: 'pattern-d',
    sequences: [
      [8, 0],
      [4, 6],
      [2, 7, 3],
      [5, 1, 8],
      [0, 6, 5, 2],
      [7, 3, 1, 4],
      [8, 5, 0, 6, 1],
      [3, 2, 6, 8, 4],
      [5, 1, 6, 0, 7, 2],
    ],
  },
  {
    id: 'pattern-e',
    sequences: [
      [6, 5],
      [0, 8],
      [3, 1, 5],
      [7, 4, 0],
      [1, 3, 8, 6],
      [2, 0, 6, 7],
      [4, 8, 3, 2, 7],
      [5, 6, 0, 4, 1],
      [8, 6, 1, 4, 2, 3],
    ],
  },
  {
    id: 'pattern-f',
    sequences: [
      [7, 5],
      [1, 8],
      [6, 0, 4],
      [2, 5, 7],
      [8, 4, 3, 0],
      [3, 6, 2, 1],
      [0, 3, 7, 8, 5],
      [4, 7, 6, 1, 2],
      [2, 4, 0, 7, 3, 8],
    ],
  },
];
