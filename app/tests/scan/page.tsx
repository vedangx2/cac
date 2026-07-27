'use client';

// app/tests/scan/page.tsx
//
// NUMBER SCAN — tap 1 to 15 in order, as fast as possible. We record total time and errors.
//
// What it's probing: how quickly the athlete can search a cluttered visual field, find a
// specific target, and move on to the next one. That "visual search + attention" loop is
// commonly slowed after a head impact, which is why rapid number-naming tasks show up in
// sideline screening generally.
//
// ── ORIGINALITY NOTE (please read before changing the layout) ────────────────────────────
// This is OUR OWN task and it is deliberately NOT the King-Devick test. King-Devick is a
// commercial, trademarked instrument: three specific printed cards of single digits arranged
// in rows with particular spacing, read ALOUD while someone else times it. Ours differs on
// every one of those axes — a 15-tile grid, the numbers 1-15 each appearing exactly once,
// tapped by the athlete on a touchscreen, self-timed. Do not "improve" this by moving to
// rows of repeated single digits or by copying any published card layout.
//
// ── A NOTE ON TIMING, VERSUS THE REACTION TEST ───────────────────────────────────────────
// The reaction test bans React re-renders during a trial because it measures a single event
// to the millisecond. This test does not need that: it measures ONE total span covering
// roughly fifteen taps and several seconds of human visual search. A re-render costing a
// fraction of a millisecond is irrelevant against that, so here we use ordinary React state
// and keep the code much easier to read. The one thing we still do imperatively is the live
// stopwatch — see the note on it below.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { shuffle } from '@/lib/shuffle';

const HIGHEST_NUMBER = 15;
const ALL_NUMBERS = Array.from({ length: HIGHEST_NUMBER }, (_, i) => i + 1);

/** How long a wrong tile stays red. */
const ERROR_FLASH_MS = 350;

type Phase = 'ready' | 'running' | 'done';

