import { describe, expect, it } from 'vitest';
import { median } from './stats';

describe('median', () => {
  it('returns the middle value of an odd-length list', () => {
    expect(median([300, 310, 320, 305, 315])).toBe(310);
  });

  it('does not care what order the values arrive in', () => {
    expect(median([320, 300, 315, 305, 310])).toBe(310);
  });

  it('averages the two middle values when the count is even', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('ignores a single wild outlier — the reason we use it over the average', () => {
    const trials = [300, 305, 310, 315, 2000];
    expect(median(trials)).toBe(310);

    // For contrast: the mean of the same trials is dragged up by over 200ms, which is enough
    // on its own to trip the reaction threshold and flag a perfectly normal athlete.
    const mean = trials.reduce((a, b) => a + b, 0) / trials.length;
    expect(mean).toBeGreaterThan(600);
  });

  it('leaves the caller’s array untouched', () => {
    const trials = [320, 300, 310];
    median(trials);
    expect(trials).toEqual([320, 300, 310]);
  });

  it('throws on an empty list rather than inventing a number', () => {
    expect(() => median([])).toThrow();
  });
});
