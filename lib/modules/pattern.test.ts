// lib/modules/pattern.test.ts
//
// Tests for pattern span's pure logic — judging taps, scoring trials, and the watchdog timing that
// keeps a stalled playback from trapping the athlete.

import { describe, expect, it } from 'vitest';
import { PATTERN_FORMS, PATTERN_GRID_SIZE, PATTERN_TRIALS_PER_FORM } from '../forms';
import {
  CELL_GAP_MS,
  CELL_ON_MS,
  MAX_PATTERN_CORRECT,
  PLAYBACK_WATCHDOG_SLACK_MS,
  allCells,
  cellPosition,
  expectedPlaybackMs,
  isExpectedTap,
  isPatternCorrect,
  patternTrialLength,
  scoreSpanTrials,
  watchdogDelayMs,
} from './pattern';

describe('isExpectedTap', () => {
  const sequence = [4, 0, 7];

  it('accepts the cell the sequence expects at that position', () => {
    expect(isExpectedTap(sequence, 0, 4)).toBe(true);
    expect(isExpectedTap(sequence, 1, 0)).toBe(true);
    expect(isExpectedTap(sequence, 2, 7)).toBe(true);
  });

  it('rejects a cell that is in the sequence but not at this position', () => {
    // Order is the whole task. Accepting any cell from the sequence would turn this into "did you
    // remember which squares", which is a materially easier and different test.
    expect(isExpectedTap(sequence, 0, 7)).toBe(false);
    expect(isExpectedTap(sequence, 1, 4)).toBe(false);
  });

  it('rejects a cell that is not in the sequence at all', () => {
    expect(isExpectedTap(sequence, 0, 8)).toBe(false);
  });

  it('rejects a position past the end of the sequence', () => {
    // Guards against reading off the end of the array and comparing against undefined.
    expect(isExpectedTap(sequence, 3, 4)).toBe(false);
    expect(isExpectedTap(sequence, 99, 4)).toBe(false);
  });

  it('treats cell 0 as a real cell, not as absent', () => {
    // Cell index 0 is the top-left square. A truthiness check instead of an equality check would
    // make the top-left square impossible to tap correctly, and it is in plenty of sequences.
    expect(isExpectedTap([0, 5], 0, 0)).toBe(true);
    expect(isExpectedTap([0, 5], 0, 5)).toBe(false);
  });
});

describe('isPatternCorrect', () => {
  it('accepts the pattern tapped in the same order', () => {
    expect(isPatternCorrect([4, 0, 7], [4, 0, 7])).toBe(true);
  });

  it('rejects the pattern tapped in reverse', () => {
    // Unlike digit span, this task is FORWARD. Reversing is a different task and must not pass.
    expect(isPatternCorrect([4, 0, 7], [7, 0, 4])).toBe(false);
  });

  it('rejects two taps transposed', () => {
    expect(isPatternCorrect([4, 0, 7, 2], [4, 7, 0, 2])).toBe(false);
  });

  it('rejects a short answer and an over-long one', () => {
    expect(isPatternCorrect([4, 0, 7], [4, 0])).toBe(false);
    expect(isPatternCorrect([4, 0, 7], [4, 0, 7, 1])).toBe(false);
  });

  it('rejects an empty answer', () => {
    expect(isPatternCorrect([4, 0], [])).toBe(false);
  });

  it('accepts every trial in every form when tapped correctly', () => {
    for (const form of PATTERN_FORMS) {
      for (const sequence of form.sequences) {
        expect(isPatternCorrect(sequence, [...sequence]), `${form.id}: ${sequence}`).toBe(true);
      }
    }
  });
});

describe('the playback watchdog timing', () => {
  it('expects playback to take the on-time plus the gap, per cell', () => {
    expect(expectedPlaybackMs(4)).toBe(4 * (CELL_ON_MS + CELL_GAP_MS));
  });

  it('always fires AFTER playback could legitimately have finished', () => {
    // A watchdog that fired early would cut playback short on a perfectly healthy phone, which
    // would make the trial harder for reasons that have nothing to do with the athlete.
    for (let length = 1; length <= PATTERN_GRID_SIZE; length += 1) {
      expect(watchdogDelayMs(length)).toBeGreaterThan(expectedPlaybackMs(length));
    }
  });

  it('leaves the declared slack', () => {
    expect(watchdogDelayMs(6) - expectedPlaybackMs(6)).toBe(PLAYBACK_WATCHDOG_SLACK_MS);
  });

  it('scales with the trial length rather than being a fixed guess', () => {
    // A single fixed delay would either cut the six-cell trial short or leave the two-cell trial
    // hanging for seconds after it had already finished.
    expect(watchdogDelayMs(6)).toBeGreaterThan(watchdogDelayMs(2));
  });

  it('is long enough for every trial in every form', () => {
    for (const form of PATTERN_FORMS) {
      for (const sequence of form.sequences) {
        expect(watchdogDelayMs(sequence.length)).toBeGreaterThan(expectedPlaybackMs(sequence.length));
      }
    }
  });
});

describe('scoreSpanTrials via the pattern module', () => {
  it('counts correct trials out of nine', () => {
    const score = scoreSpanTrials('pattern-a', [true, false, true, true, false, false, false, false, false]);

    expect(score.correct).toBe(3);
    expect(score.formId).toBe('pattern-a');
  });

  it('scores all-correct as full marks', () => {
    const allRight = Array.from({ length: PATTERN_TRIALS_PER_FORM }, () => true);

    expect(scoreSpanTrials('pattern-a', allRight).correct).toBe(MAX_PATTERN_CORRECT);
  });
});

describe('grid helpers', () => {
  it('lists every cell on the grid exactly once', () => {
    const cells = allCells();

    expect(cells).toHaveLength(PATTERN_GRID_SIZE);
    expect(new Set(cells).size).toBe(PATTERN_GRID_SIZE);
  });

  it('maps indices to 1-based rows and columns for accessible labels', () => {
    expect(cellPosition(0, 3)).toEqual({ row: 1, column: 1 });
    expect(cellPosition(4, 3)).toEqual({ row: 2, column: 2 });
    expect(cellPosition(8, 3)).toEqual({ row: 3, column: 3 });
  });

  it('reports each trial length on the declared ladder', () => {
    expect(patternTrialLength(PATTERN_FORMS[0], 0)).toBe(2);
    expect(patternTrialLength(PATTERN_FORMS[0], PATTERN_TRIALS_PER_FORM - 1)).toBe(6);
  });

  it('returns zero rather than crashing past the end', () => {
    expect(patternTrialLength(PATTERN_FORMS[0], 99)).toBe(0);
  });
});
