'use client';

// app/practice/summary/page.tsx
//
// THE END OF A PRACTICE RUN. Shows every module's score once, from sessionStorage, and
// nothing else ever sees them.
//
// What this screen must get right:
//   • These numbers are NOT judged. There is no baseline in sight, no thresholds are
//     applied, and no module is compared to anything. The screen says so, in words, and
//     attaches no verdict of any kind to any number. No green, no checkmark — see CLAUDE.md.
//   • These numbers are NOT saved. The one durable thing a practice run can produce is the
//     FACT that an attached athlete completed it (their practice pass, written by
//     finishPracticeRun when the last module completed). This screen re-reads the athlete
//     and reports honestly whether that write actually happened, instead of assuming it did.
//   • Leaving through "Done" clears the sitting, so a finished practice run does not linger
//     in the tab and reopen test screens into a completed session.

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink, Card, Notice, PageHeader, PageShell } from '@/components/ui';
import { useDeviceData } from '@/components/use-device-data';
import { getAthlete } from '@/lib/storage';
import {
  BATTERY_STEPS,
  STEP_LABELS,
  STEP_PATHS,
  clearSession,
  getSession,
  startPracticeSession,
} from '@/lib/session';
import type { Athlete, ModuleScores } from '@/lib/types';
import { MAX_SYMPTOM_TOTAL } from '@/lib/symptoms';
import { MAX_WORD_CORRECT } from '@/lib/modules/words';
import { MAX_DIGIT_CORRECT } from '@/lib/modules/digits';
import { MAX_PATTERN_CORRECT } from '@/lib/modules/pattern';

/** The six module scores, with the nulls proven absent — see the narrowing in load(). */
type CompletedScores = {
  symptom: NonNullable<ModuleScores['symptom']>;
  wordLearning: NonNullable<ModuleScores['wordLearning']>;
  wordRecognition: NonNullable<ModuleScores['wordRecognition']>;
  digitSpan: NonNullable<ModuleScores['digitSpan']>;
  patternSpan: NonNullable<ModuleScores['patternSpan']>;
  goNoGo: NonNullable<ModuleScores['goNoGo']>;
};

type SummaryState =
  | { status: 'no-run' }
  | { status: 'incomplete'; nextPath: string; nextLabel: string }
  | {
      status: 'complete';
      scores: CompletedScores;
      startedAt: number;
      /** Who the run was attached to, straight from the sitting. */
      attachedId: string | null;
      attachedName: string | null;
      /** The athlete re-read from storage AFTER the run, to verify the pass was recorded. */
      athlete: Athlete | null;
    };

