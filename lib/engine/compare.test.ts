// lib/engine/compare.test.ts
//
// Tests for the comparison engine, rewritten for the new battery.
//
// Note that every expectation below is written in terms of the threshold CONSTANTS, never
// literal numbers like 5. If we retune a threshold in thresholds.ts, these tests keep testing
// the right behaviour instead of failing for the wrong reason — and it means a test can never
// quietly disagree with the app about where the line is.
//
// WHAT LIVES ELSEWHERE:
//   • The four "a baseline must predate the check" guards → ordering.test.ts. They were moved out
//     before this file was rewritten, on purpose, so the rewrite could not weaken a guard and
//     adjust its test to match in the same breath.
//   • Which way each measurement gets worse → direction.test.ts.
//   • Refusing sittings from a different battery version → schemaGuard.test.ts.

import { describe, expect, it } from 'vitest';
import type { ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { DIGIT_TRIALS_PER_FORM, RECOGNITION_GRID_SIZE } from '../forms';
import { InvalidComparisonError, MissingBaselineError, compareToBaseline } from './compare';
import { buildBreakdown } from './breakdown';
import { DIGIT_SPAN_FEWER_CORRECT, SYMPTOM_INCREASE } from './thresholds';

/* ── Test data helpers ───────────────────────────────────────────────────────────── */

const ATHLETE = 'athlete-1';

// A baseline is always recorded BEFORE the check it is compared against — the engine enforces
// that — so the fixtures use two fixed timestamps a week apart.
const BASELINE_TIME = 1_700_000_000_000;
const CHECK_TIME = BASELINE_TIME + 7 * 24 * 60 * 60 * 1000;

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
    // Both sittings are written under the current shape. Mismatched versions are a separate
    // concern with their own tests — see schemaGuard.test.ts.
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

function symptom(total: number): NonNullable<ModuleScores['symptom']> {
  return { itemScores: [], total };
}

function digits(correct: number): NonNullable<ModuleScores['digitSpan']> {
  return {
    formId: 'digits-a',
    trialsCorrect: Array.from({ length: DIGIT_TRIALS_PER_FORM }, (_, i) => i < correct),
    correct,
  };
}

function words(correct: number, falseAlarms = 0): NonNullable<ModuleScores['wordLearning']> {
  return { formId: 'words-a', hits: correct - (RECOGNITION_GRID_SIZE / 2 - falseAlarms), falseAlarms, correct };
}

/** A complete, unremarkable baseline to compare things against. */
function healthyBaseline(): TestResult {
  return sitting('baseline', scores({ symptom: symptom(0), digitSpan: digits(6) }));
}

/** A check identical to the baseline — nothing has moved. */
function unchangedCheck(): TestResult {
  return sitting('check', scores({ symptom: symptom(0), digitSpan: digits(6) }));
}

/* ── 1. Nothing changed ──────────────────────────────────────────────────────────── */

describe('when nothing has changed', () => {
  it('does not flag', () => {
    expect(compareToBaseline(healthyBaseline(), unchangedCheck()).flagged).toBe(false);
  });

  it('sets no module flag', () => {
    const { modules } = compareToBaseline(healthyBaseline(), unchangedCheck());
    expect(Object.values(modules).every((flag) => flag === false)).toBe(true);
  });

  it('still explains what it looked at, rather than going silent', () => {
    const { explanations } = compareToBaseline(healthyBaseline(), unchangedCheck());
    expect(explanations.length).toBeGreaterThan(0);
  });

  it('says nothing that could be read as a clearance', () => {
    const { explanations } = compareToBaseline(healthyBaseline(), unchangedCheck());
    for (const line of explanations) {
      expect(line).not.toMatch(/cleared|healthy|safe|fine|no concussion|normal for/i);
    }
  });
});

/* ── 2. Symptom flagging — the one module with a real threshold ───────────────────── */

describe('the symptom module, which has a real threshold', () => {
  it('flags a rise of exactly the threshold', () => {
    const check = sitting('check', scores({ symptom: symptom(SYMPTOM_INCREASE) }));
    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.flagged).toBe(true);
    expect(outcome.modules.symptom).toBe(true);
  });

  it('does NOT flag one point under the threshold', () => {
    const check = sitting('check', scores({ symptom: symptom(SYMPTOM_INCREASE - 1) }));
    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.modules.symptom).toBe(false);
  });

  it('flags well above the threshold too', () => {
    const check = sitting('check', scores({ symptom: symptom(SYMPTOM_INCREASE + 10) }));
    expect(compareToBaseline(healthyBaseline(), check).modules.symptom).toBe(true);
  });

  it('does not flag when symptoms went DOWN', () => {
    const baseline = sitting('baseline', scores({ symptom: symptom(SYMPTOM_INCREASE + 5) }));
    const check = sitting('check', scores({ symptom: symptom(0) }));

    expect(compareToBaseline(baseline, check).modules.symptom).toBe(false);
  });

  it('describes a rise in the wording, with both values', () => {
    const check = sitting('check', scores({ symptom: symptom(SYMPTOM_INCREASE) }));
    const { explanations } = compareToBaseline(healthyBaseline(), check);
    const line = explanations.find((l) => l.startsWith('The symptom score'));

    expect(line).toMatch(/higher/);
    expect(line).toContain(`${SYMPTOM_INCREASE} out of 30`);
    expect(line).toContain('0 out of 30');
  });
});

