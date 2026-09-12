// lib/calibration/calibration.test.ts
//
// Tests for the threshold-calibration harness.
//
// The one that matters most is `agrees with the real engine on every simulated pair`. The harness
// exists to answer questions about the engine, so the way it fails catastrophically is by
// gradually becoming a model OF the engine that no longer matches it — a curve that describes
// code nobody runs. Symptom is the measurement the recorded cross-check field carries, and that
// check runs on every single pair of every simulated run rather than only here in the tests.
// (Since 2026-09-10 the flag RULE can drift too — the engine now runs 'symptom-weighted' with
// MODULES_REQUIRED_TO_FLAG — so a drift test below holds applyFlagRule against that constant.)

import { describe, expect, it } from 'vitest';
import { MODULES_REQUIRED_TO_FLAG, SYMPTOM_INCREASE, compareToBaseline } from '../engine';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import {
  CALIBRATED_MEASUREMENTS,
  type Degradations,
  MEASUREMENT_SHAPES,
  type ModuleKey,
  PLACEHOLDER_PROFILES,
  applyDegradation,
} from './profiles';
import {
  SIMULATED_FORM_ID,
  buildModuleScores,
  generateHealthyPair,
} from './generate';
import {
  applyFlagRule,
  compareFlagRules,
  crossCheck,
  defaultThresholdCandidates,
  generateSamples,
  moduleFlags,
  ratesAtThreshold,
  sweepMeasurement,
  unjudgedMeasurements,
} from './simulate';
import { binomial, clampInteger, makeRng, normal, poisson } from './random';
import { parseSeries, profileFromSeries } from './parse';

