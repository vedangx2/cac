// lib/calibration/parse.ts
//
// TURNING PASTED NUMBERS INTO A NOISE PROFILE.
//
// The whole calibration plan depends on getting real repeated-sitting measurements off the phones
// they were collected on, and this is the step that turns those numbers into something the
// simulation can use. It is deliberately forgiving about formatting and completely unforgiving
// about inventing anything: what it cannot work out from the numbers you gave it, it reports as
// unknown rather than filling in.
//
// TWO INPUT SHAPES, both accepted, told apart by how many numbers are on a line:
//
//   ONE NUMBER PER LINE — repeated sittings by the SAME healthy person, days apart. This is what
//   `/tools/noise-floor` produces and what the threshold plan actually calls for. The spread of
//   these values IS the within-athlete wobble, which is the number that decides the
//   false-positive rate.
//
//   TWO NUMBERS PER LINE — a baseline and a retest from one person, one pair per line, possibly
//   several different people. This is the better input if you have it, because it separates the
//   two spreads properly: the differences within a pair give the within-athlete wobble, and the
//   pair averages give the between-athlete spread.
//
// Blank lines and anything after a `#` are ignored, so you can paste a list with notes in it.

import type { CalibratedMeasurement, NoiseProfile } from './profiles';
import { MEASUREMENT_SHAPES } from './profiles';

export type ParsedSeries = {
  /** Every number found, in order. For paired input, both halves of every pair. */
  values: number[];
  /** The pairs, when the input was paired. Empty otherwise. */
  pairs: Array<[number, number]>;
  mean: number;
  /** Spread of all the values together. */
  standardDeviation: number;
  /**
   * The within-athlete spread, when it can honestly be worked out.
   *
   * Null when the input was a single unpaired list AND we therefore cannot separate one person
   * varying from several people differing. In practice a single list is normally one person, and
   * the page says so — but this field only carries a number when the input format proves it.
   */
  withinAthleteSd: number | null;
  /** Between-athlete spread from the pair averages. Null for unpaired input. */
  betweenAthleteSd: number | null;
  /** Anything the reader should know: ignored junk, values outside the possible range, too few. */
  problems: string[];
};

const EMPTY: ParsedSeries = {
  values: [],
  pairs: [],
  mean: 0,
  standardDeviation: 0,
  withinAthleteSd: null,
  betweenAthleteSd: null,
  problems: [],
};

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Sample standard deviation — dividing by (n - 1), not n.
 *
 * WHY (n - 1): we are estimating the spread of all the sittings this person could have had from
 * the handful we actually collected. Dividing by n systematically UNDER-estimates that spread,
 * and an under-estimated noise floor produces a threshold set too low, which flags healthy
 * athletes. The error would push in the dangerous-for-trust direction, so we take the correction.
 *
 * Returns 0 for fewer than two values, because one measurement has no spread to speak of.
 */
function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const sumSquares = values.reduce((total, value) => total + (value - average) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

/**
 * Read pasted text into a series.
 *
 * Numbers may be separated by commas, spaces or tabs. `#` starts a comment.
 */
export function parseSeries(text: string, measurement?: CalibratedMeasurement): ParsedSeries {
  const problems: string[] = [];
  const values: number[] = [];
  const pairs: Array<[number, number]> = [];
  let sawAThreeNumberLine = false;

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (line === '') continue;

    const tokens = line.split(/[\s,]+/).filter((token) => token !== '');
    const numbers: number[] = [];

    for (const token of tokens) {
      const value = Number(token);
      if (!Number.isFinite(value)) {
        problems.push(`Ignored "${token}" — not a number.`);
        continue;
      }
      numbers.push(value);
    }

    if (numbers.length === 0) continue;

    if (numbers.length === 2) {
      pairs.push([numbers[0], numbers[1]]);
      values.push(numbers[0], numbers[1]);
      continue;
    }

    if (numbers.length > 2) sawAThreeNumberLine = true;
    values.push(...numbers);
  }

  if (values.length === 0) return { ...EMPTY, problems };

  if (pairs.length > 0 && pairs.length * 2 !== values.length) {
    problems.push(
      'Some lines had two numbers and some did not. The two-number lines were read as ' +
        'baseline/retest pairs and the rest as single sittings, which mixes two different things — ' +
        'use one format or the other.',
    );
  }

  if (sawAThreeNumberLine) {
    problems.push(
      'A line had more than two numbers. Those were read as separate sittings, not as a pair.',
    );
  }

  // Sanity-check against what the measurement can actually be. A stray decimal point turns a
  // digit-span score of 7 into 70, and a silently-accepted impossible value would widen the
  // measured spread and push a threshold upwards — the direction that misses things.
  if (measurement) {
    const shape = MEASUREMENT_SHAPES[measurement];
    const max = shape.max;
    const outOfRange = values.filter(
      (value) => value < shape.min || (max !== null && value > max),
    );
    if (outOfRange.length > 0) {
      problems.push(
        `${outOfRange.length} value(s) fall outside what this measurement can be (` +
          `${shape.min} to ${max ?? 'no ceiling'}). They were kept, but check them — a value ` +
          'that cannot happen makes the spread look wider than it is.',
      );
    }
  }

  if (values.length < 5) {
    problems.push(
      `Only ${values.length} value(s). A spread estimated from this few numbers is not worth ` +
        'much — the threshold you would read off it could easily be out by a factor of two.',
    );
  }

  let withinAthleteSd: number | null = null;
  let betweenAthleteSd: number | null = null;

  if (pairs.length >= 2) {
    /*
      Paired input separates the two spreads cleanly.

      Each pair is two sittings by one person, so the DIFFERENCE between them contains only
      within-athlete variation. A difference of two independent draws has twice the variance of a
      single draw, so the within-athlete spread is the spread of the differences divided by the
      square root of two. That factor is the whole reason to prefer paired input.
    */
    const differences = pairs.map(([first, second]) => second - first);
    withinAthleteSd = standardDeviation(differences) / Math.SQRT2;

    const pairMeans = pairs.map(([first, second]) => (first + second) / 2);
    betweenAthleteSd = standardDeviation(pairMeans);
  }

  return {
    values,
    pairs,
    mean: mean(values),
    standardDeviation: standardDeviation(values),
    withinAthleteSd,
    betweenAthleteSd,
    problems,
  };
}

/**
 * Turn a parsed series into a noise profile for one measurement.
 *
 * `fallback` supplies anything the numbers cannot tell us, and is normally the placeholder
 * profile. The point of passing it in rather than reaching for a constant is that the caller can
 * see exactly which parts of the resulting profile came from real data and which did not.
 *
 * WHAT COMES FROM WHERE:
 *   • centre                — always from the pasted numbers.
 *   • spreadWithinAthlete   — from the pairs if the input was paired; otherwise from the spread of
 *                             the values, which is the right reading when the list is repeated
 *                             sittings by one person, and an over-estimate if it is several
 *                             people. Over-estimating pushes thresholds UP, so this errs towards
 *                             flagging less — worth knowing, since that is the direction that
 *                             misses things.
 *   • spreadBetweenAthletes — from the pairs if paired, otherwise the fallback's. It does not
 *                             affect the false-positive rate, because nothing here ever compares
 *                             one athlete against another.
 */
export function profileFromSeries(
  series: ParsedSeries,
  fallback: NoiseProfile,
): NoiseProfile {
  if (series.values.length === 0) return fallback;

  return {
    centre: series.mean,
    spreadWithinAthlete: series.withinAthleteSd ?? series.standardDeviation,
    spreadBetweenAthletes: series.betweenAthleteSd ?? fallback.spreadBetweenAthletes,
  };
}
