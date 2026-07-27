'use client';

// app/results/[id]/page.tsx
//
// THE RESULT SCREEN. This is the screen the whole app exists to produce, and it is the one
// place where getting the wording wrong could genuinely hurt someone.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE RULES THIS SCREEN ENFORCES (CLAUDE.md → THE HARD RULE)
// ═════════════════════════════════════════════════════════════════════════════════════
// • Every single path out of here ends with "see a medical professional." There is no exit
//   from this screen that doesn't.
// • There is no "cleared", "safe to play", "healthy", or "no concussion" state, because this
//   app cannot know any of those things.
// • The not-flagged state is NEVER green and NEVER shows a checkmark. It says three things,
//   explicitly: we found no significant change from this athlete's baseline; that does not
//   rule out a concussion; keep monitoring and see a professional if anything feels off.
// • "We could not compare anything" is its own loud state. It must never be allowed to look
//   like "we compared everything and found nothing."
// • A check with no baseline on file is an ERROR here, not a quiet pass.

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDeviceData } from '@/components/use-device-data';
import {
  ButtonLink,
  Card,
  Notice,
  PageShell,
  ThresholdDisclaimer,
} from '@/components/ui';
import { getAthlete, getResult } from '@/lib/storage';
import {
  type ComparisonRow,
  MissingBaselineError,
  buildBreakdown,
  compareToBaseline,
} from '@/lib/engine';
import type { Athlete, FlagOutcome, TestResult } from '@/lib/types';
import { formatDateTime } from '@/lib/format';

type ScreenState =
  | { status: 'loading' }
  | { status: 'not-found' }
  /** Someone opened a baseline recording rather than a sideline check. */
  | { status: 'baseline'; result: TestResult; athlete: Athlete | null }
  /** We could not run the comparison at all. `check` is null when storage itself failed. */
  | { status: 'cannot-compare'; message: string; athlete: Athlete | null; check: TestResult | null }
  | {
      status: 'compared';
      outcome: FlagOutcome;
      rows: ComparisonRow[];
      baseline: TestResult;
      check: TestResult;
      athlete: Athlete | null;
    };

