// lib/shuffle.ts

import { hashString } from './hash';

/**
 * Reorder a list using the Fisher-Yates shuffle, deterministically from a seed string.
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
 *
 * ═════════════════════════════════════════════════════════════════════════════════════
 * WHY SEEDED, NOT Math.random() — fixed 2026-09-27, a real bug
 * ═════════════════════════════════════════════════════════════════════════════════════
 * This used to draw from Math.random() at every swap. A screen that builds its layout from this
 * during render (the word recognition grid does, on first render) got a DIFFERENT order on the
 * server than on the client, because Math.random() is never the same twice. React caught the
 * mismatch, discarded the server-rendered tree and re-rendered on the client — which means for a
 * moment the athlete could see one order, tap by position, and have the tap land on a different
 * word than the one at that position when the client's render finally won. A silently wrong point.
 *
 * Fisher-Yates' random draws are now `hashString` of the seed plus the draw's position, the exact
 * technique lib/forms/index.ts already uses to choose a form deterministically. Same seed, same
 * input list, same output — every time, on the server and the client alike. A caller that wants
 * two independent shuffles from data that would otherwise produce the same seed (e.g. two
 * screens in one sitting) should pass seeds that differ by more than that data, the way the two
 * halves of the word module do — see the callers in lib/modules/words.ts.
 */
export function shuffle<T>(items: readonly T[], seed: string): T[] {
  // Copy first — mutating the caller's array in place is a classic source of surprise bugs.
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    // A deterministic "random" index from 0 up to and including i.
    const j = hashString(`${seed}:${i}`) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
