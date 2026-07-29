// lib/schema.test.ts
//
// Tests for record versioning (lib/schema.ts) and — just as important — for the rule that
// EVERY read path in lib/storage.ts runs its records through the normaliser.
//
// Why that second half matters enough to test structurally: a read path that forgets to
// normalise hands back a record with no schemaVersion field. Nothing crashes. The record
// simply flows onward as though it were fine, and once the current version is bumped past 1
// that record is an OLD-shaped sitting that the version guard never catches — a v1 record
// wearing a v2 label, compared field-by-field against fields it does not contain. The result
// is a comparison that silently ran on almost nothing. That is the failure this whole
// mechanism exists to prevent, so "did we cover every read path" is itself worth a test.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ModuleScores } from './types';
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  type StoredTestResult,
  UNKNOWN_SCHEMA_VERSION,
  isCurrentSchema,
  normaliseTestResult,
  normaliseTestResults,
} from './schema';

/* ── Fixtures ─────────────────────────────────────────────────────────────────────── */

function scores(): ModuleScores {
  return {
    symptom: { itemScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0 },
    wordLearning: { formId: 'words-a', hits: 9, falseAlarms: 1, correct: 18 },
    wordRecognition: { formId: 'words-a', hits: 8, falseAlarms: 1, correct: 17 },
    digitSpan: {
      formId: 'digits-a',
      trialsCorrect: [true, true, true, true, true, false, false, false, false],
      correct: 5,
    },
    patternSpan: {
      formId: 'pattern-a',
      trialsCorrect: [true, true, true, true, false, false, false, false, false],
      correct: 4,
    },
    goNoGo: null,
    balance: null,
  };
}

/** A record exactly as an OLD build wrote it: no schemaVersion field at all. */
function legacyRecord(): StoredTestResult {
  return {
    id: 'r1',
    athleteId: 'athlete-1',
    takenAt: 1_700_000_000_000,
    kind: 'baseline',
    scores: scores(),
  };
}

/** A record written by a build that already stamps the version. */
function stampedRecord(version: number): StoredTestResult {
  return { ...legacyRecord(), id: 'r2', schemaVersion: version };
}

/* ── The version field itself ─────────────────────────────────────────────────────── */

describe('normaliseTestResult fills in a missing version', () => {
  it('treats a record with no schemaVersion as the legacy version', () => {
    expect(normaliseTestResult(legacyRecord()).schemaVersion).toBe(LEGACY_SCHEMA_VERSION);
  });

  it('treats an explicitly null schemaVersion as legacy too', () => {
    // Not a shape we write, but JSON round-trips and hand-edited data can produce it.
    const record = { ...legacyRecord(), schemaVersion: null } as unknown as StoredTestResult;

    expect(normaliseTestResult(record).schemaVersion).toBe(LEGACY_SCHEMA_VERSION);
  });

  it('leaves an existing version exactly as it found it', () => {
    expect(normaliseTestResult(stampedRecord(1)).schemaVersion).toBe(1);
    expect(normaliseTestResult(stampedRecord(2)).schemaVersion).toBe(2);
  });

  it('does NOT relabel an old record as the current version', () => {
    // The single most important assertion in this file. If the normaliser ever "helpfully"
    // upgraded the label, every legacy record would claim to hold modules it never measured
    // and the version guard would wave all of them straight through.
    const bumped = CURRENT_SCHEMA_VERSION + 1;
    expect(normaliseTestResult(stampedRecord(bumped)).schemaVersion).toBe(bumped);
    expect(normaliseTestResult(stampedRecord(bumped)).schemaVersion).not.toBe(CURRENT_SCHEMA_VERSION);
  });

  it('preserves a version from the FUTURE rather than clamping it to one we understand', () => {
    // A newer build wrote this record on the same phone. We cannot read it, and pretending we
    // can would be worse than refusing — so the number survives and the guard refuses it.
    const fromTheFuture = normaliseTestResult(stampedRecord(99));

    expect(fromTheFuture.schemaVersion).toBe(99);
    expect(isCurrentSchema(fromTheFuture)).toBe(false);
  });
});

describe('normaliseTestResult fails closed on a version it cannot make sense of', () => {
  // Each of these is present-but-unusable. None may be quietly read as "probably v1".
  const malformed: { name: string; value: unknown }[] = [
    { name: 'a string', value: '1' },
    { name: 'zero', value: 0 },
    { name: 'a negative number', value: -3 },
    { name: 'a fraction', value: 1.5 },
    { name: 'NaN', value: Number.NaN },
    { name: 'Infinity', value: Number.POSITIVE_INFINITY },
    { name: 'an object', value: {} },
    { name: 'a boolean', value: true },
  ];

  for (const { name, value } of malformed) {
    it(`marks ${name} as unknown, never as legacy or current`, () => {
      const record = { ...legacyRecord(), schemaVersion: value } as unknown as StoredTestResult;
      const normalised = normaliseTestResult(record);

      expect(normalised.schemaVersion).toBe(UNKNOWN_SCHEMA_VERSION);
      expect(normalised.schemaVersion).not.toBe(LEGACY_SCHEMA_VERSION);
      expect(isCurrentSchema(normalised)).toBe(false);
    });
  }

  it('keeps the unknown marker below every real version, so it can never compare equal', () => {
    expect(UNKNOWN_SCHEMA_VERSION).toBeLessThan(1);
    expect(UNKNOWN_SCHEMA_VERSION).toBeLessThan(CURRENT_SCHEMA_VERSION);
    expect(UNKNOWN_SCHEMA_VERSION).toBeLessThan(LEGACY_SCHEMA_VERSION);
  });
});

