'use client';

// app/tests/digits/page.tsx
//
// DIGIT SPAN BACKWARD — watch a sequence of digits, then type it back in reverse.
//
// Nine fixed trials at lengths 3,3,4,4,5,5,6,6,7. Score is how many were reproduced exactly, out
// of nine. No partial credit within a trial — see lib/modules/digits.ts for why.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// NO PER-TRIAL RIGHT/WRONG FEEDBACK, DELIBERATELY
// ═════════════════════════════════════════════════════════════════════════════════════
// The screen never tells the athlete whether a trial was correct. Two reasons, and the first one
// is the important one:
//
//   1. Per-trial feedback would need a "correct" affordance, and the only conventional ones are a
//      green flash or a tick. This app does not have those anywhere, and inventing them here —
//      even for a single digit sequence — is exactly how a "no green, no checkmarks" rule erodes.
//      See CLAUDE.md.
//   2. An athlete who knows they have failed three in a row starts guessing or gives up, and the
//      remaining trials stop measuring anything. Silence keeps every trial comparable.
//
// The trials simply advance. The total is shown once, at the end, with no verdict attached.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// TWO UNSCORED DEMO ROUNDS BEFORE THE NINE REAL ONES (added 2026-09-20)
// ═════════════════════════════════════════════════════════════════════════════════════
// The instructions screen's Start button now leads into the demo, not trial 1 — so an athlete
// cannot reach a scored round without completing at least one demo round first. The demo plays
// exactly like a real trial (same watch-then-type mechanics, same lack of right/wrong feedback)
// but draws its two sequences from DIGIT_DEMO_SEQUENCES, a separate fixed pool that never
// overlaps with a scored form and never changes sitting to sitting — so baseline and check see
// an identical demo, and nothing about it is saved or scored. See lib/forms/digitSequences.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell, ModuleIntro } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { DIGIT_DEMO_SEQUENCES, DIGIT_FORMS, DIGIT_TRIALS_PER_FORM, pickForm } from '@/lib/forms';
import {
  DIGIT_EXPOSURE_MS,
  DIGIT_GAP_MS,
  MAX_DIGIT_CORRECT,
  isTrialCorrect,
  scoreSpanTrials,
} from '@/lib/modules/digits';

type Phase =
  | 'instructions'
  | 'demoPresenting'
  | 'demoEntering'
  | 'demoDone'
  | 'presenting'
  | 'entering'
  | 'done';

const KEYPAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function DigitSpanPage() {
  const battery = useBatteryStep('digitSpan');

  const [phase, setPhase] = useState<Phase>('instructions');
  const [trialIndex, setTrialIndex] = useState(0);
  /** Which demo round (0 or 1) is playing or being entered. */
  const [demoRound, setDemoRound] = useState(0);
  /** Which digit of the current sequence is on screen, or -1 during a gap. Shared by demo and real trials — they never run at the same time. */
  const [shownDigit, setShownDigit] = useState(-1);
  const [entered, setEntered] = useState<number[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [finalScore, setFinalScore] = useState<ReturnType<typeof scoreSpanTrials> | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One form per sitting, frozen. Same seeding as the word module — see the note there about the
  // known limitation (a repeat form is unlikely, not impossible, without a sitting counter).
  const seed = battery.session
    ? `${battery.session.athleteId}:${battery.session.startedAt}`
    : 'practice';
  const form = useMemo(() => pickForm(DIGIT_FORMS, seed), [seed]);

  const sequence = form.sequences[trialIndex] ?? [];
  const demoSequence = DIGIT_DEMO_SEQUENCES[demoRound] ?? [];
  /** Whichever sequence is actually on screen right now, real or demo. */
  const activeSequence = phase === 'demoPresenting' || phase === 'demoEntering' ? demoSequence : sequence;

  /** Play a sequence of digits one at a time, then run `onFinished`. Shared by demo and real trials so the two can never drift apart. */
  const playDigits = useCallback((digits: readonly number[], onFinished: () => void) => {
    setEntered([]);
    setShownDigit(0);

    let position = 0;
    const advance = () => {
      setShownDigit(-1); // blank beat
      timerRef.current = setTimeout(() => {
        position += 1;
        if (position >= digits.length) {
          onFinished();
          return;
        }
        setShownDigit(position);
        timerRef.current = setTimeout(advance, DIGIT_EXPOSURE_MS);
      }, DIGIT_GAP_MS);
    };

    timerRef.current = setTimeout(advance, DIGIT_EXPOSURE_MS);
  }, []);

  /** Play the digits of real trial `index`, then hand over to the keypad. */
  const presentTrial = useCallback(
    (index: number) => {
      setPhase('presenting');
      playDigits(form.sequences[index] ?? [], () => setPhase('entering'));
    },
    [form, playDigits],
  );

  /** Play demo round `round`, then hand over to the keypad. Never scored, never stored. */
  const presentDemo = useCallback(
    (round: number) => {
      setPhase('demoPresenting');
      playDigits(DIGIT_DEMO_SEQUENCES[round] ?? [], () => setPhase('demoEntering'));
    },
    [playDigits],
  );

  // No timer may outlive the screen, and none may survive into the next trial.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const press = (digit: number) => {
    // Cap at the active sequence's length so an over-long answer cannot be typed. The cap is a
    // kindness, not the scoring rule — a wrong-length answer would fail anyway.
    setEntered((previous) =>
      previous.length >= activeSequence.length ? previous : [...previous, digit],
    );
  };

  const backspace = () => setEntered((previous) => previous.slice(0, -1));

  const submitTrial = () => {
    const correct = isTrialCorrect(sequence, entered);
    const nextResults = [...results, correct];
    setResults(nextResults);

    const nextIndex = trialIndex + 1;
    if (nextIndex >= DIGIT_TRIALS_PER_FORM) {
      const score = scoreSpanTrials(form.id, nextResults);
      setFinalScore(score);
      setPhase('done');
      void battery.complete(score);
      return;
    }

    setTrialIndex(nextIndex);
    presentTrial(nextIndex);
  };

  /**
   * Submit a demo round. Never scored, never compared, nothing pushed to `battery.complete`.
   * After the second demo round this lands on 'demoDone', which is the only place the "Start the
   * real test" control exists — so a real trial can never be reached without having completed at
   * least one full demo round first.
   */
  const submitDemo = () => {
    const nextRound = demoRound + 1;
    if (nextRound >= DIGIT_DEMO_SEQUENCES.length) {
      setPhase('demoDone');
      return;
    }
    setDemoRound(nextRound);
    presentDemo(nextRound);
  };

  const restart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTrialIndex(0);
    setDemoRound(0);
    setEntered([]);
    setResults([]);
    setFinalScore(null);
    setShownDigit(-1);
    setPhase('instructions');
    battery.resetPractice();
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.practice && <PracticeBanner />}

      <InstrumentHeader
        title="Numbers backwards"
        step={battery.loaded ? battery.stepLabel : undefined}
        instruction="Watch the numbers, then type them back in reverse order. Last one first."
      >
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      {/* ── Instructions ────────────────────────────────────────────────────────────── */}
      {phase === 'instructions' && (
        <ModuleIntro
          heading="See 4, 1, 7. Type 7, 1, 4"
          detail={`Two practice rounds first, then ${DIGIT_TRIALS_PER_FORM} scored rounds, getting longer.`}
          actionLabel="Start practice"
          onStart={() => presentDemo(0)}
        />
      )}

      {/* ── Presenting the sequence, real or demo ─────────────────────────────────────── */}
      {(phase === 'presenting' || phase === 'demoPresenting') && (
        <div
          className="flex min-h-64 flex-col items-center justify-center rounded-2xl border-4 border-instrument-ink/20 bg-instrument-panel p-6 text-center sm:min-h-96"
          aria-live="off"
        >
          {shownDigit >= 0 ? (
            <span className="tabular text-stimulus font-black">{activeSequence[shownDigit]}</span>
          ) : (
            <span className="sr-only">next number coming</span>
          )}
          <span className="mt-8 text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            {phase === 'demoPresenting'
              ? `Practice round ${demoRound + 1} of ${DIGIT_DEMO_SEQUENCES.length} · watch`
              : `Round ${trialIndex + 1} of ${DIGIT_TRIALS_PER_FORM} · watch`}
          </span>
        </div>
      )}

      {/* ── Keypad entry, real or demo ─────────────────────────────────────────────────── */}
      {(phase === 'entering' || phase === 'demoEntering') && (
        <div>
          <div className="rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-4">
            <p className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
              {phase === 'demoEntering'
                ? `Practice round ${demoRound + 1} of ${DIGIT_DEMO_SEQUENCES.length} · type it backwards`
                : `Round ${trialIndex + 1} of ${DIGIT_TRIALS_PER_FORM} · type them backwards`}
            </p>

            {/*
              The answer so far, with a slot per expected digit so the length is obvious.

              FIXED 2026-09-22: at 375px width the longest sequences (6 and 7 digits) wrapped to
              a second line, because seven of the old w-12 (48px) slots plus their gaps ran to
              384px against roughly 311px actually available (InstrumentShell's px-4 plus this
              panel's p-4, each side, subtracted from the viewport). An athlete who sees the
              layout visibly break mid-sequence second-guesses whether the app glitched, which
              has nothing to do with their memory. w-8 (32px) keeps even the 7-digit case at
              about 272px, comfortably on one line with room to spare — still a fingertip-legible
              slot for a single tabular digit, just narrower than before. `flex-nowrap` makes the
              one-line guarantee explicit rather than an accident of the arithmetic holding.
              `sm:w-16` is unchanged — this was never a bug above the mobile breakpoint.
            */}
            <div className="mt-4 flex flex-nowrap gap-2" aria-live="polite">
              {Array.from({ length: activeSequence.length }, (_, index) => (
                <span
                  key={index}
                  className="tabular flex h-16 w-8 shrink-0 items-center justify-center rounded-xl border-2 border-instrument-ink/20 text-display font-black sm:w-16"
                >
                  {entered[index] ?? ''}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {KEYPAD.map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="tabular min-h-16 rounded-xl border-2 border-instrument-ink/20 bg-instrument-panel text-display font-black text-instrument-ink hover:border-instrument-ink-soft"
              >
                {digit}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button variant="instrument-quiet" onClick={backspace} disabled={entered.length === 0}>
              Undo last
            </Button>
            {phase === 'demoEntering' ? (
              <Button
                variant="instrument"
                onClick={submitDemo}
                disabled={entered.length !== activeSequence.length}
              >
                {demoRound + 1 >= DIGIT_DEMO_SEQUENCES.length ? 'Finish practice' : 'Next practice round'}
              </Button>
            ) : (
              <Button
                variant="instrument"
                onClick={submitTrial}
                disabled={entered.length !== sequence.length || battery.saving}
              >
                {trialIndex + 1 >= DIGIT_TRIALS_PER_FORM ? 'Finish' : 'Next round'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Demo complete — the only door into the scored rounds ──────────────────────── */}
      {phase === 'demoDone' && (
        <div className="rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-6">
          <h2 className="text-title font-bold">Practice complete</h2>
          <p className="mt-2 text-body text-instrument-ink-soft">
            That was practice. Nothing was recorded. The real test works exactly the same way.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              variant="instrument-quiet"
              onClick={() => {
                setDemoRound(0);
                presentDemo(0);
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

      {/* ── Finished ────────────────────────────────────────────────────────────────── */}
      {phase === 'done' && finalScore && (
        <div className="rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-6">
          <h2 className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Recorded
          </h2>
          {/*
            Flat statement of the count, no verdict. This screen has no idea what this athlete's
            baseline is, and the engine has no tested cut-off for this measurement yet either.
          */}
          <p className="tabular mt-2 text-display font-black sm:text-stimulus">
            {finalScore.correct} out of {MAX_DIGIT_CORRECT}
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
