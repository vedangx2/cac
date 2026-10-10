// lib/sittings.test.ts
//
// Why this file exists: two sideline checks by one tester came back with the SAME go/no-go
// median (331ms) as each other. That looked like a suspicious repeat — a stuck value, a cached
// score, a form reused. It was a coincidence: the commission counts differed between the
// checks (baseline 1, check one 2, check two 1), which could not happen if the same run had been
// scored twice.
//
// These tests use SYNTHETIC sittings (made-up trial data, not any tester's numbers) to pin down
// the property that finding relied on: scoring runs one at a time is independent, so two runs
// can share a median while differing in their errors, and the scorer keeps them apart.

import { describe, expect, it } from 'vitest';
import { scoreGoNoGo, toStoredScore, type TrialOutcome } from './modules/gonogo';
import { GO_NO_NOGO_PER_FORM, GO_NO_TRIALS_PER_FORM } from './forms';

const GO_TRIALS = GO_NO_TRIALS_PER_FORM - GO_NO_NOGO_PER_FORM;

/**
 * Build one synthetic sitting: `goTimesMs` are the go-trial responses (must be GO_TRIALS long),
 * and `commissions` of the no-go trials are tapped when they should not have been.
 */
function sitting(goTimesMs: number[], commissions: number): TrialOutcome[] {
  if (goTimesMs.length !== GO_TRIALS) throw new Error('fixture needs one time per go trial');
  const outcomes: TrialOutcome[] = goTimesMs.map((ms) => ({ kind: 'go-response', ms }));
  for (let i = 0; i < GO_NO_NOGO_PER_FORM; i += 1) {
    outcomes.push({ kind: i < commissions ? 'nogo-commission' : 'nogo-withheld' });
  }
  return outcomes;
}

/** GO_TRIALS times with an exact median of `middle`: half a bit under, half a bit over. */
function timesWithMedian(middle: number, spread: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < GO_TRIALS; i += 1) {
    // Symmetric around the middle, so the median is the middle. Steps are whole multiples of
    // `spread` (odd, so the two central values are middle � spread and average to the middle).
    const offset = (2 * i - (GO_TRIALS - 1)) * spread;
    times.push(Math.round(middle + offset));
  }
  return times;
}

describe('sittings with the same go/no-go median but different trial data', () => {
  const baseline = scoreGoNoGo('form-a', sitting(timesWithMedian(331, 3), 1));
  const checkOne = scoreGoNoGo('form-b', sitting(timesWithMedian(331, 7), 2));
  const checkTwo = scoreGoNoGo('form-c', sitting(timesWithMedian(331, 11), 1));

  it('produces a score for each sitting', () => {
    expect(baseline).not.toBeNull();
    expect(checkOne).not.toBeNull();
    expect(checkTwo).not.toBeNull();
  });

  it('can share a median exactly — that alone is not evidence of a repeated run', () => {
    expect(baseline!.medianMs).toBe(331);
    expect(checkOne!.medianMs).toBe(331);
    expect(checkTwo!.medianMs).toBe(331);
  });

  it('still keeps each sitting\'s own commission count', () => {
    expect(baseline!.commissionErrors).toBe(1);
    expect(checkOne!.commissionErrors).toBe(2);
    expect(checkTwo!.commissionErrors).toBe(1);
  });

  it('keeps the raw go-trial times different even when the medians match', () => {
    expect(baseline!.goTrialsMs).not.toEqual(checkOne!.goTrialsMs);
    expect(checkOne!.goTrialsMs).not.toEqual(checkTwo!.goTrialsMs);
  });

  it('stores the form each sitting was scored under', () => {
    expect(toStoredScore(baseline!).formId).toBe('form-a');
    expect(toStoredScore(checkOne!).formId).toBe('form-b');
    expect(toStoredScore(checkTwo!).formId).toBe('form-c');
  });

  it('scoring the same trial data twice gives identical scores (deterministic, no hidden state)', () => {
    const again = scoreGoNoGo('form-a', sitting(timesWithMedian(331, 3), 1));
    expect(again).toEqual(baseline);
  });

  it('scoring one sitting does not change the score of another', () => {
    const before = scoreGoNoGo('form-b', sitting(timesWithMedian(331, 7), 2));
    scoreGoNoGo('form-c', sitting(timesWithMedian(400, 5), 5));
    const after = scoreGoNoGo('form-b', sitting(timesWithMedian(331, 7), 2));
    expect(after).toEqual(before);
  });
});

describe('sittings with differing medians', () => {
  it('report the difference, in the right direction', () => {
    const fast = scoreGoNoGo('f', sitting(timesWithMedian(300, 4), 0))!;
    const slow = scoreGoNoGo('f', sitting(timesWithMedian(360, 4), 0))!;
    expect(slow.medianMs - fast.medianMs).toBe(60);
  });
});