/* ── 3. Null thresholds — the safety-critical part of this rewrite ────────────────── */

describe('a measurement with no threshold yet is reported as UNJUDGED, never as fine', () => {
  // Guards the central hazard of shipping a battery whose thresholds are deliberately null. A
  // measurement with no cut-off must not simply fail to set its flag, because that is
  // indistinguishable from having been checked and found unremarkable.

  it('lists the measurement in `unevaluated`', () => {
    const outcome = compareToBaseline(healthyBaseline(), unchangedCheck());

    expect(DIGIT_SPAN_FEWER_CORRECT).toBeNull(); // the premise of this test
    expect(outcome.unevaluated).toContain('Repeating numbers backwards');
  });

  it('does not flag it, because it genuinely has no basis to', () => {
    const collapsed = sitting('check', scores({ symptom: symptom(0), digitSpan: digits(0) }));
    const outcome = compareToBaseline(healthyBaseline(), collapsed);

    expect(outcome.modules.digitSpan).toBe(false);
  });

  it('but STILL reports the size of the change, so it is not invisible', () => {
    // Six correct at baseline, none now — a total collapse. It cannot be judged, but it must not
    // be hidden either. Someone reading the screen has to be able to see it happened.
    const collapsed = sitting('check', scores({ symptom: symptom(0), digitSpan: digits(0) }));
    const { explanations } = compareToBaseline(healthyBaseline(), collapsed);
    const line = explanations.find((l) => l.startsWith('Repeating numbers backwards'));

    expect(line).toContain('6 fewer correct');
    expect(line).toContain('0 out of 9');
    expect(line).toContain('6 out of 9');
  });

  it('says explicitly that it was NOT judged', () => {
    const { explanations } = compareToBaseline(healthyBaseline(), unchangedCheck());
    const line = explanations.find((l) => l.startsWith('Repeating numbers backwards'));

    expect(line).toMatch(/not judged/i);
    expect(line).toMatch(/unread, not as normal/i);
  });

  it('gets the DIRECTION right even though it cannot judge — fewer correct reads as worse', () => {
    // If direction were reversed here, the sentence would tell a parent their child improved.
    const worse = sitting('check', scores({ symptom: symptom(0), digitSpan: digits(2) }));
    const better = sitting('check', scores({ symptom: symptom(0), digitSpan: digits(9) }));

    const worseLine = compareToBaseline(healthyBaseline(), worse).explanations.find((l) =>
      l.startsWith('Repeating numbers backwards'),
    );
    const betterLine = compareToBaseline(healthyBaseline(), better).explanations.find((l) =>
      l.startsWith('Repeating numbers backwards'),
    );

    expect(worseLine).toContain('4 fewer correct');
    expect(betterLine).toContain('3 more correct');
  });

  it('an athlete who collapsed on every unjudged module STILL produces flagged=false', () => {
    /*
      Documenting the current, honest state of the app rather than pretending otherwise.

      With every new threshold null, a dramatic decline across the new modules cannot flag. That
      is why `unevaluated` exists and why the results screen MUST refuse to render the reassuring
      panel while it is non-empty. If someone ever makes the screen ignore that field, this test
      is the written record of why they must not.
    */
    const collapsed = sitting(
      'check',
      scores({
        symptom: symptom(0), // symptom unchanged, so the one real threshold does not fire
        digitSpan: digits(0),
        wordLearning: words(4, 6),
      }),
    );
    const baseline = sitting(
      'baseline',
      scores({ symptom: symptom(0), digitSpan: digits(8), wordLearning: words(19, 0) }),
    );

    const outcome = compareToBaseline(baseline, collapsed);

    expect(outcome.flagged).toBe(false);
    expect(outcome.unevaluated.length).toBeGreaterThan(0);
  });
});

/* ── 4. Missing modules ──────────────────────────────────────────────────────────── */

describe('a module missing from either sitting', () => {
  it('is reported as not compared, never as no change', () => {
    const check = sitting('check', scores({ symptom: symptom(0) })); // no digit span
    const { explanations } = compareToBaseline(healthyBaseline(), check);

    expect(explanations.some((l) => l.includes('not recorded in both sittings'))).toBe(true);
  });

  it('does not flag on the missing module', () => {
    const check = sitting('check', scores({ symptom: symptom(0) }));
    expect(compareToBaseline(healthyBaseline(), check).modules.digitSpan).toBe(false);
  });

  it('is not listed as unevaluated — that means something different', () => {
    // "Not recorded" and "recorded but unjudgeable" are separate states and must not be conflated.
    const check = sitting('check', scores({ symptom: symptom(0) }));
    const outcome = compareToBaseline(healthyBaseline(), check);

    expect(outcome.unevaluated).not.toContain('Repeating numbers backwards');
  });

  it('stays quiet about modules that do not exist yet, rather than nagging every screen', () => {
    // Go/no-go is not built. Saying "go/no-go was not recorded" on every single result would be
    // noise, so it is silent when absent from both sides.
    const { explanations } = compareToBaseline(healthyBaseline(), unchangedCheck());

    expect(explanations.some((l) => l.toLowerCase().includes('go / no-go'))).toBe(false);
  });

  it('still compares the modules that ARE present on both sides', () => {
    const baseline = sitting('baseline', scores({ symptom: symptom(0) }));
    const check = sitting('check', scores({ symptom: symptom(SYMPTOM_INCREASE) }));

    expect(compareToBaseline(baseline, check).modules.symptom).toBe(true);
  });
});

