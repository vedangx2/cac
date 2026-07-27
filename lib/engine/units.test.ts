import { describe, expect, it } from 'vitest';
import { displayedSecondsDifference, msText, pointsText, secondsText } from './units';

describe('displayed numbers add up', () => {
  it('reports a difference that matches the two values shown beside it', () => {
    // The exact case that shipped broken: 411ms and 561ms display as "0.4 s" and "0.6 s".
    // The raw difference is 150ms, which would print as "0.1 s" — and 0.6 minus 0.4 is not
    // 0.1, so the result screen appeared to contradict itself.
    const baseline = 411;
    const check = 561;

    expect(secondsText(baseline)).toBe('0.4 s');
    expect(secondsText(check)).toBe('0.6 s');
    expect(secondsText(displayedSecondsDifference(baseline, check))).toBe('0.2 s');
  });

  it('holds for realistic scan times too', () => {
    const baseline = 18_340;
    const check = 23_710;

    const shownBaseline = Number(secondsText(baseline).replace(' s', ''));
    const shownCheck = Number(secondsText(check).replace(' s', ''));
    const shownDifference = Number(
      secondsText(displayedSecondsDifference(baseline, check)).replace(' s', ''),
    );

    expect(Number((shownCheck - shownBaseline).toFixed(1))).toBe(shownDifference);
  });

  it('stays consistent across a sweep of random pairs', () => {
    for (let i = 0; i < 500; i++) {
      const baseline = Math.floor(Math.random() * 60_000);
      const check = Math.floor(Math.random() * 60_000);

      const shownBaseline = Number(secondsText(baseline).replace(' s', ''));
      const shownCheck = Number(secondsText(check).replace(' s', ''));
      const shownDifference = Number(
        secondsText(displayedSecondsDifference(baseline, check)).replace(' s', ''),
      );

      expect(Number((shownCheck - shownBaseline).toFixed(1))).toBe(shownDifference);
    }
  });

  it('handles a negative difference (the athlete got faster)', () => {
    expect(displayedSecondsDifference(5000, 3000)).toBe(-2000);
  });
});

describe('wording helpers', () => {
  it('formats milliseconds as whole numbers', () => {
    expect(msText(250.7)).toBe('251 ms');
  });

  it('uses the singular for exactly one point', () => {
    expect(pointsText(1)).toBe('1 point');
    expect(pointsText(5)).toBe('5 points');
  });
});
