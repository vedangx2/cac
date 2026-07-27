// lib/engine/resolveBaseline.ts
//
// Which baseline should a given check be compared against?
//
// This is deliberately its own tiny pure function, separate from both the results screen (which
// does the actual storage lookup and rendering) and the comparison engine (which only ever sees
// two already-chosen TestResults). Pulling the CHOICE out on its own means the rule below can be
// unit-tested directly, with no rendering and no fake database — the same reason the engine
// itself lives in lib/ as pure functions.
//
// THE RULE, and why it matters:
//   • PIN FIRST. A check saved by a current version of the app records, at save time, the id of
//     the baseline that was on file the moment it was taken (`comparedToBaselineId`). We honour
//     that pin. This is the whole point: recording a NEW baseline later must never change which
//     baseline an OLD check is scored against, because that would silently rewrite a past result.
//   • FALL BACK ONLY WHEN THE PIN IS ABSENT. Checks saved before this field existed do not carry
//     it (`comparedToBaselineId` is undefined). Only for those do we fall back to the athlete's
//     current `baselineId` — which is exactly the behaviour those old checks were saved under, so
//     nothing about them changes.
//   • NULL means "nothing to compare against". The engine turns that into a clear error, never a
//     quiet "no change" — see compareToBaseline / MissingBaselineError.

import type { Athlete, TestResult } from '../types';

/**
 * Pick the id of the baseline a check must be compared against.
 *
 * @param check   The check being opened. Only its `comparedToBaselineId` is read.
 * @param athlete The athlete the check belongs to, or null if it could not be loaded. Only its
 *                `baselineId` is read, and only as a fallback for legacy (un-pinned) checks.
 */
export function resolveComparedBaselineId(
  check: Pick<TestResult, 'comparedToBaselineId'>,
  athlete: Pick<Athlete, 'baselineId'> | null,
): string | null {
  // A present pin wins outright — even if the athlete's current baseline is now a different one.
  // We test for `undefined` explicitly (not just truthiness) to make the "present vs absent"
  // intent unmistakable: the field is only ever a real baseline id or absent, never "" or null.
  if (check.comparedToBaselineId !== undefined) {
    return check.comparedToBaselineId;
  }

  // Legacy check with no pin: use the athlete's current baseline, exactly as before.
  return athlete?.baselineId ?? null;
}
