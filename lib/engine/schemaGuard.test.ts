// lib/engine/schemaGuard.test.ts
//
// Tests for rule 7 of the engine: both sittings must have been measured by THIS version of the
// battery, or the comparison is refused.
//
// WHY THIS CANNOT FIRE IN THE APP TODAY, AND IS TESTED ANYWAY: right now every record on every
// phone is version 1 and the app measures version 1, so the guard never trips in practice. It
// is built and tested now, before the battery changes, because the moment the battery DOES
// change is the moment old records start arriving — and a guard written at the same time as the
// thing it guards against is a guard nobody has ever seen work. Fixtures let us watch it work
// while it still costs nothing.
//
// What it protects against: an old sitting holds the fields the old battery measured. Feed it to
// a newer engine and the modules it never measured arrive as `null`. The engine correctly skips
// anything it cannot compare — so instead of failing, it would compare whatever few fields
// survived the change and render that with the same confidence as a full comparison. One module
// silently standing in for a whole battery is precisely the false reassurance this app exists to
// prevent.

import { describe, expect, it } from 'vitest';
import type { ModuleScores, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION, UNKNOWN_SCHEMA_VERSION } from '../schema';
import {
  InvalidComparisonError,
  MissingBaselineError,
  SchemaVersionMismatchError,
  compareToBaseline,
} from './compare';

/* ── Fixtures ─────────────────────────────────────────────────────────────────────── */

const ATHLETE = 'athlete-1';
const BASELINE_TIME = 1_700_000_000_000;
const CHECK_TIME = BASELINE_TIME + 7 * 24 * 60 * 60 * 1000;

/** Identical scores on both sides, so nothing but the version can ever be the reason it fails. */
function identicalScores(): ModuleScores {
  return {
    symptom: { itemScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0 },
    wordLearning: null,
    wordRecognition: null,
    digitSpan: {
      formId: 'digits-a',
      trialsCorrect: [true, true, true, true, true, true, false, false, false],
      correct: 6,
    },
    patternSpan: null,
    goNoGo: null,
    balance: null,
  };
}

function sitting(
  kind: 'baseline' | 'check',
  schemaVersion: number,
  takenAt: number = kind === 'baseline' ? BASELINE_TIME : CHECK_TIME,
): TestResult {
  return {
    id: `${kind}-v${schemaVersion}`,
    athleteId: ATHLETE,
    takenAt,
    kind,
    scores: identicalScores(),
    schemaVersion,
  };
}

const OLDER = CURRENT_SCHEMA_VERSION - 1;
const NEWER = CURRENT_SCHEMA_VERSION + 1;

/* ── The guard ────────────────────────────────────────────────────────────────────── */

describe('the engine refuses sittings measured by a different version of the battery', () => {
  it('compares happily when both sittings are on the current version', () => {
    expect(() =>
      compareToBaseline(sitting('baseline', CURRENT_SCHEMA_VERSION), sitting('check', CURRENT_SCHEMA_VERSION)),
    ).not.toThrow();
  });

  it('refuses when the BASELINE is from an older battery', () => {
    expect(() => compareToBaseline(sitting('baseline', OLDER), sitting('check', CURRENT_SCHEMA_VERSION))).toThrow(
      SchemaVersionMismatchError,
    );
  });

  it('refuses when the CHECK is from an older battery', () => {
    expect(() => compareToBaseline(sitting('baseline', CURRENT_SCHEMA_VERSION), sitting('check', OLDER))).toThrow(
      SchemaVersionMismatchError,
    );
  });

  it('refuses when BOTH are old, even though they match each other', () => {
    // The non-obvious case, and the reason the guard tests against the current version rather
    // than just comparing the two sides. Two old sittings are consistent with one another, but
    // this build's comparison logic was written for different fields and no longer knows what
    // it would be leaving out. Guessing is not something this app does.
    expect(() => compareToBaseline(sitting('baseline', OLDER), sitting('check', OLDER))).toThrow(
      SchemaVersionMismatchError,
    );
  });

  it('refuses a record written by a NEWER version of the app', () => {
    // The same phone can hold records written by a build newer than the one currently loaded
    // (a cached service worker serving stale code, for instance). We cannot read those either.
    expect(() => compareToBaseline(sitting('baseline', NEWER), sitting('check', NEWER))).toThrow(
      SchemaVersionMismatchError,
    );
  });

  it('refuses a record whose version could not be made sense of', () => {
    expect(() =>
      compareToBaseline(sitting('baseline', UNKNOWN_SCHEMA_VERSION), sitting('check', CURRENT_SCHEMA_VERSION)),
    ).toThrow(SchemaVersionMismatchError);
  });
});

