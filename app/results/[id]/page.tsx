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
// • A measurement past its cut-off on a screen the flag rule did NOT flag (one non-symptom
//   module alone — see rule 4 in lib/engine/compare.ts) is its own state too. It must never
//   be folded into "no change detected": the change happened and gets said out loud.

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDeviceData } from '@/components/use-device-data';
import { ButtonLink, Notice, PageShell, ThresholdDisclaimer } from '@/components/ui';
// REPLACED 2026-09-23 — Apple's web design system (see app/globals.css, components/ui.tsx).
// This is a needs-agreement file; the brief that authorised this pass names "results"
// explicitly in its scope, which is the agreement CLAUDE.md asks for — see SESSION-REPORT.md.
// Colours, weights and the verdict headline's size token changed. Every word of copy, the
// branch ordering, and every safety-copy string are byte-for-byte unchanged in this commit —
// a separate, later pass removes em dashes and British spelling (see SESSION-REPORT.md).
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
        <p className="text-title text-ink-secondary">Loading result…</p>
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
        <div className="border-t-2 border-ink pt-6">
          <p className="text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            No comparison was possible
          </p>

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

          <p className="mt-4 text-title font-semibold text-ink">
            This is not a result. It does not mean anything was found, and it does not mean
            nothing is wrong. If {name} may have hit their head,{' '}
            <span className="underline underline-offset-4">
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

        <div className="border-t-2 border-ink pt-6">
          <p className="text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            No comparison was possible
          </p>
          <p className="mt-3 text-title text-ink">{state.message}</p>
          <p className="mt-4 text-title font-semibold text-ink">
            This is not a result. It does not mean anything was found, and it does not mean
            nothing is wrong. If this athlete may have hit their head,{' '}
            <span className="underline underline-offset-4">
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

  /*
    DID SOMETHING CROSS ITS CUT-OFF WITHOUT RAISING THE FLAG?

    Since 2026-09-10 the whole screen flags only on symptoms alone or on two modules together
    (rule 4 in lib/engine/compare.ts). That creates a state that could not exist before: a
    measurement genuinely past its tested cut-off, on a screen whose flag is down. Rendering
    the calm panel over a crossed measurement would be a verdict built on more than we have —
    so it gets its own headline, louder than "no verdict available" and quieter than FLAGGED.
  */
  const crossedRows = rows.filter((row) => row.flagged);
  const belowFlagRule = !outcome.flagged && crossedRows.length > 0;

  return (
    <PageShell>
      <PageHeaderLite
        title="Sideline check result"
        subtitle={`${name} · ${formatDateTime(check.takenAt)} · compared against baseline from ${formatDateTime(baseline.takenAt)}`}
        backHref={athlete ? `/athletes/${athlete.id}` : '/athletes'}
      />

      {/*
        ── THE VERDICT ──────────────────────────────────────────────────────────────
        A ruled section, not a card: a rule above, generous space, no box, no fill except
        for the flagged state's colour — the one place red appears anywhere in this app.
        Every branch's headline reaches text-stimulus on a wide-enough screen, which is
        larger than anything else on this page by a wide margin on purpose: this is the
        one thing the screen exists to say, and the measurement-by-measurement table below
        is small supporting detail, not a second thing competing for the same attention.
      */}
      {nothingCompared ? (
        // Neither sitting has overlapping modules. Loud and distinct from "no change".
        <section className="border-t-2 border-ink pt-6" aria-live="polite">
          <p className="text-meta font-semibold text-ink-secondary">Nothing could be compared</p>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-hero">
            No tests in common with {name}&apos;s baseline
          </h2>
          <p className="mt-4 text-title text-ink">
            This check and {name}&apos;s baseline have no tests in common, so no comparison was
            made. <strong>This is not a &ldquo;no change&rdquo; result.</strong> Have {name} seen by a
            medical professional.
          </p>
        </section>
      ) : outcome.flagged ? (
        /*
          FLAGGED. Deliberately the loudest thing in the app, and THE ONLY PLACE RED APPEARS:
          the largest type on the page, in the one accent colour this app has. Note it says
          what CHANGED — it does not say the athlete is concussed, because this app cannot
          know that.
        */
        <section className="border-t-8 border-flag pt-6" aria-live="polite">
          <p className="text-meta font-semibold text-flag">Flagged</p>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-flag sm:text-hero">
            Significant change from {name}&apos;s baseline
          </h2>
          <p className="mt-4 text-title font-semibold text-ink">
            Stop activity now and have {name} evaluated by a medical professional.
          </p>
          <p className="mt-3 text-body text-ink-secondary">
            This screen cannot tell you whether {name} has a concussion. It can only tell you
            that something measured differently than it did when they were well — and that is
            reason enough for a trained person to take a look.
          </p>
        </section>
      ) : belowFlagRule ? (
        /*
          A MEASUREMENT CROSSED ITS CUT-OFF, BUT THE FLAG RULE WAS NOT MET.

          One non-symptom module alone does not raise the flag (rule 4). The change is still
          real, still shown, and still marked in the table below — this panel exists so the
          headline says so too, instead of the calm panel contradicting a marked row. Ink, not
          red: red stays reserved for the flagged headline itself.

          No green. No checkmark. It does not say "no change detected", because a change WAS
          detected. Every path out still ends with a medical professional.
        */
        <section className="border-t-2 border-ink pt-6" aria-live="polite">
          <p className="text-meta font-semibold text-ink-secondary">Change found — below the flag rule</p>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-hero">
            {crossedRows.length === 1
              ? 'One of the measurements moved past its cut-off.'
              : 'Measurements moved past their cut-off.'}
          </h2>

          <div className="mt-4 space-y-3 text-body text-ink sm:text-title">
            <p className="font-semibold">This is not a &ldquo;no change&rdquo; result.</p>
            <p>
              {crossedRows.map((row) => row.label).join(', ')} changed more than the tested
              cut-off for that measurement, and is marked in the table below. On its own that
              does not raise this screen&apos;s flag — the flag needs a rise in reported
              symptoms, or two or more modules changing together.
            </p>
            {someUnjudged && (
              <p>
                Several other measurements have no tested cut-off yet, so they were recorded
                but <strong>not judged at all</strong> — they are marked &ldquo;not judged&rdquo; below.
                Treat those as unread, not as normal.
              </p>
            )}
            <p className="font-semibold">
              Treat this as a reason to watch {name} closely. If they may have hit their head,{' '}
              <span className="underline underline-offset-4">
                have them seen by a medical professional
              </span>{' '}
              — and if anything feels off at any point, seek care straight away.
            </p>
            <p className="text-ink-secondary">
              This screen is not a clearance to return to play, and it does not rule out a
              concussion. Only a medical professional can make that call.
            </p>
          </div>
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
        <section className="border-t-2 border-ink pt-6" aria-live="polite">
          <p className="text-meta font-semibold text-ink-secondary">No verdict available</p>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-hero">
            This screen could not judge {outcome.unevaluated.length === 1 ? 'one of' : 'several of'}{' '}
            {name}&apos;s results.
          </h2>

          <div className="mt-4 space-y-3 text-body text-ink sm:text-title">
            <p className="font-semibold">This is not a &ldquo;no change&rdquo; result.</p>
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
            <p className="font-semibold">
              Because of that, this screen cannot tell you whether anything has changed. If{' '}
              {name} may have hit their head,{' '}
              <span className="underline underline-offset-4">
                have them seen by a medical professional.
              </span>
            </p>
            <p className="text-ink-secondary">
              This screen is not a clearance to return to play, and this does not rule out a
              concussion. Only a medical professional can make that call.
            </p>
          </div>
        </section>
      ) : (
        /*
          NOT FLAGGED, and everything shown was genuinely judged. The three required statements,
          in order, and nothing that could be mistaken for a clearance. No green. No checkmark.
          Ink on paper, the same ruled treatment as every non-flagged state — there is nothing
          about a "no change" result that deserves a heavier, more alarming surface than a
          refusal gets, and nothing about it that deserves a lighter one either.
        */
        <section className="border-t-2 border-ink pt-6" aria-live="polite">
          <p className="text-meta font-semibold text-ink-secondary">No change detected</p>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-hero">
            This screen found no significant change from {name}&apos;s baseline.
          </h2>

          <div className="mt-4 space-y-3 text-body text-ink sm:text-title">
            <p className="font-semibold">This does not rule out a concussion.</p>
            <p>
              A concussion can be present even when these tests look unchanged, and symptoms
              can take hours to appear. Keep monitoring {name}, and{' '}
              <strong>see a medical professional if anything feels off</strong> — including
              later today or tomorrow.
            </p>
            <p className="text-ink-secondary">
              This screen is not a clearance to return to play. Only a medical professional
              can make that call.
            </p>
          </div>
        </section>
      )}

      {/* ── Plain-language explanations from the engine ───────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-title font-semibold text-ink">What we compared</h2>
        <ul className="mt-4 space-y-2">
          {outcome.explanations.map((line, index) => (
            <li key={index} className="text-body text-ink">
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/*
        ── Measurement by measurement ───────────────────────────────────────────────
        ONE ruled table, one markup, every viewport — replacing the old desktop
        table / mobile card-stack split. Each row is module name (left) and the
        change (right), on the same line, exactly like a lab report's result line;
        baseline, check and the threshold applied move to a smaller line underneath
        the name, the way a report prints a reference range under a result rather
        than in a column of its own competing for width on a phone.

        Deliberately small next to the verdict above: text-body for the name,
        text-meta for the detail line. This is supporting detail, not a second
        headline.
      */}
      <section className="mt-10">
        <h2 className="text-title font-semibold text-ink">Measurement by measurement</h2>

        <table className="mt-4 w-full border-collapse text-left">
          <caption className="sr-only">
            Each measurement&apos;s baseline value, this check&apos;s value, the threshold
            applied, and the change — marked flagged or not judged where that applies.
          </caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-hairline">
                <th scope="row" className="w-full py-4 pr-4 align-top font-normal">
                  <p className="text-body text-ink">
                    {row.label}
                    {row.flagged && <span className="ml-2 font-semibold text-flag">flagged</span>}
                    {/*
                      An unjudged row shows a real change with no verdict. Without this it would
                      read exactly like a row that was checked and found unremarkable.
                    */}
                    {row.unevaluated && (
                      <span className="ml-2 italic text-ink-secondary">not judged</span>
                    )}
                  </p>
                  <p className="mt-1 text-meta text-ink-secondary">
                    {row.baselineText} &rarr; {row.checkText} &middot; {row.thresholdText}
                  </p>
                </th>
                <td
                  className={`tabular whitespace-nowrap py-4 text-right align-top text-body font-semibold ${
                    row.flagged ? 'text-flag' : 'text-ink'
                  }`}
                >
                  {row.differenceText}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-meta font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink"
        >
          <span aria-hidden="true">←</span> Back
        </Link>
      )}
      <h1 className="text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-body text-ink-secondary">{subtitle}</p>}
    </header>
  );
}