/* ═══════════════════════════════════════════════════════════════════════════════════
   Random numbers — the run has to be reproducible or no result can be checked
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the generator is seeded and reproducible', () => {
  it('gives the same sequence for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const first = [a(), a(), a(), a(), a()];
    const second = [b(), b(), b(), b(), b()];

    expect(first).toEqual(second);
  });

  it('gives a different sequence for a different seed', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('the distributions have the shapes the measurements need', () => {
  it('normal draws land near the mean with roughly the given spread', () => {
    const rng = makeRng(3);
    const values = Array.from({ length: 20_000 }, () => normal(rng, 400, 30));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(
      values.reduce((total, v) => total + (v - mean) ** 2, 0) / (values.length - 1),
    );

    expect(mean).toBeGreaterThan(396);
    expect(mean).toBeLessThan(404);
    expect(sd).toBeGreaterThan(28);
    expect(sd).toBeLessThan(32);
  });

  it('normal with zero spread returns the mean exactly', () => {
    // Matters because several placeholder profiles carry a within-athlete spread of 0 for the
    // count-based measurements, where the wobble comes from the binomial draw instead.
    const rng = makeRng(3);
    expect(normal(rng, 12, 0)).toBe(12);
  });

  it('binomial never leaves the range of chances available', () => {
    // The reason counts are not modelled with a bell curve: a bell curve produces 9.7 out of 9.
    const rng = makeRng(5);
    for (let i = 0; i < 3000; i += 1) {
      const value = binomial(rng, 9, 0.6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(9);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('binomial respects an impossible success rate rather than throwing', () => {
    const rng = makeRng(5);
    expect(binomial(rng, 9, -1)).toBe(0);
    expect(binomial(rng, 9, 2)).toBe(9);
  });

  it('poisson is never negative and averages near its rate', () => {
    const rng = makeRng(11);
    const values = Array.from({ length: 20_000 }, () => poisson(rng, 2));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(1.9);
    expect(mean).toBeLessThan(2.1);
  });

  it('poisson of a zero or negative rate is zero, not a hang', () => {
    const rng = makeRng(11);
    expect(poisson(rng, 0)).toBe(0);
    expect(poisson(rng, -3)).toBe(0);
  });

  it('clampInteger keeps a value on the scale and whole', () => {
    expect(clampInteger(9.6, 0, 9)).toBe(9);
    expect(clampInteger(-4, 0, 9)).toBe(0);
    expect(clampInteger(4.4, 0, 9)).toBe(4);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   Generated records must be records the real engine will accept
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('simulated sittings are real, internally consistent TestResults', () => {
  const rng = makeRng(99);
  const pair = generateHealthyPair(0, PLACEHOLDER_PROFILES, rng);

  it('carries the current schema version, so the engine version guard passes', () => {
    expect(pair.baseline.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(pair.check.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('puts the baseline genuinely before the check, as rule 6 requires', () => {
    expect(pair.baseline.takenAt).toBeLessThan(pair.check.takenAt);
    expect(pair.baseline.kind).toBe('baseline');
    expect(pair.check.kind).toBe('check');
  });

  it('keeps both sittings on the same athlete, as rule 1 requires', () => {
    expect(pair.baseline.athleteId).toBe(pair.check.athleteId);
  });

  it('is accepted by the engine rather than refused', () => {
    expect(() => compareToBaseline(pair.baseline, pair.check)).not.toThrow();
  });

  it('marks every generated record as simulated so it cannot be mistaken for real data', () => {
    expect(pair.check.scores.digitSpan?.formId).toBe(SIMULATED_FORM_ID);
    expect(pair.check.scores.goNoGo?.formId).toBe(SIMULATED_FORM_ID);
    expect(pair.check.scores.wordLearning?.formId).toBe(SIMULATED_FORM_ID);
  });

  it('never generates a balance score, because the balance module does not exist', () => {
    expect(pair.baseline.scores.balance).toBeNull();
    expect(pair.check.scores.balance).toBeNull();
  });

  it('builds symptom item scores that really add up to the total', () => {
    const scores = buildModuleScores({
      symptomTotal: 11,
      wordLearningCorrect: 16,
      wordLearningFalseAlarms: 2,
      wordRecognitionCorrect: 15,
      wordRecognitionFalseAlarms: 3,
      digitSpanCorrect: 5,
      patternSpanCorrect: 4,
      goNoGoMedianMs: 400,
      goNoGoCommissionErrors: 1,
      goNoGoOmissionErrors: 0,
    });

    const total = scores.symptom!.itemScores.reduce((a, b) => a + b, 0);
    expect(total).toBe(11);
    expect(scores.symptom!.itemScores).toHaveLength(10);
    expect(scores.symptom!.itemScores.every((v) => v >= 0 && v <= 3)).toBe(true);
  });

  it('builds span trial arrays whose trues really number the correct count', () => {
    const scores = buildModuleScores({
      symptomTotal: 0,
      wordLearningCorrect: 16,
      wordLearningFalseAlarms: 2,
      wordRecognitionCorrect: 15,
      wordRecognitionFalseAlarms: 3,
      digitSpanCorrect: 6,
      patternSpanCorrect: 3,
      goNoGoMedianMs: 400,
      goNoGoCommissionErrors: 1,
      goNoGoOmissionErrors: 0,
    });

    expect(scores.digitSpan!.trialsCorrect.filter(Boolean)).toHaveLength(6);
    expect(scores.patternSpan!.trialsCorrect.filter(Boolean)).toHaveLength(3);
  });

  it('builds word hits that are arithmetically consistent with correct and false alarms', () => {
    // correct = hits + (distractors - falseAlarms). A record whose parts do not add up would
    // export as obvious nonsense and mislead whoever reads it next.
    const scores = buildModuleScores({
      symptomTotal: 0,
      wordLearningCorrect: 17,
      wordLearningFalseAlarms: 2,
      wordRecognitionCorrect: 15,
      wordRecognitionFalseAlarms: 3,
      digitSpanCorrect: 5,
      patternSpanCorrect: 4,
      goNoGoMedianMs: 400,
      goNoGoCommissionErrors: 1,
      goNoGoOmissionErrors: 0,
    });

    const distractors = MEASUREMENT_SHAPES.wordLearningFalseAlarms.max!;
    const learning = scores.wordLearning!;
    expect(learning.hits + (distractors - learning.falseAlarms)).toBe(learning.correct);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   Direction — the failure that would make the whole harness report backwards
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('degradation always makes an athlete worse, whichever way worse runs', () => {
  it('makes a higher-is-worse measurement bigger', () => {
    expect(applyDegradation('goNoGoMedianMs', 400, 60)).toBe(460);
    expect(applyDegradation('symptomTotal', 3, 5)).toBe(8);
  });

  it('makes a lower-is-worse measurement smaller', () => {
    // The one that would silently invert the whole simulation if it were wrong: a degraded
    // athlete who came out with MORE trials correct would produce a wonderful-looking
    // false-negative rate that is exactly backwards.
    expect(applyDegradation('digitSpanCorrect', 6, 2)).toBe(4);
    expect(applyDegradation('wordLearningCorrect', 16, 3)).toBe(13);
  });

  it('shows up as positive worsening in the samples for a lower-is-worse measurement', () => {
    const samples = generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations: { digitSpanCorrect: 3 },
      pairs: 400,
      seed: 5,
    });

    const meanOf = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const healthy = meanOf(samples.healthy.map((s) => s.worsening.digitSpanCorrect));
    const impaired = meanOf(samples.impaired.map((s) => s.worsening.digitSpanCorrect));

    expect(healthy).toBeLessThan(1);
    expect(impaired).toBeGreaterThan(healthy + 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE IMPORTANT ONE — the harness must not drift away from the engine
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the harness drives the real engine rather than a copy of it', () => {
  const samples = generateSamples({
    profiles: PLACEHOLDER_PROFILES,
    degradations: { symptomTotal: 6, goNoGoMedianMs: 60 },
    pairs: 600,
    seed: 12,
  });

  it('agrees with the real engine on every simulated pair', () => {
    // Symptom is the measurement whose verdict the harness cross-checks against the engine's,
    // on every pair in every run. (Go/no-go response time also has a real threshold since
    // 2026-09-10, but the recorded cross-check field is the symptom one.)
    expect(samples.crossCheckDisagreements).toBe(0);
    expect(crossCheck(samples).ok).toBe(true);
  });

  it('has no pairs the engine refused', () => {
    // A refused pair is one the app would never have judged. If any appear, the generator is
    // producing records the real app could not produce and the rates describe nothing.
    expect(samples.refusedByEngine).toBe(0);
  });

  it('reproduces the engine symptom verdict from the recorded worsening', () => {
    for (const sample of samples.healthy) {
      expect(sample.worsening.symptomTotal >= SYMPTOM_INCREASE).toBe(sample.engineSymptomFlagged);
    }
  });

  it('produces the same numbers again for the same seed', () => {
    const again = generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations: { symptomTotal: 6, goNoGoMedianMs: 60 },
      pairs: 600,
      seed: 12,
    });

    expect(again.healthy.map((s) => s.worsening.symptomTotal)).toEqual(
      samples.healthy.map((s) => s.worsening.symptomTotal),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   Rates and sweeps
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('threshold rates', () => {
  const degradations: Degradations = { goNoGoMedianMs: 80 };
  const samples = generateSamples({
    profiles: PLACEHOLDER_PROFILES,
    degradations,
    pairs: 1500,
    seed: 21,
  });

  it('flags more healthy athletes as the threshold gets smaller', () => {
    const tight = ratesAtThreshold(samples, 'goNoGoMedianMs', 200, degradations);
    const loose = ratesAtThreshold(samples, 'goNoGoMedianMs', 20, degradations);

    expect(loose.falsePositiveRate).toBeGreaterThan(tight.falsePositiveRate);
  });

  it('misses more impaired athletes as the threshold gets bigger', () => {
    const tight = ratesAtThreshold(samples, 'goNoGoMedianMs', 20, degradations);
    const loose = ratesAtThreshold(samples, 'goNoGoMedianMs', 300, degradations);

    expect(loose.falseNegativeRate!).toBeGreaterThan(tight.falseNegativeRate!);
  });

  it('reports the false-negative rate as unknown when no degradation was supplied', () => {
    // The refusal that keeps the harness honest: with nothing wrong to detect, "how often would
    // we miss it" has no answer, and printing 0% would read as a perfect score.
    const point = ratesAtThreshold(samples, 'digitSpanCorrect', 2, degradations);
    expect(point.falseNegativeRate).toBeNull();
  });

  it('produces a curve that never flags fewer athletes at a looser threshold', () => {
    const curve = sweepMeasurement(
      samples,
      'goNoGoMedianMs',
      [20, 40, 60, 80, 100, 150, 200],
      degradations,
    );

    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].falsePositiveRate).toBeLessThanOrEqual(curve[i - 1].falsePositiveRate);
    }
  });

  it('offers whole-number candidates for a count measurement', () => {
    const candidates = defaultThresholdCandidates(samples, 'digitSpanCorrect');
    expect(candidates).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('offers a data-derived range for a response time', () => {
    const candidates = defaultThresholdCandidates(samples, 'goNoGoMedianMs');
    expect(candidates.length).toBeGreaterThan(3);
    expect(candidates[0]).toBeGreaterThan(0);
    expect(candidates[candidates.length - 1]).toBeGreaterThan(candidates[0]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   The whole-screen flag rule
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the multi-module flag rule', () => {
  it('applies each rule the way it is described', () => {
    const none = new Set<'symptom' | 'digitSpan' | 'goNoGo'>();
    const symptomOnly = new Set<'symptom'>(['symptom']);
    const oneOther = new Set<'digitSpan'>(['digitSpan']);
    const two = new Set<'digitSpan' | 'goNoGo'>(['digitSpan', 'goNoGo']);

    expect(applyFlagRule('any', none)).toBe(false);
    expect(applyFlagRule('any', oneOther)).toBe(true);

    expect(applyFlagRule('two-or-more', oneOther)).toBe(false);
    expect(applyFlagRule('two-or-more', two)).toBe(true);

    expect(applyFlagRule('symptom-weighted', symptomOnly)).toBe(true);
    expect(applyFlagRule('symptom-weighted', oneOther)).toBe(false);
    expect(applyFlagRule('symptom-weighted', two)).toBe(true);
  });

  it("the rule labelled 'what the engine does now' agrees with the engine's own constant", () => {
    // FLAG_RULE_LABELS says 'symptom-weighted' is what the engine does since 2026-09-10, but
    // applyFlagRule and the engine compute their halves independently — the harness hardcodes
    // its `>= 2` while the engine reads MODULES_REQUIRED_TO_FLAG. If a human ever retunes the
    // constant, this test fails and forces the label and rule to be revisited on purpose,
    // instead of the harness quietly describing a rule nobody runs any more.
    const crossingSets: Set<ModuleKey>[] = [
      new Set(),
      new Set(['symptom']),
      new Set(['digitSpan']),
      new Set(['digitSpan', 'goNoGo']),
      new Set(['symptom', 'goNoGo']),
      new Set(['digitSpan', 'goNoGo', 'patternSpan']),
    ];

    for (const set of crossingSets) {
      expect(applyFlagRule('symptom-weighted', set)).toBe(
        set.has('symptom') || set.size >= MODULES_REQUIRED_TO_FLAG,
      );
    }
  });

  it('never lets a measurement with no threshold set a flag', () => {
    // The engine's null-threshold rule, mirrored. No cut-off means no verdict, and no verdict is
    // not the same as "fine" — which is why unjudgedMeasurements is reported beside every rate.
    const samples = generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations: { digitSpanCorrect: 9 },
      pairs: 200,
      seed: 4,
    });

    for (const sample of samples.impaired) {
      expect(moduleFlags(sample, {}).size).toBe(0);
    }
  });

  it('lists exactly the measurements left unjudged', () => {
    expect(unjudgedMeasurements({})).toEqual([...CALIBRATED_MEASUREMENTS]);
    expect(unjudgedMeasurements({ digitSpanCorrect: 2 })).not.toContain('digitSpanCorrect');
  });

  it('raises fewer false alarms when two modules must agree than when one is enough', () => {
    // The comparison the rules section exists for. With ten measurements, flagging on any one of
    // them gives ten separate chances to raise a false alarm on a healthy athlete.
    const degradations: Degradations = { goNoGoMedianMs: 80, digitSpanCorrect: 2 };
    const samples = generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations,
      pairs: 1500,
      seed: 33,
    });

    const results = compareFlagRules(
      samples,
      {
        symptomTotal: 5,
        digitSpanCorrect: 2,
        patternSpanCorrect: 2,
        goNoGoMedianMs: 80,
        wordLearningCorrect: 3,
      },
      degradations,
    );

    const any = results.find((r) => r.rule === 'any')!;
    const two = results.find((r) => r.rule === 'two-or-more')!;

    expect(any.falsePositiveRate).toBeGreaterThan(two.falsePositiveRate);
    // And the cost of that: the stricter rule misses more.
    expect(two.falseNegativeRate!).toBeGreaterThanOrEqual(any.falseNegativeRate!);
  });

  it('reports the false-negative rate as unknown when nothing degraded is being judged', () => {
    const degradations: Degradations = { digitSpanCorrect: 3 };
    const samples = generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations,
      pairs: 200,
      seed: 8,
    });

    // A threshold set that judges only symptom, while the impairment is entirely in digit span.
    const results = compareFlagRules(samples, { symptomTotal: 5 }, degradations);
    for (const result of results) {
      expect(result.falseNegativeRate).toBeNull();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   Reading pasted data
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('parsing pasted measurements', () => {
  it('reads one number per line', () => {
    const series = parseSeries('412\n398\n431\n405\n420');
    expect(series.values).toEqual([412, 398, 431, 405, 420]);
    expect(series.mean).toBeCloseTo(413.2, 1);
  });

  it('reads comma and space separated numbers', () => {
    const series = parseSeries('412, 398 431\n405,420');
    expect(series.values).toEqual([412, 398, 431, 405, 420]);
  });

  it('ignores blank lines and comments', () => {
    const series = parseSeries('# Sam, three weeks\n412\n\n398 # distracted\n431');
    expect(series.values).toEqual([412, 398, 431]);
  });

  it('reports junk instead of silently dropping it', () => {
    const series = parseSeries('412\nfast\n398');
    expect(series.values).toEqual([412, 398]);
    expect(series.problems.join(' ')).toContain('fast');
  });

  it('warns when there are too few numbers to mean anything', () => {
    const series = parseSeries('412\n398');
    expect(series.problems.join(' ')).toContain('not worth');
  });

  it('warns about values the measurement cannot take', () => {
    // A stray decimal point turns a digit span of 7 into 70, which would widen the measured
    // spread and push a threshold upwards — the direction that misses things.
    const series = parseSeries('7\n6\n70\n5\n6', 'digitSpanCorrect');
    expect(series.problems.join(' ')).toContain('outside what this measurement can be');
  });

  it('separates the two spreads when the input is paired', () => {
    // Two numbers on a line means baseline and retest from one person. The differences carry
    // only within-athlete variation; the pair averages carry only between-athlete variation.
    const series = parseSeries('400 410\n500 512\n300 306\n450 456\n380 392');

    expect(series.pairs).toHaveLength(5);
    expect(series.withinAthleteSd).not.toBeNull();
    expect(series.betweenAthleteSd).not.toBeNull();

    // The people differ hugely (300 to 500); each person barely moves (6 to 12).
    expect(series.betweenAthleteSd!).toBeGreaterThan(series.withinAthleteSd!);
  });

  it('leaves the within-athlete spread unknown for an unpaired list', () => {
    const series = parseSeries('412\n398\n431\n405\n420');
    expect(series.withinAthleteSd).toBeNull();
  });

  it('warns when the input mixes paired and unpaired lines', () => {
    const series = parseSeries('400 410\n500 512\n300\n450 456');
    expect(series.problems.join(' ')).toContain('two numbers and some did not');
  });

  it('builds a profile from the numbers, falling back only for what they cannot say', () => {
    const series = parseSeries('412\n398\n431\n405\n420');
    const fallback = { centre: 999, spreadBetweenAthletes: 77, spreadWithinAthlete: 88 };
    const profile = profileFromSeries(series, fallback);

    expect(profile.centre).toBeCloseTo(413.2, 1);
    // Unpaired input cannot separate the two spreads, so the value spread is used for within...
    expect(profile.spreadWithinAthlete).toBeCloseTo(series.standardDeviation, 6);
    // ...and between-athlete spread, which the numbers genuinely cannot say, keeps the fallback.
    expect(profile.spreadBetweenAthletes).toBe(77);
  });

  it('keeps the fallback entirely when nothing was pasted', () => {
    const fallback = { centre: 999, spreadBetweenAthletes: 77, spreadWithinAthlete: 88 };
    expect(profileFromSeries(parseSeries(''), fallback)).toEqual(fallback);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   The hard constraint
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the harness never writes a threshold', () => {
  it('leaves every value in thresholds.ts exactly as it found it, after a full run', async () => {
    // The whole point of the harness is that it produces analysis a human reads. If running it
    // could change a threshold, the "thresholds come from collected data" rule would be gone.
    //
    // Until 2026-09-10 this asserted every new-battery threshold was still null. One of them —
    // GO_NO_GO_SLOWER_MS — now carries a value a HUMAN set from collected data, so the honest
    // assertion is "a run changes nothing", plus null-ness for the ones nobody has data for.
    const thresholds = await import('../engine/thresholds');
    const before = { ...thresholds };

    generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations: { goNoGoMedianMs: 60 },
      pairs: 100,
      seed: 2,
    });

    expect({ ...thresholds }).toEqual(before);

    // The measurements with no collected data behind them stay null.
    expect(thresholds.GO_NO_GO_MORE_COMMISSION_ERRORS).toBeNull();
    expect(thresholds.GO_NO_GO_MORE_OMISSION_ERRORS).toBeNull();
    expect(thresholds.DIGIT_SPAN_FEWER_CORRECT).toBeNull();
    expect(thresholds.PATTERN_SPAN_FEWER_CORRECT).toBeNull();
    expect(thresholds.WORD_LEARNING_FEWER_CORRECT).toBeNull();
    expect(thresholds.WORD_LEARNING_MORE_FALSE_ALARMS).toBeNull();
    expect(thresholds.WORD_RECOGNITION_FEWER_CORRECT).toBeNull();
    expect(thresholds.WORD_RECOGNITION_MORE_FALSE_ALARMS).toBeNull();
  });

  it('generates simulated data marked as simulated, never as a real form', async () => {
    const { GO_NO_FORMS } = await import('../forms');
    const realIds = GO_NO_FORMS.map((form) => form.id);
    expect(realIds).not.toContain(SIMULATED_FORM_ID);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   Found by the branch review
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the sweep range survives a large run', () => {
  it('picks candidates without spreading every sample into a call', () => {
    // What this guards: the sweep range used to be `Math.max(...worsenings)`, which puts one
    // stack slot per sample and throws RangeError on a large enough array. On this Node build
    // the limit is around 125,000, so at the page's 50,000-pair cap it was not failing — it was
    // within about 2.5x of a limit that varies by engine and by the stack a browser hands the
    // tab. This test runs a large sample set so the loop version stays a loop.
    const samples = generateSamples({
      profiles: PLACEHOLDER_PROFILES,
      degradations: {},
      pairs: 30_000,
      seed: 1,
    });

    expect(samples.healthy.length).toBe(30_000);
    const candidates = defaultThresholdCandidates(samples, 'goNoGoMedianMs');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((value) => Number.isFinite(value))).toBe(true);
  });

  it('falls back to a plain range when nobody got worse', () => {
    const empty = {
      healthy: [],
      impaired: [],
      refusedByEngine: 0,
      crossCheckDisagreements: 0,
      seed: 1,
    };
    const candidates = defaultThresholdCandidates(empty, 'goNoGoMedianMs');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toBeGreaterThan(0);
  });
});
