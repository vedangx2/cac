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
// Direction convention (how the Phase 2 engine will read these): for every test, a higher
// number is "worse." So the engine flags a module when the CHECK is worse than the BASELINE
// by at least the amount below. Comparisons are always against THIS athlete's own baseline.

/**
 * Reaction time, in milliseconds.
 * Flag if the check's MEDIAN reaction time is at least this many ms SLOWER than the
 * athlete's baseline median. (Slowed reaction can follow a head impact.)
 * PLACEHOLDER — not clinically validated.
 */
export const REACTION_SLOWER_MS = 50;

/**
 * Number-scan completion time, in milliseconds.
 * Flag if the check takes at least this many ms LONGER to finish than the baseline.
 * PLACEHOLDER — not clinically validated.
 */
export const SCAN_SLOWER_MS = 4000;

/**
 * Number-scan errors (wrong taps).
 * Flag if the check has at least this many MORE errors than the baseline.
 * PLACEHOLDER — not clinically validated.
 */
export const SCAN_EXTRA_ERRORS = 2;

/**
 * Symptom checklist total (each check produces a total from 0-30).
 * Flag if the check's total is at least this many points ABOVE the baseline total.
 * (More/worse symptoms than their normal healthy state.)
 * PLACEHOLDER — not clinically validated.
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

// ─────────────────────────────────────────────────────────────────────────────────────
// DATA QUALITY — these are NOT flagging thresholds
// ─────────────────────────────────────────────────────────────────────────────────────
// The values above decide whether a change gets flagged. The value below decides whether a
// measurement is worth keeping at all. It lives in this file because CLAUDE.md says every
// tunable number in the app has exactly one home, but it is kept in its own section because
// the engine must never treat it as a threshold.

/**
 * The longest a single reaction trial can be and still plausibly be a REACTION.
 *
 * Nobody genuinely reacts to a light in three seconds. A number that large means the athlete
 * looked away, got distracted, or the phone was backgrounded mid-trial (browsers throttle
 * timers and stop painting frames for tabs that aren't visible). Recording it would inflate
 * their median and could raise a false flag, so a trial over this limit is thrown away and
 * repeated instead.
 *
 * Set deliberately high — well beyond any real reaction, healthy or concussed — so that it
 * only ever catches inattention, never a genuinely slowed athlete.
 */
export const MAX_PLAUSIBLE_REACTION_MS = 3000;
