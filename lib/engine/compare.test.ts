// lib/engine/compare.test.ts
//
// Tests for the comparison engine.
//
// Note that every expectation below is written in terms of the threshold CONSTANTS, never
// literal numbers like 50 or 4000. If we retune a threshold in thresholds.ts, these tests
// keep testing the right behaviour instead of failing for the wrong reason — and it means a
// test can never quietly disagree with the app about where the line is.

import { describe, expect, it } from 'vitest';
import type { ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { InvalidComparisonError, MissingBaselineError, compareToBaseline } from './compare';
import { buildBreakdown } from './breakdown';
import {
  REACTION_SLOWER_MS,
  SCAN_EXTRA_ERRORS,
  SCAN_SLOWER_MS,
  SYMPTOM_INCREASE,
} from './thresholds';

/* ── Test data helpers ───────────────────────────────────────────────────────────── */

const ATHLETE = 'athlete-1';

// A baseline is always recorded BEFORE the check it is compared against — the engine now
// enforces that — so the fixtures use two fixed timestamps a week apart.
const BASELINE_TIME = 1_700_000_000_000;
const CHECK_TIME = BASELINE_TIME + 7 * 24 * 60 * 60 * 1000;

function scores(partial: Partial<ModuleScores> = {}): ModuleScores {
  return {
    symptom: partial.symptom ?? null,
    reaction: partial.reaction ?? null,
    scan: partial.scan ?? null,
    balance: partial.balance ?? null,
  };
}

function sitting(
  kind: 'baseline' | 'check',
  moduleScores: ModuleScores,
  athleteId: string = ATHLETE,
  takenAt: number = kind === 'baseline' ? BASELINE_TIME : CHECK_TIME,
): TestResult {
  return {
    id: `${kind}-${Math.random()}`,
    athleteId,
    takenAt,
    kind,
    scores: moduleScores,
    // Both sittings in every test below are written under the current shape. Mismatched
    // versions are a separate concern with their own tests — see lib/schema.test.ts and the
    // version-guard tests — and are deliberately not mixed into the comparison tests here.
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/** A complete, unremarkable baseline to compare things against. */
function healthyBaseline(): TestResult {
  return sitting(
    'baseline',
    scores({
      reaction: { trialsMs: [300, 310, 320, 305, 315], medianMs: 310, falseStarts: 0 },
      scan: { elapsedMs: 20_000, errors: 1 },
      symptom: { itemScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0 },
    }),
  );
}

/** A check identical to the baseline — nothing has moved. */
function unchangedCheck(): TestResult {
  return sitting(
    'check',
    scores({
      reaction: { trialsMs: [300, 310, 320, 305, 315], medianMs: 310, falseStarts: 0 },
      scan: { elapsedMs: 20_000, errors: 1 },
      symptom: { itemScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0 },
    }),
  );
}

/* ── 1. Nothing changed ──────────────────────────────────────────────────────────── */

describe('when nothing has changed', () => {
  it('does not flag', () => {
    const outcome = compareToBaseline(healthyBaseline(), unchangedCheck());

    expect(outcome.flagged).toBe(false);
    expect(outcome.modules).toEqual({
      reaction: false,
      scan: false,
      symptom: false,
      balance: false,
    });
  });

  it('still explains every module, so the screen is never blank', () => {
    const outcome = compareToBaseline(healthyBaseline(), unchangedCheck());
    expect(outcome.explanations.length).toBeGreaterThanOrEqual(3);
    for (const line of outcome.explanations) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('does not flag when the athlete actually did better', () => {
    const check = sitting(
      'check',
      scores({
        reaction: { trialsMs: [280, 290, 285, 288, 284], medianMs: 285, falseStarts: 0 },
        scan: { elapsedMs: 15_000, errors: 0 },
        symptom: { itemScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0 },
      }),
    );

    expect(compareToBaseline(healthyBaseline(), check).flagged).toBe(false);
  });
});

/* ── 2. One module flags ─────────────────────────────────────────────────────────── */

describe('when a single module crosses its threshold', () => {
  it('flags reaction time only', () => {
    const check = unchangedCheck();
    check.scores.reaction = {
      trialsMs: [360, 370, 365, 362, 368],
      medianMs: 310 + REACTION_SLOWER_MS,
      falseStarts: 0,
    };

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.reaction).toBe(true);
    expect(outcome.modules.scan).toBe(false);
    expect(outcome.modules.symptom).toBe(false);
  });

  it('flags the scan on time alone', () => {
    const check = unchangedCheck();
    check.scores.scan = { elapsedMs: 20_000 + SCAN_SLOWER_MS, errors: 1 };

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.scan).toBe(true);
    expect(outcome.modules.reaction).toBe(false);
  });

  it('flags the scan on extra mistakes alone, even when the time improved', () => {
    const check = unchangedCheck();
    check.scores.scan = { elapsedMs: 12_000, errors: 1 + SCAN_EXTRA_ERRORS };

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.scan).toBe(true);
  });

  it('flags symptoms only', () => {
    const check = unchangedCheck();
    check.scores.symptom = { itemScores: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0], total: SYMPTOM_INCREASE };

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.symptom).toBe(true);
    expect(outcome.modules.reaction).toBe(false);
  });
});

