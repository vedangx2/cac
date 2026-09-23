// lib/modules/pattern.ts
//
// The pure logic for pattern span — the spatial counterpart to digit span.
//
// Cells on a 3x3 grid light up one at a time; the athlete taps them back in the SAME order
// (forward, not reversed — the difficulty here comes from holding a path in mind, and reversing a
// spatial route is a noticeably different task that would not be comparable with digit span).
//
// Nine fixed trials at lengths 2,2,3,3,4,4,5,5,6, scored as trials reproduced exactly out of nine.
// No partial credit within a trial, for the same reason as digit span: any per-cell part-marking
// would be a weighting we invented.

import { PATTERN_GRID_SIZE, PATTERN_TRIALS_PER_FORM, type PatternForm } from '../forms';
import { type SpanScore, isExactMatch, scoreSpanTrials } from './span';

export { type SpanScore, scoreSpanTrials };

/**
 * How long each cell stays lit, in milliseconds, and the dark beat between cells.
 *
 * NOT THRESHOLDS — these decide nothing about flagging, so they do not belong in
 * lib/engine/thresholds.ts. They are presentation parameters and live beside their module.
 *
 * The dark beat is non-negotiable rather than cosmetic: two ADJACENT cells lighting with no gap
 * would read as one long flash spreading across the grid, and the athlete would have no way to
 * tell a two-cell step from a one-cell one.
 */
export const CELL_ON_MS = 600;
export const CELL_GAP_MS = 250;

/**
 * How long to wait past the expected end of playback before force-completing it.
 *
 * WHY A WATCHDOG EXISTS AT ALL — this is the pattern-span version of a bug the deleted reaction
 * pad actually had. That pad stamped its clock only inside a requestAnimationFrame callback, and
 * because browsers stop firing rAF for tabs that are not visible, backgrounding the phone mid-trial
 * meant the callback never ran, every tap was discarded, and the pad locked up with no way out.
 *
 * Playback here is a chain of timers, and the same class of failure applies: if any link in that
 * chain fails to fire — a backgrounded tab, a throttled timer, a browser suspending the page — the
 * athlete would sit forever on a grid that never finishes flashing and never accepts a tap. There
 * would be no way forward and no way to tell it had broken.
 *
 * So reaching the input phase does not depend solely on the chain completing. A single watchdog is
 * armed when playback starts and force-completes it if the chain has not finished by the time it
 * possibly could have. The worst case is a trial the athlete saw only part of, which they will
 * probably get wrong; that is enormously better than a screen that cannot be escaped, and it fails
 * in the direction of scoring worse rather than better.
 */
export const PLAYBACK_WATCHDOG_SLACK_MS = 1500;

/** The longest playback for a trial could legitimately take, before the watchdog slack. */
export function expectedPlaybackMs(sequenceLength: number): number {
  return sequenceLength * (CELL_ON_MS + CELL_GAP_MS);
}

/** When the watchdog should fire for a trial of this length. */
export function watchdogDelayMs(sequenceLength: number): number {
  return expectedPlaybackMs(sequenceLength) + PLAYBACK_WATCHDOG_SLACK_MS;
}

/**
 * Did the athlete reproduce this pattern exactly?
 *
 * Forward order, unlike digit span. Length and order both matter.
 */
export function isPatternCorrect(
  sequence: readonly number[],
  tapped: readonly number[],
): boolean {
  return isExactMatch(sequence, tapped);
}

/**
 * Is this tap the one the sequence expects next?
 *
 * Pulled out as its own function so the screen's tap handler is a single call with nothing to get
 * subtly wrong, and so the judging rule can be tested without rendering a grid.
 */
export function isExpectedTap(
  sequence: readonly number[],
  expectedIndex: number,
  cell: number,
): boolean {
  return sequence[expectedIndex] === cell;
}

/**
 * Has this cell already been tapped this trial?
 *
 * DELIBERATE, DOCUMENTED BEHAVIOUR — added 2026-09-22 after a real run scored 8/9 where the one
 * miss was a screen with no tap feedback, not the athlete: with nothing on screen changing when
 * a tap landed, an athlete unsure the first tap registered tapped the SAME cell again, and the
 * second tap was silently judged as the NEXT position in the sequence — consuming a slot the
 * sequence never meant for it, and very likely failing an otherwise-correct trial.
 *
 * Construction rule 3 in lib/forms/patternGrids.ts guarantees no sequence ever repeats a cell,
 * so a second tap on a cell already tapped THIS TRIAL can never be a legitimate next answer —
 * it is either a mis-registered duplicate or a deliberate re-tap of something already answered.
 * Either way the right response is to ignore it: it must not advance the sequence and must not
 * count as an error. The screen also now shows a selected state the instant a tap lands (see
 * app/tests/pattern/page.tsx), which is the other half of this fix — the guard below is the
 * safety net for a double-tap that still gets through despite the feedback.
 */
export function isRepeatTap(tappedThisTrial: readonly number[], cell: number): boolean {
  return tappedThisTrial.includes(cell);
}

/** The best possible score, for showing "x out of 9". */
export const MAX_PATTERN_CORRECT = PATTERN_TRIALS_PER_FORM;

/** Row and column of a cell index, for laying the grid out and for accessible labels. */
export function cellPosition(index: number, columns: number): { row: number; column: number } {
  return { row: Math.floor(index / columns) + 1, column: (index % columns) + 1 };
}

/** Every cell index on the grid, in row-major order. */
export function allCells(): number[] {
  return Array.from({ length: PATTERN_GRID_SIZE }, (_, index) => index);
}

/** Convenience for the screen: the length of trial `index` in a form. */
export function patternTrialLength(form: PatternForm, index: number): number {
  return form.sequences[index]?.length ?? 0;
}
