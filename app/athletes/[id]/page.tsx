'use client';

// app/athletes/[id]/page.tsx
//
// One athlete: their baseline status, the two things you can do (record a baseline, run a
// sideline check), and their past checks.
//
// This is where a sitting actually begins. Pressing either button writes a "battery session"
// to sessionStorage and sends the athlete to the first test; see lib/session.ts for why the
// in-progress sitting is kept separate from the saved database.

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, ButtonLink, Card, Notice, PageShell } from '@/components/ui';
import { useDeviceData } from '@/components/use-device-data';
import { getAthlete, getResultsFor } from '@/lib/storage';
import { isCurrentSchema } from '@/lib/schema';
import { buildAthleteExport, downloadJson, exportFilename, serialiseExport } from '@/lib/export';
import { BATTERY_STEPS, STEP_PATHS, startSession } from '@/lib/session';
import type { Athlete, TestResult } from '@/lib/types';
import { completedModules, formatDateTime } from '@/lib/format';

type AthletePage = { athlete: Athlete | null; results: TestResult[]; justSavedBaseline: boolean };

export default function AthleteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const load = useCallback(async (): Promise<AthletePage> => {
    // Read the "?baseline=saved" hint straight off the URL rather than with useSearchParams,
    // which would force this whole page behind a Suspense boundary for no real benefit.
    const justSavedBaseline =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('baseline') === 'saved';

    if (!id) return { athlete: null, results: [], justSavedBaseline };

    const found = await getAthlete(id);
    if (!found) return { athlete: null, results: [], justSavedBaseline };

    const results = await getResultsFor(found.id);
    // Newest first — the most recent check is the one someone is looking for.
    results.sort((a, b) => b.takenAt - a.takenAt);
    return { athlete: found, results, justSavedBaseline };
  }, [id]);

  const { data, loading } = useDeviceData(load);

  const athlete = data?.athlete ?? null;
  const results = data?.results ?? [];
  const justSavedBaseline = data?.justSavedBaseline ?? false;

  const begin = (kind: 'baseline' | 'check') => {
    if (!athlete) return;
    startSession(athlete.id, athlete.name, kind);
    router.push(STEP_PATHS[BATTERY_STEPS[0]]);
  };

  /**
   * Download this athlete's raw records as JSON.
   *
   * Reads the clock here rather than inside the export builder so that the builder stays pure
   * and testable, and so the filename and the timestamp inside the file are the same moment.
   */
  const exportResults = () => {
    if (!athlete) return;
    const now = Date.now();
    const data = buildAthleteExport(athlete, results, now);
    downloadJson(exportFilename(athlete.name, now), serialiseExport(data));
  };

  if (loading) {
    return (
      <PageShell>
        <p className="text-lg text-ink-soft">Loading athlete…</p>
      </PageShell>
    );
  }

  if (!athlete) {
    return (
      <PageShell>
        <h1 className="text-3xl font-bold text-ink">Athlete not found</h1>
        <p className="mt-3 text-ink-soft">
          This athlete isn&apos;t saved in this browser. Data lives only on the device that
          recorded it.
        </p>
        <div className="mt-6">
          <ButtonLink href="/athletes">Back to athletes</ButtonLink>
        </div>
      </PageShell>
    );
  }

  const baseline = results.find((r) => r.id === athlete.baselineId) ?? null;
  const checks = results.filter((r) => r.kind === 'check');

  // Was this baseline recorded on the tests the app runs today?
  //
  // WHY WARN HERE AND NOT ONLY ON THE RESULT SCREEN: the result screen catches it too, but by
  // then someone has already run a check on a hurt athlete and has nothing to show for it. This
  // is the screen where a sitting starts, so it is the last useful moment to say "the baseline
  // you are about to measure against is out of date" — while there is still time to do
  // something about it on a day when the athlete is well.
  const baselineOutOfDate = baseline !== null && !isCurrentSchema(baseline);

  return (
    <PageShell>
      <header className="mb-8">
        <Link
          href="/athletes"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          <span aria-hidden="true">←</span> All athletes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{athlete.name}</h1>
        <p className="mt-2 text-base text-ink-soft">
          {baseline
            ? `Baseline recorded ${formatDateTime(baseline.takenAt)}`
            : 'No baseline recorded yet'}
        </p>
      </header>

      {justSavedBaseline && (
        <div className="mb-6">
          <Notice title="Baseline saved">
            {athlete.name}&apos;s baseline is stored on this device. Future sideline checks will
            be compared against it.
          </Notice>
        </div>
      )}

      {baselineOutOfDate && (
        <div className="mb-6">
          <Notice tone="flag" title="This baseline was recorded on an older version of the tests">
            The tests in this app have changed since {athlete.name}&apos;s baseline was recorded,
            so it measures different things than a check would today. The app will{' '}
            <strong>refuse to compare against it</strong> rather than compare the few parts that
            happen to overlap — a partial comparison would look just like a complete one.
            <br />
            <br />
            Record a new baseline for {athlete.name} on a day when they are well and rested. The
            old recording stays saved on this device.
          </Notice>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        {/* ── Actions ────────────────────────────────────────────────────────────── */}
        <section aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="text-xl font-bold text-ink">
            Run the tests
          </h2>

          <div className="mt-4 space-y-4">
            <Card>
              <h3 className="text-lg font-bold text-ink">
                {baseline ? 'Record a new baseline' : 'Record a baseline'}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-ink-soft">
                Do this while {athlete.name} is well and rested — ideally before the season
                starts. It is the reference every later check is measured against.
              </p>

              {baseline && (
                <div className="mt-4">
                  {/*
                    An athlete has one baseline, so a new one replaces it — and past checks were
                    never measured against a baseline that did not exist yet. The engine refuses
                    those comparisons rather than silently re-scoring old results, so say that
                    here instead of letting it surprise someone later.
                  */}
                  <Notice title="This replaces the current baseline">
                    Recording a new baseline replaces the one from{' '}
                    {formatDateTime(baseline.takenAt)}. Checks recorded before today were
                    measured against the old baseline, so they will no longer open as results.
                    Only record a new baseline when {athlete.name} is well.
                  </Notice>
                </div>
              )}
              <Button className="mt-4 w-full sm:w-auto" onClick={() => begin('baseline')}>
                {baseline ? 'Record new baseline' : 'Record baseline'}
              </Button>
            </Card>

            <Card>
              <h3 className="text-lg font-bold text-ink">Sideline check</h3>
              <p className="mt-2 text-base leading-relaxed text-ink-soft">
                Run this after a possible head impact. It is the same three tests, compared
                against {athlete.name}&apos;s own baseline.
              </p>

              {!baseline && (
                <div className="mt-4">
                  {/*
                    We warn here rather than blocking. Someone standing on a sideline with a
                    hurt kid should not be stopped by our app — but they should know, before
                    spending three minutes on tests, that there is nothing to compare against.
                  */}
                  <Notice tone="flag" title="There is no baseline to compare against">
                    You can still run the tests and the answers will be saved, but the app will
                    not be able to tell you whether anything has changed. If {athlete.name} may
                    have hit their head, have a medical professional evaluate them regardless
                    of what this app shows.
                  </Notice>
                </div>
              )}

              <Button
                variant={baseline ? 'signal' : 'neutral'}
                className="mt-4 w-full sm:w-auto"
                onClick={() => begin('check')}
              >
                Start sideline check
              </Button>
            </Card>
          </div>
        </section>

        {/* ── History ────────────────────────────────────────────────────────────── */}
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-xl font-bold text-ink">
            Past sideline checks
          </h2>

          {checks.length === 0 ? (
            <p className="mt-4 text-ink-soft">No sideline checks recorded yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {checks.map((check) => {
                const modules = completedModules(check.scores);
                return (
                  <li key={check.id}>
                    <Card>
                      <Link
                        href={`/results/${check.id}`}
                        className="text-lg font-bold text-ink underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-signal"
                      >
                        {formatDateTime(check.takenAt)}
                      </Link>
                      <p className="mt-1 text-sm text-ink-soft">
                        {modules.length > 0 ? modules.join(' · ') : 'No tests recorded'}
                      </p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          {baseline && (
            <div className="mt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-ink-soft">
                Current baseline
              </h3>
              <Card className="mt-2">
                <p className="font-bold text-ink">{formatDateTime(baseline.takenAt)}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {completedModules(baseline.scores).join(' · ') || 'No tests recorded'}
                </p>
              </Card>
            </div>
          )}

          {/* ── Export ─────────────────────────────────────────────────────────────
              Every threshold in this app is a placeholder guess, and the only way to
              replace a guess is with collected measurements. Those measurements live in
              this phone's own storage and nothing is ever sent anywhere, so without this
              button there is no way to look at a single number we have recorded.
          */}
          {results.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-ink-soft">
                Export raw records
              </h3>
              <Card className="mt-2">
                <p className="text-base leading-relaxed text-ink-soft">
                  Saves {athlete.name}&apos;s {results.length}{' '}
                  {results.length === 1 ? 'sitting' : 'sittings'} to a JSON file on this device,
                  exactly as stored. Nothing is uploaded — the app has no server to send it to.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  <strong className="text-ink">The file includes {athlete.name}&apos;s name</strong>{' '}
                  and is not anonymised, so treat it as personal data once it leaves this phone.
                  It is not a medical record and contains no diagnosis.
                </p>
                <Button variant="neutral" className="mt-4 w-full sm:w-auto" onClick={exportResults}>
                  Download JSON
                </Button>
              </Card>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
