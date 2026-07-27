'use client';

// app/tests/reaction/page.tsx
//
// REACTION TIME TEST — tap the pad when it turns green. 5 trials. We report the MEDIAN.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// HOW WE MADE THE TIMING TRUSTWORTHY (this is the part to explain on camera)
// ═════════════════════════════════════════════════════════════════════════════════════
// A reaction test is only worth anything if the number we print is the athlete's reaction
// time and not our app's overhead. Four specific decisions protect that:
//
// 1. performance.now(), never Date.now().
//    Date.now() reads the wall clock, which is only millisecond-resolution and can jump if
//    the system clock syncs mid-trial. performance.now() is a monotonic high-resolution
//    timer that only ever counts forward from page load. It cannot jump backwards.
//
// 2. pointerdown, never click.
//    "click" only fires after the finger/button comes back UP, so it measures how long
//    someone holds the tap as well as how fast they were. pointerdown fires the instant
//    contact is made, and it covers mouse, touch and stylus with one code path.
//
// 3. We time the frame the athlete can actually SEE, using requestAnimationFrame.
//    Changing the pad's colour in JavaScript does not put green on the screen — it queues
//    work the browser paints on its next frame. If we stamped the start time right after the
//    colour change we'd start the clock up to ~16ms before the athlete could possibly see
//    anything. So we stamp it inside requestAnimationFrame, which runs immediately before
//    that frame is painted. The pad also has NO css transition, because animating the colour
//    would smear the stimulus across several frames.
//
// 4. Zero React re-renders between "green" and the tap.
//    This is the big one. If React re-rendered while a trial was live, the athlete's tap
//    would land while the main thread was busy diffing and committing, and that delay would
//    be recorded as their reaction time. So during a trial we do not touch React state at
//    all: the pad's JSX is completely static, and its colour and text are changed by writing
//    to the DOM node directly through refs. The trial's state machine also lives in refs
//    (a ref can change without causing a render). We only call setState AFTER the tap has
//    already been measured, when a render can no longer contaminate anything.
//    On top of that, the pointerdown listener is attached natively with addEventListener
//    rather than through React's onPointerDown, so the tap doesn't have to travel through
//    React's synthetic event system before we read the clock.
//
// A note for whoever reads this next: the pad turns GREEN on purpose, and that is not a
// violation of the "never show green" rule in CLAUDE.md. That rule is about never implying a
// person is cleared or healthy. This green is a physical target to hit — it says nothing
// about anybody's health. Do not "fix" it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { median } from '@/lib/stats';
import { MAX_PLAUSIBLE_REACTION_MS } from '@/lib/engine/thresholds';

const TOTAL_TRIALS = 5;

// The wait before green must be unpredictable, otherwise an athlete learns the rhythm and
// starts anticipating instead of reacting. A range of 1.4-3.5s is long enough that counting
// it out doesn't help.
const MIN_DELAY_MS = 1400;
const MAX_DELAY_MS = 3500;

/** How long the "Too soon" message sits on screen before the trial re-arms. */
const FALSE_START_MESSAGE_MS = 1200;

type PadPhase = 'idle' | 'armed' | 'go' | 'toosoon' | 'done';

// Static class strings. They must appear literally in the source, because Tailwind builds
// its stylesheet by scanning these files as text — a class name assembled at runtime would
// never make it into the CSS.
const PAD_BASE =
  'flex w-full touch-none cursor-pointer select-none flex-col items-center justify-center ' +
  'rounded-2xl border-4 p-6 text-center min-h-[20rem] sm:min-h-[24rem] lg:min-h-[30rem]';

const PAD_PHASE_CLASSES: Record<PadPhase, string> = {
  idle: 'border-instrument-line bg-instrument-panel text-instrument-ink',
  armed: 'border-pad-wait bg-pad-wait text-white',
  go: 'border-pad-go bg-pad-go text-black',
  toosoon: 'border-white bg-pad-wait text-white',
  done: 'border-instrument-line bg-instrument-panel text-instrument-ink',
};

