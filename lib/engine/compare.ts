// lib/engine/compare.ts
//
// THE COMPARISON ENGINE.
//
// Give it an athlete's baseline sitting and a new sideline check, and it answers one
// question: did anything move enough, compared to THIS athlete's own healthy numbers, that a
// human should take a closer look?
//
// =====================================================================================
// THE RULES THIS FILE FOLLOWS
// =====================================================================================
//
// 1. Compare an athlete only to themselves.
//    There is no population average anywhere in here. A 310ms reaction time is unremarkable
//    for one kid and a red flag for another; the only meaningful reference point is what
//    that same athlete did while healthy. We even refuse to run if the two sittings belong
//    to different athletes, because that comparison would be meaningless.
//
// 2. Every number comes from thresholds.ts.
//    There is not a single bare number in the comparison logic below. If you want to change
//    how sensitive the app is, there is exactly one file to edit.
//
// 3. Missing modules are skipped, never guessed.
//    Any module can be null on either side (a rushed sideline check might only do two
//    tests). A module we cannot compare is reported as "not compared" - it never quietly
//    counts as "no change", because those two things mean very different things.
//
// 4. Any single module flagging flags the whole screen.
//    We deliberately do not require two modules to agree, and we do not average them. This
//    app is a smoke alarm, not a diagnosis: the cost of one extra "go get checked" is small,
//    and the cost of missing something is not.
//
// 5. No baseline is an ERROR, never a pass.
//    If there is nothing to compare against, the engine throws. It must be impossible for a
//    missing baseline to produce a comfortable-looking "nothing found" screen.
//
// 6. A baseline must predate the check.
//    See the guard below - this one closes a genuinely dangerous path through the app.
//
// And the rule that governs the wording of everything below: this file describes CHANGES in
// test scores. It never says anything about whether a person is concussed, healthy, or safe.

import type { FlagOutcome, TestResult } from '../types';
import {
  BALANCE_SWAY_INCREASE,
  REACTION_SLOWER_MS,
  SCAN_EXTRA_ERRORS,
  SCAN_SLOWER_MS,
  SYMPTOM_INCREASE,
} from './thresholds';
import {
  displayedSecondsDifference,
  msText as ms,
  pointsText as points,
  secondsText as seconds,
} from './units';

/* -------------------------------------------------------------------------------------
   Errors - these exist so the UI can tell the difference between "we compared and found
   nothing" and "we could not compare at all". Conflating those would break the hard rule.
   ------------------------------------------------------------------------------------- */

/** Thrown when a check is compared and the athlete has no baseline on file. */
export class MissingBaselineError extends Error {
  constructor(
    message = 'This athlete has no baseline on file, so there is nothing to compare this check against.',
  ) {
    super(message);
    this.name = 'MissingBaselineError';
  }
}

/** Thrown when the two sittings can't legitimately be compared to each other. */
export class InvalidComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidComparisonError';
  }
}

/* Wording helpers live in units.ts, shared with the results table so the two can never
   describe the same number differently. */

/* -------------------------------------------------------------------------------------
   The engine
   ------------------------------------------------------------------------------------- */

/**
 * Compare a check against a baseline and decide whether to flag.
 *
 * @param baseline The athlete's baseline sitting. Passing null/undefined throws - see rule 5.
 * @param check    The new sitting to evaluate.
 */