/* ── 5. The must-error cases ─────────────────────────────────────────────────────── */

describe('comparisons the engine must refuse outright', () => {
  it('throws when there is no baseline at all', () => {
    expect(() => compareToBaseline(null, unchangedCheck())).toThrow(MissingBaselineError);
    expect(() => compareToBaseline(undefined, unchangedCheck())).toThrow(MissingBaselineError);
  });

  it('throws rather than returning a quiet no-flag when there is no baseline', () => {
    let returned: unknown = 'nothing';
    try {
      returned = compareToBaseline(null, unchangedCheck());
    } catch {
      returned = 'threw';
    }
    expect(returned).toBe('threw');
  });

  it('refuses two sittings from different athletes', () => {
    const otherAthlete = sitting('baseline', healthyBaseline().scores, 'athlete-2');
    expect(() => compareToBaseline(otherAthlete, unchangedCheck())).toThrow(InvalidComparisonError);
  });

  it('refuses to treat a sideline check as if it were a baseline', () => {
    const notABaseline = sitting('check', healthyBaseline().scores, ATHLETE, BASELINE_TIME);
    expect(() => compareToBaseline(notABaseline, unchangedCheck())).toThrow(InvalidComparisonError);
  });
});

/* ── 6. The table and the headline must never disagree ────────────────────────────── */

describe('breakdown rows stay consistent with the engine verdict', () => {
  const cases: { name: string; baseline: () => TestResult; check: () => TestResult }[] = [
    { name: 'unchanged', baseline: healthyBaseline, check: unchangedCheck },
    {
      name: 'symptoms flagged',
      baseline: healthyBaseline,
      check: () => sitting('check', scores({ symptom: symptom(SYMPTOM_INCREASE + 2), digitSpan: digits(6) })),
    },
    {
      name: 'digit span collapsed (unjudgeable)',
      baseline: healthyBaseline,
      check: () => sitting('check', scores({ symptom: symptom(0), digitSpan: digits(0) })),
    },
    {
      name: 'digit span missing from the check',
      baseline: healthyBaseline,
      check: () => sitting('check', scores({ symptom: symptom(0) })),
    },
  ];

  for (const testCase of cases) {
    it(`agrees with compareToBaseline — ${testCase.name}`, () => {
      const baseline = testCase.baseline();
      const check = testCase.check();

      const outcome = compareToBaseline(baseline, check);
      const rows = buildBreakdown(baseline, check);

      // If any row flags, the headline must flag, and vice versa. This is the drift these two
      // files can produce, and the whole reason this describe block exists.
      expect(rows.some((row) => row.flagged)).toBe(outcome.flagged);
    });

    it(`marks the same measurements unevaluated as the engine — ${testCase.name}`, () => {
      const baseline = testCase.baseline();
      const check = testCase.check();

      const outcome = compareToBaseline(baseline, check);
      const rows = buildBreakdown(baseline, check);

      // Both files decide this from the same thresholds. If one says "unjudged" and the other
      // renders a calm row, the screen would contradict itself.
      expect(rows.some((row) => row.unevaluated)).toBe(outcome.unevaluated.length > 0);
    });
  }

  it('never marks a row both flagged and unevaluated', () => {
    // A null threshold cannot flag, so these two are mutually exclusive by construction. If both
    // were ever true the screen would have to pick one and would pick wrong.
    const rows = buildBreakdown(healthyBaseline(), unchangedCheck());

    for (const row of rows) {
      expect(row.flagged && row.unevaluated).toBe(false);
    }
  });

  it('marks an uncompared row as neither flagged nor unevaluated', () => {
    const check = sitting('check', scores({ symptom: symptom(0) }));
    const rows = buildBreakdown(healthyBaseline(), check);
    const uncompared = rows.filter((row) => !row.compared);

    expect(uncompared.length).toBeGreaterThan(0);
    for (const row of uncompared) {
      expect(row.flagged).toBe(false);
      expect(row.unevaluated).toBe(false);
    }
  });

  it('shows a "no tested cut-off" threshold column for unjudged rows', () => {
    const rows = buildBreakdown(healthyBaseline(), unchangedCheck());
    const digitRow = rows.find((row) => row.label.startsWith('Numbers backwards'));

    expect(digitRow?.unevaluated).toBe(true);
    expect(digitRow?.thresholdText).toMatch(/no tested cut-off/i);
  });
});
