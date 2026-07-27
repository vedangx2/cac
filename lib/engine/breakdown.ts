// lib/engine/breakdown.ts
//
// The per-module table the results screen shows underneath the headline: for each thing we
// measured, what the baseline was, what the check was, how big the change is, and which
// threshold we applied.
//
// WHY THIS IS A SEPARATE FILE FROM compare.ts:
// FlagOutcome is fixed by the data contract in lib/types.ts — flagged, modules, explanations,
// and nothing else. The results screen needs more than that to draw a comparison table, but
// bolting extra fields onto FlagOutcome would mean changing the contract, which we don't do.
// So the engine's verdict and the screen's presentation data are produced separately from the
// same two TestResults and the same thresholds.
//
// The risk in having two files read the same thresholds is that they drift apart and the
// table disagrees with the headline. There is a unit test (breakdown.test.ts) that compares
// the two outputs on the same input specifically to catch that.

import type { TestResult } from '../types';
import {
  BALANCE_SWAY_INCREASE,
  REACTION_SLOWER_MS,
  SCAN_EXTRA_ERRORS,
  SCAN_SLOWER_MS,
  SYMPTOM_INCREASE,
} from './thresholds';

export type ComparisonRow = {
  /** Which module this row belongs to — the scan contributes two rows. */
  module: 'reaction' | 'scan' | 'symptom' | 'balance';
  label: string;
  baselineText: string;
  checkText: string;
  /** e.g. "62 ms slower", "No change", "Not compared". */
  differenceText: string;
  /** The rule applied, in words. e.g. "Flags at 50 ms slower or more". */
  thresholdText: string;
  flagged: boolean;
  /** False when the module is missing from either sitting. */
  compared: boolean;
};

import { displayedSecondsDifference, msText as ms, secondsText as seconds } from './units';

/** "62 ms slower" / "9 ms faster" / "No change", given a raw difference. */
function describeDifference(
  difference: number,
  format: (n: number) => string,
  worseWord: string,
  betterWord: string,
): string {
  if (difference === 0) return 'No change';
  if (difference > 0) return `${format(difference)} ${worseWord}`;
  return `${format(Math.abs(difference))} ${betterWord}`;
}

const NOT_COMPARED: Pick<ComparisonRow, 'baselineText' | 'checkText' | 'differenceText' | 'flagged' | 'compared'> = {
  baselineText: 'Not recorded',
  checkText: 'Not recorded',
  differenceText: 'Not compared',
  flagged: false,
  compared: false,
};

/**
 * Build the table rows. Assumes the two results have already been validated by
 * compareToBaseline (same athlete, real baseline) — the results screen calls that first.
 */
