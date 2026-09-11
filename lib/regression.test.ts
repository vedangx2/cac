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
const PATTERN_SRC = source(join('app', 'tests', 'pattern', 'page.tsx'));
const RESULTS_SRC = source(join('app', 'results', '[id]', 'page.tsx'));
const GONOGO_SRC = source(join('app', 'tests', 'gonogo', 'page.tsx'));

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

  Symptom is included deliberately and is not incidental: it has a real threshold (go/no-go's
  response time gained one on 2026-09-10; every other new-battery threshold is still null), so
  it can produce a genuine "compared and found no significant change" verdict. Guard #4 below
  needs that state to exist in order to prove it is not rendered green — a fixture made only of
  null-threshold modules would land in the "unevaluated" state instead and the guard would be
  testing the wrong screen.
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

/*
  RE-ESTABLISHED against app/tests/pattern, which is the screen that now has this problem.

  THE ORIGINAL BUG: the deleted number scan's tap handler read "which number are we looking for"
  from React state. State only updates on the next render, so two correct taps arriving in the same
  frame were both judged against the OLD target and the second was counted as an error. An athlete
  tapping fast and correctly — which is what a good answer looks like — was scored as making
  mistakes.

  WHY PATTERN SPAN HAS EXACTLY THIS PROBLEM: it judges each tap against the next expected cell in a
  remembered sequence. Someone reproducing a six-cell pattern taps quickly and confidently, so
  several taps land inside one frame. Reading the expected position from React state would fail the
  fast, accurate athlete and pass the slow one.

  STRUCTURAL GUARD (see the note at the top of this file).
*/
describe('#1 pattern span — rapid taps are judged against a ref, not React state (structural guard)', () => {
  it('keeps the expected position in a ref, written synchronously', () => {
    expect(PATTERN_SRC).toMatch(/const expectedIndexRef = useRef\(/);
    expect(PATTERN_SRC).toMatch(/expectedIndexRef\.current = nextIndex;/);
  });

  it('judges each tap against that ref, so taps arriving before a re-render see the real position', () => {
    // The exact line the fix depends on. Reverting to reading the render-only `tapCount` state
    // would fail this — which is the regression being guarded.
    expect(PATTERN_SRC).toMatch(/const expectedIndex = expectedIndexRef\.current;/);
  });

  it('tracks a failed trial in a ref too, so several wrong taps in one frame cannot undo it', () => {
    // Same hazard, second variable. If "this trial is already wrong" lived in state, a later tap in
    // the same frame could read the stale value and score a failed trial as correct.
    expect(PATTERN_SRC).toMatch(/const trialFailedRef = useRef\(/);
    expect(PATTERN_SRC).toMatch(/trialFailedRef\.current = true;/);
  });
});

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
   #2b — Pattern span cannot soft-lock if its playback timer chain stalls.

   The same class of bug as #2, in the screen that inherited the risk. Playback is a chain of
   timers; if any link fails to fire — backgrounded tab, throttled timer, suspended page — the
   athlete would sit forever on a grid that never finishes flashing and never accepts a tap, with
   no way forward and no sign anything had broken.

   The fix: reaching the input phase does not depend solely on the chain completing. A watchdog is
   armed BEFORE the chain starts and force-completes playback if the chain has not finished by the
   time it possibly could have.

   STRUCTURAL GUARD (see the note at the top of this file).
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('#2b pattern span — a stalled playback chain cannot trap the athlete (structural guard)', () => {
  it('arms a watchdog that force-completes playback', () => {
    expect(PATTERN_SRC).toMatch(/watchdogRef\.current = setTimeout\(\(\) => beginTapping\(\)/);
  });

  it('gives the watchdog a delay derived from the trial length, not a guess', () => {
    expect(PATTERN_SRC).toMatch(/watchdogDelayMs\(cells\.length\)/);
  });

  it('can reach the athlete input phase without the timer chain finishing', () => {
    // beginTapping must be reachable from the watchdog independently of the chain. If the only
    // caller were inside the chain, the watchdog could not rescue anything.
    const watchdogCallsIt = /watchdogRef\.current = setTimeout\(\(\) => beginTapping\(\)/.test(PATTERN_SRC);
    const chainCallsIt = /position >= cells\.length\) \{\s*beginTapping\(\);/.test(PATTERN_SRC);

    expect(watchdogCallsIt).toBe(true);
    expect(chainCallsIt).toBe(true);
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

/* ═══════════════════════════════════════════════════════════════════════════════════
   #5 — Go/no-go stamps the stimulus time SYNCHRONOUSLY, before requestAnimationFrame.

   The same bug as #2, in the module that inherited the timing. The deleted reaction pad stamped
   its clock ONLY inside requestAnimationFrame; browsers stop firing rAF for a tab that is not
   visible, so backgrounding the phone at that instant meant the stamp never happened, every tap
   measured against zero, and the pad soft-locked with no way out.

   Go/no-go shows thirty stimuli instead of five, so it has thirty chances to hit it. The fix is
   the same: stamp the moment the stimulus is requested, and let rAF only REFINE it.

   STRUCTURAL GUARD (see the note at the top of this file).
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('#5 go/no-go — the stimulus time is stamped before requestAnimationFrame (structural guard)', () => {
  it('stamps synchronously and only then asks rAF to refine it', () => {
    // The assignment immediately followed by the rAF call. Deleting the synchronous line — which
    // is the mutation this guard exists for — leaves rAF as the only stamp and fails this.
    expect(GONOGO_SRC).toMatch(
      /stimulusAtRef\.current = performance\.now\(\);\s*requestAnimationFrame\(/,
    );
  });

  it('measures the response against that stamp, not against page load', () => {
    expect(GONOGO_SRC).toMatch(/performance\.now\(\) - stimulusAtRef\.current/);
  });

  it('refuses to record a response when no stimulus time was ever set', () => {
    // The safety net. If a future change breaks the stamp, a tap must produce nothing rather than
    // a measurement taken against zero — which would look like an enormous, entirely fake, delay.
    expect(GONOGO_SRC).toMatch(/if \(stimulusAtRef\.current === 0\) return;/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   #6 — Go/no-go judges every tap against refs, never against React state.

   The number scan's original bug, in the screen that now has the most to lose from it. React
   state only updates on the next render; a tap judged against stale state is judged against the
   PREVIOUS trial. In go/no-go that does not merely miscount — it can score a tap that arrived
   during a no-go trial as a go response, turning a commission error into a reaction time.

   So the phase, the stimulus time and the trial index all live in refs, and the tap handler
   reads them. React state is written exactly once, when the run ends.

   STRUCTURAL GUARD (see the note at the top of this file).
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('#6 go/no-go — taps are judged against refs, not React state (structural guard)', () => {
  it('keeps the pad phase in a ref and reads it in the tap handler', () => {
    expect(GONOGO_SRC).toMatch(/const phaseRef = useRef<PadPhase>\(/);
    expect(GONOGO_SRC).toMatch(/const phase = phaseRef\.current;/);
  });

  it('keeps the stimulus time and the trial position in refs too', () => {
    expect(GONOGO_SRC).toMatch(/const stimulusAtRef = useRef\(/);
    expect(GONOGO_SRC).toMatch(/const trialIndexRef = useRef\(/);
    expect(GONOGO_SRC).toMatch(/const outcomesRef = useRef<TrialOutcome\[\]>\(/);
  });

  it('attaches the tap listener natively rather than through React', () => {
    // A React synthetic handler would put React's own work between the tap and the clock read.
    expect(GONOGO_SRC).toMatch(/addEventListener\('pointerdown'/);
  });

  it('records a tap during a no-go trial as a commission error', () => {
    // Deleting this — the commission mutation — makes an athlete who could not hold back look
    // like an athlete who held back perfectly.
    expect(GONOGO_SRC).toMatch(/kind: 'nogo-commission'/);
  });

  it('discards an anticipation and repeats the trial instead of recording it', () => {
    expect(GONOGO_SRC).toMatch(/judged\.kind === 'anticipation'/);
    expect(GONOGO_SRC).toMatch(/discardAndRepeat\(/);
  });

  it('counts a go trial with no response as an omission', () => {
    expect(GONOGO_SRC).toMatch(/kind: 'go-omission'/);
  });

  /*
    THE WHOLE-HANDLER GUARD, added after mutation testing found the line-by-line guards above
    were not enough.

    A mutation that KEPT the guarded line `const phase = phaseRef.current;` and then judged the
    OUTCOME against React state instead — `runState?.kind === 'running' ? go-response : commission`
    — passed every test in this file. That is the same bug wearing a different hat: a tap that
    landed during a no-go trial gets recorded as a reaction time, the commission error vanishes,
    and the median is contaminated by the same tap.

    So instead of pinning individual lines, this asserts a property of the entire tap handler:
    it does not read React state at all. There is exactly one piece of React state on that
    screen (`runState`), it is written once when a run ENDS, and the handler has no business
    consulting it.
  */
  it('the tap handler reads no React state anywhere in its body (whole-handler guard)', () => {
    const start = GONOGO_SRC.indexOf('const handlePress = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const end = GONOGO_SRC.indexOf('  }, [', start);
    expect(end).toBeGreaterThan(start);
    const body = GONOGO_SRC.slice(start, end);

    // The only React state on this screen. The handler must never consult it.
    expect(body).not.toMatch(/runState/);
    // And it must still be reading the refs that carry the truth.
    expect(body).toMatch(/phaseRef\.current/);
    expect(body).toMatch(/stimulusAtRef\.current/);
  });

  /*
    A late requestAnimationFrame callback from trial N must not refine the stamp of trial N+1.

    Found by the branch review, and then found AGAIN by mutation testing: deleting this guard
    broke nothing, which meant the fix had no test. Without the token, a stale callback moves the
    next trial's start time forward, making a genuine response look fast enough to be thrown out
    as an anticipation.
  */
  it('only lets a rAF callback refine the stimulus it belongs to', () => {
    expect(GONOGO_SRC).toMatch(/const stimulusTokenRef = useRef\(/);
    expect(GONOGO_SRC).toMatch(/const token = \(stimulusTokenRef\.current \+= 1\);/);
    expect(GONOGO_SRC).toMatch(/stimulusTokenRef\.current === token && stimulusAtRef\.current !== 0/);
  });
});
