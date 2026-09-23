'use client';

// app/tools/noise-floor/page.tsx
//
// NOISE-FLOOR INSTRUMENT — a measurement tool, NOT part of the test battery.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THIS PAGE EXISTS
// ═════════════════════════════════════════════════════════════════════════════════════
// Every threshold in this app is currently a placeholder guess. To replace a guess with a
// real number you first have to know how much a HEALTHY person's score wobbles from one
// sitting to the next — the noise floor. A threshold set below the noise floor flags
// everybody; a threshold set far above it flags nobody. You cannot pick one without
// measuring the other first.
//
// So this page runs the same 5-trial reaction protocol the battery used, over and over,
// and prints the raw numbers big enough to copy onto paper. It exists to be run many times
// by one healthy person, by hand, with the results recorded off-device.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PAGE DELIBERATELY DOES NOT DO
// ═════════════════════════════════════════════════════════════════════════════════════
//   • It does not import lib/types.ts, lib/engine/** or lib/session.ts.
//   • It does not touch IndexedDB, sessionStorage, or any other storage. Nothing you do
//     here is saved anywhere. Write the numbers down or they are gone.
//   • It is not in BATTERY_STEPS and nothing in the athlete flow links to it. You reach it
//     by typing the URL.
//   • It never compares anything to anything, so it never flags, and it never says a word
//     about anybody's health.
//
// That isolation is the point. The battery around it is being rebuilt and its modules are
// being deleted and replaced; this instrument has to keep producing comparable numbers
// across that whole rebuild. Anything it shares with the battery is something that could
// change underneath it mid-collection and silently break comparability with the readings
// already on paper.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE TIMING HANDLING IS IDENTICAL TO THE BATTERY'S REACTION PAD, ON PURPOSE
// ═════════════════════════════════════════════════════════════════════════════════════
// If the instrument measured differently from the test, its readings would describe the
// instrument rather than the person. All four of the original protections are reproduced:
//
// 1. performance.now(), never Date.now() — monotonic, high-resolution, cannot jump
//    backwards if the system clock syncs mid-trial.
// 2. pointerdown, never click — fires on contact, not on release, so it does not also
//    measure how long the finger stays down.
// 3. The clock is stamped inside requestAnimationFrame, which runs immediately before the
//    frame is painted, so it marks the moment green actually became visible — plus a
//    synchronous stamp first (see armTrial for why both).
// 4. Zero React re-renders between the stimulus and the response. During a live trial the
//    pad's colour and text are written straight to the DOM through refs and the trial
//    state machine lives in refs, so React has no reason to render. setState is only
//    called after the tap has already been measured.
//
// A note for whoever reads this next: the pad turns GREEN on purpose, and that is not a
// violation of the "never show green" rule in CLAUDE.md. That rule is about never implying
// a person is cleared or healthy. This green is a physical target to hit — it says nothing
// about anybody's health. Do not "fix" it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell } from '@/components/ui';
import { median } from '@/lib/stats';

const TOTAL_TRIALS = 5;

// The wait before green must be unpredictable, otherwise you learn the rhythm and start
// anticipating instead of reacting — which would make the noise floor look far tighter
// than it really is. Same 1.4-3.5s range the battery's pad used.
const MIN_DELAY_MS = 1400;
const MAX_DELAY_MS = 3500;

/** How long the "Too soon" / "Missed" message sits on screen before the trial re-arms. */
const FALSE_START_MESSAGE_MS = 1200;

/**
 * The longest a single trial can be and still plausibly be a REACTION. Anything above this
 * means you looked away or the phone backgrounded itself mid-trial (browsers stop painting
 * frames for hidden tabs), so the trial is thrown away and repeated.
 *
 * WHY THIS IS A LOCAL COPY rather than an import: the battery's version of this constant
 * lives in lib/engine/thresholds.ts, and this page is deliberately cut off from lib/engine
 * so that rebuilding the engine cannot change how this instrument measures. The cost of
 * that isolation is one duplicated number. If you ever change the discard limit here, the
 * readings you take afterwards are NOT comparable with the ones already on paper — so
 * treat this value as frozen for the life of a collection run.
 */
const MAX_PLAUSIBLE_REACTION_MS = 3000;

