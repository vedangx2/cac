// lib/regression.test.ts
//
// Regression tests for four bugs that were already fixed, so they can never quietly come back.
// (Task 2.) Each test is written so it FAILS against the old, broken behaviour.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// A NOTE ON WHAT CAN AND CANNOT BE UNIT-TESTED HERE — please read before adding more.
// ─────────────────────────────────────────────────────────────────────────────────────
// This project's test harness is deliberately node-only and runs pure functions (see
// vitest.config.ts). Two of the four bugs below (#1 rapid taps, #2 the reaction pad recovering
// when requestAnimationFrame never fires) are defects that ONLY exist inside React's
// render/timing model — the fix is a synchronously-updated ref, and the bug cannot be
// reproduced without actually rendering the component and driving DOM events. We do not have a
// DOM test harness, and adding one (jsdom + a rendering library) or refactoring the working,
// shipped test screens purely to expose their internals were both out of scope for this change.
//
// So bugs #1 and #2 are covered here by STRUCTURAL guards: they assert that the specific fix is
// still present in the source. That is weaker than driving the behaviour — a structural guard
// proves the fix is THERE, not that it WORKS — but it still fails the moment someone reverts the
// fix, which is exactly the regression we are guarding against. They are labelled as structural
// so nobody mistakes them for behavioural tests. Bugs #3 and #4 get real behavioural assertions
// against the engine PLUS a guard on the results screen's safety copy.
//
// If a DOM testing setup is ever added, #1 and #2 should be upgraded to render the component,
// fire 15 rapid taps / withhold requestAnimationFrame, and assert on the observed result.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModuleScores, TestResult } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { MissingBaselineError, buildBreakdown, compareToBaseline } from './engine';

/* ── Reading source files, for the structural / copy guards ───────────────────────── */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
function source(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), 'utf8');
}

/*
  THE BATTERY REBUILD MOVED WHAT THESE GUARDS CAN WATCH.

  app/tests/scan/page.tsx and app/tests/reaction/page.tsx were deleted when the battery was
  replaced. Guards #1 and #2 below read those files, so this file had to change in the same
  commit as the deletion or it would have failed at import and taken guards #3 and #4 — which are
  still perfectly valid — down with it.

  #2 SURVIVES INTACT, re-pointed. app/tools/noise-floor/page.tsx runs the same 5-trial protocol
  and carries the identical fix (synchronous stamp before requestAnimationFrame, plus the
  implausible-trial discard). The bug being guarded against is a property of that timing code, not
  of the deleted route, so the guard follows the code to its new home and there is NO gap in
  coverage.

  #1 HAS NO SUBJECT RIGHT NOW. The "judge a tap against a ref, not React state" bug belongs to a
  screen that counts taps as they arrive, and no such screen exists between the scan's deletion
  and pattern span landing. It is written up below rather than silently dropped, and it must be
  re-established against app/tests/pattern when that screen is built. See SESSION-REPORT.md.
*/
const NOISE_FLOOR_SRC = source(join('app', 'tools', 'noise-floor', 'page.tsx'));
const RESULTS_SRC = source(join('app', 'results', '[id]', 'page.tsx'));

/* ── Small fixtures for the behavioural (engine) assertions ───────────────────────── */

const ATHLETE = 'athlete-1';
const BASELINE_TIME = 1_700_000_000_000;
const CHECK_TIME = BASELINE_TIME + 7 * 24 * 60 * 60 * 1000;

function scores(partial: Partial<ModuleScores> = {}): ModuleScores {
  return {
    symptom: partial.symptom ?? null,
    wordLearning: partial.wordLearning ?? null,
    wordRecognition: partial.wordRecognition ?? null,
    digitSpan: partial.digitSpan ?? null,
    patternSpan: partial.patternSpan ?? null,
    goNoGo: partial.goNoGo ?? null,
    balance: partial.balance ?? null,
  };
}

