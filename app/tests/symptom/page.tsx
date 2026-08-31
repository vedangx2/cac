'use client';

// app/tests/symptom/page.tsx
//
// SYMPTOM CHECKLIST — ten common symptoms, each rated 0-3, totalled out of 30.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THIS SCREEN USED TO BE LIGHT. IT IS NOW DARK, LIKE THE OTHER FIVE.
// ═════════════════════════════════════════════════════════════════════════════════════
// The old reasoning was that this is a questionnaire rather than a stimulus, so it belonged on
// the document surface. That was defensible in isolation and wrong in sequence: it made the
// battery flash white for one screen out of six, in the middle of a run, on a phone whose
// brightness is already turned up for daylight. The rule is not "text goes on light" — it is
// "screens you READ are a document, screens you PERFORM are instruments." You perform this one:
// it is scored, it is timed by nothing but your patience, and it sits between five dark screens.
//
// Two deliberate choices worth keeping:
//
// 1. Every item starts at "None" (0) rather than blank.
//    Someone filling this in has possibly just taken a hit to the head, and forcing ten required
//    selections before they can continue is the wrong trade. Starting at zero means they only
//    have to touch the things that are actually bothering them. The cost is that we cannot tell
//    "they said none" from "they skipped it" — acceptable, because a missed symptom shows up as
//    a smaller change, never as a false alarm.
//
// 2. The copy is flat and clinical. No reassurance, no alarm — just the symptom and a severity.

import { useState } from 'react';
import { Button, InstrumentHeader, InstrumentPanel, InstrumentShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { MAX_SYMPTOM_TOTAL, SYMPTOM_ITEMS, SYMPTOM_SCALE } from '@/lib/symptoms';

export default function SymptomTestPage() {
  const battery = useBatteryStep('symptom');

  // One score per symptom, all starting at 0. See note 1 above.
  const [scores, setScores] = useState<number[]>(() => SYMPTOM_ITEMS.map(() => 0));

  const total = scores.reduce((sum, value) => sum + value, 0);

  const setScore = (index: number, value: number) => {
    setScores((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
  };

  const handleContinue = () => {
    void battery.complete({ itemScores: scores, total });
  };

  return (
    <InstrumentShell>
      {battery.loaded && battery.practice && <PracticeBanner />}

      {/* ONE line of instruction. Not a paragraph — see InstrumentHeader. */}
      <InstrumentHeader
        title="Symptoms"
        step={battery.loaded ? battery.stepLabel : undefined}
        instruction="Rate each one as it feels right now — an honest rating is what makes the comparison work."
      >
        <SittingLabel session={battery.session} />
      </InstrumentHeader>

      {/*
        Running total, stuck to the top of the viewport so it stays visible while scrolling.
        A solid background means it never overlaps the rows underneath it.
      */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 bg-instrument px-4 py-3 sm:-mx-8 sm:px-8">
        <div className="flex items-baseline justify-between">
          <span className="text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
            Total
          </span>
          <span className="tabular text-display font-black" aria-live="polite">
            {total}
            <span className="text-body font-bold text-instrument-ink-soft">
              {' '}
              / {MAX_SYMPTOM_TOTAL}
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {SYMPTOM_ITEMS.map((symptom, index) => (
          <InstrumentPanel key={symptom}>
            {/*
              Each row is a radio group. Real radios (visually restyled) rather than buttons
              means arrow keys move between options and a screen reader announces "3 of 4"
              automatically — behaviour we would otherwise rebuild by hand and get wrong.

              The <legend> is visually hidden and a plain <p> carries the visible text. A legend
              is rendered specially by browsers and does not behave predictably as a flex child,
              so this keeps the accessible name correct AND the layout reliable.
            */}
            <fieldset>
              <legend className="sr-only">{symptom}</legend>
              <p aria-hidden="true" className="mb-3 text-title font-bold">
                {symptom}
              </p>

              <div className="flex gap-2">
                {SYMPTOM_SCALE.map((step) => {
                  const selected = scores[index] === step.value;
                  return (
                    <label
                      key={step.value}
                      /*
                        min-h-14 is 56px — the tap-target floor for anything in a test module.
                        A mis-hit here is recorded as a symptom the athlete does not have.

                        A selected chip is near-white on near-black: the strongest contrast the
                        palette has, and deliberately not a colour. There is no accent available
                        for "chosen" — red means flagged and nothing else.
                      */
                      className={`flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition-colors ${
                        selected
                          ? 'border-instrument-ink bg-instrument-ink text-instrument'
                          : 'border-instrument-ink/20 bg-instrument-panel text-instrument-ink-soft hover:border-instrument-ink-soft'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`symptom-${index}`}
                        value={step.value}
                        checked={selected}
                        onChange={() => setScore(index, step.value)}
                        // sr-only keeps the native input available to keyboards and screen
                        // readers while we style the label around it.
                        className="sr-only"
                      />
                      <span className="tabular text-title font-black leading-none">
                        {step.value}
                      </span>
                      <span className="mt-1 text-meta font-bold uppercase leading-none">
                        {step.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </InstrumentPanel>
        ))}
      </div>

      {battery.saveError && <SaveErrorNotice message={battery.saveError} />}

      <div className="mt-8 flex flex-col gap-3">
        {battery.mode === 'battery' ? (
          <Button variant="instrument" onClick={handleContinue} disabled={battery.saving}>
            {battery.saving ? 'Saving…' : 'Save and continue'}
          </Button>
        ) : (
          <Button variant="instrument" onClick={handleContinue} disabled={battery.practiceDone}>
            {battery.practiceDone
              ? `Practice total: ${total} / ${MAX_SYMPTOM_TOTAL}`
              : 'Finish practice run'}
          </Button>
        )}
        <Button
          variant="instrument-quiet"
          onClick={() => setScores(SYMPTOM_ITEMS.map(() => 0))}
        >
          Reset all to none
        </Button>
      </div>
    </InstrumentShell>
  );
}
