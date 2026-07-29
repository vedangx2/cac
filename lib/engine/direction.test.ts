// lib/engine/direction.test.ts
//
// Tests for the file that decides WHICH WAY IS WORSE.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS THE MOST SAFETY-CRITICAL TEST FILE IN THE PROJECT
// ═════════════════════════════════════════════════════════════════════════════════════
// The old battery got worse by getting bigger, every measurement, no exceptions. The new one
// mixes both directions: symptom score and error counts get worse going up, while digit span,
// pattern span and the word scores are counts of things done RIGHT and get worse going down.
//
// A single reversed subtraction would mean an athlete who has DECLINED reads as improved. A kid
// who held seven digits at baseline and four after a hit would produce -3, the engine would see
// a negative number, conclude "not worse", never flag, and print the most reassuring screen the
// app has. That is precisely the outcome this whole project exists to prevent, and it would be
// caused by a minus sign.
//
// So these tests are deliberately exhaustive rather than representative: every measurement in the
// table is checked in both directions, and the table itself is checked for completeness against
// the engine. A measurement nobody wrote a direction for must not silently default to anything.

import { describe, expect, it } from 'vitest';
import {
  MEASUREMENT_DIRECTIONS,
  type MeasurementKey,
  worseningAmount,
  worseningFor,
} from './direction';

/* ── The primitive ────────────────────────────────────────────────────────────────── */

describe('worseningAmount normalises so that positive always means worse', () => {
  describe('higher-is-worse (symptom score, response times, error counts)', () => {
    it('reports a rise as worse', () => {
      expect(worseningAmount('higher-is-worse', 10, 14)).toBe(4);
    });

    it('reports a fall as better, keeping the sign', () => {
      // Not clamped to zero: an athlete genuinely improving is real information, and throwing
      // the sign away would leave the results screen unable to tell "no change" from "better".
      expect(worseningAmount('higher-is-worse', 14, 10)).toBe(-4);
    });

    it('reports no change as zero', () => {
      expect(worseningAmount('higher-is-worse', 10, 10)).toBe(0);
    });
  });

  describe('lower-is-worse (anything counting things done correctly)', () => {
    it('reports a FALL as worse', () => {
      // The case a reversed sign would get wrong. Seven correct at baseline, four now, is a
      // decline of three — and it must come out POSITIVE so the engine can flag it.
      expect(worseningAmount('lower-is-worse', 7, 4)).toBe(3);
    });

    it('reports a RISE as better, keeping the sign', () => {
      expect(worseningAmount('lower-is-worse', 4, 7)).toBe(-3);
    });

    it('reports no change as zero', () => {
      expect(worseningAmount('lower-is-worse', 7, 7)).toBe(0);
    });
  });

  it('gives exactly opposite answers for the two directions on the same numbers', () => {
    // The definition of the two directions being genuine opposites. If both branches ever
    // computed the same subtraction, this is what would catch it.
    for (const [baseline, check] of [
      [7, 4],
      [4, 7],
      [0, 9],
      [9, 0],
      [3, 3],
    ]) {
      const higher = worseningAmount('higher-is-worse', baseline, check);
      const lower = worseningAmount('lower-is-worse', baseline, check);

      // Expressed as "they cancel out" rather than `higher === -lower`, because when both are
      // zero the negation gives -0 and Object.is(0, -0) is false — a false failure about nothing.
      expect(higher + lower).toBe(0);
    }
  });

  it('handles zero and negative values without special-casing', () => {
    expect(worseningAmount('lower-is-worse', 0, 0)).toBe(0);
    expect(worseningAmount('higher-is-worse', -5, 5)).toBe(10);
  });
});

/* ── The table ────────────────────────────────────────────────────────────────────── */

describe('the measurement direction table', () => {
  /**
   * Every measurement, written out INDEPENDENTLY of the source table.
   *
   * Deliberately duplicated rather than derived: a test that read the direction from
   * MEASUREMENT_DIRECTIONS and then asserted it matched MEASUREMENT_DIRECTIONS would pass no
   * matter what the table said. This list is a second opinion, written from what each
   * measurement MEANS, and the point is for the two to be compared.
   */
  const EXPECTED: Record<MeasurementKey, 'higher-is-worse' | 'lower-is-worse'> = {
    // More symptoms than their own normal is worse.
    symptomTotal: 'higher-is-worse',
    // Counts of grid words got RIGHT. Fewer right is worse.
    wordLearningCorrect: 'lower-is-worse',
    wordRecognitionCorrect: 'lower-is-worse',
    // Counts of words wrongly claimed as seen. More is worse.
    wordLearningFalseAlarms: 'higher-is-worse',
    wordRecognitionFalseAlarms: 'higher-is-worse',
    // Counts of trials got RIGHT, out of nine. Fewer is worse.
    digitSpanCorrect: 'lower-is-worse',
    patternSpanCorrect: 'lower-is-worse',
    // A response time. Slower is worse.
    goNoGoMedianMs: 'higher-is-worse',
    // Counts of mistakes. More is worse.
    goNoGoCommissionErrors: 'higher-is-worse',
    goNoGoOmissionErrors: 'higher-is-worse',
    // More sway is worse.
    balanceSway: 'higher-is-worse',
  };

  it('declares the direction every measurement actually has', () => {
    for (const [measurement, expected] of Object.entries(EXPECTED)) {
      expect(
        MEASUREMENT_DIRECTIONS[measurement as MeasurementKey],
        `${measurement} has the wrong direction — an athlete who declined would read as improved`,
      ).toBe(expected);
    }
  });

  it('covers every measurement and no extras', () => {
    // Catches a measurement added to the engine but not given a direction, and a stale entry left
    // behind after one was removed.
    expect(Object.keys(MEASUREMENT_DIRECTIONS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('uses only the two known directions', () => {
    for (const direction of Object.values(MEASUREMENT_DIRECTIONS)) {
      expect(['higher-is-worse', 'lower-is-worse']).toContain(direction);
    }
  });

  it('gets every count-of-successes measurement the right way round', () => {
    // Spelled out separately because these are the ones the old battery had none of, and
    // therefore the ones a reader carrying the old "bigger is worse" assumption would break.
    const countsOfSuccess: MeasurementKey[] = [
      'wordLearningCorrect',
      'wordRecognitionCorrect',
      'digitSpanCorrect',
      'patternSpanCorrect',
    ];

    for (const measurement of countsOfSuccess) {
      // Scored 8 at baseline, 3 now — a real decline, which must be positive.
      expect(worseningFor(measurement, 8, 3), measurement).toBe(5);
      // And the reverse must read as an improvement, not a decline.
      expect(worseningFor(measurement, 3, 8), measurement).toBe(-5);
    }
  });

  it('gets every count-of-mistakes measurement the right way round', () => {
    const countsOfMistakes: MeasurementKey[] = [
      'symptomTotal',
      'wordLearningFalseAlarms',
      'wordRecognitionFalseAlarms',
      'goNoGoCommissionErrors',
      'goNoGoOmissionErrors',
      'goNoGoMedianMs',
      'balanceSway',
    ];

    for (const measurement of countsOfMistakes) {
      // 2 at baseline, 7 now — more mistakes, which must be positive.
      expect(worseningFor(measurement, 2, 7), measurement).toBe(5);
      expect(worseningFor(measurement, 7, 2), measurement).toBe(-5);
    }
  });
});