/* ── 3. Threshold boundaries ─────────────────────────────────────────────────────── */

describe('exactly at the threshold', () => {
  it('flags when the change equals the threshold (the rule is "or more")', () => {
    const check = unchangedCheck();
    check.scores.reaction = {
      trialsMs: [],
      medianMs: 310 + REACTION_SLOWER_MS,
      falseStarts: 0,
    };

    expect(compareToBaseline(healthyBaseline(), check).modules.reaction).toBe(true);
  });

  it('does not flag one unit below the threshold', () => {
    const check = unchangedCheck();
    check.scores.reaction = {
      trialsMs: [],
      medianMs: 310 + REACTION_SLOWER_MS - 1,
      falseStarts: 0,
    };

    expect(compareToBaseline(healthyBaseline(), check).modules.reaction).toBe(false);
  });
});

/* ── 4. Several modules flag ─────────────────────────────────────────────────────── */

describe('when several modules cross their thresholds', () => {
  it('flags all of them and reports flagged overall', () => {
    const check = sitting(
      'check',
      scores({
        reaction: { trialsMs: [], medianMs: 310 + REACTION_SLOWER_MS + 30, falseStarts: 2 },
        scan: { elapsedMs: 20_000 + SCAN_SLOWER_MS + 1000, errors: 1 + SCAN_EXTRA_ERRORS },
        symptom: { itemScores: [3, 3, 3, 2, 1, 0, 0, 0, 0, 0], total: SYMPTOM_INCREASE + 7 },
      }),
    );

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.reaction).toBe(true);
    expect(outcome.modules.scan).toBe(true);
    expect(outcome.modules.symptom).toBe(true);
  });
});

/* ── 5. Missing modules ──────────────────────────────────────────────────────────── */

describe('when a module is missing', () => {
  it('skips a module the check did not record, and says so', () => {
    const check = unchangedCheck();
    check.scores.reaction = null;

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.modules.reaction).toBe(false);
    expect(outcome.explanations.some((line) => line.includes('could not be compared'))).toBe(true);
  });

  it('skips a module the baseline never had', () => {
    const baseline = healthyBaseline();
    baseline.scores.scan = null;

    const outcome = compareToBaseline(baseline, unchangedCheck());

    expect(outcome.modules.scan).toBe(false);
    expect(outcome.explanations.some((line) => line.includes('number scan'))).toBe(true);
  });

  it('still flags the modules it CAN compare when another is missing', () => {
    const check = unchangedCheck();
    check.scores.reaction = null;
    check.scores.symptom = { itemScores: [], total: SYMPTOM_INCREASE };

    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.symptom).toBe(true);
    expect(outcome.modules.reaction).toBe(false);
  });

  it('does not flag when nothing at all could be compared, but explains why', () => {
    // This is the dangerous case: no flag here must never read as "all clear". The engine's
    // job is to be honest that it compared nothing; the results screen is what has to say so
    // loudly, which is why it checks whether any row was actually compared.
    const baseline = sitting('baseline', scores());
    const check = sitting('check', scores());

    const outcome = compareToBaseline(baseline, check);

    expect(outcome.flagged).toBe(false);
    expect(outcome.explanations.every((line) => line.includes('could not be compared'))).toBe(true);
  });
});

/* ── 6. No baseline on file — must ERROR, never pass ─────────────────────────────── */

describe('when there is no baseline on file', () => {
  it('throws rather than returning a comfortable-looking "no flag"', () => {
    expect(() => compareToBaseline(null, unchangedCheck())).toThrow(MissingBaselineError);
  });

  it('throws for undefined too', () => {
    expect(() => compareToBaseline(undefined, unchangedCheck())).toThrow(MissingBaselineError);
  });

  it('gives a message a non-programmer can act on', () => {
    expect(() => compareToBaseline(null, unchangedCheck())).toThrow(/no baseline on file/i);
  });
});

/* ── 7. Comparisons that must be refused ─────────────────────────────────────────── */

