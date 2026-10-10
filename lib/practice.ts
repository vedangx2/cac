// lib/practice.ts
//
// The first-exposure guard's rule, in one place: how many practice passes an athlete needs
// before a baseline can be recorded. See Athlete.practicePassCount in lib/types.ts for why.
//
// This is a protocol rule about data quality, not a flagging threshold, so it lives here and
// not in lib/engine/thresholds.ts. It does not decide whether anyone is flagged.

import type { Athlete } from './types';

/**
 * Practice passes required before recording a baseline. Raised from 1 to 2 on 2026-10-10 after
 * two testers showed a large practice effect following a single pass.
 *
 * TODO(NEEDS_SOURCE): two is a response to two testers' observations, not a validated number.
 * Whether two passes is enough has not been measured.
 */
export const PRACTICE_PASSES_REQUIRED = 2;

/** Passes still to go. Never negative. A count that is not a usable number counts as zero. */
export function practicePassesRemaining(athlete: Pick<Athlete, 'practicePassCount'>): number {
  const done = Number.isInteger(athlete.practicePassCount) ? athlete.practicePassCount : 0;
  return Math.max(0, PRACTICE_PASSES_REQUIRED - Math.max(0, done));
}

/**
 * May a baseline be recorded for this athlete?
 *
 * FAILS CLOSED: only an explicit count at or above the requirement unlocks. A missing,
 * undefined, NaN or negative count compares false and stays locked — an earlier migration of
 * this guard unlocked old records by mistake, so this is tested directly.
 */
export function canRecordBaseline(athlete: Pick<Athlete, 'practicePassCount'>): boolean {
  return practicePassesRemaining(athlete) === 0;
}
