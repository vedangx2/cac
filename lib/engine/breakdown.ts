// lib/engine/breakdown.ts
//
// The per-measurement table the results screen shows underneath the headline: for each thing we
// measured, what the baseline was, what the check was, how big the change is, and which
// threshold we applied.
//
// WHY THIS IS A SEPARATE FILE FROM compare.ts:
// FlagOutcome is the engine's verdict — flagged, which modules, the sentences, and which
// measurements went unjudged. The results screen needs more than that to draw a table, and
// bolting presentation fields onto the verdict would muddle the two. So the verdict and the
// table are produced separately from the same two TestResults and the same thresholds.
//
// The risk in having two files read the same thresholds is that they drift apart and the table
// disagrees with the headline. compare.test.ts compares the two outputs on the same inputs
// specifically to catch that, and both files get their direction from direction.ts so neither
// can decide on its own which way "worse" runs.

import type { TestResult } from '../types';
import { DIGIT_TRIALS_PER_FORM, PATTERN_TRIALS_PER_FORM, RECOGNITION_GRID_SIZE } from '../forms';
import {
  BALANCE_SWAY_INCREASE,
  DIGIT_SPAN_FEWER_CORRECT,
  GO_NO_GO_MORE_COMMISSION_ERRORS,
  GO_NO_GO_MORE_OMISSION_ERRORS,
  GO_NO_GO_SLOWER_MS,
  PATTERN_SPAN_FEWER_CORRECT,
  SYMPTOM_INCREASE,
  WORD_LEARNING_FEWER_CORRECT,
  WORD_LEARNING_MORE_FALSE_ALARMS,
  WORD_RECOGNITION_FEWER_CORRECT,
  WORD_RECOGNITION_MORE_FALSE_ALARMS,
} from './thresholds';
import { type ChangeWords, type MeasurementKey, worseningFor } from './direction';
import { msText as ms, pointsText as points } from './units';

/** Which module a row belongs to. Some modules contribute more than one row. */
export type BreakdownModule =
  | 'symptom'
  | 'wordLearning'
  | 'wordRecognition'
  | 'digitSpan'
  | 'patternSpan'
  | 'goNoGo'
  | 'balance';

export type ComparisonRow = {
  module: BreakdownModule;
  label: string;
  baselineText: string;
  checkText: string;
  /** e.g. "3 fewer correct", "No change", "Not compared". */
  differenceText: string;
  /** The rule applied, in words. e.g. "Flags at 5 points higher or more". */
  thresholdText: string;
  flagged: boolean;
  /** False when the measurement is missing from either sitting. */
  compared: boolean;
  /**
   * True when the measurement WAS compared but no threshold exists to judge it.
   *
   * The results screen must render this differently from both a flagged row and a quiet row.
   * A row showing a real change with a blank verdict column, styled like every other calm row,
   * would read as "checked, fine" — which is the opposite of what it means.
   */
  unevaluated: boolean;
};

/** One row's worth of declaration. The table below is the only place these are written down. */
type RowSpec = {
  module: BreakdownModule;
  measurement: MeasurementKey;
  label: string;
  threshold: number | null;
  baselineValue: number | null;
  checkValue: number | null;
  format: (value: number) => string;
  formatChange: (magnitude: number) => string;
  words: ChangeWords;
  /** Omit the row entirely when the measurement is absent from both sittings. */
  hideWhenAbsent?: boolean;
};

const count = (value: number) => String(value);
const outOf = (total: number) => (value: number) => `${value} out of ${total}`;

/**
 * Build the table rows. Assumes the two results have already been validated by
 * compareToBaseline (same athlete, real baseline, matching schema version) — the results screen
 * calls that first.
 */