/*
  A sitting where every measured module is identical between baseline and check.

  Symptom is included deliberately and is not incidental: it is currently the ONLY module with a
  real threshold, so it is the only one that can produce a genuine "compared and found no
  significant change" verdict. Guard #4 below needs that state to exist in order to prove it is
  not rendered green — a fixture made only of null-threshold modules would land in the
  "unevaluated" state instead and the guard would be testing the wrong screen.
*/
const IDENTICAL_MODULES = (): ModuleScores =>
  scores({
    symptom: { itemScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0 },
    digitSpan: {
      formId: 'digits-a',
      trialsCorrect: [true, true, true, true, true, false, false, false, false],
      correct: 5,
    },
  });

function baseline(): TestResult {
  return {
    id: 'b1',
    athleteId: ATHLETE,
    takenAt: BASELINE_TIME,
    kind: 'baseline',
    scores: IDENTICAL_MODULES(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
function identicalCheck(): TestResult {
  return {
    id: 'c1',
    athleteId: ATHLETE,
    takenAt: CHECK_TIME,
    kind: 'check',
    scores: IDENTICAL_MODULES(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   #1 — Number scan: 15 rapid sequential taps must produce 0 errors.

   OLD BUG: the tap handler read the "next number to find" from React state, which only updates
   on the next render. Two correct taps arriving before that render were both judged against the
   OLD target, so the second correct tap was miscounted as an error. The fix keeps the current
   target in a ref that updates synchronously, so every tap is judged against the real target.

   STRUCTURAL GUARD (see the note at the top of this file): we assert the synchronous ref is
   still what the tap handler reads. Reverting to reading React state — `const target = nextTarget`
   — fails these assertions.
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe.todo(
  '#1 rapid taps are not miscounted — RE-ESTABLISH against app/tests/pattern when it is built',
  /*
    NOT SKIPPED BECAUSE IT FAILS. Skipped because its subject was deleted and its replacement does
    not exist yet, and a `todo` says that out loud in the test output every single run instead of
    letting the gap disappear quietly.

    THE BUG, so whoever builds pattern span knows what to protect against: the number scan's tap
    handler read "which number are we looking for" from React state. State only updates on the next
    render, so two correct taps arriving in the same frame were both judged against the OLD target
    and the second was counted as an error. An athlete tapping fast and correctly was scored as
    making mistakes.

    WHY PATTERN SPAN HAS EXACTLY THIS PROBLEM: it judges each tap against the next expected cell in
    a remembered sequence. Someone reproducing a six-cell pattern taps quickly and confidently —
    that is what a correct answer looks like — so several taps will land inside one frame. Reading
    the expected cell from React state would fail the fast, correct athlete and pass the slow one.

    THE FIX to assert: keep the expected position in a ref written synchronously, and have the tap
    handler read the ref. Then re-point these assertions at app/tests/pattern/page.tsx.
  */
);

/* ═══════════════════════════════════════════════════════════════════════════════════
   #2 — Reaction pad recovers if requestAnimationFrame never fires (backgrounded tab).

   OLD BUG: the moment "green" appears was stamped ONLY inside requestAnimationFrame. Browsers
   stop firing rAF for tabs that aren't visible, so if the tab was backgrounded at that instant,
   the timestamp was never set and every tap was discarded — the pad soft-locked with no way out.
   The fix stamps the time synchronously the instant green is requested (worst case one frame
   early), and rAF only REFINES it. A tap is therefore always measurable, and a wildly inflated
   time (tab was hidden for seconds) is thrown out and the trial repeated via
   MAX_PLAUSIBLE_REACTION_MS rather than locking up.

   STRUCTURAL GUARD (see the note at the top of this file).
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('#2 timed pad — recovers when requestAnimationFrame never fires (structural guard)', () => {
  // Re-pointed from the deleted app/tests/reaction to app/tools/noise-floor, which runs the same
  // protocol with the same fix. The guard is about the timing code, not about which route hosts it.
  it('stamps the green time synchronously BEFORE requestAnimationFrame, not only inside it', () => {
    // Old code only assigned greenAt inside the rAF callback. This pattern — the assignment
    // immediately followed by the rAF call — only matches when the synchronous stamp is present.
    expect(NOISE_FLOOR_SRC).toMatch(
      /greenAtRef\.current = performance\.now\(\);\s*requestAnimationFrame\(/,
    );
  });

  it('throws out an implausibly long trial and repeats it instead of recording garbage', () => {
    expect(NOISE_FLOOR_SRC).toMatch(/if \(ms > MAX_PLAUSIBLE_REACTION_MS\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   #3 — A check on an athlete with NO baseline refuses, and that screen does not invite
   recording a baseline at that moment.

   Two halves:
   • BEHAVIOURAL: the engine must throw MissingBaselineError rather than return a comfortable
     "no flag" when there is no baseline. (A missing baseline must never read as "all clear".)
   • COPY: the results screen's could-not-compare state must NOT offer "record a baseline now" as
     an action — a baseline taken right after a hit measures a possibly-concussed athlete. The
     screen instead carries an explicit "Do not record a baseline right now" notice.
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('#3 check with no baseline — refuses, and does not invite a baseline on the spot', () => {
  it('the engine throws rather than returning a reassuring "no flag" (behavioural)', () => {
    expect(() => compareToBaseline(null, identicalCheck())).toThrow(MissingBaselineError);
    expect(() => compareToBaseline(undefined, identicalCheck())).toThrow(MissingBaselineError);
  });

  it('the results screen tells the user NOT to record a baseline right now (copy guard)', () => {
    expect(RESULTS_SRC).toContain('Do not record a baseline right now');
  });

  it('every path off the could-not-compare screen still points at a professional (copy guard)', () => {
    // The refusal must always end in referral, never in a dead end or a fix-it-yourself action.
    expect(RESULTS_SRC).toContain('have them seen by a medical professional');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   #4 — A check that exactly matches the baseline: no green, no checkmark, and the
   "does not rule out a concussion" copy is present.

   • BEHAVIOURAL: identical baseline and check must produce flagged=false AND must actually have
     compared something (so the screen shows the sober "no change detected" state, NOT the loud
     "nothing could be compared" state).
   • COPY / STATE: the results screen must never render a success-green style or a checkmark
     glyph, and the no-change state must state, in words, that this does not rule out a concussion.
     (Guarding style tokens and the ✓ glyph specifically — the safety comments legitimately use
     the WORDS "green" and "checkmark", so we must not match those.)
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('#4 identical check — a "no change" result, never a clearance', () => {
  it('does not flag, and did compare at least one module (behavioural)', () => {
    const outcome = compareToBaseline(baseline(), identicalCheck());
    expect(outcome.flagged).toBe(false);

    // If nothing had been comparable this would be the "nothing could be compared" screen, which
    // is a different (also non-green) state. Prove we are in the genuine "no change" state.
    const rows = buildBreakdown(baseline(), identicalCheck());
    expect(rows.some((row) => row.compared)).toBe(true);
  });

  it('renders no success-green style and no checkmark glyph (state guard)', () => {
    // Style tokens only — NOT the prose. bg-green / text-green / emerald etc. would be a green
    // success surface; the ✓/✔/☑ glyphs would be a "pass" tick. Neither may appear.
    expect(RESULTS_SRC).not.toMatch(/\b(?:bg|text|border|from|to|via|ring)-(?:green|emerald|lime|teal)\b/);
    expect(RESULTS_SRC).not.toMatch(/[✓✔☑]/); // ✓ ✔ ☑
  });

  it('states in words that this does not rule out a concussion (copy guard)', () => {
    expect(RESULTS_SRC).toContain('does not rule out a concussion');
  });
});
