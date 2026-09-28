import { describe, expect, it } from 'vitest';
import { shuffle } from './shuffle';

describe('shuffle', () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  it('keeps every element exactly once', () => {
    const result = shuffle(numbers, 'seed-a');
    expect(result).toHaveLength(numbers.length);
    expect([...result].sort((a, b) => a - b)).toEqual(numbers);
  });

  it('leaves the caller’s array untouched', () => {
    const original = [...numbers];
    shuffle(numbers, 'seed-a');
    expect(numbers).toEqual(original);
  });

  it('handles empty and single-item lists without complaining', () => {
    expect(shuffle([], 'seed-a')).toEqual([]);
    expect(shuffle([42], 'seed-a')).toEqual([42]);
  });

  /*
    THE WHOLE REASON THIS IS SEEDED, NOT Math.random() (see lib/shuffle.ts): a screen that builds
    its layout from this during render must get the identical order every single time it is asked
    for the same seed — on the server, on the client, and on every re-render in between. A test
    that only checked "it shuffles" would miss the actual bug this fixed.
  */
  describe('determinism — the property the 2026-09-27 fix depends on', () => {
    it('gives the same seed the same order, every time, including across many repeats', () => {
      const first = shuffle(numbers, 'athlete-1:1700000000000');
      for (let attempt = 0; attempt < 50; attempt++) {
        expect(shuffle(numbers, 'athlete-1:1700000000000')).toEqual(first);
      }
    });

    it('gives different seeds different orders', () => {
      // Not a statistical test — a deterministic function has no distribution to sample. This
      // just confirms the seed actually participates in the result, so two different sittings
      // are not accidentally handed the same layout.
      const seeds = Array.from({ length: 20 }, (_, index) => `seed-${index}`);
      const orders = seeds.map((seed) => shuffle(numbers, seed).join(','));

      expect(new Set(orders).size).toBeGreaterThan(1);
    });

    it('spreads reasonably across the possible orderings for a small list', () => {
      // Same spirit as the old Math.random()-based spread check, adapted for a deterministic
      // function: instead of repeating one call many times, vary the SEED many times. A biased
      // implementation (e.g. one that barely uses the seed) would collapse most seeds onto a
      // handful of orderings; this asserts it does not.
      const counts = new Map<string, number>();
      for (let i = 0; i < 600; i++) {
        const key = shuffle([1, 2, 3], `seed-${i}`).join('');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // Six possible orderings of three items. Every one should show up at all, and no single
      // ordering should dominate the way it would if the seed were barely affecting the result.
      expect(counts.size).toBe(6);
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(50);
      }
    });
  });
});
