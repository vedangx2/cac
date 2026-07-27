// lib/shuffle.ts

/**
 * Randomly reorder a list using the Fisher-Yates shuffle.
 *
 * WHY NOT `array.sort(() => Math.random() - 0.5)`, which is the trick you see everywhere:
 *
 *   1. It is not uniform. A sort algorithm assumes the comparator is *consistent* — that if
 *      a < b and b < c then a < c. A random comparator breaks that promise, so the algorithm
 *      makes decisions based on comparisons that contradict each other. The orders that come
 *      out are measurably lopsided: some arrangements show up far more often than others.
 *   2. The result depends on the engine. Different browsers use different sort algorithms,
 *      so the same "shuffle" is biased in different ways in different places.
 *   3. It is slower — O(n log n) comparisons instead of O(n) swaps.
 *
 * Fisher-Yates has none of those problems. Walking from the end of the list backwards, each
 * position is swapped with a randomly chosen position at or before it. Every one of the n!
 * possible orderings comes out with exactly equal probability, in a single pass.
 *
 * This matters for us: if the grid layout were biased, some sittings would be systematically
 * easier than others, and an athlete's "slower time" might just mean "harder grid."
 */
export function shuffle<T>(items: readonly T[]): T[] {
  // Copy first — mutating the caller's array in place is a classic source of surprise bugs.
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    // A random index from 0 up to and including i.
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