export default function ReactionTestPage() {
  const battery = useBatteryStep('reaction');

  // ── Values React is allowed to know about. These only change between trials. ──────────
  const [trials, setTrials] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [finished, setFinished] = useState(false);

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
      // The provisional stamp is taken right now, the instant we ask for green. On its own it
      // is very slightly early — the pixels aren't on screen yet.
      //
      // The refinement inside requestAnimationFrame is the accurate one: rAF runs immediately
      // before the browser paints, so it marks the moment green actually became visible.
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

      // Not a reaction — they looked away, or the phone was backgrounded and the browser
      // stopped painting. Throw the trial out and repeat it rather than let an inflated
      // number drag the median up and raise a false flag. See MAX_PLAUSIBLE_REACTION_MS.
      if (ms > MAX_PLAUSIBLE_REACTION_MS) {
        greenAtRef.current = 0;
        paintPad('toosoon', 'MISSED', 'Too slow to be a reaction — that trial will start again');
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
        done ? 'All trials complete' : `Tap for trial ${trialsRef.current.length + 1}`,
      );

      // The measurement is finished, so React is safe to wake up now.
      setTrials(trialsRef.current);
      if (done) setFinished(true);
      return;
    }

    // RED IS SHOWING — they jumped the gun.
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

  // The native listener below is attached once and never re-bound, but `handlePress` is a new
  // function on every render. Parking the newest one in a ref lets that single listener always
  // call the current version. The assignment happens in an effect rather than during render,
  // because mutating a ref while rendering is not something React guarantees is safe.
  const handlePressRef = useRef(handlePress);
  useEffect(() => {
    handlePressRef.current = handlePress;
  });

  // Attach the tap listener natively, exactly once. `passive: true` tells the browser it
  // never has to wait on us to decide whether to scroll.
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

  const restart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    trialsRef.current = [];
    falseStartsRef.current = 0;
    greenAtRef.current = 0;
    setTrials([]);
    setFalseStarts(0);
    setFinished(false);
    battery.resetPractice();
    idlePrompt(0);
  };

  const medianMs = trials.length > 0 ? Math.round(median(trials)) : null;

  const handleContinue = () => {
    // Store whole milliseconds — sub-millisecond precision is noise here, and it keeps the
    // saved record and the on-screen number identical.
    void battery.complete({
      trialsMs: trials,
      medianMs: Math.round(median(trials)),
      falseStarts,
    });
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.mode === 'practice' && <PracticeBanner />}

      <InstrumentHeader title="Reaction time" step={battery.loaded ? battery.stepLabel : ''}>
        <SittingLabel session={battery.session} />
        <p className="mt-2">
          Wait for the pad to turn green, then tap it as fast as you can. Tapping while it is
          red counts as a false start and that trial starts over.
        </p>
      </InstrumentHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        {/*
          THE PAD. Note how little is here: no props that change, no children that change, no
          conditional classes. React renders this once and then never has a reason to touch
          it again, which is precisely what keeps renders out of the measurement.
        */}
        <div
          ref={padRef}
          className={`${PAD_BASE} ${PAD_PHASE_CLASSES.idle}`}
          role="button"
          tabIndex={0}
          aria-label="Reaction pad. Press when it turns green."
        >
          <span ref={padMainRef} className="tabular text-5xl font-black tracking-tight sm:text-7xl" />
          <span ref={padSubRef} className="mt-4 max-w-md text-base font-semibold opacity-90 sm:text-lg" />
        </div>

        {/* Live scoreboard. Updates only between trials, never during one. */}
        <aside className="rounded-2xl border border-instrument-line bg-instrument-panel p-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-instrument-ink-soft">
            Trials
          </h2>

          <ol className="mt-4 space-y-2" aria-live="polite">
            {Array.from({ length: TOTAL_TRIALS }, (_, index) => {
              const value = trials[index];
              return (
                <li
                  key={index}
                  className="flex items-center justify-between border-b border-instrument-line pb-2 text-lg"
                >
                  <span className="text-instrument-ink-soft">Trial {index + 1}</span>
                  <span className="tabular font-bold">
                    {value === undefined ? <span className="text-instrument-ink-soft">—</span> : `${value} ms`}
                  </span>
                </li>
              );
            })}
          </ol>

          <dl className="mt-5 space-y-2 text-base">
            <div className="flex items-center justify-between">
              <dt className="text-instrument-ink-soft">False starts</dt>
              <dd className="tabular font-bold">{falseStarts}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-instrument-line pt-2">
              <dt className="font-semibold">Median</dt>
              <dd className="tabular text-xl font-black">
                {medianMs === null ? '—' : `${medianMs} ms`}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-instrument-ink-soft">
            We use the median (the middle trial) rather than the average so one distracted tap
            cannot skew the result.
          </p>
        </aside>
      </div>

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}

      {finished && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {battery.mode === 'battery' ? (
            <Button onClick={handleContinue} disabled={battery.saving}>
              {battery.saving ? 'Saving…' : 'Save and continue'}
            </Button>
          ) : (
            <Button onClick={restart}>Run practice again</Button>
          )}
          {battery.mode === 'battery' && (
            <Button variant="instrument" onClick={restart} disabled={battery.saving}>
              Redo this test
            </Button>
          )}
        </div>
      )}
    </InstrumentShell>
  );
}