export function buildBreakdown(baseline: TestResult, check: TestResult): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  // ── Reaction ──────────────────────────────────────────────────────────────────────
  const baseReaction = baseline.scores.reaction;
  const checkReaction = check.scores.reaction;
  if (baseReaction && checkReaction) {
    const difference = checkReaction.medianMs - baseReaction.medianMs;
    rows.push({
      module: 'reaction',
      label: 'Reaction time (median of 5)',
      baselineText: ms(baseReaction.medianMs),
      checkText: ms(checkReaction.medianMs),
      differenceText: describeDifference(difference, ms, 'slower', 'faster'),
      thresholdText: `Flags at ${ms(REACTION_SLOWER_MS)} slower or more`,
      flagged: difference >= REACTION_SLOWER_MS,
      compared: true,
    });
  } else {
    rows.push({
      module: 'reaction',
      label: 'Reaction time (median of 5)',
      thresholdText: `Flags at ${ms(REACTION_SLOWER_MS)} slower or more`,
      ...NOT_COMPARED,
      baselineText: baseReaction ? ms(baseReaction.medianMs) : 'Not recorded',
      checkText: checkReaction ? ms(checkReaction.medianMs) : 'Not recorded',
    });
  }

  // ── Scan: time ────────────────────────────────────────────────────────────────────
  const baseScan = baseline.scores.scan;
  const checkScan = check.scores.scan;
  if (baseScan && checkScan) {
    // Flag on the exact difference; PRINT the difference between the rounded values shown in
    // the two columns beside it, so the row reads consistently. See units.ts.
    const difference = checkScan.elapsedMs - baseScan.elapsedMs;
    const shownDifference = displayedSecondsDifference(baseScan.elapsedMs, checkScan.elapsedMs);
    rows.push({
      module: 'scan',
      label: 'Number scan — time',
      baselineText: seconds(baseScan.elapsedMs),
      checkText: seconds(checkScan.elapsedMs),
      differenceText: describeDifference(shownDifference, seconds, 'longer', 'faster'),
      thresholdText: `Flags at ${seconds(SCAN_SLOWER_MS)} longer or more`,
      flagged: difference >= SCAN_SLOWER_MS,
      compared: true,
    });

    // ── Scan: errors ────────────────────────────────────────────────────────────────
    const errorDifference = checkScan.errors - baseScan.errors;
    rows.push({
      module: 'scan',
      label: 'Number scan — wrong taps',
      baselineText: String(baseScan.errors),
      checkText: String(checkScan.errors),
      differenceText: describeDifference(errorDifference, (n) => String(n), 'more', 'fewer'),
      thresholdText: `Flags at ${SCAN_EXTRA_ERRORS} more or more`,
      flagged: errorDifference >= SCAN_EXTRA_ERRORS,
      compared: true,
    });
  } else {
    rows.push({
      module: 'scan',
      label: 'Number scan — time',
      thresholdText: `Flags at ${seconds(SCAN_SLOWER_MS)} longer or more`,
      ...NOT_COMPARED,
      baselineText: baseScan ? seconds(baseScan.elapsedMs) : 'Not recorded',
      checkText: checkScan ? seconds(checkScan.elapsedMs) : 'Not recorded',
    });
    rows.push({
      module: 'scan',
      label: 'Number scan — wrong taps',
      thresholdText: `Flags at ${SCAN_EXTRA_ERRORS} more or more`,
      ...NOT_COMPARED,
      baselineText: baseScan ? String(baseScan.errors) : 'Not recorded',
      checkText: checkScan ? String(checkScan.errors) : 'Not recorded',
    });
  }

  // ── Symptoms ──────────────────────────────────────────────────────────────────────
  const baseSymptom = baseline.scores.symptom;
  const checkSymptom = check.scores.symptom;
  if (baseSymptom && checkSymptom) {
    const difference = checkSymptom.total - baseSymptom.total;
    rows.push({
      module: 'symptom',
      label: 'Symptom score (out of 30)',
      baselineText: String(baseSymptom.total),
      checkText: String(checkSymptom.total),
      differenceText: describeDifference(difference, (n) => `${n} ${n === 1 ? 'point' : 'points'}`, 'higher', 'lower'),
      thresholdText: `Flags at ${SYMPTOM_INCREASE} points higher or more`,
      flagged: difference >= SYMPTOM_INCREASE,
      compared: true,
    });
  } else {
    rows.push({
      module: 'symptom',
      label: 'Symptom score (out of 30)',
      thresholdText: `Flags at ${SYMPTOM_INCREASE} points higher or more`,
      ...NOT_COMPARED,
      baselineText: baseSymptom ? String(baseSymptom.total) : 'Not recorded',
      checkText: checkSymptom ? String(checkSymptom.total) : 'Not recorded',
    });
  }

  // ── Balance ───────────────────────────────────────────────────────────────────────
  // Only shown if it exists at all. The test isn't built, so an always-empty row would just
  // be clutter on every single result screen.
  const baseBalance = baseline.scores.balance;
  const checkBalance = check.scores.balance;
  if (baseBalance || checkBalance) {
    const compared = Boolean(baseBalance && checkBalance);
    const difference = compared ? checkBalance!.swayScore - baseBalance!.swayScore : 0;
    rows.push({
      module: 'balance',
      label: 'Balance sway',
      baselineText: baseBalance ? baseBalance.swayScore.toFixed(1) : 'Not recorded',
      checkText: checkBalance ? checkBalance.swayScore.toFixed(1) : 'Not recorded',
      differenceText: compared
        ? describeDifference(difference, (n) => n.toFixed(1), 'more sway', 'less sway')
        : 'Not compared',
      thresholdText: `Flags at ${BALANCE_SWAY_INCREASE.toFixed(1)} more sway or more`,
      flagged: compared && difference >= BALANCE_SWAY_INCREASE,
      compared,
    });
  }

  return rows;
}