export default function ResultPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const load = useCallback(async (): Promise<ScreenState> => {
    if (!id) return { status: 'not-found' };

    const check = await getResult(id);
    if (!check) return { status: 'not-found' };

    const athlete = await getAthlete(check.athleteId);

    if (check.kind === 'baseline') {
      return { status: 'baseline', result: check, athlete };
    }

    // Find the baseline this check should be measured against.
    const baseline = athlete?.baselineId ? await getResult(athlete.baselineId) : null;

    try {
      // The engine throws rather than returning anything when it can't legitimately compare.
      // We let it throw and handle it here, which is what keeps a missing baseline from ever
      // rendering as a reassuring screen.
      const outcome = compareToBaseline(baseline, check);
      const rows = buildBreakdown(baseline as TestResult, check);
      return { status: 'compared', outcome, rows, baseline: baseline as TestResult, check, athlete };
    } catch (error) {
      const message =
        error instanceof MissingBaselineError
          ? `${athlete?.name ?? 'This athlete'} has no baseline recorded, so this check cannot be compared against anything.`
          : error instanceof Error
            ? error.message
            : 'This check could not be compared.';
      return { status: 'cannot-compare', message, athlete, check };
    }
  }, [id]);

  const { data, loading, error } = useDeviceData(load);

  // If reading from storage threw, `loading` goes false while `data` stays null. Collapsing
  // that into "loading" would leave this screen spinning forever on the one page where being
  // stuck is least acceptable, so a storage failure gets its own honest state.
  const state: ScreenState = error
    ? {
        status: 'cannot-compare',
        message:
          'This device would not let the app read its saved results. That is usually private browsing or a browser setting blocking local storage.',
        athlete: null,
        check: null,
      }
    : loading || !data
      ? { status: 'loading' }
      : data;

  /* ── Loading ──────────────────────────────────────────────────────────────────── */
  if (state.status === 'loading') {
    return (
      <PageShell>
        <p className="text-lg text-ink-soft">Loading result…</p>
      </PageShell>
    );
  }

  /* ── Result doesn't exist ─────────────────────────────────────────────────────── */
  if (state.status === 'not-found') {
    return (
      <PageShell>
        <PageHeaderLite title="Result not found" />
        <Notice tone="flag" title="We couldn't find this result">
          It may have been recorded on a different device or in a different browser. Because
          all data is stored privately on the device that recorded it, results do not follow
          you between phones or browsers.
        </Notice>
        <div className="mt-6">
          <ButtonLink href="/athletes">Back to athletes</ButtonLink>
        </div>
      </PageShell>
    );
  }

  /* ── Someone opened a baseline recording ──────────────────────────────────────── */
  if (state.status === 'baseline') {
    return (
      <PageShell>
        <PageHeaderLite
          title="Baseline recording"
          subtitle={`${state.athlete?.name ?? 'Athlete'} · recorded ${formatDateTime(state.result.takenAt)}`}
          backHref={state.athlete ? `/athletes/${state.athlete.id}` : '/athletes'}
        />
        <Notice title="This is a baseline, not a sideline check">
          A baseline is the healthy reference we compare future checks against, so there is
          nothing to compare it to on its own. Run a sideline check to get a result.
        </Notice>
        {state.athlete && (
          <div className="mt-6">
            <ButtonLink href={`/athletes/${state.athlete.id}`}>
              Back to {state.athlete.name}
            </ButtonLink>
          </div>
        )}
      </PageShell>
    );
  }

  /* ── We could not compare — an ERROR, never a pass ────────────────────────────── */
  if (state.status === 'cannot-compare') {
    return (
      <PageShell>
        <PageHeaderLite
          title="This check could not be compared"
          subtitle={
            state.check
              ? `${state.athlete?.name ?? 'Athlete'} · ${formatDateTime(state.check.takenAt)}`
              : undefined
          }
          backHref={state.athlete ? `/athletes/${state.athlete.id}` : '/athletes'}
        />

        <div className="rounded-xl border-4 border-flag bg-paper p-6">
          <p className="text-2xl font-black text-ink sm:text-3xl">No comparison was possible</p>
          <p className="mt-3 text-lg leading-relaxed text-ink">{state.message}</p>
          <p className="mt-4 text-lg font-bold leading-relaxed text-ink">
            This is not a result. It does not mean anything was found, and it does not mean
            nothing is wrong. If this athlete may have hit their head,{' '}
            <span className="underline decoration-flag decoration-4 underline-offset-4">
              have them seen by a medical professional.
            </span>
          </p>
        </div>

        {/*
          This screen used to offer "Record a baseline for {name}" as its main action, which
          was actively dangerous: the athlete standing in front of you has just taken a hit,
          and a baseline recorded now would be a measurement of a possibly-concussed athlete.
          Every later check would then be compared against an already-impaired reference and
          would look reassuringly normal. The engine now refuses that comparison outright, and
          this screen no longer invites it.
        */}
        <div className="mt-6">
          <Notice title="Do not record a baseline right now">
            A baseline only means something if it is recorded while the athlete is well. Record
            one for {state.athlete?.name ?? 'this athlete'} another day, before they play again
            — not today, and not after a possible head impact.
          </Notice>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {state.athlete && (
            <ButtonLink href={`/athletes/${state.athlete.id}`} variant="neutral">
              Back to {state.athlete.name}
            </ButtonLink>
          )}
          <ButtonLink href="/athletes" variant="neutral">
            All athletes
          </ButtonLink>
        </div>

        <div className="mt-8">
          <ThresholdDisclaimer />
        </div>
      </PageShell>
    );
  }

  /* ── A real comparison ────────────────────────────────────────────────────────── */
  const { outcome, rows, baseline, check, athlete } = state;
  const name = athlete?.name ?? 'This athlete';
  const nothingCompared = rows.every((row) => !row.compared);

  return (
    <PageShell>
      <PageHeaderLite
        title="Sideline check result"
        subtitle={`${name} · ${formatDateTime(check.takenAt)} · compared against baseline from ${formatDateTime(baseline.takenAt)}`}
        backHref={athlete ? `/athletes/${athlete.id}` : '/athletes'}
      />

      {/* ── THE HEADLINE ──────────────────────────────────────────────────────────── */}
      {nothingCompared ? (
        // Neither sitting has overlapping modules. Loud and distinct from "no change".
        <section className="rounded-xl border-4 border-flag bg-paper p-6" aria-live="polite">
          <p className="text-2xl font-black text-ink sm:text-3xl">Nothing could be compared</p>
          <p className="mt-3 text-lg leading-relaxed text-ink">
            This check and {name}&apos;s baseline have no tests in common, so no comparison was
            made. <strong>This is not a &ldquo;no change&rdquo; result.</strong> Have {name} seen by a
            medical professional.
          </p>
        </section>
      ) : outcome.flagged ? (
        /*
          FLAGGED. Deliberately the loudest thing in the app: a heavy red border, the biggest
          type on the screen, and the action first. Note it says what CHANGED — it does not
          say the athlete is concussed, because this app cannot know that.
        */
        <section className="rounded-xl border-4 border-flag bg-flag p-6 text-white" aria-live="polite">
          <p className="text-sm font-black uppercase tracking-[0.2em]">Flagged</p>
          <h2 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">
            Significant change from {name}&apos;s baseline
          </h2>
          <p className="mt-4 text-lg font-bold leading-relaxed sm:text-xl">
            Stop activity now and have {name} evaluated by a medical professional.
          </p>
          <p className="mt-3 text-base leading-relaxed opacity-95">
            This screen cannot tell you whether {name} has a concussion. It can only tell you
            that something measured differently than it did when they were well — and that is
            reason enough for a trained person to take a look.
          </p>
        </section>
      ) : (
        /*
          NOT FLAGGED. The three required statements, in order, and nothing that could be
          mistaken for a clearance. No green. No checkmark. The panel is deliberately the same
          sober dark neutral as the rest of the app's serious surfaces.
        */
        <section className="rounded-xl border-4 border-ink bg-ink p-6 text-white" aria-live="polite">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-white/70">
            No change detected
          </p>
          <h2 className="mt-2 text-2xl font-black leading-tight sm:text-4xl">
            This screen found no significant change from {name}&apos;s baseline.
          </h2>

          <div className="mt-5 space-y-3 text-base leading-relaxed sm:text-lg">
            <p className="font-bold">This does not rule out a concussion.</p>
            <p>
              A concussion can be present even when these tests look unchanged, and symptoms
              can take hours to appear. Keep monitoring {name}, and{' '}
              <strong>see a medical professional if anything feels off</strong> — including
              later today or tomorrow.
            </p>
            <p className="text-white/80">
              This screen is not a clearance to return to play. Only a medical professional
              can make that call.
            </p>
          </div>
        </section>
      )}

      {/* ── Plain-language explanations from the engine ───────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-ink">What we compared</h2>
        <ul className="mt-4 space-y-3">
          {outcome.explanations.map((line, index) => (
            <li key={index} className="flex gap-3 text-base leading-relaxed text-ink sm:text-lg">
              <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-line-strong" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The numbers ───────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-ink">Measurement by measurement</h2>

        {/*
          Desktop gets a real table — it is genuinely tabular data and side-by-side columns
          are the clearest way to read it. Below `md` the same rows become stacked cards,
          because five columns on a phone is unreadable. Only one of the two is ever in the
          accessibility tree, since `hidden` removes an element from it entirely.
        */}
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Baseline value, sideline check value, the change, and the threshold applied, for
              each measurement.
            </caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-3 pr-4 text-sm font-black uppercase tracking-wide">Measurement</th>
                <th scope="col" className="py-3 pr-4 text-sm font-black uppercase tracking-wide">Baseline</th>
                <th scope="col" className="py-3 pr-4 text-sm font-black uppercase tracking-wide">This check</th>
                <th scope="col" className="py-3 pr-4 text-sm font-black uppercase tracking-wide">Change</th>
                <th scope="col" className="py-3 pr-4 text-sm font-black uppercase tracking-wide">Threshold applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b border-line ${row.flagged ? 'bg-flag/10' : ''}`}
                >
                  <th scope="row" className="py-4 pr-4 font-semibold text-ink">
                    {row.label}
                    {row.flagged && (
                      <span className="ml-2 rounded bg-flag px-2 py-0.5 text-xs font-black uppercase text-white">
                        Flagged
                      </span>
                    )}
                  </th>
                  <td className="tabular py-4 pr-4 text-ink-soft">{row.baselineText}</td>
                  <td className="tabular py-4 pr-4 font-bold text-ink">{row.checkText}</td>
                  <td className={`tabular py-4 pr-4 font-bold ${row.flagged ? 'text-flag' : 'text-ink-soft'}`}>
                    {row.differenceText}
                  </td>
                  <td className="py-4 pr-4 text-sm text-ink-soft">{row.thresholdText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {rows.map((row) => (
            <Card key={row.label} className={row.flagged ? 'border-flag border-2' : ''}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-ink">{row.label}</p>
                {row.flagged && (
                  <span className="shrink-0 rounded bg-flag px-2 py-0.5 text-xs font-black uppercase text-white">
                    Flagged
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-ink-soft">Baseline</dt>
                <dd className="tabular text-right font-semibold text-ink">{row.baselineText}</dd>
                <dt className="text-ink-soft">This check</dt>
                <dd className="tabular text-right font-semibold text-ink">{row.checkText}</dd>
                <dt className="text-ink-soft">Change</dt>
                <dd className={`tabular text-right font-bold ${row.flagged ? 'text-flag' : 'text-ink'}`}>
                  {row.differenceText}
                </dd>
                <dt className="text-ink-soft">Threshold</dt>
                <dd className="text-right text-ink-soft">{row.thresholdText}</dd>
              </dl>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Always-on referral + the placeholder caveat ───────────────────────────── */}
      <section className="mt-8 space-y-4">
        {/*
          TODO(NEEDS_SOURCE): we deliberately do NOT list specific emergency "red flag"
          symptoms here. A list like that has to come from a real clinical source and be
          reviewed by a medical professional, and we don't have one — so we give general
          referral guidance rather than inventing a plausible-looking list.
        */}
        <Notice tone="flag" title="Whatever this screen says, get a professional opinion">
          This app is a screening aid built by high school students. It cannot diagnose a
          concussion and it cannot clear anyone to return to play. If there is any chance{' '}
          {name} hit their head, have a medical professional evaluate them. If you are worried
          about their condition at any point, seek emergency care.
        </Notice>

        <ThresholdDisclaimer />
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {athlete && <ButtonLink href={`/athletes/${athlete.id}`}>Back to {athlete.name}</ButtonLink>}
        <ButtonLink href="/athletes" variant="neutral">
          All athletes
        </ButtonLink>
      </div>
    </PageShell>
  );
}

/**
 * A local header. The shared PageHeader takes a `subtitle` as a node, and this screen wants
 * a plain string plus an optional back link, so this thin wrapper keeps the JSX above tidy.
 */
function PageHeaderLite({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  return (
    <header className="mb-6">
      {backHref && (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          <span aria-hidden="true">←</span> Back
        </Link>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 text-base text-ink-soft">{subtitle}</p>}
    </header>
  );
}
