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

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ButtonLink, Button, Card, Notice, PageHeader, PageShell } from '@/components/ui';
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
        title="Practice run"
        subtitle="All six tests, in order, exactly as a real sitting runs them — scored, shown to you once at the end, and saved nowhere."
        backHref={athlete ? `/athletes/${athlete.id}` : '/'}
        backLabel={athlete ? `Back to ${athlete.name}` : 'Home'}
      />

      {/*
        THE ONE-SENTENCE WHY. Required to be on screen by the brief that added this flow, and
        kept to one sentence so it actually gets read.
      */}
      <Notice title="Why practise before recording a baseline">
        A baseline recorded on someone&apos;s very first attempt reads worse than their true
        normal — later sittings improve just from familiarity, and that improvement can cancel
        out a real decline and hide it on the day it matters.
      </Notice>

      {athleteMissing && (
        <div className="mt-6">
          <Notice tone="loud" title="That athlete could not be found on this device">
            The link that brought you here named an athlete this browser does not have. You can
            still run a practice pass, but it will not count for anyone. To unlock recording a
            baseline for a specific athlete, open them from the roster and start practice from
            their page.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <Card>
          <h2 className="text-title font-bold text-ink">What happens</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-body text-ink-soft">
            {BATTERY_STEPS.map((step, index) => (
              <li key={step}>
                {STEP_LABELS[step]}
                {index === 0 && ' — the run starts here'}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-body text-ink-soft">
            Each screen is marked as practice while you are on it. At the end you see every
            module&apos;s score once, and then it is thrown away — practice numbers are
            first-attempt numbers, which is exactly what a baseline must not contain.
          </p>

          {athlete ? (
            <div className="mt-4">
              <Notice title={`Practising as ${athlete.name}`}>
                Finishing this run counts as {athlete.name}&apos;s practice pass and unlocks
                recording a baseline for them. Only the fact that the pass happened is stored —
                never its scores.
              </Notice>
            </div>
          ) : (
            !athleteMissing && (
              <p className="mt-4 text-body text-ink-soft">
                No athlete is attached, and nothing about this run will be recorded anywhere. To
                unlock recording a baseline for a specific athlete, start practice from their
                page instead.
              </p>
            )
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={start} disabled={loading}>
              {loading ? 'Loading…' : 'Start the practice run'}
            </Button>
            <ButtonLink href="/athletes" variant="secondary">
              Pick an athlete first
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
