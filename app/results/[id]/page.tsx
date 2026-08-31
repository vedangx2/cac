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
  SchemaVersionMismatchError,
  buildBreakdown,
  compareToBaseline,
  resolveComparedBaselineId,
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
  /**
   * The records are fine but were measured by a different version of the battery than this
   * build. Its own state because the explanation and the fix are completely different from
   * every other refusal: nothing is wrong with the data, the app moved on, and the only way
   * forward is a fresh baseline.
   */
  | {
      status: 'schema-mismatch';
      athlete: Athlete | null;
      check: TestResult;
      staleSide: 'baseline' | 'check' | 'both';
      fromFuture: boolean;
    }
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
    //
    // PINNED FIRST: a check saved by a current version of the app records the baseline that was
    // on file the moment it was taken (`comparedToBaselineId`). We resolve THAT, so a later
    // re-baselining can never change which baseline this old check is scored against. The old
    // baseline record is never deleted when a new one is recorded, so it is still here to load.
    //
    // LEGACY FALLBACK: checks saved before this field existed have no pin, so for them we fall
    // back to the athlete's current `baselineId` — exactly the old behaviour, so they still open.
    //
    // Either way the id might resolve to nothing (no baseline at all, or a pinned baseline that
    // has somehow gone missing). We pass whatever we find — including null — to the engine, which
    // refuses loudly rather than inventing a reassuring "no change" result.
    const baselineId = resolveComparedBaselineId(check, athlete);
    const baseline = baselineId ? await getResult(baselineId) : null;

    try {
      // The engine throws rather than returning anything when it can't legitimately compare.
      // We let it throw and handle it here, which is what keeps a missing baseline from ever
      // rendering as a reassuring screen.
      const outcome = compareToBaseline(baseline, check);
      const rows = buildBreakdown(baseline as TestResult, check);
      return { status: 'compared', outcome, rows, baseline: baseline as TestResult, check, athlete };
    } catch (error) {
      // A version mismatch gets its own screen. It is not a data problem and it is not a
      // "wrong baseline" problem, so the generic refusal copy would be actively misleading.
      if (error instanceof SchemaVersionMismatchError) {
        const baselineStale = error.baselineVersion !== error.currentVersion;
        const checkStale = error.checkVersion !== error.currentVersion;
        return {
          status: 'schema-mismatch',
          athlete,
          check,
          staleSide: baselineStale && checkStale ? 'both' : baselineStale ? 'baseline' : 'check',
          // A record from a NEWER build means this phone is running an old copy of the app,
          // which is a different instruction to the user: reload, don't re-record.
          fromFuture:
            error.baselineVersion > error.currentVersion || error.checkVersion > error.currentVersion,
        };
      }

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
        <p className="text-title text-ink-soft">Loading result…</p>
      </PageShell>
    );
  }

  /* ── Result doesn't exist ─────────────────────────────────────────────────────── */
  if (state.status === 'not-found') {
    return (
      <PageShell>
        <PageHeaderLite title="Result not found" />
        <Notice tone="loud" title="We couldn't find this result">
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

  /* ── The battery changed under these records — also an ERROR, never a pass ────── */
  if (state.status === 'schema-mismatch') {
    const name = state.athlete?.name ?? 'this athlete';

    return (
      <PageShell>
        <PageHeaderLite
          title="This check could not be compared"
          subtitle={`${state.athlete?.name ?? 'Athlete'} · ${formatDateTime(state.check.takenAt)}`}
          backHref={state.athlete ? `/athletes/${state.athlete.id}` : '/athletes'}
        />

        {/*
          Same visual weight as every other refusal on this screen: a heavy ink border, no
          green, no checkmark. A version mismatch is a "we have no answer for you" outcome and
          it must look like one. The one thing that differs from the generic refusal is the
          explanation and the next step.

          The border is INK rather than red on purpose. Red in this app now means exactly one
          thing — this screening found a change worth a human looking at — and it appears only
          on the flagged headline below and the flagged rows of the table. A refusal is
          different news; giving it the accent too would blunt the accent on the one panel
          where it has to land hardest.
        */}
        <div className="rounded-xl border-4 border-ink bg-paper p-6">
          <p className="text-display font-black text-ink sm:text-display">No comparison was possible</p>

          {state.fromFuture ? (
            <p className="mt-3 text-title text-ink">
              These test results were recorded by a newer version of this app than the one this
              phone is running, so this copy cannot read their scores properly. Close the app
              completely and reopen it to pick up the newer version, then try again.
            </p>
          ) : (
            <p className="mt-3 text-title text-ink">
              The tests in this app changed after{' '}
              {state.staleSide === 'check'
                ? 'this check was recorded'
                : state.staleSide === 'both'
                  ? 'both of these sittings were recorded'
                  : `${name}'s baseline was recorded`}
              . The app now measures different things, so the old scores and the new ones are
              not measurements of the same tests and cannot be compared to each other.
            </p>
          )}

          <p className="mt-4 text-title font-bold text-ink">
            This is not a result. It does not mean anything was found, and it does not mean
            nothing is wrong. If {name} may have hit their head,{' '}
            <span className="underline decoration-ink decoration-4 underline-offset-4">
              have them seen by a medical professional.
            </span>
          </p>
        </div>

        {!state.fromFuture && (
          <div className="mt-6">
            {/*
              Same reasoning as the no-baseline screen: never invite a baseline recording on
              the day of a possible head impact. A baseline taken from a possibly-concussed
              athlete would make every future check look reassuringly normal.
            */}
            <Notice title="What to do about this">
              {name} needs a new baseline recorded on the current tests before checks can be
              compared again. Record it on a day when they are well and rested —{' '}
              <strong>not today, and not after a possible head impact.</strong> The old
              recordings stay saved on this device; they simply cannot be compared against the
              new tests.
            </Notice>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {state.athlete && (
            <ButtonLink href={`/athletes/${state.athlete.id}`} variant="secondary">
              Back to {state.athlete.name}
            </ButtonLink>
          )}
          <ButtonLink href="/athletes" variant="secondary">
            All athletes
          </ButtonLink>
        </div>

        <div className="mt-8">
          <ThresholdDisclaimer />
        </div>
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

        <div className="rounded-xl border-4 border-ink bg-paper p-6">
          <p className="text-display font-black text-ink sm:text-display">No comparison was possible</p>
          <p className="mt-3 text-title text-ink">{state.message}</p>
          <p className="mt-4 text-title font-bold text-ink">
            This is not a result. It does not mean anything was found, and it does not mean
            nothing is wrong. If this athlete may have hit their head,{' '}
            <span className="underline decoration-ink decoration-4 underline-offset-4">
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
            <ButtonLink href={`/athletes/${state.athlete.id}`} variant="secondary">
              Back to {state.athlete.name}
            </ButtonLink>
          )}
          <ButtonLink href="/athletes" variant="secondary">
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

  /*
    WERE THERE MEASUREMENTS WE COULD NOT JUDGE?

    Most of this battery's thresholds are deliberately null until real data has been collected
    (see lib/engine/thresholds.ts). A measurement with no threshold gets compared, gets reported,
    and gets NO verdict — the engine lists it in `unevaluated`.

    This screen must therefore not render the sober "no change detected" panel just because
    nothing flagged. With unjudged measurements present, "nothing flagged" does not mean "we
    looked at everything and it was unremarkable"; it means we looked at some of it and had no
    yardstick for the rest. Those are different statements and only one of them is true.
  */
  const someUnjudged = outcome.unevaluated.length > 0;

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
        <section className="rounded-xl border-4 border-ink bg-paper p-6" aria-live="polite">
          <p className="text-display font-black text-ink sm:text-display">Nothing could be compared</p>
          <p className="mt-3 text-title text-ink">
            This check and {name}&apos;s baseline have no tests in common, so no comparison was
            made. <strong>This is not a &ldquo;no change&rdquo; result.</strong> Have {name} seen by a
            medical professional.
          </p>
        </section>
      ) : outcome.flagged ? (
        /*
          FLAGGED. Deliberately the loudest thing in the app, and THE ONLY PLACE RED APPEARS:
          a solid red field, the biggest type on the screen, and the action first. Note it says what CHANGED — it does not
          say the athlete is concussed, because this app cannot know that.
        */
        <section className="rounded-xl border-4 border-flag bg-flag p-6 text-paper" aria-live="polite">
          <p className="text-meta font-black uppercase tracking-widest">Flagged</p>
          <h2 className="mt-2 text-display font-black leading-tight sm:text-stimulus">
            Significant change from {name}&apos;s baseline
          </h2>
          <p className="mt-4 text-title font-bold sm:text-title">
            Stop activity now and have {name} evaluated by a medical professional.
          </p>
          <p className="mt-3 text-body opacity-95">
            This screen cannot tell you whether {name} has a concussion. It can only tell you
            that something measured differently than it did when they were well — and that is
            reason enough for a trained person to take a look.
          </p>
        </section>
      ) : someUnjudged ? (
        /*
          NOTHING FLAGGED, BUT SOME MEASUREMENTS COULD NOT BE JUDGED AT ALL.

          Its own state, and deliberately closer in weight to the refusal states than to the
          "no change" one. While this battery's thresholds are null, this is the state a normal
          check will land in — so it is the panel most people will actually see, and it must not
          be the comfortable one.

          No green. No checkmark. It does not say "no change detected", because that would claim
          a verdict on measurements that never got one.
        */
        <section className="rounded-xl border-4 border-ink bg-paper p-6" aria-live="polite">
          <p className="text-meta font-black uppercase tracking-widest text-ink-soft">
            No verdict available
          </p>
          <h2 className="mt-2 text-display font-black leading-tight text-ink sm:text-display">
            This screen could not judge {outcome.unevaluated.length === 1 ? 'one of' : 'several of'}{' '}
            {name}&apos;s results.
          </h2>

          <div className="mt-4 space-y-3 text-body text-ink sm:text-title">
            <p className="font-bold">This is not a &ldquo;no change&rdquo; result.</p>
            <p>
              Some of these tests are too new for us to know how much a healthy athlete&apos;s
              score moves around on its own, so we have no tested cut-off to compare against yet.
              Those measurements were recorded and are shown below, but{' '}
              <strong>nothing was decided about them</strong>. Treat them as unread, not as normal.
            </p>
            <ul className="ml-4 list-disc space-y-1 text-body">
              {outcome.unevaluated.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <p className="font-bold">
              Because of that, this screen cannot tell you whether anything has changed. If{' '}
              {name} may have hit their head,{' '}
              <span className="underline decoration-ink decoration-4 underline-offset-4">
                have them seen by a medical professional.
              </span>
            </p>
            <p className="text-ink-soft">
              This screen is not a clearance to return to play, and this does not rule out a
              concussion. Only a medical professional can make that call.
            </p>
          </div>
        </section>
      ) : (
        /*
          NOT FLAGGED, and everything shown was genuinely judged. The three required statements,
          in order, and nothing that could be mistaken for a clearance. No green. No checkmark.
          The panel is deliberately the same sober dark neutral as the rest of the app's serious
          surfaces.
        */
        <section className="rounded-xl border-4 border-ink bg-ink p-6 text-paper" aria-live="polite">
          <p className="text-meta font-black uppercase tracking-widest text-paper/70">
            No change detected
          </p>
          <h2 className="mt-2 text-display font-black leading-tight sm:text-display">
            This screen found no significant change from {name}&apos;s baseline.
          </h2>

          <div className="mt-4 space-y-3 text-body sm:text-title">
            <p className="font-bold">This does not rule out a concussion.</p>
            <p>
              A concussion can be present even when these tests look unchanged, and symptoms
              can take hours to appear. Keep monitoring {name}, and{' '}
              <strong>see a medical professional if anything feels off</strong> — including
              later today or tomorrow.
            </p>
            <p className="text-paper/80">
              This screen is not a clearance to return to play. Only a medical professional
              can make that call.
            </p>
          </div>
        </section>
      )}

      {/* ── Plain-language explanations from the engine ───────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-title font-bold text-ink">What we compared</h2>
        <ul className="mt-4 space-y-3">
          {outcome.explanations.map((line, index) => (
            <li key={index} className="flex gap-3 text-body text-ink sm:text-title">
              <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ink/30" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The numbers ───────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-title font-bold text-ink">Measurement by measurement</h2>

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
                <th scope="col" className="py-3 pr-4 text-meta font-black uppercase tracking-wide">Measurement</th>
                <th scope="col" className="py-3 pr-4 text-meta font-black uppercase tracking-wide">Baseline</th>
                <th scope="col" className="py-3 pr-4 text-meta font-black uppercase tracking-wide">This check</th>
                <th scope="col" className="py-3 pr-4 text-meta font-black uppercase tracking-wide">Change</th>
                <th scope="col" className="py-3 pr-4 text-meta font-black uppercase tracking-wide">Threshold applied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b border-ink/15 ${row.flagged ? 'bg-flag/10' : ''}`}
                >
                  <th scope="row" className="py-4 pr-4 font-semibold text-ink">
                    {row.label}
                    {row.flagged && (
                      <span className="ml-2 rounded bg-flag px-2 py-1 text-meta font-black uppercase text-paper">
                        Flagged
                      </span>
                    )}
                    {/*
                      An unjudged row shows a real change with no verdict. Without this badge it
                      would look exactly like a row that was checked and found unremarkable.
                    */}
                    {row.unevaluated && (
                      <span className="ml-2 rounded border-2 border-ink px-2 py-1 text-meta font-black uppercase text-ink">
                        Not judged
                      </span>
                    )}
                  </th>
                  <td className="tabular py-4 pr-4 text-ink-soft">{row.baselineText}</td>
                  <td className="tabular py-4 pr-4 font-bold text-ink">{row.checkText}</td>
                  <td className={`tabular py-4 pr-4 font-bold ${row.flagged ? 'text-flag' : 'text-ink-soft'}`}>
                    {row.differenceText}
                  </td>
                  <td className="py-4 pr-4 text-meta text-ink-soft">{row.thresholdText}</td>
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
                  <span className="shrink-0 rounded bg-flag px-2 py-1 text-meta font-black uppercase text-paper">
                    Flagged
                  </span>
                )}
                {row.unevaluated && (
                  <span className="shrink-0 rounded border-2 border-ink px-2 py-1 text-meta font-black uppercase text-ink">
                    Not judged
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-meta">
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
        <Notice tone="loud" title="Whatever this screen says, get a professional opinion">
          This app is a screening aid built by high school students. It cannot diagnose a
          concussion and it cannot clear anyone to return to play. If there is any chance{' '}
          {name} hit their head, have a medical professional evaluate them. If you are worried
          about their condition at any point, seek emergency care.
        </Notice>

        <ThresholdDisclaimer />
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {athlete && <ButtonLink href={`/athletes/${athlete.id}`}>Back to {athlete.name}</ButtonLink>}
        <ButtonLink href="/athletes" variant="secondary">
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
          className="mb-4 inline-flex items-center gap-1 text-meta font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          <span aria-hidden="true">←</span> Back
        </Link>
      )}
      <h1 className="text-display font-bold tracking-tight text-ink sm:text-display">{title}</h1>
      {subtitle && <p className="mt-2 text-body text-ink-soft">{subtitle}</p>}
    </header>
  );
}
