// lib/engine/thresholds.ts
//
// EVERY threshold in the app lives in this one file. If a number decides whether something
// gets flagged, it belongs here — never hard-coded ("magic number") inside the engine or a
// component. That way there's exactly one place to read, explain, and tune the sensitivity.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// TODO(NEEDS_SOURCE): These values are OUR OWN PLACEHOLDER GUESSES. They are NOT clinically
// validated and are not taken from any published concussion protocol. Real thresholds would
// need to come from actual clinical data / a qualified source, which we do not have. Until
// then, the results screen must tell the user these thresholds are placeholders, and the app
// must only ever FLAG and REFER — never diagnose or clear. (See CLAUDE.md, THE HARD RULE.)
// ─────────────────────────────────────────────────────────────────────────────────────
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY MOST OF THE NUMBERS BELOW ARE `null`
// ═════════════════════════════════════════════════════════════════════════════════════
// A threshold answers "how big a change is big enough to be worth a human's attention?" That
// depends entirely on how much a HEALTHY athlete's score wobbles between two sittings on its
// own. Set the threshold below that natural wobble and the app flags everybody, which trains
// people to ignore it. Set it far above and it flags nobody, which is worse.
//
// We have not measured that wobble yet. So for the new battery there is no honest number to
// put here, and a plausible-looking guess would be the most dangerous thing in the file: it
// would look exactly like a real threshold to anyone reading the code, and every result screen
// would inherit its authority.
//
// `null` therefore means something specific and deliberate: THIS MEASUREMENT CANNOT BE JUDGED
// YET. It does not mean zero, it does not mean "flag on any change", and — most importantly —
// it does not mean "no flag". The engine reports these measurements as unevaluated and the
// results screen says out loud that it could not judge them. "We did not look" must never
// render as "we looked and it was fine".
//
// HOW TO FILL THEM IN, when the data exists: have a healthy athlete take the same module twice,
// days apart, several times over. The spread of those baseline-to-baseline differences is the
// noise floor. A threshold has to sit above it. `app/tools/noise-floor` exists to collect
// exactly that, and the JSON export exists to get it off the phone.
//
// Direction is NOT encoded here. Which way a measurement gets worse lives in direction.ts, so
// a threshold is always a plain positive magnitude — "this much worse, whichever way worse is".

/* ═══════════════════════════════════════════════════════════════════════════════════
   MEASURED AND JUDGED — placeholder values, from the original battery
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Symptom checklist total (each sitting produces a total from 0-30).
 * Flag if the check's total is at least this many points ABOVE the baseline total.
 * (More/worse symptoms than their normal healthy state.)
 * PLACEHOLDER — not clinically validated. Carried over from the original battery.
 */
export const SYMPTOM_INCREASE = 5;

/**
 * Balance sway score. Balance is a P1 feature and is NOT built yet (scores.balance stays
 * null), so this threshold is currently unused. Defined here so that when balance is added,
 * its threshold already has a home in this file.
 * Flag if the check's sway score is at least this much ABOVE the baseline sway.
 * PLACEHOLDER — not clinically validated.
 */
export const BALANCE_SWAY_INCREASE = 1;

/* ═══════════════════════════════════════════════════════════════════════════════════
   MEASURED BUT NOT YET JUDGED — every one of these is null on purpose

   TODO(NEEDS_SOURCE) applies to all of them. Do not estimate, tune or infer a value to make
   a screen look more complete. These get filled in from collected noise-floor data and from
   nowhere else.
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Word learning, immediate recognition. Grid words classified correctly, out of 20.
 * Would flag if the check gets at least this many FEWER right than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const WORD_LEARNING_FEWER_CORRECT: number | null = null;

/**
 * Word learning, immediate recognition. Distractors wrongly claimed as seen, out of 10.
 * Would flag if the check has at least this many MORE false alarms than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const WORD_LEARNING_MORE_FALSE_ALARMS: number | null = null;

/**
 * Word learning, DELAYED recognition. Grid words classified correctly, out of 20.
 * Would flag if the check gets at least this many FEWER right than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const WORD_RECOGNITION_FEWER_CORRECT: number | null = null;

/**
 * Word learning, DELAYED recognition. Distractors wrongly claimed as seen, out of 10.
 * Would flag if the check has at least this many MORE false alarms than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const WORD_RECOGNITION_MORE_FALSE_ALARMS: number | null = null;

/**
 * Digit span backward. Trials reproduced exactly, out of 9.
 * Would flag if the check gets at least this many FEWER right than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const DIGIT_SPAN_FEWER_CORRECT: number | null = null;

/**
 * Pattern span. Trials reproduced exactly, out of 9.
 * Would flag if the check gets at least this many FEWER right than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const PATTERN_SPAN_FEWER_CORRECT: number | null = null;

/**
 * Go/no-go, median response time on correct go trials, in milliseconds.
 * Would flag if the check is at least this many ms SLOWER than the baseline.
 * The go/no-go module is not built; a student is writing it.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const GO_NO_GO_SLOWER_MS: number | null = null;

/**
 * Go/no-go commission errors — responding on a no-go trial, i.e. failing to hold back.
 * Would flag if the check has at least this many MORE than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const GO_NO_GO_MORE_COMMISSION_ERRORS: number | null = null;

/**
 * Go/no-go omission errors — not responding on a go trial, i.e. losing attention.
 * Kept separate from commission errors on purpose: "could not stop" and "was not there" are
 * different findings and should not be added together.
 * Would flag if the check has at least this many MORE than the baseline.
 * TODO(NEEDS_SOURCE): no value. Needs collected healthy-variability data.
 */
export const GO_NO_GO_MORE_OMISSION_ERRORS: number | null = null;

/* ═══════════════════════════════════════════════════════════════════════════════════
   DATA QUALITY — this is NOT a flagging threshold
   ═══════════════════════════════════════════════════════════════════════════════════ */
// The values above decide whether a change gets flagged. The value below decides whether a
// measurement is worth keeping at all. It lives in this file because CLAUDE.md says every
// tunable number in the app has exactly one home, but it is kept in its own section because
// the engine must never treat it as a threshold.

/**
 * The longest a single timed trial can be and still plausibly be a REACTION.
 *
 * Nobody genuinely reacts to a stimulus in three seconds. A number that large means the athlete
 * looked away, got distracted, or the phone was backgrounded mid-trial (browsers throttle
 * timers and stop painting frames for tabs that aren't visible). Recording it would inflate
 * their result and could raise a false flag, so a trial over this limit is thrown away and
 * repeated instead.
 *
 * Set deliberately high — well beyond any real reaction, healthy or concussed — so that it
 * only ever catches inattention, never a genuinely slowed athlete.
 *
 * STILL HERE even though the reaction module has been removed, because it is a property of any
 * timed trial rather than of one test, and go/no-go will need exactly this rule. Note that
 * app/tools/noise-floor keeps its OWN copy on purpose — see the comment in that file.
 */
export const MAX_PLAUSIBLE_REACTION_MS = 3000;
