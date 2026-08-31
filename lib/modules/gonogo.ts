// lib/modules/gonogo.ts
//
// The pure logic for go / no-go: pacing constants, the rules that decide whether a tap counts,
// and the scoring. No React, no DOM, no timers — every rule in here can be tested by calling a
// function with a number.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THE TASK MEASURES
// ═════════════════════════════════════════════════════════════════════════════════════
// Most trials say GO and the athlete taps as fast as they can. A minority say NO-GO and they
// must do nothing. Because responding is the common case the urge becomes automatic, and
// holding it back takes deliberate effort. That effort is the thing being measured.
//
// It produces three numbers that mean different things and are never added together:
//
//   • the MEDIAN response time on go trials — how fast they are when they should move
//   • COMMISSION errors — tapping on a no-go trial. Failing to hold back.
//   • OMISSION errors  — not tapping on a go trial. Losing attention entirely.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THE PACING NUMBERS BELOW ARE NOT IN thresholds.ts
// ═════════════════════════════════════════════════════════════════════════════════════
// thresholds.ts holds numbers that decide whether something gets FLAGGED. Nothing in this file
// does that. These decide how the task is presented and which taps are worth recording at all,
// which is the same category as CELL_ON_MS in pattern.ts — presentation, so it lives beside its
// module.
//
// They still matter: change one after collection starts and the readings taken before it are no
// longer comparable with the ones taken after. Treat them as frozen once anybody records a real
// baseline.

import { median } from '../stats';
import { MAX_PLAUSIBLE_REACTION_MS } from '../engine/thresholds';
import { GO_NO_TRIALS_PER_FORM, type GoNoTrial } from '../forms';

/* ═══════════════════════════════════════════════════════════════════════════════════
   PACING — how the task is presented
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * How long a stimulus stays on screen, and therefore how long a response is accepted for.
 *
 * WHY IT IS THIS WIDE. A tighter window (many tasks use a second or less) would turn a
 * genuinely SLOW response into an omission error. That is exactly backwards for this app: a
 * slowed response time is the signal we are trying to measure, and converting it into a
 * different error category would hide it. A wide window means a slow athlete still produces a
 * measurable number instead of a hole in the data.
 */
export const GO_NO_STIMULUS_WINDOW_MS = 1500;

/**
 * The blank gap before each stimulus, drawn at random between these two values.
 *
 * UNPREDICTABLE ON PURPOSE. With a fixed gap you learn the rhythm within a few trials and start
 * moving on the beat rather than on the stimulus. Response times then measure your sense of
 * timing, and — worse for this task — a rhythmic tap lands on no-go trials too, so the errors
 * stop meaning anything either.
 */
export const GO_NO_MIN_GAP_MS = 700;
export const GO_NO_MAX_GAP_MS = 1600;

/** How long the "too soon" / "that round will repeat" message sits on screen before re-arming. */
export const GO_NO_MESSAGE_MS = 900;

/* ═══════════════════════════════════════════════════════════════════════════════════
   DATA QUALITY — which taps are worth recording. NOT flagging thresholds.
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * The fastest a tap can arrive after a stimulus and still plausibly have been CAUSED by it.
 *
 * Anything quicker was already on its way down before the athlete could have seen and processed
 * anything — they guessed the timing. Recording it would drag the median downwards, and a
 * baseline full of anticipations makes a later honest sitting look slower than it is: a false
 * flag built out of the athlete's own impatience.
 *
 * So an anticipation is DISCARDED AND THE TRIAL REPEATED, exactly as the noise-floor pad
 * discards and repeats an implausible trial. It is never recorded, and never counted as an error
 * either — we did not measure that trial, so we say nothing about it.
 *
 * TODO(NEEDS_SOURCE): the exact number is our own choice of "obviously too fast to be a
 * reaction", not a value taken from any published protocol. It is deliberately well below any
 * real response so it only ever catches guessing.
 */
export const GO_NO_MIN_PLAUSIBLE_RESPONSE_MS = 150;

