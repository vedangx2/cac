'use client';

// app/tests/gonogo/page.tsx
//
// GO / NO-GO — tap fast when the signal says go, and do nothing when it says hold.
//
// Thirty trials, eight of them no-go, taken from lib/forms/goNo.ts. THIS SCREEN NEVER GENERATES
// A TRIAL. The run it presents is a fixed list chosen from the pool by the same deterministic
// rule every other module uses, so two sittings by the same athlete are comparable and a saved
// score can always be traced back to the exact trial order that produced it.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE FOUR TIMING RULES. Every one of these is a bug this codebase has already paid for.
// ═════════════════════════════════════════════════════════════════════════════════════
//
// 1. THE STIMULUS TIME IS STAMPED SYNCHRONOUSLY, BEFORE requestAnimationFrame.
//    The deleted reaction pad stamped it ONLY inside rAF. Browsers stop firing rAF for a tab
//    that is not visible, so backgrounding the phone at that instant meant the stamp never
//    happened, every tap measured against zero, and the pad soft-locked with no way out. Here
//    the clock is read the moment we ask for the stimulus — worst case one frame (~16ms) early —
//    and rAF only REFINES it. A tap is therefore always measurable.
//
// 2. ZERO REACT RE-RENDERS BETWEEN STIMULUS AND RESPONSE.
//    The deleted number scan judged taps against React state, which only updates on the next
//    render; taps arriving in the same frame were judged against a stale value and correct taps
//    were counted as errors — 14 phantom errors on a fast, accurate athlete. So the entire run
//    lives in refs and paints straight to the DOM. React is not asked to render anything between
//    the first trial and the last, and every judgement reads a ref.
//
// 3. AN ANTICIPATION IS DISCARDED AND THE TRIAL REPEATED.
//    A tap that lands before the stimulus, or too soon after it to have been caused by it, was
//    already on its way down. It is thrown away and the trial runs again, exactly as the
//    noise-floor pad discards a trial over MAX_PLAUSIBLE_REACTION_MS. It is never recorded and
//    never counted as an error: we did not measure that trial, so we say nothing about it.
//
// 4. A GO TRIAL WITH NO RESPONSE IS AN OMISSION.
//    Silence is data here, not a missing measurement. Not responding when you should have is
//    exactly what "losing attention" looks like, and it is kept separate from commission errors
//    because "could not stop" and "was not there" are different findings.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// A NOTE ABOUT THE COLOUR GREEN, WHICH IS DELIBERATE — DO NOT "FIX" IT
// ═════════════════════════════════════════════════════════════════════════════════════
// The go stimulus is green. That is not a violation of the never-show-green rule in CLAUDE.md.
// That rule is about never implying a person is cleared, healthy or safe. This green is a
// physical target to hit — it says nothing about anybody's health, it is gone in under two
// seconds, and it never appears on a results screen. The same reasoning is written into
// app/tools/noise-floor/page.tsx.
//
// Both stimuli also carry a WORD (TAP / HOLD), so colour is never the only thing distinguishing
// them. And the no-go stimulus is near-white rather than red: red in this app means flagged and
// nothing else, and a green/red pair is the worst possible choice for a colour-blind athlete.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { GO_NO_FORMS, GO_NO_NOGO_PER_FORM, pickForm } from '@/lib/forms';
import {
  GO_NO_MAX_TRIAL_REPEATS,
  GO_NO_MESSAGE_MS,
  GO_NO_STIMULUS_WINDOW_MS,
  GO_NO_TOTAL_TRIALS,
  type GoNoGoRunResult,
  type TrialOutcome,
  gapDelayMs,
  isGoTrial,
  judgeResponse,
  judgeWindowClose,
  scoreGoNoGo,
  toStoredScore,
} from '@/lib/modules/gonogo';

/** What the pad is doing right now. Lives in a ref — see timing rule 2. */
type PadPhase = 'idle' | 'gap' | 'go' | 'nogo' | 'message' | 'done';

/** What React is allowed to know. It only ever changes when a run ENDS. */
type RunState =
  | { kind: 'running' }
  | { kind: 'scored'; run: GoNoGoRunResult }
  | { kind: 'unmeasurable' }
  | { kind: 'abandoned' };

// Static class strings. They have to appear literally in the source: Tailwind builds its
// stylesheet by scanning these files as text, so a class name assembled at runtime would never
// make it into the CSS.
const PAD_BASE =
  'flex w-full touch-none cursor-pointer select-none flex-col items-center justify-center ' +
  'rounded-2xl border-4 p-6 text-center min-h-64 sm:min-h-96';

