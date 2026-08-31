'use client';

// app/tests/pattern/page.tsx
//
// PATTERN SPAN — watch cells light up on a 3x3 grid, then tap them back in the same order.
//
// Nine fixed trials at lengths 2,2,3,3,4,4,5,5,6. Score is trials reproduced exactly, out of nine.
// No per-trial right/wrong feedback, for the same two reasons as digit span: a "correct" affordance
// would mean a green flash or a tick, which this app does not have anywhere, and an athlete who
// knows they are failing starts guessing.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// TWO GUARDS RE-ESTABLISHED HERE — both were lost when the old screens were deleted
// ═════════════════════════════════════════════════════════════════════════════════════
//
// GUARD 1 — JUDGE A TAP AGAINST A REF, NEVER AGAINST REACT STATE.
//
// This is the bug the deleted number scan actually had. Its tap handler read "which target are we
// looking for" out of React state. State only updates on the next render, so two correct taps
// arriving inside the same frame were BOTH judged against the old target, and the second was
// counted as an error. The athlete tapping fast and accurately — which is what a good answer looks
// like — was scored as making mistakes.
//
// Pattern span has exactly the same shape of problem. Someone reproducing a six-cell pattern taps
// quickly and confidently, so several taps land in one frame. So the position we are expecting
// lives in `expectedIndexRef`, written SYNCHRONOUSLY, and the tap handler reads the ref. React
// state is kept alongside it only to drive rendering, and is never consulted for a judgement.
//
// GUARD 2 — REACHING THE INPUT PHASE MUST NOT DEPEND ON A CALLBACK THAT MIGHT NEVER FIRE.
//
// This is the reaction pad's soft-lock bug, in its pattern-span form. That pad stamped its clock
// only inside requestAnimationFrame; browsers stop firing rAF for hidden tabs, so backgrounding the
// phone mid-trial meant the stamp never happened, every tap was discarded, and the pad locked with
// no way out.
//
// Here, playback is a chain of timers. If any link fails to fire — backgrounded tab, throttled
// timer, suspended page — the athlete would sit forever on a grid that never finishes flashing and
// never accepts input. So a WATCHDOG is armed when playback starts and force-completes it if the
// chain has not finished by the time it possibly could have. See lib/modules/pattern.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell, ModuleIntro } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import {
  PATTERN_FORMS,
  PATTERN_GRID_COLUMNS,
  PATTERN_TRIALS_PER_FORM,
  pickForm,
} from '@/lib/forms';
import {
  CELL_GAP_MS,
  CELL_ON_MS,
  MAX_PATTERN_CORRECT,
  allCells,
  cellPosition,
  isExpectedTap,
  scoreSpanTrials,
  watchdogDelayMs,
} from '@/lib/modules/pattern';

type Phase = 'instructions' | 'presenting' | 'tapping' | 'done';