/**
 * How late the window-closing timer may fire before we stop believing it.
 *
 * WHY THIS EXISTS. The response window is closed by a timer. Browsers throttle timers hard in a
 * tab that is not visible — put the phone in a pocket mid-run and a 1500 ms timer can fire many
 * seconds later. Without this check, every trial that passed while the screen was off would be
 * recorded as an omission error: a page of attention failures invented by the phone's power
 * saving, on an athlete who was never shown anything.
 *
 * So when the timer finally fires we look at the real clock. If far more time has passed than
 * the window allows, we do not trust that trial in either direction — it is discarded and
 * repeated, like an anticipation.
 */
export const GO_NO_TIMER_SLACK_MS = 750;

/**
 * How many times one trial may be discarded and repeated before we give up on the whole run.
 *
 * A repeat is the right answer to a single bad trial, but "repeat forever" is its own failure:
 * a phone left face-down would sit in that loop with no way out. After this many discards on the
 * same trial we stop the run and record NOTHING. An abandoned run is honest; a run stitched
 * together from trials the athlete never saw is not.
 */
export const GO_NO_MAX_TRIAL_REPEATS = 3;

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE RULES
   ═══════════════════════════════════════════════════════════════════════════════════ */

/** What we decided about a tap that landed while a stimulus was showing. */
export type ResponseJudgement =
  /** Too fast to have been caused by the stimulus. Discard the trial and repeat it. */
  | { kind: 'anticipation' }
  /** Arrived after the window should have closed — the timer was throttled. Discard and repeat. */
  | { kind: 'stale' }
  /** A real response, this many milliseconds after the stimulus appeared. */
  | { kind: 'response'; ms: number };

/**
 * Judge one tap by how long after the stimulus it arrived.
 *
 * Deliberately a plain function of one number: no state, no DOM, no trial type. Whether the
 * trial was go or no-go decides what the response MEANS, not whether it was a real response, and
 * keeping those two decisions apart is what makes both of them testable.
 */
export function judgeResponse(elapsedMs: number): ResponseJudgement {
  if (elapsedMs < GO_NO_MIN_PLAUSIBLE_RESPONSE_MS) return { kind: 'anticipation' };
  if (elapsedMs > GO_NO_STIMULUS_WINDOW_MS) return { kind: 'stale' };
  return { kind: 'response', ms: Math.round(elapsedMs) };
}

/**
 * When the window timer fires, did it fire on time?
 *
 * 'closed'  — the window really did run out. A go trial with no response is an omission; a
 *             no-go trial with no response is a correct withhold.
 * 'stale'   — the timer was throttled and far more time has passed than the window allows. We
 *             cannot tell whether the athlete saw the stimulus, so we discard and repeat.
 */
export function judgeWindowClose(elapsedMs: number): 'closed' | 'stale' {
  return elapsedMs > GO_NO_STIMULUS_WINDOW_MS + GO_NO_TIMER_SLACK_MS ? 'stale' : 'closed';
}

/**
 * A sanity bound shared with the rest of the app: no timed trial anywhere may accept a response
 * slower than MAX_PLAUSIBLE_REACTION_MS. Our window is far tighter, so that ceiling can never
 * bind here — this function exists so a test can prove that, and so the day somebody widens the
 * window they find out immediately rather than silently recording three-second "reactions".
 */
export function windowIsWithinPlausibleCeiling(): boolean {
  return GO_NO_STIMULUS_WINDOW_MS <= MAX_PLAUSIBLE_REACTION_MS;
}

