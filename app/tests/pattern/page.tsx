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
//
// ═════════════════════════════════════════════════════════════════════════════════════
// GUARD 3 — A TAP SHOWS IMMEDIATELY, AND A REPEAT TAP ON THE SAME CELL IS IGNORED, NOT
// DOUBLE-COUNTED (fixed 2026-09-22)
// ═════════════════════════════════════════════════════════════════════════════════════
//
// THE BUG: nothing on screen changed when a tap landed. An athlete who was not sure the first
// tap registered tapped the same cell again, and the second tap was silently judged as the NEXT
// position in the sequence — a real run scored 8/9 where the single miss was this, not the
// athlete's memory.
//
// THE FIX has two halves:
//   1. A tapped cell shows a distinct SELECTED fill (ink-soft, not the lit cue's full ink) the
//      instant the tap is recorded, so the athlete can see it took without being told whether it
//      was correct — selected means "you picked this", never "this is right". See CLAUDE.md.
//   2. A second tap on a cell already tapped THIS TRIAL is deliberately ignored — see
//      isRepeatTap in lib/modules/pattern.ts for why that is always the safe reading (no
//      sequence in the pool ever repeats a cell, so a repeat tap can never be a legitimate next
//      answer). This is the safety net for a double-tap that still slips through despite the
//      visual feedback, e.g. two pointerdown events the OS itself coalesces oddly.
//
// Tracked in `tappedCellsRef`/`tappedCells`, the same synchronous-ref-plus-mirrored-state shape
// GUARD 1 already uses for `expectedIndexRef`/`tapCount` — the ref is the authority a tap is
// judged against, the state exists only to paint the selected cells.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// TWO UNSCORED DEMO ROUNDS BEFORE THE NINE REAL ONES (added 2026-09-20)
// ═════════════════════════════════════════════════════════════════════════════════════
// The instructions screen's Start button now leads into the demo, not trial 1 — so an athlete
// cannot reach a scored round without completing at least one demo round first. The demo plays
// against PATTERN_DEMO_SEQUENCES, a separate fixed pool that never overlaps with a scored form
// and never changes sitting to sitting, so baseline and check see an identical demo and nothing
// about it is saved or scored. See lib/forms/patternGrids.ts.
//
// The demo deliberately does NOT reuse GUARD 1's correctness machinery (expectedIndexRef /
// trialFailedRef): a demo round has no verdict to protect, so it only needs to count taps, not
// judge them. It gets its own ref-based counter (`demoTapCountRef`) for the same reason GUARD 1
// exists at all — several taps landing in one animation frame must still be counted correctly —
// but the real trial's judging code below is untouched by any of this.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell, ModuleIntro } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import {
  PATTERN_DEMO_SEQUENCES,
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
  isRepeatTap,
  scoreSpanTrials,
  watchdogDelayMs,
} from '@/lib/modules/pattern';

type Phase =
  | 'instructions'
  | 'demoPresenting'
  | 'demoTapping'
  | 'demoDone'
  | 'presenting'
  | 'tapping'
  | 'done';