export default function PracticeSummaryPage() {
  const router = useRouter();

  const load = useCallback(async (): Promise<SummaryState> => {
    const session = getSession();
    if (!session || session.kind !== 'practice') return { status: 'no-run' };

    const missing = BATTERY_STEPS.find((step) => session.scores[step] === null);
    if (missing) {
      return { status: 'incomplete', nextPath: STEP_PATHS[missing], nextLabel: STEP_LABELS[missing] };
    }

    // Destructure and re-check so the compiler carries the non-nullness into rendering,
    // instead of every row needing a "?? 0" that could silently invent a score.
    const { symptom, wordLearning, wordRecognition, digitSpan, patternSpan, goNoGo } =
      session.scores;
    if (!symptom || !wordLearning || !wordRecognition || !digitSpan || !patternSpan || !goNoGo) {
      return { status: 'no-run' }; // unreachable given the find() above; here for the types
    }

    return {
      status: 'complete',
      scores: { symptom, wordLearning, wordRecognition, digitSpan, patternSpan, goNoGo },
      startedAt: session.startedAt,
      attachedId: session.athleteId,
      attachedName: session.athleteName,
      athlete: session.athleteId ? await getAthlete(session.athleteId) : null,
    };
  }, []);

  const { data, loading } = useDeviceData(load);
  const state: SummaryState = loading || !data ? { status: 'no-run' } : data;

  if (loading) {
    return (
      <PageShell>
        <p className="text-title text-ink-soft">Loading practice run…</p>
      </PageShell>
    );
  }

  if (state.status === 'no-run') {
    return (
      <PageShell>
        <PageHeader title="No practice run to show" backHref="/" backLabel="Home" />
        <Notice title="There is no finished practice run in this tab">
          A practice run&apos;s scores live only in this browser tab and are thrown away when it
          closes or when the run ends. Start a new one whenever you like.
        </Notice>
        <div className="mt-6">
          <ButtonLink href="/practice">Start a practice run</ButtonLink>
        </div>
      </PageShell>
    );
  }

  if (state.status === 'incomplete') {
    return (
      <PageShell>
        <PageHeader title="This practice run is not finished" backHref="/" backLabel="Home" />
        <Notice title={`Next up: ${state.nextLabel}`}>
          The run has modules left to do, so there is nothing to sum up yet. Carry on where it
          left off.
        </Notice>
        <div className="mt-6">
          <ButtonLink href={state.nextPath}>Continue with {state.nextLabel}</ButtonLink>
        </div>
      </PageShell>
    );
  }

  const { scores, attachedId, attachedName, athlete, startedAt } = state;

  // Was the pass actually written? finishPracticeRun stamps the athlete when the last module
  // completes; comparing against startedAt means an OLD pass from last week cannot be
  // mistaken for this run having been recorded.
  const passRecorded =
    athlete !== null &&
    athlete.practiceCompletedAt !== null &&
    athlete.practiceCompletedAt >= startedAt;

  const practiceAgain = () => {
    startPracticeSession(athlete ? { id: athlete.id, name: athlete.name } : null);
    router.push(STEP_PATHS[BATTERY_STEPS[0]]);
  };

  const done = () => {
    clearSession();
    router.push(athlete ? `/athletes/${athlete.id}` : '/');
  };

  const rows: { label: string; value: string; detail: string }[] = [
    {
      label: STEP_LABELS.symptom,
      value: `${scores.symptom.total} out of ${MAX_SYMPTOM_TOTAL}`,
      detail: 'Total across ten symptoms, each rated 0–3.',
    },
    {
      label: STEP_LABELS.wordLearning,
      value: `${scores.wordLearning.correct} out of ${MAX_WORD_CORRECT}`,
      detail: `${scores.wordLearning.hits} shown words picked, ${scores.wordLearning.falseAlarms} picked that were not shown.`,
    },
    {
      label: STEP_LABELS.digitSpan,
      value: `${scores.digitSpan.correct} out of ${MAX_DIGIT_CORRECT}`,
      detail: 'Rounds reproduced exactly.',
    },
    {
      label: STEP_LABELS.patternSpan,
      value: `${scores.patternSpan.correct} out of ${MAX_PATTERN_CORRECT}`,
      detail: 'Rounds reproduced exactly.',
    },
    {
      label: STEP_LABELS.goNoGo,
      value: `${scores.goNoGo.medianMs} ms median`,
      detail: `Tapped on hold ${scores.goNoGo.commissionErrors} ${scores.goNoGo.commissionErrors === 1 ? 'time' : 'times'}, missed ${scores.goNoGo.omissionErrors} ${scores.goNoGo.omissionErrors === 1 ? 'tap' : 'taps'}.`,
    },
    {
      label: STEP_LABELS.wordRecognition,
      value: `${scores.wordRecognition.correct} out of ${MAX_WORD_CORRECT}`,
      detail: `${scores.wordRecognition.hits} shown words picked, ${scores.wordRecognition.falseAlarms} picked that were not shown.`,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Practice run complete"
        subtitle="Every number below is a record of what happened, judged against nothing. None of it is saved — it exists only on this screen."
      />

      {/* What the run did or did not durably change — said before the numbers, not after. */}
      {attachedId ? (
        athlete === null ? (
          <div className="mb-6">
            <Notice tone="loud" title="This pass was not recorded for anyone">
              The athlete this run was attached to{attachedName ? ` (${attachedName})` : ''} is no
              longer on this device, so there was nobody to record the practice pass for.
            </Notice>
          </div>
        ) : passRecorded ? (
          <div className="mb-6">
            <Notice title={`This counted as ${athlete.name}'s practice pass`}>
              Recording a baseline for {athlete.name} is now unlocked on their page. Only the
              fact that this pass happened was stored — none of the numbers below were.
            </Notice>
          </div>
        ) : (
          <div className="mb-6">
            <Notice tone="loud" title="The practice pass could not be recorded">
              The run finished, but writing the pass to this device failed — that usually means
              this browser is blocking storage (private browsing does this). Recording a
              baseline for {athlete.name} stays locked until a pass is recorded. You can run
              the practice again to retry.
            </Notice>
          </div>
        )
      ) : (
        <div className="mb-6">
          <Notice title="No athlete was attached to this run">
            Nothing about this run was recorded anywhere. To unlock recording a baseline for a
            specific athlete, start a practice run from their page.
          </Notice>
        </div>
      )}

      <section aria-labelledby="scores-heading">
        <h2 id="scores-heading" className="text-title font-bold text-ink">
          What happened, module by module
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.label}>
              <p className="text-meta font-black uppercase tracking-widest text-ink-soft">
                {row.label}
              </p>
              <p className="tabular mt-2 text-display font-black text-ink">{row.value}</p>
              <p className="mt-2 text-meta text-ink-soft">{row.detail}</p>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-body text-ink-soft">
          Practice numbers are first-attempt numbers — the exact thing a baseline must not
          contain, which is why they are shown once and thrown away. No cut-offs were applied
          and nothing here says anything about anyone&apos;s health.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={done}>Done</Button>
        <Button variant="secondary" onClick={practiceAgain}>
          Practise again
        </Button>
      </div>
    </PageShell>
  );
}
