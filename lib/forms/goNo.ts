// lib/forms/goNo.ts
//
// ═════════════════════════════════════════════════════════════════════════════════════
// SCOPE OF THIS FILE — IMPORTANT
// ═════════════════════════════════════════════════════════════════════════════════════
// This file is the STIMULUS POOL for go/no-go, and nothing else. It holds trial lists and no
// behaviour.
//
// THE GO/NO-GO MODULE ITSELF IS NOT BUILT AND MUST NOT BE BUILT BY AN AI SESSION. A student
// is writing `app/tests/gonogo` by hand. Until it exists, `goNoGo` is deliberately absent from
// BATTERY_STEPS and there is deliberately NO route stub — a stub that wrote plausible-looking
// scores would be fabricated data, which this project forbids outright.
//
// So: this pool exists so the module has something to consume the day it is written. Nothing
// imports it yet. That is expected, not an oversight.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT GO/NO-GO MEASURES, SO THE POOL MAKES SENSE
// ═════════════════════════════════════════════════════════════════════════════════════
// Most trials say GO and the athlete responds as fast as they can. A minority say NO-GO and
// the athlete must do nothing. Because responding is the common case, the urge to respond
// becomes automatic, and holding it back on a no-go trial takes deliberate effort. That effort
// is the thing being measured.
//
// It therefore produces two different kinds of error, and they mean different things:
//
//   • a COMMISSION error — responding on a no-go trial. Failing to hold back.
//   • an OMISSION error  — not responding on a go trial. Losing attention entirely.
//
// Both are kept (an approved project decision). Collapsing them into one "errors" number would
// throw away the distinction between "could not stop" and "was not there", which are not the
// same difficulty and would not be the same finding.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// CONSTRUCTION RULES — every one of these is enforced by select.test.ts
// ═════════════════════════════════════════════════════════════════════════════════════
// 1. NOT COPIED FROM ANY PUBLISHED ASSESSMENT. Written from scratch against these rules. No
//    trial order, ratio, timing or scoring taken from any published instrument.
//
// 2. Every form has the same number of trials and the same number of no-go trials. Error
//    counts are only comparable between two sittings if the opportunities to err were equal.
//
// 3. Go trials heavily outnumber no-go trials. If no-go trials were common, withholding would
//    stop being effortful and the task would measure nothing in particular. The ratio here is
//    a design property of the task, not a threshold, so it lives in this file rather than in
//    thresholds.ts.
//
// 4. The first several trials are all GO, with no no-go among them. The automatic urge to
//    respond has to be built before it can be tested; a no-go in the first few trials is
//    simply a different, easier task.
//
// 5. No two no-go trials are ever adjacent. Back-to-back no-gos let an athlete settle into not
//    responding, which turns the second one into a free pass.
//
// 6. The last trial is never a no-go. An athlete who can see the run ending has less to hold
//    back against, so a final no-go is not comparable with the others.
//
// 7. No two forms share the same no-go pattern, so the forms are genuinely independent for
//    alternate-form testing.
//
// NOTE ON TIMING: how long each stimulus stays on screen and how long the gap between trials
// is are NOT in this file. Those are behaviour, and behaviour belongs to the module the student
// is writing. This file only says what the trials are and in what order.

/** What a single trial asks for. */
export type GoNoTrial = 'go' | 'nogo';

/** One interchangeable go/no-go form. */
export type GoNoForm = {
  /** Stable id, stored on the result so we know which trial list produced a score. */
  id: string;
  /** The trials, in presentation order. */
  trials: readonly GoNoTrial[];
};

/** How many trials each form holds. */
export const GO_NO_TRIALS_PER_FORM = 30;

/**
 * How many of those trials are no-go.
 *
 * Eight of thirty, so roughly a quarter. Frequent enough that the athlete gets eight genuine
 * chances to fail — one or two would make the score almost pure luck — and rare enough that
 * responding stays the automatic default.
 */
export const GO_NO_NOGO_PER_FORM = 8;

/**
 * How many opening trials are guaranteed to be GO, building the habit before it is tested.
 * See construction rule 4.
 */
export const GO_NO_LEAD_IN_GO_TRIALS = 4;

// Written out in full rather than generated from a list of positions. It is more lines, but
// you can read the actual run an athlete will see, and rule 5 (no adjacent no-gos) is
// verifiable by eye as well as by test.
const G: GoNoTrial = 'go';
const N: GoNoTrial = 'nogo';

export const GO_NO_FORMS: readonly GoNoForm[] = [
  {
    id: 'gonogo-a',
    trials: [G, G, G, G, N, G, G, N, G, G, G, N, G, G, N, G, G, G, N, G, N, G, G, G, N, G, G, N, G, G],
  },
  {
    id: 'gonogo-b',
    trials: [G, G, G, G, G, N, G, G, G, N, G, N, G, G, N, G, G, N, G, G, G, N, G, N, G, G, G, N, G, G],
  },
  {
    id: 'gonogo-c',
    trials: [G, G, G, G, N, G, G, G, N, G, N, G, G, N, G, G, G, N, G, N, G, G, N, G, G, G, N, G, G, G],
  },
  {
    id: 'gonogo-d',
    trials: [G, G, G, G, G, N, G, N, G, G, N, G, G, G, N, G, N, G, G, N, G, G, G, N, G, G, N, G, G, G],
  },
  {
    id: 'gonogo-e',
    trials: [G, G, G, G, N, G, N, G, G, G, N, G, N, G, G, N, G, G, G, N, G, G, N, G, G, N, G, G, G, G],
  },
  {
    id: 'gonogo-f',
    trials: [G, G, G, G, G, N, G, G, N, G, G, N, G, N, G, G, N, G, G, G, N, G, G, N, G, G, G, G, N, G],
  },
];