export default function PatternSpanPage() {
  const battery = useBatteryStep('patternSpan');

  const [phase, setPhase] = useState<Phase>('instructions');
  const [trialIndex, setTrialIndex] = useState(0);
  /** Which demo round (0 or 1) is playing or being tapped. */
  const [demoRound, setDemoRound] = useState(0);
  /** Which cell is lit during playback, or -1 for none. Shared by demo and real trials. */
  const [litCell, setLitCell] = useState(-1);
  /** How many taps the athlete has made this trial — drives rendering only. Shared by demo and real trials. */
  const [tapCount, setTapCount] = useState(0);
  /**
   * Which cells have been tapped THIS TRIAL, in tap order — drives the selected-cell visual.
   * Shared by demo and real trials, and mirrored from `tappedCellsRef` (see GUARD 3 above).
   */
  const [tappedCells, setTappedCells] = useState<number[]>([]);
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

  /**
   * GUARD 3 STATE. The authority on which cells have been tapped this trial — see isRepeatTap
   * in lib/modules/pattern.ts. Written synchronously, same reasoning as expectedIndexRef.
   */
  const tappedCellsRef = useRef<number[]>([]);

  /**
   * DEMO STATE. A demo round has no verdict, so it needs no failed-trial ref — only a
   * synchronous tap counter, for the same reason GUARD 1 needs one: several taps can land inside
   * one animation frame, and only a ref updated synchronously counts them correctly.
   */
  const demoTapCountRef = useRef(0);

  const seed = battery.session
    ? `${battery.session.athleteId}:${battery.session.startedAt}`
    : 'practice';
  const form = useMemo(() => pickForm(PATTERN_FORMS, seed), [seed]);
  const sequence = form.sequences[trialIndex] ?? [];
  const demoSequence = PATTERN_DEMO_SEQUENCES[demoRound] ?? [];
  /** Whichever sequence is actually in play right now, real or demo. */
  const activeSequence = phase === 'demoPresenting' || phase === 'demoTapping' ? demoSequence : sequence;

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
    tappedCellsRef.current = [];
    setTapCount(0);
    setTappedCells([]);
    setPhase('tapping');
  }, [clearTimers]);

  /** Flash the cells of trial `index`, then hand over to the athlete. */
  const presentTrial = useCallback(
    (index: number) => {
      clearTimers();
      setPhase('presenting');
      setTapCount(0);
      setTappedCells([]);
      expectedIndexRef.current = 0;
      trialFailedRef.current = false;
      tappedCellsRef.current = [];

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

  /** Move from demo playback into the athlete's demo turn. Safe to call twice. */
  const beginDemoTapping = useCallback(() => {
    clearTimers();
    setLitCell(-1);
    demoTapCountRef.current = 0;
    tappedCellsRef.current = [];
    setTapCount(0);
    setTappedCells([]);
    setPhase('demoTapping');
  }, [clearTimers]);

  /** Flash the cells of demo round `round`, then hand over to the athlete. Never scored, never stored. */
  const presentDemoTrial = useCallback(
    (round: number) => {
      clearTimers();
      setPhase('demoPresenting');
      setTapCount(0);
      setTappedCells([]);
      demoTapCountRef.current = 0;
      tappedCellsRef.current = [];

      const cells = PATTERN_DEMO_SEQUENCES[round] ?? [];
      let position = 0;

      const step = () => {
        setLitCell(cells[position]);
        timerRef.current = setTimeout(() => {
          setLitCell(-1);
          timerRef.current = setTimeout(() => {
            position += 1;
            if (position >= cells.length) {
              beginDemoTapping();
              return;
            }
            step();
          }, CELL_GAP_MS);
        }, CELL_ON_MS);
      };

      // Same GUARD 2 reasoning as the real trial: a demo an athlete can never escape is exactly
      // as bad as a real trial they can never escape.
      watchdogRef.current = setTimeout(() => beginDemoTapping(), watchdogDelayMs(cells.length));

      step();
    },
    [beginDemoTapping, clearTimers],
  );

  // No timer may outlive the screen.
  useEffect(() => clearTimers, [clearTimers]);

  /**
   * GUARD 1 IN ACTION. Every judgement below reads `expectedIndexRef.current`, never the
   * `tapCount` state. Do not "simplify" this to use state — see the header comment.
   *
   * GUARD 3 IN ACTION too: a cell already in `tappedCellsRef` this trial is ignored outright,
   * before anything else runs — see isRepeatTap in lib/modules/pattern.ts.
   */
  const handleTap = (cell: number) => {
    if (phase !== 'tapping') return;
    if (isRepeatTap(tappedCellsRef.current, cell)) return;

    const expectedIndex = expectedIndexRef.current;

    // Already past the end of the sequence: ignore extra taps rather than reading off the array.
    if (expectedIndex >= sequence.length) return;

    if (!isExpectedTap(sequence, expectedIndex, cell)) {
      // Wrong cell. Mark the trial failed synchronously and keep counting taps, so the athlete
      // finishes the trial normally instead of being told mid-way that they got it wrong.
      trialFailedRef.current = true;
    }

    tappedCellsRef.current = [...tappedCellsRef.current, cell]; // synchronous — GUARD 3
    setTappedCells(tappedCellsRef.current); // for rendering only

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

  /**
   * A demo tap. No correctness judgement — a demo round has no verdict to protect, so this only
   * has to count taps, synchronously, the same way GUARD 1 counts real ones. It gets the same
   * selected-cell feedback and repeat-tap guard as a real trial (GUARD 3) — the demo exists to
   * teach the real mechanic, and teaching a different one would defeat the point of practising.
   */
  const handleDemoTap = (cell: number) => {
    if (phase !== 'demoTapping') return;
    if (isRepeatTap(tappedCellsRef.current, cell)) return;

    const nextCount = demoTapCountRef.current + 1;
    if (nextCount > demoSequence.length) return; // ignore extra taps past the end
    demoTapCountRef.current = nextCount;
    tappedCellsRef.current = [...tappedCellsRef.current, cell];
    setTappedCells(tappedCellsRef.current);
    setTapCount(nextCount);

    if (nextCount >= demoSequence.length) {
      finishDemoTrial();
    }
  };

  /**
   * Finish a demo round. Never scored, never compared, nothing pushed to `battery.complete`.
   * After the second demo round this lands on 'demoDone', which is the only place the "Start the
   * real test" control exists — so a real trial can never be reached without having completed at
   * least one full demo round first.
   */
  const finishDemoTrial = () => {
    const nextRound = demoRound + 1;
    if (nextRound >= PATTERN_DEMO_SEQUENCES.length) {
      setPhase('demoDone');
      clearTimers();
      return;
    }
    setDemoRound(nextRound);
    presentDemoTrial(nextRound);
  };

  const restart = () => {
    clearTimers();
    setTrialIndex(0);
    setDemoRound(0);
    setResults([]);
    setFinalScore(null);
    setLitCell(-1);
    setTapCount(0);
    setTappedCells([]);
    expectedIndexRef.current = 0;
    trialFailedRef.current = false;
    tappedCellsRef.current = [];
    demoTapCountRef.current = 0;
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
          detail={`Two practice rounds first, then ${PATTERN_TRIALS_PER_FORM} scored rounds, getting longer.`}
          actionLabel="Start practice"
          onStart={() => presentDemoTrial(0)}
        />
      )}

      {(phase === 'presenting' ||
        phase === 'tapping' ||
        phase === 'demoPresenting' ||
        phase === 'demoTapping') && (
        <div>
          <p className="mb-4 text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            {phase === 'demoPresenting' || phase === 'demoTapping'
              ? `Practice round ${demoRound + 1} of ${PATTERN_DEMO_SEQUENCES.length}`
              : `Round ${trialIndex + 1} of ${PATTERN_TRIALS_PER_FORM}`}{' '}
            ·{' '}
            {phase === 'presenting' || phase === 'demoPresenting'
              ? 'watch'
              : `your turn — ${tapCount} of ${activeSequence.length} tapped`}
          </p>

          <div
            className="mx-auto grid max-w-md gap-3"
            style={{ gridTemplateColumns: `repeat(${PATTERN_GRID_COLUMNS}, minmax(0, 1fr))` }}
          >
            {allCells().map((cell) => {
              const lit = litCell === cell;
              const selected = tappedCells.includes(cell);
              const { row, column } = cellPosition(cell, PATTERN_GRID_COLUMNS);
              const tappable = phase === 'tapping' || phase === 'demoTapping';
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={!tappable}
                  onPointerDown={() => (phase === 'demoTapping' ? handleDemoTap(cell) : handleTap(cell))}
                  aria-label={`Row ${row}, column ${column}`}
                  aria-pressed={selected}
                  /*
                    A LIT cell is a bright neutral panel, not green. It is a target to watch and
                    then hit — it says nothing about correctness, and it must not borrow the visual
                    language of "right". See CLAUDE.md.

                    A SELECTED cell (GUARD 3, added 2026-09-22) is a distinct ink-soft fill — never
                    the lit cue's full ink, so "you tapped this" is never confused with "watch this"
                    during playback, and never green or a checkmark, so it never reads as "correct".
                  */
                  className={`aspect-square touch-none rounded-xl border-4 transition-none ${
                    lit
                      ? 'border-instrument-ink bg-instrument-ink'
                      : selected
                        ? 'border-instrument-ink-soft bg-instrument-ink-soft'
                        : 'border-instrument-ink/20 bg-instrument-panel'
                  } ${tappable ? 'cursor-pointer hover:border-instrument-ink-soft' : ''}`}
                />
              );
            })}
          </div>

          {(phase === 'tapping' || phase === 'demoTapping') && (
            <p className="mt-4 text-center text-body text-instrument-ink-soft">
              Tap {activeSequence.length} {activeSequence.length === 1 ? 'square' : 'squares'}, in order.
            </p>
          )}
        </div>
      )}

      {/* ── Demo complete — the only door into the scored rounds ──────────────────────── */}
      {phase === 'demoDone' && (
        <div className="rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-6">
          <h2 className="text-title font-bold">Practice complete</h2>
          <p className="mt-2 text-body text-instrument-ink-soft">
            That was practice — nothing was recorded. The real test works exactly the same way.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="instrument-quiet"
              onClick={() => {
                setDemoRound(0);
                presentDemoTrial(0);
              }}
            >
              Do the practice again
            </Button>
            <Button
              variant="instrument"
              onClick={() => {
                setTrialIndex(0);
                presentTrial(0);
              }}
            >
              Start the real test
            </Button>
          </div>
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
