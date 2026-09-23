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
// 4. Symptoms alone, or any TWO modules together, flag the whole screen.
//    Changed 2026-09-10 from "any single module", at the project owner's direction. With ten
//    measurements, flag-on-any is ten separate chances to false-alarm on a healthy athlete —
//    the calibration harness measured ~30% of healthy simulated athletes flagged under
//    flag-on-any against ~3% under flag-on-two. The symptom checklist is the one exception
//    and may flag alone (see MODULES_REQUIRED_TO_FLAG in thresholds.ts for the rationale and
//    its TODO(NEEDS_SOURCE)). A single non-symptom module past its cut-off does NOT flag the
//    screen — but it is still recorded in `modules`, and the results screen shows that state
//    explicitly rather than letting it render as "no change".
//
// 5. No baseline is an ERROR, never a pass.
//    If there is nothing to compare against, the engine throws. It must be impossible for a
//    missing baseline to produce a comfortable-looking "nothing found" screen.
//
// 6. A baseline must predate the check.
//    See the guard below - this one closes a genuinely dangerous path through the app.
//
// 7. Both sittings must have been measured by THIS version of the battery.
//    When the battery changes, older records hold different fields. Rule 3 would skip the
//    missing ones one by one and quietly report on whatever overlapped, which would look
//    exactly like a full comparison. We refuse instead. See lib/schema.ts.
//
// And the rule that governs the wording of everything below: this file describes CHANGES in
// test scores. It never says anything about whether a person is concussed, healthy, or safe.

import type { FlagOutcome, TestResult } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { DIGIT_TRIALS_PER_FORM, PATTERN_TRIALS_PER_FORM, RECOGNITION_GRID_SIZE } from '../forms';
import {
  BALANCE_SWAY_INCREASE,
  DIGIT_SPAN_FEWER_CORRECT,
  GO_NO_GO_MORE_COMMISSION_ERRORS,
  GO_NO_GO_MORE_OMISSION_ERRORS,
  GO_NO_GO_SLOWER_MS,
  MODULES_REQUIRED_TO_FLAG,
  PATTERN_SPAN_FEWER_CORRECT,
  SYMPTOM_INCREASE,
  WORD_LEARNING_FEWER_CORRECT,
  WORD_LEARNING_MORE_FALSE_ALARMS,
  WORD_RECOGNITION_FEWER_CORRECT,
  WORD_RECOGNITION_MORE_FALSE_ALARMS,
} from './thresholds';
import { type ChangeWords, type MeasurementKey, worseningFor } from './direction';
import { msText as ms, pointsText as points } from './units';

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

/**
 * Thrown when a sitting was recorded under a different version of the battery than this build
 * measures — see lib/schema.ts.
 *
 * WHY THIS IS ITS OWN ERROR rather than a flavour of InvalidComparisonError: the UI has to
 * say something completely different about it. Every other refusal in here is about the two
 * records being wrong for each other; this one is about the records being fine and the APP
 * having moved on. The only fix is recording a fresh baseline, so the screen needs to say
 * that, and it needs the version numbers to explain which side is out of date.
 */
export class SchemaVersionMismatchError extends Error {
  /** The version the baseline sitting was recorded under. */
  readonly baselineVersion: number;
  /** The version the check sitting was recorded under. */
  readonly checkVersion: number;
  /** The version this build of the app measures. */
  readonly currentVersion: number;