export default function PatternSpanPage() {
  const battery = useBatteryStep('patternSpan');

  const [phase, setPhase] = useState<Phase>('instructions');
  const [trialIndex, setTrialIndex] = useState(0);
  /** Which cell is lit during playback, or -1 for none. */
  const [litCell, setLitCell] = useState(-1);
  /** How many taps the athlete has made this trial — drives rendering only. */
  const [tapCount, setTapCount] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [finalScore, setFinalScore] = useState<ReturnType<typeof scoreSpanTrials> | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    GUARD 1 STATE. `expectedIndexRef` is the authority on which position in the sequence we are
    waiting for, and it is written synchronously so a tap arriving before the next render still
    sees the truth. `trialFailedRef` likewise: once a trial is wrong it must stay wrong even if
    three more taps land in the same frame.
  */
  const expectedIndexRef = useRef(0);
  const trialFailedRef = useRef(false);

  const seed = battery.session
    ? `${battery.session.athleteId}:${battery.session.startedAt}`
    : 'practice';
  const form = useMemo(() => pickForm(PATTERN_FORMS, seed), [seed]);
  const sequence = form.sequences[trialIndex] ?? [];

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    timerRef.current = null;
    watchdogRef.current = null;
  }, []);

  /** Move from playback into the athlete's turn. Safe to call twice. */
  const beginTapping = useCallback(() => {
    clearTimers();
    setLitCell(-1);
    // Reset the ref BEFORE the phase changes, so the very first tap of the new phase is judged
    // against position 0 rather than against whatever the last trial left behind.
    expectedIndexRef.current = 0;
    trialFailedRef.current = false;
    setTapCount(0);
    setPhase('tapping');
  }, [clearTimers]);

  /** Flash the cells of trial `index`, then hand over to the athlete. */
  const presentTrial = useCallback(
    (index: number) => {
      clearTimers();
      setPhase('presenting');
      setTapCount(0);
      expectedIndexRef.current = 0;
      trialFailedRef.current = false;

      const cells = form.sequences[index] ?? [];
      let position = 0;

      const step = () => {
        setLitCell(cells[position]);
        timerRef.current = setTimeout(() => {
          setLitCell(-1); // dark beat, so adjacent cells do not read as one flash
          timerRef.current = setTimeout(() => {
            position += 1;
            if (position >= cells.length) {
              beginTapping();
              return;
            }
            step();
          }, CELL_GAP_MS);
        }, CELL_ON_MS);
      };

      /*
        GUARD 2. Arm the watchdog BEFORE starting the chain, so it is already in place no matter
        what happens next. If the chain stalls — backgrounded tab, throttled timer — this is what
        gets the athlete out. beginTapping is idempotent, so a watchdog firing just as the chain
        finishes normally is harmless.
      */
      watchdogRef.current = setTimeout(() => beginTapping(), watchdogDelayMs(cells.length));

      step();
    },
    [beginTapping, clearTimers, form],
  );

  // No timer may outlive the screen.
  useEffect(() => clearTimers, [clearTimers]);

  /**
   * GUARD 1 IN ACTION. Every judgement below reads `expectedIndexRef.current`, never the
   * `tapCount` state. Do not "simplify" this to use state — see the header comment.
   */
  const handleTap = (cell: number) => {
    if (phase !== 'tapping') return;

    const expectedIndex = expectedIndexRef.current;

    // Already past the end of the sequence: ignore extra taps rather than reading off the array.
    if (expectedIndex >= sequence.length) return;

    if (!isExpectedTap(sequence, expectedIndex, cell)) {
      // Wrong cell. Mark the trial failed synchronously and keep counting taps, so the athlete
      // finishes the trial normally instead of being told mid-way that they got it wrong.
      trialFailedRef.current = true;
    }

    const nextIndex = expectedIndex + 1;
    expectedIndexRef.current = nextIndex; // synchronous — this is the guard
    setTapCount(nextIndex); // for rendering only

    if (nextIndex >= sequence.length) {
      finishTrial(!trialFailedRef.current);
    }
  };

  const finishTrial = (correct: boolean) => {
    const nextResults = [...results, correct];
    setResults(nextResults);

    const nextTrial = trialIndex + 1;
    if (nextTrial >= PATTERN_TRIALS_PER_FORM) {
      const score = scoreSpanTrials(form.id, nextResults);
      setFinalScore(score);
      setPhase('done');
      clearTimers();
      void battery.complete(score);
      return;
    }

    setTrialIndex(nextTrial);
    presentTrial(nextTrial);
  };

  const restart = () => {
    clearTimers();
    setTrialIndex(0);
    setResults([]);
    setFinalScore(null);
    setLitCell(-1);
    setTapCount(0);
    expectedIndexRef.current = 0;
    trialFailedRef.current = false;
    setPhase('instructions');
    battery.resetPractice();
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.practice && <PracticeBanner />}

      <InstrumentHeader
        title="Tapped patterns"
        step={battery.loaded ? battery.stepLabel : undefined}
        instruction="Watch the squares light up, then tap them back in the same order."
      >
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      {phase === 'instructions' && (
        <ModuleIntro
          heading="Tap them back in the same order"
          detail={`${PATTERN_TRIALS_PER_FORM} rounds, getting longer.`}
          onStart={() => presentTrial(0)}
        />
      )}

      {(phase === 'presenting' || phase === 'tapping') && (
        <div>
          <p className="mb-4 text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Round {trialIndex + 1} of {PATTERN_TRIALS_PER_FORM} ·{' '}
            {phase === 'presenting' ? 'watch' : `your turn — ${tapCount} of ${sequence.length} tapped`}
          </p>

          <div
            className="mx-auto grid max-w-md gap-3"
            style={{ gridTemplateColumns: `repeat(${PATTERN_GRID_COLUMNS}, minmax(0, 1fr))` }}
          >
            {allCells().map((cell) => {
              const lit = litCell === cell;
              const { row, column } = cellPosition(cell, PATTERN_GRID_COLUMNS);
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={phase !== 'tapping'}
                  onPointerDown={() => handleTap(cell)}
                  aria-label={`Row ${row}, column ${column}`}
                  /*
                    A LIT cell is a bright neutral panel, not green. It is a target to watch and
                    then hit — it says nothing about correctness, and it must not borrow the visual
                    language of "right". See CLAUDE.md.
                  */
                  className={`aspect-square touch-none rounded-xl border-4 transition-none ${
                    lit
                      ? 'border-instrument-ink bg-instrument-ink'
                      : 'border-instrument-ink/20 bg-instrument-panel'
                  } ${phase === 'tapping' ? 'cursor-pointer hover:border-instrument-ink-soft' : ''}`}
                />
              );
            })}
          </div>

          {phase === 'tapping' && (
            <p className="mt-4 text-center text-body text-instrument-ink-soft">
              Tap {sequence.length} {sequence.length === 1 ? 'square' : 'squares'}, in order.
            </p>
          )}
        </div>
      )}

      {phase === 'done' && finalScore && (
        <div className="rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-6">
          <h2 className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Recorded
          </h2>
          <p className="tabular mt-2 text-display font-black sm:text-stimulus">
            {finalScore.correct} out of {MAX_PATTERN_CORRECT}
          </p>
          <p className="mt-3 text-body text-instrument-ink-soft">
            Rounds reproduced exactly. This is a record of what happened, not a judgement about it.
          </p>

          {battery.mode === 'practice' && (
            <Button variant="instrument-quiet" className="mt-6" onClick={restart}>
              Run practice again
            </Button>
          )}
        </div>
      )}

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}
    </InstrumentShell>
  );
}
