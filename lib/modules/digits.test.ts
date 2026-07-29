// lib/modules/digits.test.ts
//
// Tests for digit span backward scoring.
//
// The all-or-nothing rule is the thing worth guarding hardest. Every plausible "helpful" change to
// this file — accepting a nearly-right answer, ignoring order, allowing a short answer — makes the
// score easier to earn, which shifts it in the direction that makes a struggling athlete look
// unchanged. That is the dangerous direction for this app, so each of those is pinned by a test.

import { describe, expect, it } from 'vitest';
import { DIGIT_FORMS, DIGIT_TRIALS_PER_FORM } from '../forms';
import {
  MAX_DIGIT_CORRECT,
  isTrialCorrect,
  reversedSequence,
  scoreSpanTrials,
  trialLength,
} from './digits';

describe('reversedSequence', () => {
  it('reverses the order', () => {
    expect(reversedSequence([4, 1, 7])).toEqual([7, 1, 4]);
  });

  it('does not mutate the input', () => {
    // The sequence belongs to the form pool, which is shared across the whole app. Reversing it in
    // place would corrupt the pool for every later trial and every later sitting in the same tab.
    const sequence = [4, 1, 7];
    reversedSequence(sequence);

    expect(sequence).toEqual([4, 1, 7]);
  });

  it('handles a single digit and an empty sequence', () => {
    expect(reversedSequence([5])).toEqual([5]);
    expect(reversedSequence([])).toEqual([]);
  });
});

describe('isTrialCorrect', () => {
  it('accepts the exactly-reversed sequence', () => {
    expect(isTrialCorrect([4, 1, 7], [7, 1, 4])).toBe(true);
  });

  it('rejects the sequence typed FORWARD', () => {
    // The single most likely wrong answer, and it must fail — the task is the reversal.
    expect(isTrialCorrect([4, 1, 7], [4, 1, 7])).toBe(false);
  });

  it('rejects two digits transposed', () => {
    // "Mostly right" is not a pass. No partial credit within a trial.
    expect(isTrialCorrect([5, 1, 8, 3], [3, 8, 5, 1])).toBe(false);
  });

  it('rejects a correct answer that is too short', () => {
    expect(isTrialCorrect([4, 1, 7], [7, 1])).toBe(false);
  });

  it('rejects a correct answer with an extra digit on the end', () => {
    expect(isTrialCorrect([4, 1, 7], [7, 1, 4, 4])).toBe(false);
  });

  it('rejects an empty answer', () => {
    expect(isTrialCorrect([4, 1, 7], [])).toBe(false);
  });

  it('rejects the right digits in the wrong order', () => {
    // Order matters. A scoring rule that only compared the SET of digits would accept this, and
    // would be measuring something other than sequence memory.
    expect(isTrialCorrect([1, 2, 4], [1, 2, 4])).toBe(false);
    expect(isTrialCorrect([1, 2, 4], [4, 1, 2])).toBe(false);
  });

  it('works at the longest length in the pool', () => {
    const longest = DIGIT_FORMS[0].sequences[DIGIT_TRIALS_PER_FORM - 1];

    expect(isTrialCorrect(longest, reversedSequence(longest))).toBe(true);
    expect(isTrialCorrect(longest, longest)).toBe(false);
  });

  it('accepts every trial in every form when answered correctly', () => {
    // Proves the scoring rule and the pools actually agree with each other across the board.
    for (const form of DIGIT_FORMS) {
      for (const sequence of form.sequences) {
        expect(isTrialCorrect(sequence, reversedSequence(sequence)), `${form.id}: ${sequence}`).toBe(
          true,
        );
      }
    }
  });
});

describe('scoreSpanTrials', () => {
  it('counts how many trials were correct', () => {
    const score = scoreSpanTrials('digits-a', [true, true, false, true, false, false, false, false, false]);

    expect(score.correct).toBe(3);
  });

  it('keeps the per-trial pattern, not just the count', () => {
    // The pattern carries information the total does not: failing the two longest trials and
    // failing two of the shortest are the same score and very different sittings. This detail is
    // what makes the export useful for threshold work.
    const pattern = [true, true, true, true, true, true, false, false, false];
    const score = scoreSpanTrials('digits-a', pattern);

    expect(score.trialsCorrect).toEqual(pattern);
  });

  it('records the form id', () => {
    expect(scoreSpanTrials('digits-c', []).formId).toBe('digits-c');
  });

  it('does not alias the array it was given', () => {
    const pattern = [true, false];
    const score = scoreSpanTrials('digits-a', pattern);
    pattern.push(true);

    expect(score.trialsCorrect).toEqual([true, false]);
  });

  it('scores all-correct as full marks and all-wrong as zero', () => {
    const allRight = Array.from({ length: DIGIT_TRIALS_PER_FORM }, () => true);
    const allWrong = Array.from({ length: DIGIT_TRIALS_PER_FORM }, () => false);

    expect(scoreSpanTrials('digits-a', allRight).correct).toBe(MAX_DIGIT_CORRECT);
    expect(scoreSpanTrials('digits-a', allWrong).correct).toBe(0);
  });

  it('never exceeds the number of trials', () => {
    const allRight = Array.from({ length: DIGIT_TRIALS_PER_FORM }, () => true);

    expect(scoreSpanTrials('digits-a', allRight).correct).toBeLessThanOrEqual(DIGIT_TRIALS_PER_FORM);
  });
});

describe('trialLength', () => {
  it('reports the length of each trial in order', () => {
    expect(trialLength(DIGIT_FORMS[0], 0)).toBe(3);
    expect(trialLength(DIGIT_FORMS[0], DIGIT_TRIALS_PER_FORM - 1)).toBe(7);
  });

  it('returns zero rather than crashing for an index past the end', () => {
    // Defensive: a screen that miscounted its trials should not take the whole sitting down.
    expect(trialLength(DIGIT_FORMS[0], 99)).toBe(0);
  });
});