export function compareToBaseline(
  baseline: TestResult | null | undefined,
  check: TestResult,
): FlagOutcome {
  // -- Rule 5: refuse to produce a result we can't stand behind. ----------------------
  if (!baseline) {
    throw new MissingBaselineError();
  }

  // -- Rule 1: you are only ever compared to yourself. --------------------------------
  if (baseline.athleteId !== check.athleteId) {
    throw new InvalidComparisonError(
      "These two sittings belong to different athletes. Results are only ever compared against the same athlete's own baseline.",
    );
  }

  if (baseline.kind !== 'baseline') {
    throw new InvalidComparisonError(
      'The sitting being used as a baseline was not recorded as a baseline.',
    );
  }

  // -- Rule 6: a baseline must come BEFORE the check it is measured against. ----------
  //
  // This guard exists because of a genuinely dangerous path through the app. If a coach runs
  // a sideline check on an athlete with no baseline, then records a baseline right there to
  // "fix" the error, that baseline is taken from an athlete who may already be concussed.
  // Re-opening the earlier check would then compare an impaired athlete against himself
  // impaired, the differences would be tiny, and the app would show the most reassuring
  // screen it has. That is precisely the outcome the hard rule exists to prevent.
  //
  // The same guard also stops something subtler: an Athlete holds ONE baselineId, so
  // recording a new baseline silently re-scores every past check against it. A check taken
  // months before the current baseline was never measured against it and must not be
  // retroactively rewritten - a result that previously read FLAGGED could otherwise quietly
  // turn into "no change detected".
  //
  // We refuse loudly in both cases. Losing the ability to re-read an old result is a real
  // cost, and it is the right trade: this app's whole job is to avoid false reassurance.
  if (baseline.takenAt >= check.takenAt) {
    throw new InvalidComparisonError(
      'The baseline on file was recorded at the same time as, or after, this check. A baseline ' +
        'only means something if it was recorded BEFORE the hit, while the athlete was well, so ' +
        'this check cannot be compared against it.',
    );
  }

  const modules = { reaction: false, scan: false, symptom: false, balance: false };
  const explanations: string[] = [];

  // -- Reaction time -----------------------------------------------------------------
  // Higher = slower = worse, so we look for the check being LARGER than the baseline.
  const baseReaction = baseline.scores.reaction;
  const checkReaction = check.scores.reaction;

  if (baseReaction && checkReaction) {
    const difference = checkReaction.medianMs - baseReaction.medianMs;

    if (difference >= REACTION_SLOWER_MS) {
      modules.reaction = true;
      explanations.push(
        `Reaction time was ${ms(difference)} slower than this athlete's baseline ` +
          `(${ms(checkReaction.medianMs)} now, compared with ${ms(baseReaction.medianMs)} at baseline). ` +
          `This screen flags a slowdown of ${ms(REACTION_SLOWER_MS)} or more.`,
      );
    } else if (difference > 0) {
      explanations.push(
        `Reaction time was ${ms(difference)} slower than baseline ` +
          `(${ms(checkReaction.medianMs)} now, compared with ${ms(baseReaction.medianMs)}), ` +
          `which is under the ${ms(REACTION_SLOWER_MS)} mark this screen flags at.`,
      );
    } else {
      explanations.push(
        `Reaction time was ${ms(Math.abs(difference))} faster than baseline ` +
          `(${ms(checkReaction.medianMs)} now, compared with ${ms(baseReaction.medianMs)}).`,
      );
    }
  } else {
    explanations.push(
      'Reaction time was not recorded in both sittings, so it could not be compared.',
    );
  }

  // -- Number scan -------------------------------------------------------------------
  // Two independent ways to flag: taking longer, or making more mistakes. Either one alone
  // is enough, because they can come apart - someone can stay fast by getting sloppy.
  const baseScan = baseline.scores.scan;
  const checkScan = check.scores.scan;

  if (baseScan && checkScan) {
    // ONE number does both jobs: the flag decision and the sentence.
    //
    // We originally flagged on the exact millisecond difference while printing a rounded one,
    // and that could produce a sentence contradicting itself - "took 4.0 s longer ... which is
    // under the 4.0 s mark this screen flags at" - because 3,960ms displays as 4.0s but does
    // not cross a 4,000ms threshold. On a screen whose only job is to be believed, visibly
    // broken arithmetic is worse than the 100ms of precision we give up.
    //
    // Rounding to the displayed precision can only ever move a borderline case ACROSS the
    // threshold into flagging, never out of it - the safe direction for this app.
    const timeDifference = displayedSecondsDifference(baseScan.elapsedMs, checkScan.elapsedMs);
    const errorDifference = checkScan.errors - baseScan.errors;

    if (timeDifference >= SCAN_SLOWER_MS) {
      modules.scan = true;
      explanations.push(
        `The number scan took ${seconds(timeDifference)} longer than this athlete's baseline ` +
          `(${seconds(checkScan.elapsedMs)} now, compared with ${seconds(baseScan.elapsedMs)}). ` +
          `This screen flags ${seconds(SCAN_SLOWER_MS)} or more.`,
      );
    } else if (timeDifference > 0) {
      explanations.push(
        `The number scan took ${seconds(timeDifference)} longer than baseline ` +
          `(${seconds(checkScan.elapsedMs)} now, compared with ${seconds(baseScan.elapsedMs)}), ` +
          `which is under the ${seconds(SCAN_SLOWER_MS)} mark this screen flags at.`,
      );
    } else {
      explanations.push(
        `The number scan was ${seconds(Math.abs(timeDifference))} faster than baseline ` +
          `(${seconds(checkScan.elapsedMs)} now, compared with ${seconds(baseScan.elapsedMs)}).`,
      );
    }

    if (errorDifference >= SCAN_EXTRA_ERRORS) {
      modules.scan = true;
      explanations.push(
        `There were ${errorDifference} more wrong taps on the number scan than at baseline ` +
          `(${checkScan.errors} now, compared with ${baseScan.errors}). ` +
          `This screen flags ${SCAN_EXTRA_ERRORS} or more extra mistakes.`,
      );
    } else if (errorDifference > 0) {
      explanations.push(
        `There ${errorDifference === 1 ? 'was' : 'were'} ${errorDifference} more wrong ` +
          `${errorDifference === 1 ? 'tap' : 'taps'} on the number scan than at baseline ` +
          `(${checkScan.errors} now, compared with ${baseScan.errors}), which is under the ` +
          `${SCAN_EXTRA_ERRORS}-mistake mark this screen flags at.`,
      );
    }
  } else {
    explanations.push(
      'The number scan was not recorded in both sittings, so it could not be compared.',
    );
  }

  // -- Symptom checklist -------------------------------------------------------------
  // Higher total = more/worse symptoms than this athlete's own normal.
  const baseSymptom = baseline.scores.symptom;
  const checkSymptom = check.scores.symptom;

  if (baseSymptom && checkSymptom) {
    const difference = checkSymptom.total - baseSymptom.total;

    if (difference >= SYMPTOM_INCREASE) {
      modules.symptom = true;
      explanations.push(
        `The symptom score rose by ${points(difference)} compared with this athlete's baseline ` +
          `(${checkSymptom.total} out of 30 now, compared with ${baseSymptom.total}). ` +
          `This screen flags a rise of ${points(SYMPTOM_INCREASE)} or more.`,
      );
    } else if (difference > 0) {
      explanations.push(
        `The symptom score rose by ${points(difference)} compared with baseline ` +
          `(${checkSymptom.total} out of 30 now, compared with ${baseSymptom.total}), which is ` +
          `under the ${points(SYMPTOM_INCREASE)} rise this screen flags at.`,
      );
    } else if (difference < 0) {
      explanations.push(
        `The symptom score was ${points(Math.abs(difference))} lower than baseline ` +
          `(${checkSymptom.total} out of 30 now, compared with ${baseSymptom.total}).`,
      );
    } else {
      explanations.push(
        `The symptom score was the same as baseline (${checkSymptom.total} out of 30).`,
      );
    }
  } else {
    explanations.push(
      'The symptom checklist was not completed in both sittings, so it could not be compared.',
    );
  }

  // -- Balance -----------------------------------------------------------------------
  // Not built yet (scores.balance is always null today), but the comparison is written so
  // that adding the test later requires no change in here.
  const baseBalance = baseline.scores.balance;
  const checkBalance = check.scores.balance;

  if (baseBalance && checkBalance) {
    const difference = checkBalance.swayScore - baseBalance.swayScore;
    if (difference >= BALANCE_SWAY_INCREASE) {
      modules.balance = true;
      explanations.push(
        `Balance sway increased by ${difference.toFixed(1)} compared with this athlete's baseline ` +
          `(${checkBalance.swayScore.toFixed(1)} now, compared with ${baseBalance.swayScore.toFixed(1)}).`,
      );
    }
  }
  // No "not compared" line for balance: the test doesn't exist yet, so saying it was skipped
  // every single time would be noise.

  // -- Rule 4: any one module is enough. ---------------------------------------------
  const flagged = modules.reaction || modules.scan || modules.symptom || modules.balance;

  return { flagged, modules, explanations };
}