export function buildBreakdown(baseline: TestResult, check: TestResult): ComparisonRow[] {
  const specs: RowSpec[] = [
    {
      module: 'symptom',
      measurement: 'symptomTotal',
      label: 'Symptom score (out of 30)',
      threshold: SYMPTOM_INCREASE,
      baselineValue: baseline.scores.symptom?.total ?? null,
      checkValue: check.scores.symptom?.total ?? null,
      format: outOf(30),
      formatChange: points,
      words: { worse: 'higher', better: 'lower' },
    },
    {
      module: 'wordLearning',
      measurement: 'wordLearningCorrect',
      label: `Word learning, immediate (out of ${RECOGNITION_GRID_SIZE})`,
      threshold: WORD_LEARNING_FEWER_CORRECT,
      baselineValue: baseline.scores.wordLearning?.correct ?? null,
      checkValue: check.scores.wordLearning?.correct ?? null,
      format: outOf(RECOGNITION_GRID_SIZE),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'wordLearning',
      measurement: 'wordLearningFalseAlarms',
      label: 'Word learning, immediate — words wrongly claimed',
      threshold: WORD_LEARNING_MORE_FALSE_ALARMS,
      baselineValue: baseline.scores.wordLearning?.falseAlarms ?? null,
      checkValue: check.scores.wordLearning?.falseAlarms ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
    },
    {
      module: 'wordRecognition',
      measurement: 'wordRecognitionCorrect',
      label: `Word recall, delayed (out of ${RECOGNITION_GRID_SIZE})`,
      threshold: WORD_RECOGNITION_FEWER_CORRECT,
      baselineValue: baseline.scores.wordRecognition?.correct ?? null,
      checkValue: check.scores.wordRecognition?.correct ?? null,
      format: outOf(RECOGNITION_GRID_SIZE),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'wordRecognition',
      measurement: 'wordRecognitionFalseAlarms',
      label: 'Word recall, delayed — words wrongly claimed',
      threshold: WORD_RECOGNITION_MORE_FALSE_ALARMS,
      baselineValue: baseline.scores.wordRecognition?.falseAlarms ?? null,
      checkValue: check.scores.wordRecognition?.falseAlarms ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
    },
    {
      module: 'digitSpan',
      measurement: 'digitSpanCorrect',
      label: `Numbers backwards (out of ${DIGIT_TRIALS_PER_FORM})`,
      threshold: DIGIT_SPAN_FEWER_CORRECT,
      baselineValue: baseline.scores.digitSpan?.correct ?? null,
      checkValue: check.scores.digitSpan?.correct ?? null,
      format: outOf(DIGIT_TRIALS_PER_FORM),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'patternSpan',
      measurement: 'patternSpanCorrect',
      label: `Tapped patterns (out of ${PATTERN_TRIALS_PER_FORM})`,
      threshold: PATTERN_SPAN_FEWER_CORRECT,
      baselineValue: baseline.scores.patternSpan?.correct ?? null,
      checkValue: check.scores.patternSpan?.correct ?? null,
      format: outOf(PATTERN_TRIALS_PER_FORM),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'goNoGo',
      measurement: 'goNoGoMedianMs',
      label: 'Go / no-go — response time',
      threshold: GO_NO_GO_SLOWER_MS,
      baselineValue: baseline.scores.goNoGo?.medianMs ?? null,
      checkValue: check.scores.goNoGo?.medianMs ?? null,
      format: ms,
      formatChange: ms,
      words: { worse: 'slower', better: 'faster' },
      hideWhenAbsent: true,
    },
    {
      module: 'goNoGo',
      measurement: 'goNoGoCommissionErrors',
      label: 'Go / no-go — responded on a stop signal',
      threshold: GO_NO_GO_MORE_COMMISSION_ERRORS,
      baselineValue: baseline.scores.goNoGo?.commissionErrors ?? null,
      checkValue: check.scores.goNoGo?.commissionErrors ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
      hideWhenAbsent: true,
    },
    {
      module: 'goNoGo',
      measurement: 'goNoGoOmissionErrors',
      label: 'Go / no-go — missed a go signal',
      threshold: GO_NO_GO_MORE_OMISSION_ERRORS,
      baselineValue: baseline.scores.goNoGo?.omissionErrors ?? null,
      checkValue: check.scores.goNoGo?.omissionErrors ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
      hideWhenAbsent: true,
    },
    {
      module: 'balance',
      measurement: 'balanceSway',
      label: 'Balance sway',
      threshold: BALANCE_SWAY_INCREASE,
      baselineValue: baseline.scores.balance?.swayScore ?? null,
      checkValue: check.scores.balance?.swayScore ?? null,
      format: (value) => value.toFixed(1),
      formatChange: (magnitude) => magnitude.toFixed(1),
      words: { worse: 'more sway', better: 'less sway' },
      hideWhenAbsent: true,
    },
  ];

  const rows: ComparisonRow[] = [];

  for (const spec of specs) {
    const { baselineValue, checkValue } = spec;
    const absentFromBoth = baselineValue === null && checkValue === null;

    // Modules that do not exist yet would otherwise add an always-empty row to every single
    // result screen, which is clutter rather than information.
    if (absentFromBoth && spec.hideWhenAbsent) continue;

    const thresholdText =
      spec.threshold === null
        ? 'No tested cut-off yet — not judged'
        : `Flags at ${spec.formatChange(spec.threshold)} ${spec.words.worse} or more`;

    if (baselineValue === null || checkValue === null) {
      rows.push({
        module: spec.module,
        label: spec.label,
        baselineText: baselineValue === null ? 'Not recorded' : spec.format(baselineValue),
        checkText: checkValue === null ? 'Not recorded' : spec.format(checkValue),
        differenceText: 'Not compared',
        thresholdText,
        flagged: false,
        compared: false,
        unevaluated: false,
      });
      continue;
    }

    const worsening = worseningFor(spec.measurement, baselineValue, checkValue);

    rows.push({
      module: spec.module,
      label: spec.label,
      baselineText: spec.format(baselineValue),
      checkText: spec.format(checkValue),
      differenceText: describeChange(worsening, spec),
      thresholdText,
      // A null threshold can never flag. It must also never look like a clean pass, which is
      // what `unevaluated` is for.
      flagged: spec.threshold !== null && worsening >= spec.threshold,
      compared: true,
      unevaluated: spec.threshold === null,
    });
  }

  return rows;
}

/** "3 fewer correct" / "62 ms faster" / "No change", given a normalised worsening amount. */
function describeChange(worsening: number, spec: RowSpec): string {
  if (worsening === 0) return 'No change';
  if (worsening > 0) return `${spec.formatChange(worsening)} ${spec.words.worse}`;
  return `${spec.formatChange(Math.abs(worsening))} ${spec.words.better}`;
}
