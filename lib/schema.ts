// lib/schema.ts
//
// RECORD VERSIONING. One small idea, kept in its own file because everything that touches
// stored results has to agree about it.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE PROBLEM
// ═════════════════════════════════════════════════════════════════════════════════════
// A stored TestResult holds a `scores` object whose SHAPE follows whatever the battery
// measured at the time. Change the battery — replace a module, add one, drop one — and the
// records written afterwards have different keys from the records written before.
//
// Both sets of records are honest. Neither is corrupt. But they are not comparable, because
// a module the old record never measured shows up as `null`, and `null` in this codebase
// means "not recorded", which every consumer correctly skips. Skip enough modules and you
// get a comparison that ran on almost nothing and still produced a confident-looking screen.
//
// That is the failure mode this file exists to make impossible: an old record silently
// half-compared against a new one. We would rather refuse loudly and tell the athlete to
// record a fresh baseline than show a screen we cannot stand behind.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE APPROACH
// ═════════════════════════════════════════════════════════════════════════════════════
// Every record carries the version of the scores shape it was written under.
//
//   • WRITE — lib/session.ts stamps CURRENT_SCHEMA_VERSION onto every record it saves.
//   • READ  — lib/storage.ts runs every record it returns through normaliseTestResult(),
//             which fills the field in for records saved before the field existed.
//   • USE   — the engine compares the two versions and refuses if they differ.
//
// The normaliser deliberately does NOT upgrade anything. It does not rewrite an old record
// into the new shape, and it never relabels a record as the current version. Its entire job
// is to make sure a version number is present so that a later comparison can be honest about
// what it is looking at. Relabelling would be the exact bug we are preventing: a record
// wearing a version whose fields it does not actually contain.

import type { TestResult } from './types';

/**
 * The version of the `ModuleScores` shape this build writes.
 *
 * BUMP THIS whenever the set of keys in ModuleScores changes — a module added, removed, or
 * renamed, or a module's own score object changing shape. Do NOT bump it for changes that
 * leave every stored field meaning exactly what it meant before (new thresholds, new copy,
 * a new screen for an existing module), because bumping needlessly throws away baselines
 * that are still perfectly valid and makes athletes redo them for nothing.
 *
 * Version 1 is the original three-module battery: symptom + reaction + scan (+ an unused
 * balance slot).
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * The version we attribute to a record that carries no version field at all.
 *
 * Every record written before this field existed came from the original three-module
 * battery, so "no field" and "version 1" describe exactly the same shape. This is a fact
 * about our own history, not a guess.
 */
export const LEGACY_SCHEMA_VERSION = 1;

/**
 * The version we attribute to a record whose version field is present but unusable.
 *
 * Negative on purpose: CURRENT_SCHEMA_VERSION only ever counts up from 1, so a record
 * carrying this can never accidentally compare equal to the current version, and the
 * engine's version guard will refuse it. A record we cannot make sense of must fail
 * closed — refused — never fall through to "probably fine, treat it as v1".
 */
export const UNKNOWN_SCHEMA_VERSION = -1;

/**
 * A TestResult as it actually exists on disk: everything except a guaranteed version field.
 *
 * IndexedDB hands back whatever was written, including records written by builds that
 * predate `schemaVersion` entirely. Typing the raw read as this — rather than as TestResult
 * — is what forces every read path through the normaliser: the raw shape simply does not
 * fit where a TestResult is expected, so the compiler rejects a path that forgets to
 * normalise. That check is worth more than remembering to be careful.
 */
export type StoredTestResult = Omit<TestResult, 'schemaVersion'> & { schemaVersion?: number };

/**
 * Give one record read from storage a usable version number.
 *
 * Returns a NEW object rather than mutating the input, so a caller holding the raw record
 * (a test, say) still sees exactly what was on disk.
 *
 * The three cases:
 *   • field absent          → LEGACY_SCHEMA_VERSION. It predates versioning; see above.
 *   • a positive integer    → itself, untouched. Including versions from the future: if a
 *                             newer build wrote version 9 and this older build reads it, we
 *                             want the guard to refuse it, which it will. Clamping it to
 *                             something we understand would be inventing a compatibility we
 *                             have not got.
 *   • anything else         → UNKNOWN_SCHEMA_VERSION. Corrupt, hand-edited, or written by
 *                             something that is not this app. Fail closed.
 */
export function normaliseTestResult(stored: StoredTestResult): TestResult {
  return { ...stored, schemaVersion: normaliseVersionField(stored.schemaVersion) };
}

/** The list form. Same rules, applied per record. */
export function normaliseTestResults(stored: StoredTestResult[]): TestResult[] {
  return stored.map(normaliseTestResult);
}

/** Whether a record can be read by this build at all. */
export function isCurrentSchema(result: Pick<TestResult, 'schemaVersion'>): boolean {
  return result.schemaVersion === CURRENT_SCHEMA_VERSION;
}

function normaliseVersionField(value: unknown): number {
  if (value === undefined || value === null) return LEGACY_SCHEMA_VERSION;

  // Number.isInteger already rejects NaN, Infinity and non-numbers, so this single test
  // covers every malformed case: strings, objects, fractions, and the rest.
  if (!Number.isInteger(value) || (value as number) < 1) return UNKNOWN_SCHEMA_VERSION;

  return value as number;
}