/** How long to wait before the next stimulus. `random` is injected so tests can pin it. */
export function gapDelayMs(random: () => number = Math.random): number {
  return GO_NO_MIN_GAP_MS + random() * (GO_NO_MAX_GAP_MS - GO_NO_MIN_GAP_MS);
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   OUTCOMES AND SCORING
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * What happened on one trial that was actually completed.
 *
 * Note what is NOT in this union: a discarded trial. A trial that was repeated has no outcome at
 * all — it did not happen, so it contributes nothing to any count. Giving it an outcome kind
 * would be the beginning of counting it as something.
 */
export type TrialOutcome =
  /** Go trial, responded. The number we came for. */
  | { kind: 'go-response'; ms: number }
  /** Go trial, no response before the window closed. An omission error. */
  | { kind: 'go-omission' }
  /** No-go trial, responded. A commission error. */
  | { kind: 'nogo-commission' }
  /** No-go trial, correctly did nothing. */
  | { kind: 'nogo-withheld' };

/** What one completed run produces. */
export type GoNoGoRunResult = {
  formId: string;
  /** Every accepted go-trial response time, in the order they happened. */
  goTrialsMs: number[];
  medianMs: number;
  commissionErrors: number;
  omissionErrors: number;
};

/**
 * The subset of a run that gets stored on a TestResult.
 *
 * WHY IT IS A SUBSET. `goTrialsMs` — the raw per-trial times — is genuinely the most useful
 * thing this module produces for threshold work, but ModuleScores.goNoGo has no field for it,
 * and adding one changes the stored shape, which requires bumping CURRENT_SCHEMA_VERSION and
 * makes every baseline already on a phone unreadable. That is not a change to make in passing.
 *
 * So the raw times are shown on screen at the end of a run (write them down, the same workflow
 * as /tools/noise-floor) and the record keeps the four fields the data contract defines. See
 * SESSION-REPORT.md — widening the contract is written up there as a proposal for the humans.
 */
export type GoNoGoStoredScore = {
  formId: string;
  medianMs: number;
  commissionErrors: number;
  omissionErrors: number;
};

/**
 * Turn a run's completed trials into a score, or null if there is no honest score to give.
 *
 * THE NULL CASE: no go trial produced a response at all. There is then no median — not a median
 * of zero, not a median of the window length, nothing. The athlete did not do the task. Rather
 * than invent a number to fill the field, we return null and the screen says nothing could be
 * measured. A test nobody took must not produce a score.
 *
 * Note the cost of that choice, which is real: the omission count in that situation is itself a
 * striking finding, and returning null throws it away. It is still the right call — the contract
 * requires a median, and every way of manufacturing one is a fabrication. Widening the contract
 * so medianMs can be null is proposed in SESSION-REPORT.md.
 */
export function scoreGoNoGo(
  formId: string,
  outcomes: readonly TrialOutcome[],
): GoNoGoRunResult | null {
  const goTrialsMs: number[] = [];
  let commissionErrors = 0;
  let omissionErrors = 0;

  for (const outcome of outcomes) {
    if (outcome.kind === 'go-response') goTrialsMs.push(outcome.ms);
    else if (outcome.kind === 'go-omission') omissionErrors += 1;
    else if (outcome.kind === 'nogo-commission') commissionErrors += 1;
    // 'nogo-withheld' is the correct answer on a no-go trial and counts towards nothing.
  }

  if (goTrialsMs.length === 0) return null;

  return {
    formId,
    goTrialsMs,
    medianMs: Math.round(median(goTrialsMs)),
    commissionErrors,
    omissionErrors,
  };
}

/** Drop the fields the stored data contract has no home for. See GoNoGoStoredScore. */
export function toStoredScore(run: GoNoGoRunResult): GoNoGoStoredScore {
  return {
    formId: run.formId,
    medianMs: run.medianMs,
    commissionErrors: run.commissionErrors,
    omissionErrors: run.omissionErrors,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   SMALL HELPERS FOR THE SCREEN
   ═══════════════════════════════════════════════════════════════════════════════════ */

/** How many trials a run has. Read from the pool so the screen never assumes a length. */
export const GO_NO_TOTAL_TRIALS = GO_NO_TRIALS_PER_FORM;

/**
 * Is this trial a go trial?
 *
 * Trivial, but it exists so the screen never writes `trials[i] === 'go'` inline. The one place
 * that decides what a trial is stays the one place a test can point at.
 */
export function isGoTrial(trial: GoNoTrial): boolean {
  return trial === 'go';
}
