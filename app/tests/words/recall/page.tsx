'use client';

// app/tests/words/recall/page.tsx
//
// WORD RECALL — the delayed half of the word module. Same twenty words, asked again at the end.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A SEPARATE SCREEN AND WHY IT IS LAST
// ═════════════════════════════════════════════════════════════════════════════════════
// /tests/words asks which words the athlete saw, seconds after showing them. This screen asks the
// identical question at the very END of the battery, with the two span tasks in between. The gap
// is the entire point: without it, this would be a second look at the same screen rather than a
// test of what survived.
//
// So nothing may be appended to BATTERY_STEPS after `wordRecognition`, and the span tasks must
// stay between the pair. See lib/session.ts.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE FORM IS READ BACK, NOT RE-CHOSEN
// ═════════════════════════════════════════════════════════════════════════════════════
// This screen takes the form id out of the wordLearning score already recorded in the sitting,
// rather than re-deriving it. Re-deriving would work right up until the derivation changed, and
// then this screen would quietly test a DIFFERENT ten words than the athlete studied — every
// target would be a false alarm and the athlete would score near zero for no reason connected to
// their head. Reading the recorded id makes that impossible.
//
// If the id is missing or names a form the pool no longer has, this screen refuses rather than
// substituting a form. A score against the wrong word list is worse than no score.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, InstrumentHeader, InstrumentShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { WORD_FORMS, WORDS_PER_FORM, findFormById, pickForm } from '@/lib/forms';
import { MAX_WORD_CORRECT, buildGrid, scoreSelections } from '@/lib/modules/words';

export default function WordRecallPage() {
  const battery = useBatteryStep('wordRecognition');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [finalScore, setFinalScore] = useState<ReturnType<typeof scoreSelections> | null>(null);

  /*
    Which form did the study screen actually use?

    In a real sitting: whatever id the wordLearning score recorded. In practice mode there is no
    sitting and no recorded score, so we fall back to the same deterministic pick the study screen
    would have made, which keeps the practice run coherent on its own.
  */
  const recordedFormId = battery.session?.scores.wordLearning?.formId ?? null;
  const form = useMemo(() => {
    if (recordedFormId) return findFormById(WORD_FORMS, recordedFormId);
    if (battery.session) return null; // a real sitting that never recorded the study half
    return pickForm(WORD_FORMS, 'practice');
  }, [recordedFormId, battery.session]);

  const grid = useMemo(() => (form ? buildGrid(form) : []), [form]);

  const toggle = (word: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  const submit = () => {
    if (!form) return;
    const score = scoreSelections(form, selected);
    setFinalScore(score);
    void battery.complete(score);
  };

  /* ── The refusal: we do not know which words were studied ─────────────────────────── */
  if (battery.loaded && !form) {
    return (
      <InstrumentShell>
        <InstrumentHeader title="Word recall">
          <SittingLabel session={battery.session} />
        </InstrumentHeader>

        {/*
          A refusal, not a flag. This is a solid reversed panel rather than a red-bordered one:
          red in this app means "this screening found a change worth looking at" and belongs to
          the results screen alone. A refusal is different news, and borrowing the accent for it
          would blunt the accent on the one screen where it has to land hardest.
        */}
        <div role="alert" className="rounded-xl bg-instrument-ink p-4 text-instrument sm:p-6">
          <p className="text-display font-black">This part cannot be run</p>
          <p className="mt-3 text-body">
            {recordedFormId
              ? 'The word list used earlier in this sitting is not one this version of the app has any more, so there is no way to ask about the right words.'
              : 'The first word screen was not completed in this sitting, so there is nothing to ask about yet.'}
          </p>
          <p className="mt-3 text-body font-bold">
            Rather than test a different set of words and record a score that means nothing, this
            screen is stopping. Nothing has been saved for this part.
          </p>
          <div className="mt-6">
            <Link
              href="/athletes"
              className="inline-flex min-h-14 items-center font-bold underline underline-offset-4"
            >
              Back to athletes
            </Link>
          </div>
        </div>
      </InstrumentShell>
    );
  }

  return (
    <InstrumentShell>
      {battery.loaded && battery.practice && <PracticeBanner />}

      <InstrumentHeader
        title="Word recall"
        step={battery.loaded ? battery.stepLabel : undefined}
        instruction="Tap every word you were shown at the very start — tap again to un-pick."
      >
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      {!finalScore && form && (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {grid.map((tile) => {
              const picked = selected.has(tile.word);
              return (
                <button
                  key={tile.word}
                  type="button"
                  onClick={() => toggle(tile.word)}
                  aria-pressed={picked}
                  // Heavy border for "picked" — never a green fill, never a tick. See CLAUDE.md.
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
              {battery.saving ? 'Saving…' : 'Finish'}
            </Button>
            <p className="text-meta text-instrument-ink-soft">
              {selected.size} {selected.size === 1 ? 'word' : 'words'} picked
            </p>
          </div>
        </div>
      )}

      {finalScore && (
        <div className="rounded-2xl border border-instrument-ink/20 bg-instrument-panel p-6">
          <h2 className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Recorded
          </h2>
          <p className="tabular mt-2 text-display font-black sm:text-stimulus">
            {finalScore.correct} out of {MAX_WORD_CORRECT}
          </p>
          <p className="mt-3 text-body text-instrument-ink-soft">
            {finalScore.hits} of the {WORDS_PER_FORM} shown words picked, and{' '}
            {finalScore.falseAlarms}{' '}
            {finalScore.falseAlarms === 1 ? 'word' : 'words'} picked that were not shown. This is a
            record of what happened, not a judgement about it.
          </p>
        </div>
      )}

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}
    </InstrumentShell>
  );
}
