// lib/engine/thresholds.ts
//
// EVERY threshold in the app lives in this one file. If a number decides whether something
// gets flagged, it belongs here — never hard-coded ("magic number") inside the engine or a
// component. That way there's exactly one place to read, explain, and tune the sensitivity.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// TODO(NEEDS_SOURCE): NOTHING in this file is clinically validated, and none of it is taken
// from any published concussion protocol. As of 2026-09-10 the values are of two kinds:
// placeholder guesses carried over from the original battery (symptom, balance), and one
// value derived from n=1 self-collected noise-floor data (go/no-go response time). A measured
// basis from one healthy person is better than a guess and is still not clinical evidence.
// The results screen must keep saying so, and the app must only ever FLAG and REFER — never
// diagnose or clear. (See CLAUDE.md, THE HARD RULE.)
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
   SET FROM COLLECTED DATA — a measured basis, still NOT clinically validated
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * Go/no-go, median response time on correct go trials, in milliseconds.
 * Flag if the check is at least this many ms SLOWER than the baseline.
 *
 * Set 2026-09-10 at the project owner's direction — the first threshold in this file with a
 * measured basis rather than a guess. The owner's derivation, recorded as given: derived from
 * n=1 self-collected data, 2-sigma noise band ~24.6ms, difference noise ~17.4ms, expected
 * false alarm ~4% with an averaged baseline. TODO(NEEDS_SOURCE): not a validated cutoff.
 *
 * Read "n=1" literally: this is how much ONE healthy person's median wobbled between sittings,
 * collected by hand on /tools/noise-floor. It says nothing about how anyone else varies, and
 * nothing about concussion. It clears the bar this file sets — a value from collected
 * measurements instead of a plausible-looking guess — and no other bar.
 */
export const GO_NO_GO_SLOWER_MS = 25;

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
   THE WHOLE-SCREEN FLAG RULE
   ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * How many modules must cross their own cut-off before the whole screen flags.
 *
 * Changed from 1 (flag on any module) to 2 on 2026-09-10, at the project owner's direction,
 * after the calibration harness measured the difference on simulated athletes: flag-on-any
 * raised a false alarm on roughly 30% of healthy simulated athletes against roughly 3% for
 * flag-on-two (the 2026-08-31 SESSION-REPORT records that run — nine of the ten measurement
 * profiles behind it were placeholders, so treat those numbers as a shape, not as truth).
 * With ten measurements, flag-on-any is ten separate chances to cry wolf at a healthy kid,
 * and an alarm people learn to ignore protects nobody.
 *
 * THE EXCEPTION, decided in the same instruction: the SYMPTOM CHECKLIST may flag alone. The
 * owner's stated rationale is that published work indicates self-reported symptoms carry the
 * most weight and that athletes underreport them. TODO(NEEDS_SOURCE): no citation is on file
 * for that claim — it is recorded here as the reason a human gave, not as an established fact.
 *
 * The rule itself is applied in compare.ts (rule 4). This file only holds the number, so
 * sensitivity is still tuned in exactly one place.
 */
export const MODULES_REQUIRED_TO_FLAG = 2;

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
