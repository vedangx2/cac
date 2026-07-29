// lib/engine/ordering.test.ts
//
// THE FOUR ORDERING-GUARD TESTS, in their own file.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THESE LIVE HERE AND NOT IN compare.test.ts
// ═════════════════════════════════════════════════════════════════════════════════════
// These four tests guard the single most dangerous path through this app: a baseline recorded
// AFTER the check it would be compared against. They were ported out of compare.test.ts
// BEFORE the battery rewrite touched compare.ts, deliberately, and they stayed green through
// every step of that rewrite.
//
// The reason for the order of operations: a guard and its test rewritten in the same sitting
// can drift in the same direction and both still pass. If the rewrite had weakened the guard
// and the test had been rewritten to match, nothing would have failed and the app would have
// quietly regained a path where an already-injured athlete gets compared against himself
// injured. Moving the tests first and leaving their assertions untouched means the rewrite had
// to satisfy the ORIGINAL expectations, not a fresh set written to fit whatever it produced.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THE FIXTURES CARRY NO MODULE SCORES
// ═════════════════════════════════════════════════════════════════════════════════════
// Every sitting below has all modules null. That is not laziness — it is what makes these
// tests survive a change to ModuleScores. The ordering guard is checked before the engine
// reads a single module, so it fires regardless of what was measured. Keeping the fixtures
// empty means a future change to the battery updates ONE helper in this file and cannot touch
// the four assertions at all.
//
// If you are changing the battery: update emptyScores() and nothing else in this file. If a
// test below needs editing to pass, stop — that is the guard weakening, which is the thing
// this file exists to catch.

import { describe, expect, it } from 'vitest';
import type { ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { InvalidComparisonError, compareToBaseline } from './compare';

const ATHLETE = 'athlete-1';
const BASELINE_TIME = 1_700_000_000_000;
const CHECK_TIME = BASELINE_TIME + 7 * 24 * 60 * 60 * 1000;

/**
 * All modules null.
 *
 * THE ONLY THING IN THIS FILE THAT SHOULD EVER NEED CHANGING when the battery changes. Add or
 * remove keys here to match ModuleScores; leave everything below untouched.
 */
function emptyScores(): ModuleScores {
  return {
    symptom: null,
    wordLearning: null,
    wordRecognition: null,
    digitSpan: null,
    patternSpan: null,
    goNoGo: null,
    balance: null,
  };
}

function sitting(kind: 'baseline' | 'check', takenAt: number): TestResult {
  return {
    id: `${kind}-${takenAt}`,
    athleteId: ATHLETE,
    takenAt,
    kind,
    scores: emptyScores(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/* ── The four guards ──────────────────────────────────────────────────────────────── */

describe('a baseline must predate the check it is compared against', () => {
  /*
    The dangerous one. A coach checks an athlete who has no baseline, gets the "no baseline"
    error, and records a baseline right there — on the athlete who may already be concussed.
    Re-opening the earlier check would then compare an impaired athlete against himself
    impaired, find almost no difference, and render the most reassuring screen in the app.
    The engine has to refuse.
  */
  it('refuses a baseline recorded AFTER the check it would be compared against', () => {
    const check = sitting('check', CHECK_TIME);
    const baselineTakenLater = sitting('baseline', CHECK_TIME + 60_000); // a minute after the hit

    expect(() => compareToBaseline(baselineTakenLater, check)).toThrow(InvalidComparisonError);
    expect(() => compareToBaseline(baselineTakenLater, check)).toThrow(/before the hit/i);
  });

  it('refuses a baseline recorded at the same moment as the check', () => {
    const check = sitting('check', CHECK_TIME);
    const sameMoment = sitting('baseline', CHECK_TIME);

    expect(() => compareToBaseline(sameMoment, check)).toThrow(InvalidComparisonError);
  });

  it('still accepts a baseline recorded even one millisecond before the check', () => {
    // The boundary in the safe direction. A guard that also rejected legitimate baselines would
    // be replacing one failure with another.
    const check = sitting('check', CHECK_TIME);
    const justBefore = sitting('baseline', CHECK_TIME - 1);

    expect(() => compareToBaseline(justBefore, check)).not.toThrow();
  });

  it('never turns a flagged result into a reassuring one via a later baseline', () => {
    // The same athlete measured twice after the hit. If the engine allowed this, the two
    // sittings would look almost identical and it would report "no significant change".
    //
    // Note this holds even with nothing measured: the refusal happens before any module is
    // read, so it cannot be defeated by which tests the battery happens to contain.
    const check = sitting('check', CHECK_TIME);
    const postImpactBaseline = sitting('baseline', CHECK_TIME + 120_000);

    // It must throw rather than return { flagged: false }.
    expect(() => compareToBaseline(postImpactBaseline, check)).toThrow(InvalidComparisonError);

    let returned: unknown = 'nothing';
    try {
      returned = compareToBaseline(postImpactBaseline, check);
    } catch {
      returned = 'threw';
    }
    expect(returned).toBe('threw');
  });
});
