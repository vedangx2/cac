// lib/modules/span.ts
//
// Scoring shared by the two fixed-trial span modules: digit span backward and pattern span.
//
// WHY SHARED: both tasks are "nine fixed trials, each either reproduced exactly or not". If each
// module carried its own copy of that arithmetic, one could drift — and since the engine compares
// both against thresholds of the same kind, a difference in how "correct" is counted would show up
// as a difference in the athlete rather than in the code.

/** The stored score for a fixed-trial span task. */
export type SpanScore = {
  formId: string;
  trialsCorrect: boolean[];
  correct: number;
};

/**
 * Turn per-trial pass/fail into the stored score.
 *
 * `trialsCorrect` is kept in presentation order rather than collapsed to a count alone, because
 * the pattern carries information the total does not: "failed the three longest trials" and
 * "failed three of the shortest" are the same score and very different sittings. That detail
 * survives into the JSON export, where it is exactly the kind of thing threshold work needs.
 *
 * The array is copied, so a caller mutating its own list afterwards cannot change a recorded score.
 */
export function scoreSpanTrials(formId: string, trialsCorrect: readonly boolean[]): SpanScore {
  return {
    formId,
    trialsCorrect: [...trialsCorrect],
    correct: trialsCorrect.filter(Boolean).length,
  };
}

/**
 * Did the athlete reproduce this trial exactly?
 *
 * Order and length both have to match. A partial answer that happens to start correctly is still a
 * failed trial — see the no-partial-credit note on each module.
 */
export function isExactMatch(expected: readonly number[], entered: readonly number[]): boolean {
  if (entered.length !== expected.length) return false;
  return expected.every((value, index) => entered[index] === value);
}