describe('comparisons that are not legitimate', () => {
  it('refuses to compare two different athletes', () => {
    const baseline = healthyBaseline();
    const check = sitting('check', unchangedCheck().scores, 'someone-else');

    expect(() => compareToBaseline(baseline, check)).toThrow(InvalidComparisonError);
    expect(() => compareToBaseline(baseline, check)).toThrow(/different athletes/i);
  });

  it('refuses to treat a sideline check as if it were a baseline', () => {
    const notABaseline = sitting('check', healthyBaseline().scores, ATHLETE, BASELINE_TIME);

    expect(() => compareToBaseline(notABaseline, unchangedCheck())).toThrow(InvalidComparisonError);
  });

  /*
    The dangerous one. A coach checks an athlete who has no baseline, gets the "no baseline"
    error, and records a baseline right there — on the athlete who may already be concussed.
    Re-opening the earlier check would then compare an impaired athlete against himself
    impaired, find almost no difference, and render the most reassuring screen in the app.
    The engine has to refuse.
  */
  it('refuses a baseline recorded AFTER the check it would be compared against', () => {
    const check = sitting('check', unchangedCheck().scores, ATHLETE, CHECK_TIME);
    const baselineTakenLater = sitting(
      'baseline',
      healthyBaseline().scores,
      ATHLETE,
      CHECK_TIME + 60_000, // recorded a minute after the hit
    );

    expect(() => compareToBaseline(baselineTakenLater, check)).toThrow(InvalidComparisonError);
    expect(() => compareToBaseline(baselineTakenLater, check)).toThrow(/before the hit/i);
  });

  it('refuses a baseline recorded at the same moment as the check', () => {
    const check = sitting('check', unchangedCheck().scores, ATHLETE, CHECK_TIME);
    const sameMoment = sitting('baseline', healthyBaseline().scores, ATHLETE, CHECK_TIME);

    expect(() => compareToBaseline(sameMoment, check)).toThrow(InvalidComparisonError);
  });

  it('still accepts a baseline recorded even one millisecond before the check', () => {
    const check = sitting('check', unchangedCheck().scores, ATHLETE, CHECK_TIME);
    const justBefore = sitting('baseline', healthyBaseline().scores, ATHLETE, CHECK_TIME - 1);

    expect(() => compareToBaseline(justBefore, check)).not.toThrow();
  });

  it('never turns a flagged result into a reassuring one via a later baseline', () => {
    // Same impaired athlete measured twice. If the engine allowed this, the two sittings
    // would look almost identical and it would report "no significant change".
    const impaired = () =>
      scores({
        reaction: { trialsMs: [], medianMs: 480, falseStarts: 0 },
        scan: { elapsedMs: 34_000, errors: 5 },
        symptom: { itemScores: [], total: 14 },
      });

    const check = sitting('check', impaired(), ATHLETE, CHECK_TIME);
    const postImpactBaseline = sitting('baseline', impaired(), ATHLETE, CHECK_TIME + 120_000);

    // It must throw rather than return { flagged: false }.
    expect(() => compareToBaseline(postImpactBaseline, check)).toThrow(InvalidComparisonError);
  });
});

/* ── 8. The table and the headline must never disagree ───────────────────────────── */

describe('breakdown rows stay consistent with the engine verdict', () => {
  const cases: { name: string; check: () => TestResult }[] = [
    { name: 'unchanged', check: unchangedCheck },
    {
      name: 'reaction flagged',
      check: () => {
        const c = unchangedCheck();
        c.scores.reaction = { trialsMs: [], medianMs: 310 + REACTION_SLOWER_MS, falseStarts: 0 };
        return c;
      },
    },
    {
      name: 'scan errors flagged',
      check: () => {
        const c = unchangedCheck();
        c.scores.scan = { elapsedMs: 19_000, errors: 1 + SCAN_EXTRA_ERRORS };
        return c;
      },
    },
    {
      name: 'symptoms flagged',
      check: () => {
        const c = unchangedCheck();
        c.scores.symptom = { itemScores: [], total: SYMPTOM_INCREASE + 2 };
        return c;
      },
    },
    {
      name: 'module missing',
      check: () => {
        const c = unchangedCheck();
        c.scores.scan = null;
        return c;
      },
    },
  ];

  for (const testCase of cases) {
    it(`agrees for: ${testCase.name}`, () => {
      const baseline = healthyBaseline();
      const check = testCase.check();

      const outcome = compareToBaseline(baseline, check);
      const rows = buildBreakdown(baseline, check);

      for (const moduleName of ['reaction', 'scan', 'symptom'] as const) {
        const anyRowFlagged = rows
          .filter((row) => row.module === moduleName)
          .some((row) => row.flagged);

        expect(anyRowFlagged).toBe(outcome.modules[moduleName]);
      }
    });
  }
});