/**
 * The FASTEST a single trial can be and still plausibly be a reaction rather than a guess.
 *
 * ADDED 2026-09-10, at the project owner's direction, because until then this page had NO
 * lower bound: it discarded implausibly slow trials and counted taps while red as false
 * starts, but a tap landing just AFTER green — a finger already on its way down — was
 * recorded as a genuine reaction. The owner's own collected runs contained three trials
 * under 200 ms, one at 131 ms, and one of them moved a run's median by 11 ms. Those are
 * anticipations, not reactions, and left in the data they make the noise floor look tighter
 * than it is — which would eventually argue for a threshold set too low.
 *
 * A too-fast trial is DISCARDED AND REPEATED, exactly the way go/no-go treats an
 * anticipation: never recorded, and never counted as an error either — we did not measure
 * that trial, so we say nothing about it. It is deliberately NOT added to the false-start
 * count, so that count keeps meaning what it meant on every reading already on paper: taps
 * while the pad was still red.
 *
 * TODO(NEEDS_SOURCE): 180 ms is the owner's own choice of "too fast to be a reaction to
 * this stimulus", not a value from any published protocol.
 *
 * COMPARABILITY WARNING, same as the constant above but sharper because this rule arrived
 * MID-COLLECTION: readings taken before 2026-09-10 could contain anticipations; readings
 * taken after this rule cannot. That difference is deliberate — the earlier data is what
 * exposed the problem — but keep it in mind when the two are side by side on paper, and
 * treat the value as frozen from here on.
 */
const MIN_PLAUSIBLE_REACTION_MS = 180;

type PadPhase = 'idle' | 'armed' | 'go' | 'toosoon' | 'done';

// Static class strings. They must appear literally in the source, because Tailwind builds
// its stylesheet by scanning these files as text — a class name assembled at runtime would
// never make it into the CSS.
const PAD_BASE =
  'flex w-full touch-none cursor-pointer select-none flex-col items-center justify-center ' +
  'rounded-2xl border-4 p-6 text-center min-h-64 sm:min-h-96';

const PAD_PHASE_CLASSES: Record<PadPhase, string> = {
  idle: 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink',
  armed: 'border-instrument-ink-soft bg-instrument-panel text-instrument-ink',
  go: 'border-pad-go bg-pad-go text-instrument',
  toosoon: 'border-instrument-ink bg-instrument-panel text-instrument-ink',
  done: 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink',
};

