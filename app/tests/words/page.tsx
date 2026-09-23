'use client';

// app/tests/words/page.tsx
//
// WORD LEARNING — study ten words, then immediately pick them out of a grid of twenty.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THIS IS HALF A MODULE
// ═════════════════════════════════════════════════════════════════════════════════════
// The other half is /tests/words/recall, which asks the SAME question again at the very end of
// the battery, after the two span tasks have come in between. Neither half means much alone:
//
//   • this screen says whether the words went IN,
//   • the delayed screen says whether they STAYED.
//
// A low score here and a low score there is a different finding from a good score here and a low
// score there. That is why they ship together and why nothing may be inserted after the recall
// screen — the gap between the two IS the measurement.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THE FORM IS CHOSEN THE WAY IT IS
// ═════════════════════════════════════════════════════════════════════════════════════
// The word list is picked deterministically from the sitting itself (athlete id + the moment the
// sitting started), so:
//   • both word screens in one sitting get the SAME list — the recall screen actually reads the
//     form id back out of the recorded score, so the pair can never disagree;
//   • two different sittings almost always get different lists, which matters because an athlete
//     who saw the same ten words at baseline would partly be remembering the baseline, and that
//     practice effect inflates the later score — making a struggling athlete look unchanged.
//
// Known limitation, logged rather than hidden: this makes a repeat form unlikely, not impossible
// (roughly one sitting in six). Guaranteeing alternation needs a per-athlete sitting counter that
// nothing currently persists. lib/forms/index.ts already has pickFormBySitting() ready for it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, InstrumentHeader, InstrumentShell, ModuleIntro } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { WORD_FORMS, WORDS_PER_FORM, pickForm } from '@/lib/forms';
import {
  MAX_WORD_CORRECT,
  WORD_EXPOSURE_MS,
  WORD_GAP_MS,
  buildGrid,
  scoreSelections,
} from '@/lib/modules/words';

type Phase = 'instructions' | 'studying' | 'choosing' | 'done';