/* ── It must THROW, never quietly pass ────────────────────────────────────────────── */

describe('a version mismatch is never a quiet no-flag result', () => {
  it('throws rather than returning an unflagged outcome', () => {
    // The whole point. If this ever returned { flagged: false } the result screen would render
    // the reassuring panel for two sittings it never actually compared.
    let returned: unknown = 'nothing returned';
    try {
      returned = compareToBaseline(sitting('baseline', OLDER), sitting('check', CURRENT_SCHEMA_VERSION));
    } catch {
      returned = 'threw';
    }

    expect(returned).toBe('threw');
  });

  it('is a distinct error class, so the UI can explain it differently', () => {
    // The result screen shows completely different copy for this than for a bad baseline: the
    // data is fine, the app moved on, and the fix is a new baseline rather than a different one.
    // That branch only works if the class is distinguishable.
    const error = grabError(() =>
      compareToBaseline(sitting('baseline', OLDER), sitting('check', CURRENT_SCHEMA_VERSION)),
    );

    expect(error).toBeInstanceOf(SchemaVersionMismatchError);
    expect(error).not.toBeInstanceOf(InvalidComparisonError);
    expect(error).not.toBeInstanceOf(MissingBaselineError);
  });

  it('carries both versions and the current one, so the screen can say which side is stale', () => {
    const error = grabError(() => compareToBaseline(sitting('baseline', OLDER), sitting('check', NEWER)));

    expect(error).toBeInstanceOf(SchemaVersionMismatchError);
    const mismatch = error as SchemaVersionMismatchError;
    expect(mismatch.baselineVersion).toBe(OLDER);
    expect(mismatch.checkVersion).toBe(NEWER);
    expect(mismatch.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('says nothing about anybody being fine', () => {
    const error = grabError(() =>
      compareToBaseline(sitting('baseline', OLDER), sitting('check', CURRENT_SCHEMA_VERSION)),
    );

    expect((error as Error).message).not.toMatch(/cleared|healthy|safe|fine|no concussion/i);
  });
});

/* ── Precedence against the other refusals ────────────────────────────────────────── */

describe('the version guard sits in a deliberate order among the other refusals', () => {
  it('a missing baseline still reports as a missing baseline, not a version problem', () => {
    // Rule 5 comes first. "There is nothing to compare against" is a more useful thing to tell
    // someone than "the versions disagree", and a null baseline has no version at all.
    expect(() => compareToBaseline(null, sitting('check', OLDER))).toThrow(MissingBaselineError);
  });

  it('two different athletes still reports as two different athletes', () => {
    const otherAthlete: TestResult = { ...sitting('baseline', OLDER), athleteId: 'athlete-2' };

    expect(() => compareToBaseline(otherAthlete, sitting('check', CURRENT_SCHEMA_VERSION))).toThrow(
      InvalidComparisonError,
    );
  });

  it('a baseline recorded after the check still reports as an ordering problem', () => {
    // The ordering guard is checked BEFORE the version guard, so this stays an
    // InvalidComparisonError. Pinned deliberately: the ordering guard closes the more dangerous
    // path of the two — a baseline taken from an already-injured athlete — and it should keep
    // being the thing the screen talks about when both are wrong at once.
    const lateBaseline = sitting('baseline', OLDER, CHECK_TIME + 60_000);

    expect(() => compareToBaseline(lateBaseline, sitting('check', OLDER))).toThrow(InvalidComparisonError);
    expect(() => compareToBaseline(lateBaseline, sitting('check', OLDER))).toThrow(/before the hit/i);
  });
});

/** Run a function that is expected to throw and hand back whatever it threw. */
function grabError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw, but it returned normally.');
}
