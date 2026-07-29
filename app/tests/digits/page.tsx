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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { DIGIT_FORMS, DIGIT_TRIALS_PER_FORM, pickForm } from '@/lib/forms';
import {
  DIGIT_EXPOSURE_MS,
  DIGIT_GAP_MS,
  MAX_DIGIT_CORRECT,
  isTrialCorrect,
  scoreSpanTrials,
} from '@/lib/modules/digits';

type Phase = 'instructions' | 'presenting' | 'entering' | 'done';

const KEYPAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function DigitSpanPage() {
  const battery = useBatteryStep('digitSpan');

  const [phase, setPhase] = useState<Phase>('instructions');
  const [trialIndex, setTrialIndex] = useState(0);
  /** Which digit of the current sequence is on screen, or -1 during a gap. */
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

  /** Play the digits of trial `index` one at a time, then hand over to the keypad. */
  const presentTrial = useCallback(
    (index: number) => {
      setPhase('presenting');
      setEntered([]);
      setShownDigit(0);

      const digits = form.sequences[index] ?? [];
      let position = 0;

      const advance = () => {
        setShownDigit(-1); // blank beat
        timerRef.current = setTimeout(() => {
          position += 1;
          if (position >= digits.length) {
            setPhase('entering');
            return;
          }
          setShownDigit(position);
          timerRef.current = setTimeout(advance, DIGIT_EXPOSURE_MS);
        }, DIGIT_GAP_MS);
      };

      timerRef.current = setTimeout(advance, DIGIT_EXPOSURE_MS);
    },
    [form],
  );

  // No timer may outlive the screen, and none may survive into the next trial.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const press = (digit: number) => {
    // Cap at the sequence length so an over-long answer cannot be typed. The cap is a kindness,
    // not the scoring rule — a wrong-length answer would fail anyway.
    setEntered((previous) => (previous.length >= sequence.length ? previous : [...previous, digit]));
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

  const restart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTrialIndex(0);
    setEntered([]);
    setResults([]);
    setFinalScore(null);
    setShownDigit(-1);
    setPhase('instructions');
    battery.resetPractice();
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.mode === 'practice' && <PracticeBanner />}

      <InstrumentHeader title="Numbers backwards" step={battery.loaded ? battery.stepLabel : ''}>
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      {/* ── Instructions ────────────────────────────────────────────────────────────── */}
      {phase === 'instructions' && (
        <div className="rounded-2xl border border-instrument-line bg-instrument-panel p-6 sm:p-8">
          <h2 className="text-xl font-bold sm:text-2xl">Type the numbers backwards</h2>
          <div className="mt-4 space-y-3 text-base leading-relaxed text-instrument-ink-soft sm:text-lg">
            <p>
              Numbers will flash up one at a time. When they stop, type them back in{' '}
              <strong className="text-instrument-ink">reverse order</strong> — last one first.
            </p>
            <p>
              So if you see <span className="tabular font-bold">4 — 1 — 7</span>, you would type{' '}
              <span className="tabular font-bold">7 1 4</span>.
            </p>
            <p>
              There are {DIGIT_TRIALS_PER_FORM} rounds and they get longer. You will not be told
              whether each one was right — just do your best and carry on.
            </p>
          </div>
          <Button className="mt-6 w-full sm:w-auto" onClick={() => presentTrial(0)}>
            Start
          </Button>
        </div>
      )}

      {/* ── Presenting the sequence ─────────────────────────────────────────────────── */}
      {phase === 'presenting' && (
        <div
          className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border-4 border-instrument-line bg-instrument-panel p-6 text-center sm:min-h-[22rem]"
          aria-live="off"
        >
          {shownDigit >= 0 ? (
            <span className="tabular text-7xl font-black sm:text-9xl">{sequence[shownDigit]}</span>
          ) : (
            <span className="sr-only">next number coming</span>
          )}
          <span className="mt-8 text-sm font-bold uppercase tracking-widest text-instrument-ink-soft">
            Round {trialIndex + 1} of {DIGIT_TRIALS_PER_FORM} · watch
          </span>
        </div>
      )}

      {/* ── Keypad entry ────────────────────────────────────────────────────────────── */}
      {phase === 'entering' && (
        <div>
          <div className="rounded-2xl border border-instrument-line bg-instrument-panel p-5">
            <p className="text-sm font-bold uppercase tracking-widest text-instrument-ink-soft">
              Round {trialIndex + 1} of {DIGIT_TRIALS_PER_FORM} · type them backwards
            </p>

            {/* The answer so far, with a slot per expected digit so the length is obvious. */}
            <div className="mt-4 flex flex-wrap gap-2" aria-live="polite">
              {Array.from({ length: sequence.length }, (_, index) => (
                <span
                  key={index}
                  className="tabular flex h-16 w-12 items-center justify-center rounded-lg border-2 border-instrument-line text-3xl font-black sm:h-20 sm:w-16 sm:text-4xl"
                >
                  {entered[index] ?? ''}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {KEYPAD.map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="tabular min-h-20 rounded-xl border-2 border-instrument-line bg-instrument-panel text-3xl font-black text-instrument-ink hover:border-instrument-ink-soft"
              >
                {digit}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button variant="instrument" onClick={backspace} disabled={entered.length === 0}>
              Undo last
            </Button>
            <Button onClick={submitTrial} disabled={entered.length !== sequence.length || battery.saving}>
              {trialIndex + 1 >= DIGIT_TRIALS_PER_FORM ? 'Finish' : 'Next round'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Finished ────────────────────────────────────────────────────────────────── */}
      {phase === 'done' && finalScore && (
        <div className="rounded-2xl border border-instrument-line bg-instrument-panel p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-instrument-ink-soft">
            Recorded
          </h2>
          {/*
            Flat statement of the count, no verdict. This screen has no idea what this athlete's
            baseline is, and the engine has no tested cut-off for this measurement yet either.
          */}
          <p className="tabular mt-2 text-4xl font-black sm:text-5xl">
            {finalScore.correct} out of {MAX_DIGIT_CORRECT}
          </p>
          <p className="mt-3 text-base leading-relaxed text-instrument-ink-soft">
            Rounds reproduced exactly. This is a record of what happened, not a judgement about it.
          </p>

          {battery.mode === 'practice' && (
            <Button variant="instrument" className="mt-6" onClick={restart}>
              Run practice again
            </Button>
          )}
        </div>
      )}

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}
    </InstrumentShell>
  );
}