export default function WordLearningPage() {
  const battery = useBatteryStep('wordLearning');

  const [phase, setPhase] = useState<Phase>('instructions');
  /** Which word of the study list is on screen, or -1 during a gap between words. */
  const [studyIndex, setStudyIndex] = useState(-1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [finalScore, setFinalScore] = useState<ReturnType<typeof scoreSelections> | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    The form and the grid are computed ONCE per sitting and then frozen.

    useMemo keyed on the sitting is doing real work here, not micro-optimisation: buildGrid
    shuffles, so recomputing it on any re-render would reshuffle the tiles under the athlete's
    finger mid-selection. A tile they had already ticked would jump somewhere else.
  */
  const seed = battery.session
    ? `${battery.session.athleteId}:${battery.session.startedAt}`
    : 'practice';
  const form = useMemo(() => pickForm(WORD_FORMS, seed), [seed]);
  const grid = useMemo(() => buildGrid(form), [form]);

  /** Walk the study list one word at a time, then move to the grid. */
  const runStudy = useCallback(() => {
    setPhase('studying');
    setStudyIndex(0);

    let index = 0;
    const advance = () => {
      // Blank beat, so two words never blur together.
      setStudyIndex(-1);
      timerRef.current = setTimeout(() => {
        index += 1;
        if (index >= WORDS_PER_FORM) {
          setPhase('choosing');
          return;
        }
        setStudyIndex(index);
        timerRef.current = setTimeout(advance, WORD_EXPOSURE_MS);
      }, WORD_GAP_MS);
    };

    timerRef.current = setTimeout(advance, WORD_EXPOSURE_MS);
  }, []);

  // No timer may outlive the screen, or it would fire setState on an unmounted component and,
  // worse, advance a study phase nobody is looking at any more.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const toggle = (word: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  const submit = () => {
    const score = scoreSelections(form, selected);
    setFinalScore(score);
    setPhase('done');
    void battery.complete(score);
  };

  const restart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSelected(new Set());
    setFinalScore(null);
    setStudyIndex(-1);
    setPhase('instructions');
    battery.resetPractice();
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.practice && <PracticeBanner />}

      <InstrumentHeader
        title="Word learning"
        step={battery.loaded ? battery.stepLabel : undefined}
        instruction={`Remember ${WORDS_PER_FORM} words. You will be asked about them twice.`}
      >
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      {/* ── One instruction screen, covering both halves of the module ──────────────── */}
      {phase === 'instructions' && (
        <ModuleIntro
          heading="Read each word and hold on to it"
          detail={`${WORDS_PER_FORM} words, one at a time. You cannot go back.`}
          onStart={runStudy}
        />
      )}

      {/* ── Study phase ─────────────────────────────────────────────────────────────── */}
      {phase === 'studying' && (
        <div
          className="flex min-h-64 flex-col items-center justify-center rounded-2xl border-4 border-instrument-ink/20 bg-instrument-panel p-6 text-center sm:min-h-96"
          aria-live="polite"
        >
          {studyIndex >= 0 ? (
            <span className="text-stimulus font-black tracking-tight sm:text-stimulus">
              {form.targets[studyIndex]}
            </span>
          ) : (
            // The blank beat. Rendered as an empty box of the same size so the layout does not
            // jump every time a word leaves the screen.
            <span className="sr-only">next word coming</span>
          )}
          <span className="mt-8 text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Word {Math.max(1, studyIndex + 1)} of {WORDS_PER_FORM}
          </span>
        </div>
      )}

      {/* ── Recognition grid ────────────────────────────────────────────────────────── */}
      {phase === 'choosing' && (
        <div>
          <p className="mb-4 text-body text-instrument-ink-soft sm:text-title">
            Tap every word you were just shown. Tap again to un-pick. There is no time limit.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {grid.map((tile) => {
              const picked = selected.has(tile.word);
              return (
                <button
                  key={tile.word}
                  type="button"
                  onClick={() => toggle(tile.word)}
                  aria-pressed={picked}
                  /*
                    A picked tile is marked with a heavy white border and bold text — never a
                    green fill and never a tick. See CLAUDE.md: no green, no checkmarks anywhere
                    in this app. "Picked" here is a selection state, and it still must not borrow
                    the visual language of "correct".
                  */
                  className={`min-h-16 rounded-xl border-2 px-3 py-4 text-title font-bold transition-colors ${
                    picked
                      ? 'border-instrument-ink bg-instrument-ink text-instrument'
                      : 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink hover:border-instrument-ink-soft'
                  }`}
                >
                  {tile.word}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="instrument" onClick={submit} disabled={battery.saving}>
              {/* Never "Saving…" in a practice run — nothing is being saved. */}
              {battery.saving ? (battery.practice ? 'Continuing…' : 'Saving…') : 'Done picking'}
            </Button>
            <p className="text-meta text-instrument-ink-soft">
              {selected.size} {selected.size === 1 ? 'word' : 'words'} picked
            </p>
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
            The raw counts, stated flatly with no verdict attached. There is deliberately no
            "good"/"fine" framing and no comparison here: this screen has no idea what this
            athlete's baseline is, and even the engine has no tested cut-off for this measurement
            yet. See lib/engine/thresholds.ts.
          */}
          <p className="tabular mt-2 text-display font-black sm:text-stimulus">
            {finalScore.correct} out of {MAX_WORD_CORRECT}
          </p>
          <p className="mt-3 text-body text-instrument-ink-soft">
            {finalScore.hits} of the {WORDS_PER_FORM} shown words picked, and{' '}
            {finalScore.falseAlarms}{' '}
            {finalScore.falseAlarms === 1 ? 'word' : 'words'} picked that were not shown. This is a
            record of what happened, not a judgement about it.
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
