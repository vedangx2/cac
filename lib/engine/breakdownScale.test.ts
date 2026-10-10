// lib/engine/breakdownScale.test.ts
//
// The comparison bars use FIXED scales (ComparisonRow.scaleMax), so one error cannot fill a bar
// and a 1-to-1 result cannot look maxed out. These tests pin the scale each row carries, and
// that it does not move with the data.

import { describe, expect, it } from 'vitest';
import type { ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import {
  DIGIT_TRIALS_PER_FORM,
  GO_NO_FORMS,
  GO_NO_NOGO_PER_FORM,
  GO_NO_TRIALS_PER_FORM,
  PATTERN_TRIALS_PER_FORM,
  RECOGNITION_GRID_SIZE,
  WORDS_PER_FORM,
} from '../forms';
import {
  GO_NO_GO_GO_TRIALS,
  GO_NO_GO_STOP_TRIALS,
  RESPONSE_TIME_BAR_MAX_MS,
  WORD_DISTRACTORS_PER_GRID,
  buildBreakdown,
} from './breakdown';

function result(kind: 'baseline' | 'check', commission: number, omission: number, falseAlarms: number): TestResult {
  const scores: ModuleScores = {
    symptom: { itemScores: [], total: 0 },
    wordLearning: { formId: 'w', hits: 10, falseAlarms, correct: 10 },
    wordRecognition: { formId: 'w', hits: 10, falseAlarms, correct: 10 },
    digitSpan: { formId: 'd', trialsCorrect: [], correct: 5 },
    patternSpan: { formId: 'p', trialsCorrect: [], correct: 5 },
    goNoGo: { formId: 'g', medianMs: 331, commissionErrors: commission, omissionErrors: omission },
    balance: null,
  };
  return {
    id: kind,
    athleteId: 'a',
    takenAt: kind === 'baseline' ? 1 : 2,
    kind,
    scores,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

const byLabel = (rows: ReturnType<typeof buildBreakdown>, part: string) => {
  const row = rows.find((r) => r.label.includes(part));
  if (!row) throw new Error(`no row containing "${part}"`);
  return row;
};

describe('fixed scales on the comparison rows', () => {
  const rows = buildBreakdown(result('baseline', 1, 0, 1), result('check', 1, 0, 1));

  it('words wrongly claimed: out of the distractors in the grid', () => {
    expect(WORD_DISTRACTORS_PER_GRID).toBe(RECOGNITION_GRID_SIZE - WORDS_PER_FORM);
    expect(byLabel(rows, 'immediate: words wrongly claimed').scaleMax).toBe(WORD_DISTRACTORS_PER_GRID);
    expect(byLabel(rows, 'delayed: words wrongly claimed').scaleMax).toBe(WORD_DISTRACTORS_PER_GRID);
  });

  it('stop-signal responses: out of the no-go trials in the form', () => {
    expect(byLabel(rows, 'responded on a stop signal').scaleMax).toBe(GO_NO_NOGO_PER_FORM);
  });

  it('missed go signals: out of the go trials in the form', () => {
    expect(byLabel(rows, 'missed a go signal').scaleMax).toBe(GO_NO_TRIALS_PER_FORM - GO_NO_NOGO_PER_FORM);
  });

  it('every go/no-go form agrees on those counts, so the scale is true for any form', () => {
    for (const form of GO_NO_FORMS) {
      expect(form.trials.filter((t) => t === 'nogo')).toHaveLength(GO_NO_GO_STOP_TRIALS);
      expect(form.trials.filter((t) => t === 'go')).toHaveLength(GO_NO_GO_GO_TRIALS);
    }
  });

  it('response time: a fixed 0 to RESPONSE_TIME_BAR_MAX_MS range', () => {
    expect(byLabel(rows, 'response time').scaleMax).toBe(RESPONSE_TIME_BAR_MAX_MS);
  });

  it('scores that already have a maximum keep it', () => {
    expect(byLabel(rows, 'Symptom').scaleMax).toBe(30);
    expect(byLabel(rows, 'Word learning, immediate (out of').scaleMax).toBe(RECOGNITION_GRID_SIZE);
    expect(byLabel(rows, 'Word recall, delayed (out of').scaleMax).toBe(RECOGNITION_GRID_SIZE);
    expect(byLabel(rows, 'Numbers backwards').scaleMax).toBe(DIGIT_TRIALS_PER_FORM);
    expect(byLabel(rows, 'Tapped patterns').scaleMax).toBe(PATTERN_TRIALS_PER_FORM);
  });

  it('does not move with the data: a different result gives the same scales', () => {
    const other = buildBreakdown(result('baseline', 0, 3, 4), result('check', 6, 9, 9));
    expect(other.map((r) => r.scaleMax)).toEqual(rows.map((r) => r.scaleMax));
  });

  it('keeps every count within its scale, so no valid result is clipped', () => {
    for (const row of buildBreakdown(result('baseline', 8, 22, 10), result('check', 8, 22, 10))) {
      if (row.scaleMax === null) continue;
      expect(row.baselineValue ?? 0).toBeLessThanOrEqual(row.scaleMax);
      expect(row.checkValue ?? 0).toBeLessThanOrEqual(row.scaleMax);
    }
  });
});
