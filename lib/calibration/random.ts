// lib/calibration/random.ts
//
// Random numbers for the calibration simulation.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY OUR OWN GENERATOR INSTEAD OF Math.random()
// ═════════════════════════════════════════════════════════════════════════════════════
// One reason only: a run has to be REPRODUCIBLE. If you look at a false-positive rate of 4.2%
// and want to know whether it is real or noise, you have to be able to run exactly the same ten
// thousand simulated athletes again and get exactly the same answer. Math.random() cannot be
// seeded, so the same inputs would give a slightly different number every time and there would be
// no way to tell a change in the model from a change in the dice.
//
// It also means these functions can be unit-tested against fixed expected values rather than
// "roughly, on average, usually".
//
// THIS IS NOT CRYPTOGRAPHY and does not need to be. It needs to be fast, seedable, and spread
// evenly. Mulberry32 is about six lines and does that.

/** A seeded stream of numbers in [0, 1). */
export type Rng = () => number;

/**
 * Mulberry32 — a small, fast, seedable pseudo-random generator.
 *
 * The bit twiddling is standard and not worth explaining line by line; what matters is the
 * contract: same seed in, same sequence out, every time, on every machine.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A draw from a normal (bell-shaped) distribution, by the Box-Muller transform.
 *
 * Used for measurements that are continuous, like a response time in milliseconds. Two uniform
 * draws in, one normal draw out. (Box-Muller actually produces two normals; we throw the second
 * away, which costs a little speed and saves carrying state around.)
 */
export function normal(rng: Rng, mean: number, sd: number): number {
  if (sd === 0) return mean;

  // Math.log(0) is -Infinity, so nudge a zero draw off the boundary.
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();

  const magnitude = Math.sqrt(-2 * Math.log(u1));
  return mean + sd * magnitude * Math.cos(2 * Math.PI * u2);
}

/**
 * A draw from a binomial distribution: how many of `trials` independent attempts succeed, when
 * each succeeds with probability `successRate`.
 *
 * THIS IS THE RIGHT SHAPE FOR THE COUNT-BASED MEASUREMENTS. Digit span, pattern span and the word
 * scores are all "how many of a fixed number of chances did you get right". Modelling them with a
 * bell curve would be wrong in a way that matters at the edges: a bell curve happily produces 9.7
 * out of 9, or a negative count, and the whole question a threshold answers is about the size of
 * small integer changes near the top of a bounded scale.
 *
 * Implemented as the obvious loop rather than anything clever, because `trials` here is at most a
 * few dozen and the loop is easy to read and check.
 */
export function binomial(rng: Rng, trials: number, successRate: number): number {
  const p = clamp01(successRate);
  let successes = 0;

  for (let i = 0; i < trials; i += 1) {
    if (rng() < p) successes += 1;
  }

  return successes;
}

/**
 * A draw from a Poisson distribution: how many rare events happen, when they happen at an average
 * rate of `rate` per sitting.
 *
 * THIS IS THE RIGHT SHAPE FOR ERROR COUNTS. False alarms, commission errors and omission errors
 * are counts of things that mostly do not happen. They cannot be negative, they are not
 * symmetric — you can have far more than average but never fewer than zero — and their spread
 * grows with their average, which is exactly the behaviour a threshold has to survive.
 *
 * Knuth's method: multiply uniform draws until the product falls below e^-rate.
 */
export function poisson(rng: Rng, rate: number): number {
  if (rate <= 0) return 0;

  const limit = Math.exp(-rate);
  let count = 0;
  let product = rng();

  // A very large rate would make `limit` underflow to 0 and this loop never end. Rates in this
  // app are single digits, but a guard costs nothing and a hung browser tab costs a lot.
  while (product > limit && count < 10_000) {
    count += 1;
    product *= rng();
  }

  return count;
}

/** Keep a probability inside [0, 1]. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Keep a value inside a range, and make it a whole number. */
export function clampInteger(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}