export default function NoiseFloorPage() {
  // ── Values React is allowed to know about. These only change between trials. ──────────
  const [trials, setTrials] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [finished, setFinished] = useState(false);

  // Which run this is since the page loaded. Purely a bookkeeping aid so that when you are
  // writing readings onto paper you can tell run 7 from run 8 without counting rows.
  const [runNumber, setRunNumber] = useState(1);

  // ── The live trial machine. All refs, so none of this triggers a render. ─────────────
  const phaseRef = useRef<PadPhase>('idle');
  const greenAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trialsRef = useRef<number[]>([]);
  const falseStartsRef = useRef(0);

  // ── Handles on the DOM we paint directly. ────────────────────────────────────────────
  const padRef = useRef<HTMLDivElement | null>(null);
  const padMainRef = useRef<HTMLSpanElement | null>(null);
  const padSubRef = useRef<HTMLSpanElement | null>(null);

  /** Write a phase straight to the DOM. Never goes through React. */
  const paintPad = useCallback((phase: PadPhase, main: string, sub: string) => {
    phaseRef.current = phase;
    if (padRef.current) padRef.current.className = `${PAD_BASE} ${PAD_PHASE_CLASSES[phase]}`;
    if (padMainRef.current) padMainRef.current.textContent = main;
    if (padSubRef.current) padSubRef.current.textContent = sub;
  }, []);

  const idlePrompt = useCallback(
    (completed: number) =>
      paintPad(
        'idle',
        completed === 0 ? 'Tap to begin' : `Tap for trial ${completed + 1}`,
        `Trial ${completed + 1} of ${TOTAL_TRIALS} · wait for green, then tap as fast as you can`,
      ),
    [paintPad],
  );

  /** Arm a trial: go red, then flip to green after an unpredictable delay. */
  const armTrial = useCallback(() => {
    paintPad('armed', 'WAIT', 'Do not tap yet');

    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    timerRef.current = setTimeout(() => {
      // Paint green first...
      paintPad('go', 'TAP', '');

      // ...then stamp the clock TWICE, and this belt-and-braces is deliberate.
      //
      // The provisional stamp is taken right now, the instant we ask for green. On its own
      // it is very slightly early — the pixels aren't on screen yet.
      //
      // The refinement inside requestAnimationFrame is the accurate one: rAF runs
      // immediately before the browser paints, so it marks the moment green actually
      // became visible.
      //
      // We do BOTH because requestAnimationFrame is not guaranteed to run. Browsers stop
      // firing it for tabs that aren't visible, and it never fires at all in an environment
      // that isn't painting. If we relied on rAF alone, greenAt would stay unset, every tap
      // would be discarded, and the pad would silently stop responding with no way out — a
      // soft-lock. This way the worst case is being one frame (~16ms) early, and the normal
      // case is still frame-accurate.
      greenAtRef.current = performance.now();
      requestAnimationFrame(() => {
        greenAtRef.current = performance.now();
      });
    }, delay);
  }, [paintPad]);

  const handlePress = useCallback(() => {
    const phase = phaseRef.current;

    // GREEN IS SHOWING — measure before literally anything else happens.
    if (phase === 'go') {
      const elapsed = performance.now() - greenAtRef.current;

      // Safety net. greenAt is always set the moment we paint green, so this should be
      // impossible; it exists so that a future change which breaks that can never record a
      // measurement taken against page load instead of against the stimulus.
      if (greenAtRef.current === 0) return;

      const ms = Math.round(elapsed);

      // Not a reaction — you looked away, or the phone was backgrounded and the browser
      // stopped painting. Throw the trial out and repeat it. For a noise-floor reading this
      // matters even more than it did in the battery: one 2,800ms "trial" left in the set
      // would widen the measured spread and make the floor look far noisier than it is.
      if (ms > MAX_PLAUSIBLE_REACTION_MS) {
        greenAtRef.current = 0;
        paintPad('toosoon', 'MISSED', 'Too slow to be a reaction. That trial will start again');
        timerRef.current = setTimeout(() => {
          idlePrompt(trialsRef.current.length);
        }, FALSE_START_MESSAGE_MS);
        return;
      }

      // The other direction: a tap this soon after green was already on its way down before
      // anything could have been seen and processed. Discard and repeat, the same way
      // go/no-go handles an anticipation — it is not recorded and not counted as anything.
      // See MIN_PLAUSIBLE_REACTION_MS for why this exists and why it is not a false start.
      if (ms < MIN_PLAUSIBLE_REACTION_MS) {
        greenAtRef.current = 0;
        paintPad('toosoon', 'TOO SOON', 'Too fast to be a reaction. That trial will start again');
        timerRef.current = setTimeout(() => {
          idlePrompt(trialsRef.current.length);
        }, FALSE_START_MESSAGE_MS);
        return;
      }

      trialsRef.current = [...trialsRef.current, ms];
      greenAtRef.current = 0;

      const done = trialsRef.current.length >= TOTAL_TRIALS;
      paintPad(
        done ? 'done' : 'idle',
        `${ms} ms`,
        done ? 'All trials complete. Readings below' : `Tap for trial ${trialsRef.current.length + 1}`,
      );

      // The measurement is finished, so React is safe to wake up now.
      setTrials(trialsRef.current);
      if (done) setFinished(true);
      return;
    }

    // RED IS SHOWING — jumped the gun.
    if (phase === 'armed') {
      if (timerRef.current) clearTimeout(timerRef.current);
      falseStartsRef.current += 1;
      setFalseStarts(falseStartsRef.current);

      paintPad('toosoon', 'TOO SOON', 'That trial will start again');
      timerRef.current = setTimeout(() => {
        // The trial is repeated, not consumed — we still end up with 5 real measurements.
        idlePrompt(trialsRef.current.length);
      }, FALSE_START_MESSAGE_MS);
      return;
    }

    // IDLE — start the next trial, unless we've already got all five.
    if (phase === 'idle') {
      if (trialsRef.current.length >= TOTAL_TRIALS) return;
      armTrial();
    }
  }, [armTrial, idlePrompt, paintPad]);

  // The native listener below is attached once and never re-bound, but `handlePress` is a
  // new function on every render. Parking the newest one in a ref lets that single listener
  // always call the current version. The assignment happens in an effect rather than during
  // render, because mutating a ref while rendering is not something React guarantees is safe.
  const handlePressRef = useRef(handlePress);
  useEffect(() => {
    handlePressRef.current = handlePress;
  });

  // Attach the tap listener natively, exactly once. Going through React's synthetic event
  // system would put React's work between the tap and the clock read.
  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;

    const onPointerDown = () => handlePressRef.current();

    const onKeyDown = (event: KeyboardEvent) => {
      // Keyboard access for desktop and for anyone who can't use a pointer. e.repeat filters
      // out the machine-gun events you get from holding a key down.
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
    idlePrompt(0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [idlePrompt]);

  /**
   * Reset to a clean slate for another run.
   *
   * Everything is cleared, including the pending timer — otherwise a "run again" pressed
   * during the 1.2s false-start message would leave that timer alive and it would repaint
   * the idle prompt partway into the new run.
   */
  const runAgain = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    trialsRef.current = [];
    falseStartsRef.current = 0;
    greenAtRef.current = 0;
    setTrials([]);
    setFalseStarts(0);
    setFinished(false);
    setRunNumber((n) => n + 1);
    idlePrompt(0);
  };

  const medianMs = finished ? Math.round(median(trials)) : null;

  return (
    <InstrumentShell>
      {/*
        This banner is the first thing on the page on purpose. Anyone who lands here by
        accident, or a judge clicking around, must immediately understand that this is not
        a test of anybody and produces nothing about anybody's health.
      */}
      <div className="mb-6 rounded-lg border-l-4 border-y border-r border-instrument-ink-soft bg-instrument-panel p-4">
        <p className="font-bold text-instrument-ink">Measurement tool. Not part of the screening battery</p>
        <p className="mt-1 text-meta text-instrument-ink-soft">
          This page exists so we can measure how much a healthy person&apos;s reaction time
          varies between sittings. It is not a concussion test, it is not scored, it is not
          compared against anyone&apos;s baseline, and it says nothing about anyone&apos;s
          health. Nothing on this page is saved. The numbers disappear when you leave, so
          write them down.
        </p>
      </div>

      <InstrumentHeader title="Reaction noise floor" step={`Run ${runNumber}`}>
        <p>
          Wait for the pad to turn green, then tap it as fast as you can. Five trials. Tapping
          while it is red counts as a false start and that trial starts over; a tap almost
          instantly after green is discarded as a guess and the trial repeats too.
        </p>
      </InstrumentHeader>

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
        aria-label="Reaction pad. Press when it turns green."
      >
        <span ref={padMainRef} className="tabular text-stimulus font-black tracking-tight sm:text-stimulus" />
        <span ref={padSubRef} className="mt-4 max-w-md text-body font-semibold opacity-90 sm:text-title" />
      </div>

      {/*
        THE READOUT. Deliberately oversized: the whole workflow for this page is "run it,
        read the numbers off the screen, write them on paper, run it again", and that is a
        lot easier if the digits are legible at arm's length.
      */}
      {finished && (
        <section className="mt-8 rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-4 sm:p-8">
          <h2 className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Run {runNumber} · write these down
          </h2>

          <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
            {trials.map((value, index) => (
              <li
                key={index}
                className="rounded-xl border border-instrument-ink/20 px-4 py-3 text-center"
              >
                <span className="block text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
                  Trial {index + 1}
                </span>
                <span className="tabular mt-1 block text-display font-black sm:text-display">{value}</span>
              </li>
            ))}
          </ol>

          <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border-2 border-instrument-ink-soft px-4 py-4">
              <dt className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
                Median
              </dt>
              <dd className="tabular mt-1 text-stimulus font-black sm:text-stimulus">{medianMs} ms</dd>
            </div>
            <div className="rounded-xl border border-instrument-ink/20 px-4 py-4">
              <dt className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
                False starts
              </dt>
              <dd className="tabular mt-1 text-stimulus font-black sm:text-stimulus">{falseStarts}</dd>
            </div>
          </dl>

          <p className="mt-4 text-meta text-instrument-ink-soft">
            Trials are shown in the order they happened. Any trial slower than{' '}
            {MAX_PLAUSIBLE_REACTION_MS} ms or faster than {MIN_PLAUSIBLE_REACTION_MS} ms was
            discarded and repeated rather than recorded, so all five numbers above are genuine
            reactions. A sub-{MIN_PLAUSIBLE_REACTION_MS} ms tap is a guess that was already on
            its way down, not a reaction. False starts do not consume a trial.
          </p>

          <div className="mt-8">
            <Button variant="instrument-quiet" onClick={runAgain}>
              Run again
            </Button>
          </div>
        </section>
      )}

      {/*
        The persistent safety footer ("Student-built screening aid — not a medical device.
        Always consult a medical professional.") is rendered by the ROOT layout, so it is
        already on this page and cannot be forgotten here. See app/layout.tsx and
        CLAUDE.md → THE HARD RULE.
      */}
    </InstrumentShell>
  );
}