/* ── Everything else about the record must survive untouched ──────────────────────── */

describe('normaliseTestResult changes nothing except the version field', () => {
  it('carries every other field through unchanged', () => {
    const record = legacyRecord();
    const normalised = normaliseTestResult(record);

    expect(normalised.id).toBe(record.id);
    expect(normalised.athleteId).toBe(record.athleteId);
    expect(normalised.takenAt).toBe(record.takenAt);
    expect(normalised.kind).toBe(record.kind);
    expect(normalised.scores).toEqual(record.scores);
  });

  it('preserves the baseline pin, which is a different optional field entirely', () => {
    const pinned: StoredTestResult = { ...legacyRecord(), kind: 'check', comparedToBaselineId: 'b7' };

    expect(normaliseTestResult(pinned).comparedToBaselineId).toBe('b7');
  });

  it('does not mutate the record it was given', () => {
    // Callers should be able to hold the raw record and still see what was really on disk.
    const record = legacyRecord();
    normaliseTestResult(record);

    expect(record.schemaVersion).toBeUndefined();
  });

  it('never invents module scores for a shape that did not measure them', () => {
    // The normaliser labels; it does not migrate. A legacy record's balance slot stays null
    // and no new key appears, because filling one in would be fabricating a measurement.
    const normalised = normaliseTestResult(legacyRecord());

    expect(normalised.scores.balance).toBeNull();
    expect(Object.keys(normalised.scores).sort()).toEqual([
      'balance',
      'digitSpan',
      'goNoGo',
      'patternSpan',
      'symptom',
      'wordLearning',
      'wordRecognition',
    ]);
  });
});

/* ── The list form ────────────────────────────────────────────────────────────────── */

describe('normaliseTestResults', () => {
  it('normalises every record in the list independently', () => {
    const mixed = [legacyRecord(), stampedRecord(2), stampedRecord(1)];

    expect(normaliseTestResults(mixed).map((r) => r.schemaVersion)).toEqual([
      LEGACY_SCHEMA_VERSION,
      2,
      1,
    ]);
  });

  it('handles an empty list', () => {
    expect(normaliseTestResults([])).toEqual([]);
  });
});

/* ── isCurrentSchema ──────────────────────────────────────────────────────────────── */

describe('isCurrentSchema', () => {
  it('accepts only an exact match on the current version', () => {
    expect(isCurrentSchema({ schemaVersion: CURRENT_SCHEMA_VERSION })).toBe(true);
    expect(isCurrentSchema({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toBe(false);
    expect(isCurrentSchema({ schemaVersion: CURRENT_SCHEMA_VERSION - 1 })).toBe(false);
    expect(isCurrentSchema({ schemaVersion: UNKNOWN_SCHEMA_VERSION })).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE READ-PATH COVERAGE GUARD

   A structural test, reading lib/storage.ts as text. It is the same technique the existing
   regression tests use for bugs that only exist in a browser: we cannot open a real
   IndexedDB here, and adding a fake one would mean a new dependency, which CLAUDE.md rules
   out.

   What it protects: the compiler already forces normalisation, because a raw read is typed
   StoredTestResult and will not fit a TestResult return. This test guards the case the
   compiler cannot see — someone silencing that error with a cast instead of normalising.
   ═══════════════════════════════════════════════════════════════════════════════════ */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE_SRC = readFileSync(join(REPO, 'lib', 'storage.ts'), 'utf8');

describe('every read path in storage.ts goes through the normaliser', () => {
  // Every exported function whose return type mentions TestResult. Adding one here is the
  // deliberate speed bump: a new result-returning read has to be listed and covered.
  const READ_PATHS = ['getResult', 'getResultsFor'];

  it('has exactly the read paths this test knows about', () => {
    // If someone adds a third result-returning read, this fails and forces them to look at
    // the two assertions below rather than quietly shipping an unnormalised path.
    const found = [...STORAGE_SRC.matchAll(/export async function (\w+)\([^)]*\):\s*Promise<([^>]*TestResult[^>]*)>/g)]
      .map((match) => match[1]);

    expect(found.sort()).toEqual([...READ_PATHS].sort());
  });

  for (const name of READ_PATHS) {
    it(`${name} normalises before returning`, () => {
      // Take the function body from its signature to the closing brace at column 0.
      const body = STORAGE_SRC.split(`export async function ${name}`)[1]?.split('\n}')[0] ?? '';

      expect(body).not.toBe('');
      expect(body).toMatch(/normaliseTestResults?\(/);
    });
  }

  it('types the raw read as StoredTestResult, so the compiler enforces this too', () => {
    // The type-level half of the guarantee. If a raw read is re-typed as TestResult the
    // compiler stops objecting and the whole enforcement mechanism quietly switches off.
    expect(STORAGE_SRC).toMatch(/const result: StoredTestResult \| undefined/);
    expect(STORAGE_SRC).toMatch(/const results: StoredTestResult\[\]/);
  });

  it('never casts its way past normalisation', () => {
    expect(STORAGE_SRC).not.toMatch(/as TestResult/);
  });
});