  constructor(baselineVersion: number, checkVersion: number) {
    super(
      'These sittings were recorded under a different version of the test battery than this ' +
        'version of the app measures, so their scores are not comparable. ' +
        `(baseline: version ${baselineVersion}; check: version ${checkVersion}; ` +
        `this app: version ${CURRENT_SCHEMA_VERSION}.)`,
    );
    this.name = 'SchemaVersionMismatchError';
    this.baselineVersion = baselineVersion;
    this.checkVersion = checkVersion;
    this.currentVersion = CURRENT_SCHEMA_VERSION;
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

  // -- Rule 7: both sittings must have been measured by THIS version of the battery. --
  //
  // The scores object holds whatever the battery measured at the time. Change the battery and
  // the records written afterwards have different keys from the ones written before. Both are
  // honest records; they are simply not measurements of the same things.
  //
  // The danger is that nothing about this fails loudly on its own. A module the older sitting
  // never measured arrives here as `null`, and rule 3 above correctly skips anything it cannot
  // compare — so an old baseline against a new check would quietly compare whatever few fields
  // happened to survive the change and report on those. A one-module comparison rendered with
  // the same confidence as a full one is exactly the false reassurance this app exists to
  // avoid.
  //
  // So we require BOTH sittings to match the current version, not merely each other. Two old
  // sittings are comparable with one another in principle, but this build no longer knows what
  // its own comparison logic would be leaving out, and guessing is not a thing we do here.
  //
  // The cost is real and accepted: after the battery changes, old baselines stop opening and
  // the athlete has to record a new one. That is the same trade rule 6 makes — losing the
  // ability to re-read an old result is worth it to never show a comparison we cannot stand
  // behind.
  if (
    baseline.schemaVersion !== CURRENT_SCHEMA_VERSION ||
    check.schemaVersion !== CURRENT_SCHEMA_VERSION
  ) {
    throw new SchemaVersionMismatchError(baseline.schemaVersion, check.schemaVersion);
  }

  const modules = {
    symptom: false,
    wordLearning: false,
    wordRecognition: false,
    digitSpan: false,
    patternSpan: false,
    goNoGo: false,
    balance: false,
  };
  const explanations: string[] = [];
  const unevaluated: string[] = [];

  /*
    WHY THE COMPARISONS ARE A TABLE AND NOT ELEVEN HAND-WRITTEN BLOCKS

    The original engine compared three modules with three near-identical blocks of if/else. At
    eleven measurements that stops being readable and starts being dangerous: every block
    repeats the same subtraction, and one of them getting the operands backwards is a silent,
    severe bug — an athlete who has declined would read as improved (see direction.ts). It would
    also be eleven separate places to remember the null-threshold rule.

    So each measurement declares WHAT it is, and the single loop below decides what to say about
    it. Direction lives in direction.ts, the magnitude comparison happens once, and the
    null-threshold rule is applied in exactly one place.
  */
  type Comparison = {
    /** Which module's flag this measurement can set. */
    module: keyof typeof modules;
    /** Which direction rule applies — see direction.ts. */
    measurement: MeasurementKey;
    /** How this measurement is named to a parent. */
    label: string;
    /** The flagging threshold, or null if we have no validated value yet. */
    threshold: number | null;
    /** The two values, or null on a side where the module was not recorded. */
    baselineValue: number | null;
    checkValue: number | null;
    /** Render a value for display, e.g. "7 out of 9". */
    format: (value: number) => string;
    /** Render the SIZE of a change, e.g. "3", "62 ms", "5 points". */
    formatChange: (magnitude: number) => string;
    /** Words for a change in each direction, e.g. worse: "fewer correct". */
    words: ChangeWords;
    /**
     * When true, a measurement missing from BOTH sittings produces no sentence at all.
     * Used for balance (not built yet) and for go/no-go — the module is built now, but a
     * sitting can legitimately carry no go/no-go score (a run where no go trial got a
     * response records nothing, see scoreGoNoGo), and announcing "not recorded" for a module
     * absent from both sides is noise, not information. Absent from ONE side still gets the
     * "could not be compared" sentence like everything else.
     */
    silentWhenAbsent?: boolean;
  };

  const count = (value: number) => String(value);
  const outOf = (total: number) => (value: number) => `${value} out of ${total}`;

  const comparisons: Comparison[] = [
    {
      module: 'symptom',
      measurement: 'symptomTotal',
      label: 'The symptom score',
      threshold: SYMPTOM_INCREASE,
      baselineValue: baseline.scores.symptom?.total ?? null,
      checkValue: check.scores.symptom?.total ?? null,
      format: outOf(30),
      formatChange: points,
      words: { worse: 'higher', better: 'lower' },
    },
    {
      module: 'wordLearning',
      measurement: 'wordLearningCorrect',
      label: 'Word learning, straight after seeing the words',
      threshold: WORD_LEARNING_FEWER_CORRECT,
      baselineValue: baseline.scores.wordLearning?.correct ?? null,
      checkValue: check.scores.wordLearning?.correct ?? null,
      format: outOf(RECOGNITION_GRID_SIZE),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'wordLearning',
      measurement: 'wordLearningFalseAlarms',
      label: 'Words wrongly remembered straight away',
      threshold: WORD_LEARNING_MORE_FALSE_ALARMS,
      baselineValue: baseline.scores.wordLearning?.falseAlarms ?? null,
      checkValue: check.scores.wordLearning?.falseAlarms ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
    },
    {
      module: 'wordRecognition',
      measurement: 'wordRecognitionCorrect',
      label: 'Word recall after a delay',
      threshold: WORD_RECOGNITION_FEWER_CORRECT,
      baselineValue: baseline.scores.wordRecognition?.correct ?? null,
      checkValue: check.scores.wordRecognition?.correct ?? null,
      format: outOf(RECOGNITION_GRID_SIZE),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'wordRecognition',
      measurement: 'wordRecognitionFalseAlarms',
      label: 'Words wrongly remembered after a delay',
      threshold: WORD_RECOGNITION_MORE_FALSE_ALARMS,
      baselineValue: baseline.scores.wordRecognition?.falseAlarms ?? null,
      checkValue: check.scores.wordRecognition?.falseAlarms ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
    },
    {
      module: 'digitSpan',
      measurement: 'digitSpanCorrect',
      label: 'Repeating numbers backwards',
      threshold: DIGIT_SPAN_FEWER_CORRECT,
      baselineValue: baseline.scores.digitSpan?.correct ?? null,
      checkValue: check.scores.digitSpan?.correct ?? null,
      format: outOf(DIGIT_TRIALS_PER_FORM),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'patternSpan',
      measurement: 'patternSpanCorrect',
      label: 'Repeating tapped patterns',
      threshold: PATTERN_SPAN_FEWER_CORRECT,
      baselineValue: baseline.scores.patternSpan?.correct ?? null,
      checkValue: check.scores.patternSpan?.correct ?? null,
      format: outOf(PATTERN_TRIALS_PER_FORM),
      formatChange: count,
      words: { worse: 'fewer correct', better: 'more correct' },
    },
    {
      module: 'goNoGo',
      measurement: 'goNoGoMedianMs',
      label: 'Go / no-go response time',
      threshold: GO_NO_GO_SLOWER_MS,
      baselineValue: baseline.scores.goNoGo?.medianMs ?? null,
      checkValue: check.scores.goNoGo?.medianMs ?? null,
      format: ms,
      formatChange: ms,
      words: { worse: 'slower', better: 'faster' },
      silentWhenAbsent: true,
    },
    {
      module: 'goNoGo',
      measurement: 'goNoGoCommissionErrors',
      label: 'Times they responded when the signal said stop',
      threshold: GO_NO_GO_MORE_COMMISSION_ERRORS,
      baselineValue: baseline.scores.goNoGo?.commissionErrors ?? null,
      checkValue: check.scores.goNoGo?.commissionErrors ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
      silentWhenAbsent: true,
    },
    {
      module: 'goNoGo',
      measurement: 'goNoGoOmissionErrors',
      label: 'Times they missed a go signal entirely',
      threshold: GO_NO_GO_MORE_OMISSION_ERRORS,
      baselineValue: baseline.scores.goNoGo?.omissionErrors ?? null,
      checkValue: check.scores.goNoGo?.omissionErrors ?? null,
      format: count,
      formatChange: count,
      words: { worse: 'more', better: 'fewer' },
      silentWhenAbsent: true,
    },
    {
      module: 'balance',
      measurement: 'balanceSway',
      label: 'Balance sway',
      threshold: BALANCE_SWAY_INCREASE,
      baselineValue: baseline.scores.balance?.swayScore ?? null,
      checkValue: check.scores.balance?.swayScore ?? null,
      format: (value) => value.toFixed(1),
      formatChange: (magnitude) => magnitude.toFixed(1),
      words: { worse: 'more sway', better: 'less sway' },
      silentWhenAbsent: true,
    },
  ];

  for (const item of comparisons) {
    const { baselineValue, checkValue } = item;

    // -- Rule 3: a module we cannot compare is never counted as "no change". ------------
    if (baselineValue === null || checkValue === null) {
      const absentFromBoth = baselineValue === null && checkValue === null;
      if (!(absentFromBoth && item.silentWhenAbsent)) {
        explanations.push(
          `${item.label} was not recorded in both sittings, so it could not be compared.`,
        );
      }
      continue;
    }

    // Positive means worse, whichever way "worse" runs for this measurement. The sign handling
    // lives in direction.ts precisely so it is not repeated here eleven times.
    const worsening = worseningFor(item.measurement, baselineValue, checkValue);
    const bothValues =
      `(${item.format(checkValue)} now, compared with ${item.format(baselineValue)} at baseline)`;

    /*
      -- THE NULL-THRESHOLD RULE -------------------------------------------------------
      No validated cut-off exists for this measurement yet, so we have no basis for saying
      whether the change matters. We report the change, say plainly that we did not judge it,
      and record it in `unevaluated` so the results screen can refuse to look reassuring.

      What we must NOT do is fall through without setting a flag, because that is
      indistinguishable from having checked and found nothing. "We did not look" is not
      "we looked and it was fine". See thresholds.ts for why these are null.
    */
    if (item.threshold === null) {
      unevaluated.push(item.label);

      const movement =
        worsening > 0
          ? `${item.formatChange(worsening)} ${item.words.worse} than baseline`
          : worsening < 0
            ? `${item.formatChange(Math.abs(worsening))} ${item.words.better} than baseline`
            : 'the same as baseline';

      explanations.push(
        `${item.label}: ${movement} ${bothValues}. This screen has no tested cut-off for this ` +
          'measurement yet, so it was NOT judged. Treat it as unread, not as normal.',
      );
      continue;
    }

    // NOTE the wording: a crossed cut-off marks the MEASUREMENT, and whether the whole screen
    // flags is rule 4's separate decision below. The sentence must not claim more than that.
    if (worsening >= item.threshold) {
      modules[item.module] = true;
      explanations.push(
        `${item.label} was ${item.formatChange(worsening)} ${item.words.worse} than this ` +
          `athlete's baseline ${bothValues}. That is at or past the ` +
          `${item.formatChange(item.threshold)} ${item.words.worse} mark set for this measurement.`,
      );
    } else if (worsening > 0) {
      explanations.push(
        `${item.label} was ${item.formatChange(worsening)} ${item.words.worse} than baseline ` +
          `${bothValues}, which is under the ${item.formatChange(item.threshold)} ` +
          `${item.words.worse} mark set for this measurement.`,
      );
    } else if (worsening < 0) {
      explanations.push(
        `${item.label} was ${item.formatChange(Math.abs(worsening))} ${item.words.better} than ` +
          `baseline ${bothValues}.`,
      );
    } else {
      explanations.push(`${item.label} was the same as baseline ${bothValues}.`);
    }
  }

  // -- Rule 4: symptoms alone, or any two modules together. ---------------------------
  //
  // `modules` deliberately keeps every per-module crossing regardless of this rule, so a
  // change that stayed below the flag bar is still visible to the results screen — which has
  // its own state for exactly that, because hiding it inside "no change" would be a lie.
  const flaggedModuleCount = Object.values(modules).filter(Boolean).length;
  const flagged = modules.symptom || flaggedModuleCount >= MODULES_REQUIRED_TO_FLAG;

  return { flagged, modules, explanations, unevaluated };
}
