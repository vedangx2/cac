'use client';

// app/practice/page.tsx
//
// THE PRACTICE RUN — all six tests, in battery order, scored, shown once, saved nowhere.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY PRACTICE IS A FIRST-CLASS FLOW AND NOT A DEMO
// ═════════════════════════════════════════════════════════════════════════════════════
// The owner's own noise-floor collection measured a ~20 ms practice effect on reaction time
// that survived a week off. That means an athlete's very FIRST attempt at these tests is
// worse than their true normal — so a baseline recorded on a first attempt is permanently
// skewed, and the improvement that comes free with familiarity on the next sitting can
// cancel out a real decline and hide it. That is the exact failure this app exists to
// prevent, arriving through the front door.
//
// So: recording a baseline is locked until the athlete has completed at least one practice
// pass (Athlete.practiceCompletedAt — see lib/types.ts). This page is where a pass starts.
//
// Two ways in:
//   • from an athlete's page (?athlete=<id>) — finishing counts as THAT athlete's pass;
//   • from anywhere else — anonymous, no athlete needed, nothing recorded about it at all.
//
// What a practice run deliberately is NOT: it is not scored against anything, it is not
// judged, its scores are never written to the database (the compiler enforces that — a
// practice session does not fit finishSession), and it never says a word about anyone's
// health.
//
// REPLACED 2026-09-23 — Apple's web design system (see app/globals.css, components/ui.tsx).
// The single centred Card is now a plain block with a hairline top rule — restyling only;
// no copy changed in this pass.

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ButtonLink, Button, Kicker, Notice, PageHeader, PageShell } from '@/components/ui';
import { useDeviceData } from '@/components/use-device-data';
import { getAthlete } from '@/lib/storage';
import { BATTERY_STEPS, STEP_LABELS, STEP_PATHS, startPracticeSession } from '@/lib/session';
import type { Athlete } from '@/lib/types';

type PracticeStart = {
  athlete: Athlete | null;
  /** True when the URL asked for an athlete, so "not found" can be said out loud. */
  requested: boolean;
};

export default function PracticePage() {
  const router = useRouter();

  const load = useCallback(async (): Promise<PracticeStart> => {
    // Same technique as the athlete page: read the query straight off the URL rather than
    // with useSearchParams, which would force this page behind a Suspense boundary.
    const requestedId =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('athlete')
        : null;

    if (!requestedId) return { athlete: null, requested: false };
    return { athlete: await getAthlete(requestedId), requested: true };
  }, []);

  const { data, loading } = useDeviceData(load);
  const athlete = data?.athlete ?? null;
  const athleteMissing = (data?.requested ?? false) && !loading && !athlete;

  const start = () => {
    startPracticeSession(athlete ? { id: athlete.id, name: athlete.name } : null);
    router.push(STEP_PATHS[BATTERY_STEPS[0]]);
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Instructions"
        title="Practice run"
        subtitle="All six tests, in order, exactly as a real sitting runs them — scored, shown to you once at the end, and saved nowhere."
        backHref={athlete ? `/athletes/${athlete.id}` : '/'}
        backLabel={athlete ? `Back to ${athlete.name}` : 'Home'}
      />

      {athleteMissing && (
        <div className="mb-8">
          <Notice tone="loud" title="That athlete could not be found on this device">
            The link that brought you here named an athlete this browser does not have. You can
            still run a practice pass, but it will not count for anyone. To unlock recording a
            baseline for a specific athlete, open them from the roster and start practice from
            their page.
          </Notice>
        </div>
      )}

      {/*
        Two unequal columns rather than one centred Card: the reasoning and the step-by-step
        run as open, generous prose on the wide side, and the action itself (start / pick
        someone first) stays a compact panel on the narrow side.
      */}
      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-16">
        <div>
          <Kicker>Why practise before recording a baseline</Kicker>
          <p className="mt-2 max-w-2xl text-title text-ink-secondary">
            A baseline recorded on someone&apos;s very first attempt reads worse than their
            true normal — later sittings improve just from familiarity, and that improvement
            can cancel out a real decline and hide it on the day it matters.
          </p>

          <h2 className="mt-10 text-title font-semibold text-ink">What happens</h2>
          <ol className="mt-4 divide-y divide-hairline border-t border-hairline">
            {BATTERY_STEPS.map((step, index) => (
              <li key={step} className="flex gap-4 py-3 text-body text-ink-secondary">
                <span className="tabular shrink-0 text-ink">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  {STEP_LABELS[step]}
                  {index === 0 && ' — the run starts here'}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-body text-ink-secondary">
            Each screen is marked as practice while you are on it. At the end you see every
            module&apos;s score once, and then it is thrown away — practice numbers are
            first-attempt numbers, which is exactly what a baseline must not contain.
          </p>
        </div>

        <div className="mt-10 lg:mt-0">
          <div className="border-t border-hairline pt-6">
            {athlete ? (
              <Notice title={`Practising as ${athlete.name}`}>
                Finishing this run counts as {athlete.name}&apos;s practice pass and unlocks
                recording a baseline for them. Only the fact that the pass happened is stored —
                never its scores.
              </Notice>
            ) : (
              !athleteMissing && (
                <p className="text-body text-ink-secondary">
                  No athlete is attached, and nothing about this run will be recorded anywhere.
                  To unlock recording a baseline for a specific athlete, start practice from
                  their page instead.
                </p>
              )
            )}

            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={start} disabled={loading}>
                {loading ? 'Loading…' : 'Start the practice run'}
              </Button>
              <ButtonLink href="/athletes" variant="secondary">
                Pick an athlete first
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
