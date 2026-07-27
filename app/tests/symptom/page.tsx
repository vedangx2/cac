'use client';

// app/tests/symptom/page.tsx
//
// SYMPTOM CHECKLIST — ten common symptoms, each rated 0-3, totalled out of 30.
//
// Two deliberate choices worth explaining:
//
// 1. This screen is LIGHT, while the reaction and scan screens are dark.
//    That is the design system doing its job rather than an inconsistency. The rule is "the
//    app is a document, the tests are instruments." The reaction pad and number grid are
//    instruments: dark surrounds isolate a stimulus. This screen is a questionnaire — ten
//    lines of text to read and answer — and dark text on a light surface is the easier thing
//    to read outdoors on a phone in daylight.
//
// 2. Every item starts at "None" (0) rather than blank.
//    Someone filling this in has possibly just taken a hit to the head, and forcing ten
//    required selections before they can continue is the wrong trade. Starting at zero means
//    they only have to touch the things that are actually bothering them. The trade-off is
//    that we cannot tell "they said none" apart from "they skipped it" — acceptable here,
//    because a missed symptom shows up as a smaller change, never as a false alarm.
//
// The copy is intentionally flat and clinical. No reassurance, no alarm — just the symptom
// and a severity.

import { useState } from 'react';
import { Button, Card, PageHeader, PageShell } from '@/components/ui';
import { PracticeBanner, SaveErrorNotice, SittingLabel, useBatteryStep } from '@/components/battery';
import { MAX_SYMPTOM_TOTAL, SYMPTOM_ITEMS, SYMPTOM_SCALE } from '@/lib/symptoms';

export default function SymptomTestPage() {
  const battery = useBatteryStep('symptom');

  // One score per symptom, all starting at 0. See note 2 above.
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
    <PageShell>
      {battery.loaded && battery.mode === 'practice' && <PracticeBanner tone="light" />}

      <PageHeader
        title="Symptom checklist"
        subtitle="Rate each item as it feels right now. There are no right answers — an honest rating is what makes the comparison useful."
      />

      {battery.loaded && (
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">
            {battery.stepLabel}
          </p>
          <SittingLabel session={battery.session} tone="light" />
        </div>
      )}

      {/*
        Running total, stuck to the top of the viewport so it stays visible while scrolling.
        `top-0` plus a solid background means it never overlaps the rows underneath it.
      */}
      <div className="sticky top-0 z-10 -mx-5 mb-6 border-y border-line bg-surface px-5 py-3 sm:-mx-8 sm:px-8">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-bold text-ink sm:text-lg">Total</span>
          <span className="tabular text-2xl font-black text-ink sm:text-3xl" aria-live="polite">
            {total}
            <span className="text-base font-bold text-ink-soft"> / {MAX_SYMPTOM_TOTAL}</span>
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {SYMPTOM_ITEMS.map((symptom, index) => (
          <Card key={symptom}>
            {/*
              Each row is a radio group. Using real radios (visually restyled) rather than
              buttons means arrow keys move between options and a screen reader announces
              "3 of 4" automatically — behaviour we'd otherwise have to rebuild by hand.

              The <legend> is visually hidden and a plain <p> carries the visible text. A
              legend is rendered specially by browsers and does not behave predictably as a
              flex child, so this keeps the accessible name correct AND the layout reliable.
            */}
            <fieldset className="sm:flex sm:items-center sm:justify-between sm:gap-6">
              <legend className="sr-only">{symptom}</legend>
              <p aria-hidden="true" className="mb-3 text-lg font-semibold text-ink sm:mb-0">
                {symptom}
              </p>

              <div className="flex gap-2 sm:shrink-0">
                {SYMPTOM_SCALE.map((step) => {
                  const selected = scores[index] === step.value;
                  return (
                    <label
                      key={step.value}
                      className={`flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-center transition-colors sm:w-20 sm:flex-none ${
                        selected
                          ? 'border-signal bg-signal text-white'
                          : 'border-line bg-paper text-ink-soft hover:border-line-strong'
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
                      <span className="tabular text-xl font-black leading-none">{step.value}</span>
                      <span className="mt-1 text-[11px] font-bold uppercase tracking-wide leading-none">
                        {step.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Card>
        ))}
      </div>

      {battery.saveError && <SaveErrorNotice message={battery.saveError} tone="light" />}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {battery.mode === 'battery' ? (
          <Button onClick={handleContinue} disabled={battery.saving}>
            {battery.saving ? 'Saving…' : 'Save and continue'}
          </Button>
        ) : (
          <Button onClick={handleContinue} disabled={battery.practiceDone}>
            {battery.practiceDone ? `Practice total: ${total} / ${MAX_SYMPTOM_TOTAL}` : 'Finish practice run'}
          </Button>
        )}
        <Button variant="neutral" onClick={() => setScores(SYMPTOM_ITEMS.map(() => 0))}>
          Reset all to none
        </Button>
      </div>
    </PageShell>
  );
}