export default function ScanTestPage() {
  const battery = useBatteryStep('scan');

  const [phase, setPhase] = useState<Phase>('ready');
  const [numbers, setNumbers] = useState<number[]>([]);
  const [nextTarget, setNextTarget] = useState(1);
  const [errors, setErrors] = useState(0);
  const [wrongTile, setWrongTile] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The authoritative "which number is next" value.
   *
   * WHY A REF AND NOT JUST STATE: deciding whether a tap is right or wrong means reading the
   * current target. React state is only updated on the next render, so two taps arriving
   * before that render would both be judged against the OLD target — and the second one, even
   * though it was correct, would be counted as a mistake. A fast tapper on a slow phone could
   * rack up errors they never made, and extra errors are one of the things that raise a flag.
   * The ref updates synchronously, so the check is always against the real current target.
   * The state copy exists purely so the screen re-renders.
   */
  const nextTargetRef = useRef(1);

  const setTarget = useCallback((value: number) => {
    nextTargetRef.current = value;
    setNextTarget(value);
  }, []);

  /**
   * The live stopwatch.
   *
   * We write the time straight into one span with requestAnimationFrame instead of holding it
   * in React state. If the clock were state, every single frame (~60 times a second) would
   * re-render all fifteen tiles just to change two digits on screen. Painting one text node
   * costs almost nothing and keeps the grid perfectly responsive to taps.
   */
  const runClock = useCallback(() => {
    const tick = () => {
      if (clockRef.current) {
        const seconds = (performance.now() - startedAtRef.current) / 1000;
        clockRef.current.textContent = seconds.toFixed(1);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopClock = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  // Never leave a timer or animation frame running after the screen goes away.
  useEffect(() => {
    return () => {
      stopClock();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [stopClock]);

  // start/handleTile are wrapped in useCallback because they read the clock. React's lint
  // rules treat a bare function in the component body as something that could run during
  // render, and performance.now() is impure — useCallback makes it explicit that these only
  // ever run in response to a tap.
  const start = useCallback(() => {
    // The grid is only shuffled and revealed when they press start. Two reasons: the clock
    // can't be running before they're looking, and they can't pre-locate the 1 while reading
    // the instructions.
    setNumbers(shuffle(ALL_NUMBERS));
    setTarget(1);
    setErrors(0);
    setWrongTile(null);
    setElapsedMs(0);
    setPhase('running');
    startedAtRef.current = performance.now();
    runClock();
  }, [runClock, setTarget]);

  const handleTile = useCallback(
    (value: number) => {
      if (phase !== 'running') return;

      const target = nextTargetRef.current;
      if (value < target) return; // already found and locked in

      if (value !== target) {
        // Wrong number: count it, flash the tile, and do NOT advance the target.
        setErrors((n) => n + 1);
        setWrongTile(value);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setWrongTile(null), ERROR_FLASH_MS);
        return;
      }

      if (value === HIGHEST_NUMBER) {
        // Read the clock before any state work, then stop it.
        const total = Math.round(performance.now() - startedAtRef.current);
        stopClock();
        setElapsedMs(total);
        setTarget(HIGHEST_NUMBER + 1);
        setPhase('done');
        return;
      }

      setTarget(value + 1);
    },
    [phase, stopClock, setTarget],
  );

  const reset = () => {
    stopClock();
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setPhase('ready');
    setNumbers([]);
    setTarget(1);
    setErrors(0);
    setWrongTile(null);
    setElapsedMs(0);
    battery.resetPractice();
  };

  const handleContinue = () => {
    void battery.complete({ elapsedMs, errors });
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.mode === 'practice' && <PracticeBanner />}

      <InstrumentHeader title="Number scan" step={battery.loaded ? battery.stepLabel : ''}>
        <SittingLabel session={battery.session} />
        <p className="mt-2">
          Tap the numbers 1 through 15 in order, as fast as you can. Tapping the wrong number
          counts as an error and the target does not move on.
        </p>
      </InstrumentHeader>

      {/* Status strip: what to find, the running clock, and the error count. */}
      <div className="mb-5 grid grid-cols-3 gap-3 rounded-2xl border border-instrument-line bg-instrument-panel p-4 text-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-instrument-ink-soft">Find</p>
          <p className="tabular mt-1 text-3xl font-black sm:text-4xl" aria-live="polite">
            {phase === 'done' ? '✓' : phase === 'running' ? nextTarget : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-instrument-ink-soft">Time</p>
          <p className="tabular mt-1 text-3xl font-black sm:text-4xl">
            {phase === 'done' ? (
              (elapsedMs / 1000).toFixed(1)
            ) : (
              <span ref={clockRef}>0.0</span>
            )}
            <span className="ml-1 text-lg font-bold text-instrument-ink-soft">s</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-instrument-ink-soft">Errors</p>
          <p className="tabular mt-1 text-3xl font-black sm:text-4xl">{errors}</p>
        </div>
      </div>

      {/*
        THE GRID. 3 columns on a phone (comfortable for one thumb), 5 across from tablet up so
        a laptop gets a genuine wide field to search rather than a tall ribbon.
      */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4">
        {phase === 'ready'
          ? // Covered placeholders, so the layout is familiar before the clock starts.
            ALL_NUMBERS.map((n) => (
              <div
                key={n}
                aria-hidden="true"
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-instrument-line bg-instrument text-instrument-ink-soft"
              >
                <span className="text-2xl font-black opacity-30">?</span>
              </div>
            ))
          : numbers.map((n) => {
              const found = n < nextTarget;
              const isWrong = wrongTile === n;

              // Static class strings per state so Tailwind can see them in the source.
              const tileClass = isWrong
                ? 'border-white bg-flag text-white'
                : found
                  ? 'border-instrument-line bg-instrument text-instrument-ink-soft opacity-40'
                  : 'border-instrument-line bg-instrument-panel text-instrument-ink hover:border-instrument-ink-soft';

              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleTile(n)}
                  disabled={found || phase === 'done'}
                  aria-label={`Number ${n}`}
                  className={`flex aspect-square touch-none select-none items-center justify-center rounded-xl border-2 text-3xl font-black tabular sm:text-4xl ${tileClass}`}
                >
                  {n}
                </button>
              );
            })}
      </div>

      {/* Announce wrong taps in text as well as colour, so the feedback isn't colour-only. */}
      <p className="sr-only" role="status" aria-live="polite">
        {wrongTile !== null ? `${wrongTile} is not next. Find ${nextTarget}.` : ''}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {phase === 'ready' && <Button onClick={start}>Start</Button>}

        {phase === 'running' && (
          <Button variant="instrument" onClick={reset}>
            Start over
          </Button>
        )}

        {phase === 'done' && (
          <>
            {battery.mode === 'battery' ? (
              <>
                {/*
                  This is the last step of the battery, so this button is what actually commits
                  the whole sitting. It must be impossible to fire twice — a second tap while
                  the write is in flight could save the sitting twice or race the redirect.
                */}
                <Button onClick={handleContinue} disabled={battery.saving}>
                  {battery.saving ? 'Saving…' : 'Save and continue'}
                </Button>
                <Button variant="instrument" onClick={reset} disabled={battery.saving}>
                  Redo this test
                </Button>
              </>
            ) : (
              <Button onClick={reset}>Run practice again</Button>
            )}
          </>
        )}
      </div>

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}

      {phase === 'done' && (
        <p className="mt-4 text-lg font-semibold" aria-live="polite">
          Finished in {(elapsedMs / 1000).toFixed(1)} seconds with {errors}{' '}
          {errors === 1 ? 'error' : 'errors'}.
        </p>
      )}
    </InstrumentShell>
  );
}
