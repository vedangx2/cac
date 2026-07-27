import { describe, expect, it } from 'vitest';
import { shuffle } from './shuffle';

describe('shuffle', () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

  it('keeps every element exactly once', () => {
    const result = shuffle(numbers);
    expect(result).toHaveLength(numbers.length);
    expect([...result].sort((a, b) => a - b)).toEqual(numbers);
  });

  it('leaves the caller’s array untouched', () => {
    const original = [...numbers];
    shuffle(numbers);
    expect(numbers).toEqual(original);
  });

  it('produces every ordering roughly equally often', () => {
    // The whole reason we hand-wrote Fisher-Yates instead of sorting by a random comparator
    // is uniformity, so it is worth actually checking. With three elements there are six
    // possible orderings; over 6000 shuffles each should turn up about 1000 times. We assert
    // a very loose floor of 500 — far below anything random chance would realistically hit,
    // but nowhere near loose enough to let a genuinely biased shuffle through.
    const counts = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const key = shuffle([1, 2, 3]).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(500);
    }
  });

  it('handles empty and single-item lists without complaining', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([42])).toEqual([42]);
  });
});
