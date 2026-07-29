// lib/engine/pinning.test.ts
//
// Tests for baseline PINNING (Task 1): a check must always be scored against the baseline that
// was on file when it was recorded, not against whatever the athlete's current baseline happens
// to be when the result is later opened.
//
// The choice of "which baseline" is made by resolveComparedBaselineId(); the results screen then
// loads that baseline and hands it to compareToBaseline(). These tests exercise that pair the
// same way the screen does — with a tiny in-memory store standing in for IndexedDB — so they
// cover the real decision, not a reimplementation of it.
//
// As in compare.test.ts, thresholds are referenced as constants, never as literal numbers.

import { describe, expect, it } from 'vitest';
import type { Athlete, ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { InvalidComparisonError, compareToBaseline } from './compare';
import { resolveComparedBaselineId } from './resolveBaseline';
import { SYMPTOM_INCREASE } from './thresholds';

/* ── Fixtures ─────────────────────────────────────────────────────────────────────── */

const ATHLETE = 'athlete-1';
const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function scores(partial: Partial<ModuleScores> = {}): ModuleScores {
  return {
    symptom: partial.symptom ?? null,
    wordLearning: partial.wordLearning ?? null,
    wordRecognition: partial.wordRecognition ?? null,
    digitSpan: partial.digitSpan ?? null,
    patternSpan: partial.patternSpan ?? null,
    goNoGo: partial.goNoGo ?? null,
    balance: partial.balance ?? null,
  };
}

/**
 * A symptom module with a given total, which is the one number these tests vary.
 *
 * WHY SYMPTOM: this file is about WHICH baseline a check resolves to, not about any particular
 * measurement — it just needs one number that can differ between two sittings enough to change
 * the verdict. The reaction module it used to use was deleted with the battery rewrite, and
 * symptom is the natural replacement because it is currently the only module with a real
 * threshold, so a difference in it actually flips flagged/not-flagged. A null-threshold module
 * would leave every comparison unevaluated and these tests would stop distinguishing anything.
 */
function symptom(total: number): NonNullable<ModuleScores['symptom']> {
  // itemScores is left empty on purpose: nothing in this file reads the per-item detail, and
  // inventing ten numbers that happen to add up would only invite someone to read meaning into
  // them. The engine compares on `total`.
  return { itemScores: [], total };
}

/**
 * A baseline symptom total high enough that a LOWER later baseline can flip the verdict.
 *
 * Expressed in terms of the threshold rather than as a bare number, like every other test in this
 * project, so retuning SYMPTOM_INCREASE cannot silently make these tests meaningless.
 */
const BASE_TOTAL = SYMPTOM_INCREASE + 1;

function baselineSitting(id: string, takenAt: number, symptomTotal: number): TestResult {
  return {
    id,
    athleteId: ATHLETE,
    takenAt,
    kind: 'baseline',
    scores: scores({ symptom: symptom(symptomTotal) }),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function checkSitting(
  id: string,
  takenAt: number,
  symptomTotal: number,
  comparedToBaselineId?: string,
): TestResult {
  return {
    id,
    athleteId: ATHLETE,
    takenAt,
    kind: 'check',
    scores: scores({ symptom: symptom(symptomTotal) }),
    comparedToBaselineId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Mirror of what the results screen does: pick the baseline id, then load that baseline from
 * storage. `store` stands in for IndexedDB.
 */
function resolveBaseline(
  check: TestResult,
  athlete: Athlete | null,
  store: Map<string, TestResult>,
): TestResult | null {
  const id = resolveComparedBaselineId(check, athlete);
  return id ? (store.get(id) ?? null) : null;
}

function athlete(baselineId: string | null): Athlete {
  return { id: ATHLETE, name: 'Jordan', baselineId, checkIds: [] };
}

/* ── 1. resolveComparedBaselineId: the rule, in isolation ─────────────────────────── */

describe('resolveComparedBaselineId', () => {
  it('uses the pinned baseline, even when the athlete has since moved to a different one', () => {
    expect(resolveComparedBaselineId({ comparedToBaselineId: 'b1' }, { baselineId: 'b2' })).toBe('b1');
  });

  it('falls back to the athlete current baseline for a legacy check with no pin', () => {
    expect(resolveComparedBaselineId({ comparedToBaselineId: undefined }, { baselineId: 'b2' })).toBe('b2');
    // An object that never had the key at all behaves identically to an explicit undefined.
    expect(resolveComparedBaselineId({}, { baselineId: 'b2' })).toBe('b2');
  });

  it('honours the pin even if the athlete could not be loaded', () => {
    expect(resolveComparedBaselineId({ comparedToBaselineId: 'b1' }, null)).toBe('b1');
  });

  it('honours the pin even if the athlete currently has no baseline on file', () => {
    expect(resolveComparedBaselineId({ comparedToBaselineId: 'b1' }, { baselineId: null })).toBe('b1');
  });

  it('returns null when there is neither a pin nor a current baseline', () => {
    expect(resolveComparedBaselineId({}, { baselineId: null })).toBeNull();
    expect(resolveComparedBaselineId({}, null)).toBeNull();
  });
});

/* ── 2. Pinned wins over current (outcome level) ──────────────────────────────────── */

describe('a pinned baseline is used instead of the athlete current one', () => {
  it('scores the check against its pin, which can give a different verdict than the current baseline', () => {
    const b1 = baselineSitting('b1', T0, BASE_TOTAL); // the baseline on file when the check ran
    // A later baseline recorded with FEWER symptoms — a "healthier" reference.
    const b2 = baselineSitting('b2', T0 + DAY, BASE_TOTAL - SYMPTOM_INCREASE - 1);
    const check = checkSitting('c1', T0 + 7 * DAY, BASE_TOTAL, 'b1'); // pinned to b1
    const store = new Map<string, TestResult>([
      ['b1', b1],
      ['b2', b2],
      ['c1', check],
    ]);

    // Athlete's CURRENT baseline is now b2, but the check is pinned to b1.
    const resolved = resolveBaseline(check, athlete('b2'), store);
    expect(resolved?.id).toBe('b1');

    // Against its pin (b1) the symptom total is unchanged, so nothing flags...
    expect(compareToBaseline(resolved, check).flagged).toBe(false);

    // ...whereas against the current baseline (b2, a lower-symptom reference) the very same check
    // would have crossed the symptom threshold. Pinning is what keeps the verdict stable here.
    expect(compareToBaseline(b2, check).flagged).toBe(true);
  });
});

/* ── 3. Legacy checks fall back to the current baseline ───────────────────────────── */

describe('a legacy check with no pin', () => {
  it('is scored against the athlete current baseline, exactly as before', () => {
    const b2 = baselineSitting('b2', T0 + DAY, BASE_TOTAL - SYMPTOM_INCREASE - 1);
    const legacyCheck = checkSitting('c-legacy', T0 + 7 * DAY, BASE_TOTAL); // no comparedToBaselineId
    const store = new Map<string, TestResult>([
      ['b2', b2],
      ['c-legacy', legacyCheck],
    ]);

    const resolved = resolveBaseline(legacyCheck, athlete('b2'), store);
    expect(resolved?.id).toBe('b2');
    // It compares (and here flags) against the current baseline — never crashes, never silently
    // rescored into nothing.
    expect(compareToBaseline(resolved, legacyCheck).flagged).toBe(true);
  });
});

/* ── 4. Re-baselining does not change an old check's outcome ──────────────────────── */

describe('recording a new baseline later', () => {
  it('leaves a previously-recorded pinned check scoring exactly as it did before', () => {
    const b1 = baselineSitting('b1', T0, BASE_TOTAL);
    const check = checkSitting('c1', T0 + 7 * DAY, BASE_TOTAL, 'b1'); // unchanged vs b1 → no flag
    const store = new Map<string, TestResult>([
      ['b1', b1],
      ['c1', check],
    ]);

    // Before re-baselining: current baseline is b1.
    const before = compareToBaseline(resolveBaseline(check, athlete('b1'), store), check);
    expect(before.flagged).toBe(false);

    // Re-baseline: record b2 AFTER the check, and point the athlete at it. The old b1 record is
    // NOT removed from storage (finishSession only moves the pointer), so the pin can still load.
    const b2 = baselineSitting('b2', T0 + 14 * DAY, 0);
    store.set('b2', b2);
    const reBaselined = athlete('b2');

    // After re-baselining: the pinned check still resolves b1 and still gets the same verdict.
    const resolvedAfter = resolveBaseline(check, reBaselined, store);
    expect(resolvedAfter?.id).toBe('b1');
    const after = compareToBaseline(resolvedAfter, check);
    expect(after).toEqual(before);
    expect(after.flagged).toBe(false);
  });

  it('would instead break an UN-pinned copy of the same check — the exact failure pinning prevents', () => {
    // A legacy (un-pinned) check, after the same re-baselining, resolves to the NEW baseline b2,
    // which was recorded AFTER the check. The engine's ordering guard then refuses the comparison
    // outright — so the old result stops opening. Pinning is precisely what avoids this.
    const check = checkSitting('c-legacy', T0 + 7 * DAY, BASE_TOTAL); // no pin
    const b2 = baselineSitting('b2', T0 + 14 * DAY, 0); // recorded after the check
    const store = new Map<string, TestResult>([
      ['b2', b2],
      ['c-legacy', check],
    ]);

    const resolved = resolveBaseline(check, athlete('b2'), store);
    expect(resolved?.id).toBe('b2');
    expect(() => compareToBaseline(resolved, check)).toThrow(InvalidComparisonError);
  });
});