const PAD_PHASE_CLASSES: Record<PadPhase, string> = {
  idle: 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink',
  // The gap is dim on purpose, so the stimulus arriving is an unmistakable jump in brightness.
  gap: 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink-soft',
  go: 'border-pad-go bg-pad-go text-instrument',
  nogo: 'border-instrument-ink bg-instrument-ink text-instrument',
  message: 'border-instrument-ink bg-instrument-panel text-instrument-ink',
  done: 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink',
};

export default function GoNoGoPage() {
  const battery = useBatteryStep('goNoGo');

  // The ONLY React state involved in a run, and it is written exactly once, at the end.
  const [runState, setRunState] = useState<RunState | null>(null);

  /* ── The live machine. All refs, so none of this triggers a render. ─────────────── */
  const phaseRef = useRef<PadPhase>('idle');
  /** When the current stimulus became visible. 0 means "no stimulus showing". */
  const stimulusAtRef = useRef(0);
  const trialIndexRef = useRef(0);
  const outcomesRef = useRef<TrialOutcome[]>([]);
  /** How many times the CURRENT trial has been discarded and repeated. */
  const repeatsRef = useRef(0);
  /**
   * Which stimulus the clock is currently timing. Incremented every time one is shown.
   *
   * WHY A COUNTER AND NOT JUST A ZERO CHECK: a requestAnimationFrame callback can arrive late.
   * If one from trial N fired while trial N+1 was already showing, a bare "is the stamp live?"
   * test would pass and the callback would overwrite N+1's start time with the current moment —
   * making N+1's response look far faster than it was, quite possibly fast enough to be thrown
   * out as an anticipation. Tagging each stimulus means a late callback can only ever refine the
   * stimulus it belongs to.
   */
  const stimulusTokenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Handles on the DOM we paint directly. ──────────────────────────────────────── */
  const padRef = useRef<HTMLDivElement | null>(null);
  const padMainRef = useRef<HTMLSpanElement | null>(null);
  const padSubRef = useRef<HTMLSpanElement | null>(null);
  const progressRef = useRef<HTMLParagraphElement | null>(null);

  const seed = battery.session
    ? `${battery.session.athleteId}:${battery.session.startedAt}`
    : 'practice';
  const form = useMemo(() => pickForm(GO_NO_FORMS, seed), [seed]);

  /** Write a phase straight to the DOM. Never goes through React. */
  const paintPad = useCallback((phase: PadPhase, main: string, sub: string) => {
    phaseRef.current = phase;
    if (padRef.current) padRef.current.className = `${PAD_BASE} ${PAD_PHASE_CLASSES[phase]}`;
    if (padMainRef.current) padMainRef.current.textContent = main;
    if (padSubRef.current) padSubRef.current.textContent = sub;
  }, []);

  /**
   * Paint the trial counter. Only ever called at the START of a gap — never while a stimulus is
   * showing, so it cannot put a DOM write between the stimulus and the tap.
   */
  const paintProgress = useCallback((index: number) => {
    if (progressRef.current) {
      progressRef.current.textContent = `Trial ${index + 1} of ${GO_NO_TOTAL_TRIALS}`;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /*
    The functions below call each other in a cycle (arm → show → close → arm). Refs hold the
    newest version of each so they can refer forwards without React's dependency rules forcing
    them into one giant function. This is the same trick the noise-floor pad uses for its press
    handler, for the same reason.
  */
  const armTrialRef = useRef<(index: number) => void>(() => {});
  const finishRunRef = useRef<() => void>(() => {});

  /** Give up on the whole run. Nothing is recorded — see GO_NO_MAX_TRIAL_REPEATS. */
  const abandonRun = useCallback(() => {
    clearTimer();
    stimulusAtRef.current = 0;
    paintPad(
      'done',
      'STOPPED',
      'This run was interrupted too many times, so nothing was recorded. Start again.',
    );
    setRunState({ kind: 'abandoned' });
  }, [clearTimer, paintPad]);

  /**
   * Throw this trial away and run it again. Used for an anticipation and for a window timer that
   * fired far too late to be believed.
   *
   * The trial index does not move, so the athlete still completes all thirty trials. Nothing is
   * added to `outcomes` — a discarded trial contributes to no count in either direction.
   */
  const discardAndRepeat = useCallback(
    (main: string, sub: string) => {
      clearTimer();
      stimulusAtRef.current = 0;
      repeatsRef.current += 1;

      if (repeatsRef.current > GO_NO_MAX_TRIAL_REPEATS) {
        abandonRun();
        return;
      }

      paintPad('message', main, sub);
      timerRef.current = setTimeout(() => armTrialRef.current(trialIndexRef.current), GO_NO_MESSAGE_MS);
    },
    [abandonRun, clearTimer, paintPad],
  );

  /** Record what happened on this trial and move to the next one (or finish). */
  const completeTrial = useCallback(
    (outcome: TrialOutcome) => {
      clearTimer();
      stimulusAtRef.current = 0;
      outcomesRef.current = [...outcomesRef.current, outcome];

      // A completed trial resets the repeat budget: the allowance is per trial, not per run.
      repeatsRef.current = 0;

      const next = trialIndexRef.current + 1;
      if (next >= GO_NO_TOTAL_TRIALS) {
        finishRunRef.current();
        return;
      }

      trialIndexRef.current = next;
      armTrialRef.current(next);
    },
    [clearTimer],
  );

  /** The window ran out with no response. */
  const closeWindow = useCallback(() => {
    if (phaseRef.current !== 'go' && phaseRef.current !== 'nogo') return;

    const elapsed = performance.now() - stimulusAtRef.current;

    // Did the timer fire when it was supposed to? A timer that fires seconds late means the tab
    // was backgrounded and throttled, so the athlete was very likely never shown this stimulus.
    // Recording an omission there would be an attention failure invented by the phone's power
    // saving. Discard and repeat instead.
    if (judgeWindowClose(elapsed) === 'stale') {
      discardAndRepeat('SKIPPED', 'That round did not run properly, so it will start again');
      return;
    }

    const isGo = phaseRef.current === 'go';
    completeTrial(isGo ? { kind: 'go-omission' } : { kind: 'nogo-withheld' });
  }, [completeTrial, discardAndRepeat]);

  /**
   * Show the stimulus for trial `index` and open the response window.
   *
   * TIMING RULE 1 LIVES HERE. Read the two stamps below carefully before changing anything.
   */
  const showStimulus = useCallback(
    (index: number) => {
      const trial = form.trials[index];
      const go = isGoTrial(trial);

      // Paint first, so the pixels are on their way...
      if (go) paintPad('go', 'TAP', '');
      else paintPad('nogo', 'HOLD', '');

      // ...then stamp the clock TWICE, and the belt-and-braces is the whole point.
      //
      // The synchronous stamp is taken right now, the instant we ask for the stimulus. On its
      // own it is very slightly early — the pixels are not on screen yet.
      //
      // The refinement inside requestAnimationFrame is the accurate one: rAF runs immediately
      // before the browser paints, so it marks the moment the stimulus actually became visible.
      //
      // We do BOTH because rAF is not guaranteed to run. Browsers stop firing it for tabs that
      // are not visible, and it never fires at all in an environment that is not painting. If we
      // relied on rAF alone, stimulusAt would stay 0, every tap would measure against nothing,
      // and the pad would silently stop responding with no way out — a soft-lock. This way the
      // worst case is being one frame (~16ms) early, and the normal case is frame-accurate.
      const token = (stimulusTokenRef.current += 1);
      stimulusAtRef.current = performance.now();
      requestAnimationFrame(() => {
        // Only refine THIS stimulus, and only while it is still live. A late callback from an
        // earlier trial fails the token test and is ignored.
        if (stimulusTokenRef.current === token && stimulusAtRef.current !== 0) {
          stimulusAtRef.current = performance.now();
        }
      });

      timerRef.current = setTimeout(closeWindow, GO_NO_STIMULUS_WINDOW_MS);
    },
    [closeWindow, form, paintPad],
  );

  /** Wait an unpredictable moment, then show the stimulus. */
  const armTrial = useCallback(
    (index: number) => {
      clearTimer();
      trialIndexRef.current = index;
      stimulusAtRef.current = 0;
      paintProgress(index);
      paintPad('gap', 'WAIT', 'Tap the moment it says TAP. Do nothing when it says HOLD.');
      timerRef.current = setTimeout(() => showStimulus(index), gapDelayMs());
    },
    [clearTimer, paintPad, paintProgress, showStimulus],
  );

  const finishRun = useCallback(() => {
    clearTimer();
    stimulusAtRef.current = 0;

    const run = scoreGoNoGo(form.id, outcomesRef.current);

    if (!run) {
      // Not one go trial got a response. There is no median to report and we will not invent
      // one — see scoreGoNoGo. Nothing is saved.
      paintPad('done', 'NO DATA', 'No response was recorded on any go trial');
      setRunState({ kind: 'unmeasurable' });
      return;
    }

    paintPad('done', 'FINISHED', 'Readings below');
    setRunState({ kind: 'scored', run });
    void battery.complete(toStoredScore(run));
  }, [battery, clearTimer, form, paintPad]);

  // Park the newest version of each cyclic function in its ref, in an effect rather than during
  // render (mutating a ref while rendering is not something React guarantees is safe).
  useEffect(() => {
    armTrialRef.current = armTrial;
    finishRunRef.current = finishRun;
  });

  /**
   * TIMING RULE 2 IN ACTION. Every judgement below reads a ref. There is no React state on this
   * path at all, so a tap arriving in the same frame as anything else still sees the truth.
   */
  const handlePress = useCallback(() => {
    const phase = phaseRef.current;

    // A stimulus is showing — measure before literally anything else happens.
    if (phase === 'go' || phase === 'nogo') {
      const elapsed = performance.now() - stimulusAtRef.current;

      // Safety net. stimulusAt is set the moment we paint, so this should be impossible; it
      // exists so a future change that breaks that can never record a response measured against
      // page load instead of against the stimulus.
      if (stimulusAtRef.current === 0) return;

      const judged = judgeResponse(elapsed);

      if (judged.kind === 'anticipation') {
        discardAndRepeat('TOO SOON', 'That was faster than anyone can react — the round will repeat');
        return;
      }

      if (judged.kind === 'stale') {
        discardAndRepeat('SKIPPED', 'That round did not run properly, so it will start again');
        return;
      }

      // A real response. What it MEANS depends on which kind of trial it landed on.
      //
      // No per-trial right/wrong feedback, for the same two reasons as digit span and pattern
      // span: a "correct" affordance would be a green flash or a tick, which this app does not
      // have anywhere, and an athlete who knows they are failing starts guessing, which stops
      // the remaining trials measuring anything.
      completeTrial(
        phase === 'go' ? { kind: 'go-response', ms: judged.ms } : { kind: 'nogo-commission' },
      );
      return;
    }

    // Tapped during the blank gap, before any stimulus existed. That is an anticipation too, and
    // the loudest kind: there was nothing there to react to.
    if (phase === 'gap') {
      discardAndRepeat('TOO SOON', 'Nothing had appeared yet — the round will repeat');
      return;
    }

    // Idle — this is the tap that starts the run.
    if (phase === 'idle') {
      outcomesRef.current = [];
      repeatsRef.current = 0;
      armTrial(0);
    }
  }, [armTrial, completeTrial, discardAndRepeat]);

  // The native listener below is attached once and never re-bound, but `handlePress` is a new
  // function on every render. Parking the newest one in a ref lets that single listener always
  // call the current version.
  const handlePressRef = useRef(handlePress);
  useEffect(() => {
    handlePressRef.current = handlePress;
  });

  // Attach the tap listener natively, exactly once. Going through React's synthetic event system
  // would put React's own work between the tap and the clock read.
  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;

    const onPointerDown = () => handlePressRef.current();

    const onKeyDown = (event: KeyboardEvent) => {
      // Keyboard access for desktop and for anyone who cannot use a pointer. e.repeat filters out
      // the machine-gun events you get from holding a key down.
      if (event.repeat) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault(); // stop the spacebar from scrolling the page
      handlePressRef.current();
    };

    pad.addEventListener('pointerdown', onPointerDown, { passive: true });
    pad.addEventListener('keydown', onKeyDown);
    return () => {
      pad.removeEventListener('pointerdown', onPointerDown);
      pad.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Paint the opening prompt once the pad exists, and make sure no timer outlives the page.
  useEffect(() => {
    paintPad('idle', 'Tap to begin', `${GO_NO_TOTAL_TRIALS} trials · about a minute`);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paintPad]);

  /** Start over. Only offered in practice mode — a real sitting is saved when it finishes. */
  const runAgain = () => {
    clearTimer();
    stimulusAtRef.current = 0;
    trialIndexRef.current = 0;
    outcomesRef.current = [];
    repeatsRef.current = 0;
    setRunState(null);
    battery.resetPractice();
    paintPad('idle', 'Tap to begin', `${GO_NO_TOTAL_TRIALS} trials · about a minute`);
    if (progressRef.current) progressRef.current.textContent = '';
  };

  const scored = runState?.kind === 'scored' ? runState.run : null;

  return (
    <InstrumentShell>
      {battery.loaded && battery.practice && <PracticeBanner />}

      {/* ONE line of instruction, and it lives in the header with every other module's. */}
      <InstrumentHeader
        title="Go / no-go"
        step={battery.loaded ? battery.stepLabel : undefined}
        instruction="Tap the moment it says TAP — and do nothing at all when it says HOLD."
      >
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      <p
        ref={progressRef}
        aria-live="off"
        className="tabular mb-3 text-meta font-bold uppercase tracking-widest text-instrument-ink-soft"
      />

      {/*
        THE PAD. Note how little is here: no props that change, no children that change, no
        conditional classes. React renders this once and then never has a reason to touch it
        again, which is precisely what keeps renders out of the measurement.
      */}
      <div
        ref={padRef}
        className={`${PAD_BASE} ${PAD_PHASE_CLASSES.idle}`}
        role="button"
        tabIndex={0}
        aria-label="Go / no-go pad. Press when it says TAP. Do nothing when it says HOLD."
      >
        <span ref={padMainRef} className="tabular text-stimulus font-black tracking-tight sm:text-stimulus" />
        <span ref={padSubRef} className="mt-4 max-w-md text-body font-semibold opacity-90 sm:text-title" />
      </div>

      {scored && (
        <section className="mt-8 rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-4 sm:p-8">
          <h2 className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Recorded
          </h2>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border-2 border-instrument-ink-soft px-4 py-4">
              <dt className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
                Median response
              </dt>
              <dd className="tabular mt-1 text-display font-black sm:text-stimulus">{scored.medianMs} ms</dd>
            </div>
            <div className="rounded-xl border border-instrument-ink/20 px-4 py-4">
              <dt className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
                Tapped on hold
              </dt>
              <dd className="tabular mt-1 text-display font-black sm:text-stimulus">
                {scored.commissionErrors}
              </dd>
            </div>
            <div className="rounded-xl border border-instrument-ink/20 px-4 py-4">
              <dt className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
                Missed a tap
              </dt>
              <dd className="tabular mt-1 text-display font-black sm:text-stimulus">
                {scored.omissionErrors}
              </dd>
            </div>
          </dl>

          {/*
            The raw per-trial times. They are NOT saved — ModuleScores.goNoGo has no field for
            them and widening it would force every athlete to re-record their baseline. They are
            printed here because they are the most useful thing this module produces for the
            threshold work, and the workflow is the same as /tools/noise-floor: read them off the
            screen and write them down.
          */}
          <div className="mt-6">
            <h3 className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
              Every go-trial response, in order · not saved, write these down
            </h3>
            <p className="tabular mt-2 text-body break-words">
              {scored.goTrialsMs.join(' · ')} ms
            </p>
          </div>

          <p className="mt-4 text-meta text-instrument-ink-soft">
            {scored.goTrialsMs.length} of the {GO_NO_TOTAL_TRIALS - GO_NO_NOGO_PER_FORM} go trials
            got a response. Rounds that were tapped too early were discarded and run again rather
            than recorded. This is a record of what happened, not a judgement about it.
          </p>

          {battery.mode === 'practice' && (
            <Button variant="instrument-quiet" className="mt-6" onClick={runAgain}>
              Run practice again
            </Button>
          )}
        </section>
      )}

      {runState?.kind === 'unmeasurable' && (
        <section className="mt-8 rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-4 sm:p-8">
          <h2 className="text-title font-bold">Nothing could be measured</h2>
          <p className="mt-3 text-body text-instrument-ink-soft">
            No go trial got a response, so there is no response time to report and nothing has
            been recorded for this test. Run it again.
          </p>
          <Button variant="instrument-quiet" className="mt-6" onClick={runAgain}>
            Run again
          </Button>
        </section>
      )}

      {runState?.kind === 'abandoned' && (
        <section className="mt-8 rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-4 sm:p-8">
          <h2 className="text-title font-bold">This run was stopped</h2>
          <p className="mt-3 text-body text-instrument-ink-soft">
            The same round had to be repeated {GO_NO_MAX_TRIAL_REPEATS} times — usually because
            the screen was switched away from, or because taps kept arriving before the signal.
            Nothing was recorded. Run it again with the screen on and in front of you.
          </p>
          <Button variant="instrument-quiet" className="mt-6" onClick={runAgain}>
            Run again
          </Button>
        </section>
      )}

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}

      {/*
        The persistent safety footer ("Student-built screening aid — not a medical device. Always
        consult a medical professional.") is rendered by the ROOT layout, so it is already on this
        page and cannot be forgotten here. See app/layout.tsx and CLAUDE.md → THE HARD RULE.
      */}
    </InstrumentShell>
  );
}
