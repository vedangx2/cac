'use client';

// app/tools/calibration/page.tsx
//
// THRESHOLD CALIBRATION — a development tool. Not part of the app, not linked from anywhere, and
// not available in a production build.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THIS PAGE EXISTS
// ═════════════════════════════════════════════════════════════════════════════════════
// Every threshold in this app is `null` because nobody has collected the data yet, and a
// threshold may never be guessed. But the machinery that turns collected data INTO a threshold
// can be built before the data arrives — so the day real measurements exist, the answer falls out
// of them the same afternoon instead of a fortnight later.
//
// Paste repeated healthy measurements in, say how much slowing (or how many fewer trials) you
// want to be able to detect, and this page invents thousands of athletes with those properties,
// pushes every one through the REAL comparison engine, and shows you the whole tradeoff curve
// instead of picking a number for you.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PAGE MUST NEVER DO, AND DOES NOT
// ═════════════════════════════════════════════════════════════════════════════════════
//   • It writes NOTHING. Not to thresholds.ts, not to IndexedDB, not to sessionStorage. It is
//     arithmetic on screen. Every threshold stays null until a human types one in by hand after
//     looking at a curve.
//   • It never says what a threshold should be. It shows the tradeoff and stops. Choosing the
//     balance between missing a concussion and crying wolf is not a decision code gets to make.
//   • It says on every screenful that the output is a simulation. A false-positive rate here is a
//     property of the MODEL you fed it — not evidence about concussion, and not a measurement of
//     anybody.
//
// It is deliberately gated out of production builds. A page full of percentages about "false
// negative rates" is exactly the sort of thing that gets screenshotted and mistaken for clinical
// evidence, and it has no business being reachable by anyone but us.

import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Notice, PageHeader, PageShell } from '@/components/ui';
import {
  CALIBRATED_MEASUREMENTS,
  type CalibratedMeasurement,
  DEFAULT_PAIRS,
  type Degradations,
  MEASUREMENT_SHAPES,
  type NoiseProfiles,
  PLACEHOLDER_LABEL,
  PLACEHOLDER_PROFILES,
  type RuleResult,
  type SampleSet,
  type ThresholdPoint,
  type ThresholdSet,
  compareFlagRules,
  crossCheck,
  defaultThresholdCandidates,
  generateSamples,
  parseSeries,
  profileFromSeries,
  sweepMeasurement,
  unjudgedMeasurements,
} from '@/lib/calibration';

/** What the person typed into one measurement's row. All strings — parsed only when we run. */
type MeasurementInput = {
  pasted: string;
  degradation: string;
  threshold: string;
};

type RunOutput = {
  samples: SampleSet;
  curve: ThresholdPoint[];
  focus: CalibratedMeasurement;
  rules: RuleResult[];
  thresholds: ThresholdSet;
  usedRealData: CalibratedMeasurement[];
  unjudged: CalibratedMeasurement[];
};

const EMPTY_INPUT: MeasurementInput = { pasted: '', degradation: '', threshold: '' };

function emptyInputs(): Record<CalibratedMeasurement, MeasurementInput> {
  const inputs = {} as Record<CalibratedMeasurement, MeasurementInput>;
  for (const measurement of CALIBRATED_MEASUREMENTS) inputs[measurement] = { ...EMPTY_INPUT };
  return inputs;
}

/** Percentages, to one decimal. Null means "we cannot answer that", which is never 0%. */
function percent(rate: number | null): string {
  if (rate === null) return 'not answerable';
  return `${(rate * 100).toFixed(1)}%`;
}

export default function CalibrationPage() {
  // Gated at build time. In a production bundle this branch is all that remains.
  if (process.env.NODE_ENV === 'production') {
    return (
      <PageShell>
        <PageHeader
          title="Calibration harness"
          subtitle="This is a development tool and is not available in a deployed build."
        />
        <Notice title="Not available here">
          The threshold calibration harness runs a simulation and prints error rates. Those numbers
          describe a made-up model, not real athletes, so the page is deliberately kept out of any
          build that a person who is not us could reach. Run the app locally to use it.
        </Notice>
      </PageShell>
    );
  }

  return <CalibrationTool />;
}

function CalibrationTool() {
  const [inputs, setInputs] = useState(emptyInputs);
  const [pairsText, setPairsText] = useState(String(DEFAULT_PAIRS));
  const [seedText, setSeedText] = useState('1');
  const [focus, setFocus] = useState<CalibratedMeasurement>('goNoGoMedianMs');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<RunOutput | null>(null);

  const update = useCallback(
    (measurement: CalibratedMeasurement, field: keyof MeasurementInput, value: string) => {
      setInputs((current) => ({
        ...current,
        [measurement]: { ...current[measurement], [field]: value },
      }));
    },
    [],
  );

  /**
   * Which measurements the pasted numbers actually cover.
   *
   * Shown in the output beside every rate, because a curve built entirely from the placeholder
   * profile looks exactly as convincing as one built from real data, and the difference is the
   * only thing that decides whether it means anything.
   */
  const realDataMeasurements = useMemo(
    () => CALIBRATED_MEASUREMENTS.filter((m) => parseSeries(inputs[m].pasted).values.length > 0),
    [inputs],
  );

  const run = () => {
    setRunning(true);

    // Let the browser paint the "running" state before we occupy the main thread for a second.
    setTimeout(() => {
      const profiles = { ...PLACEHOLDER_PROFILES } as NoiseProfiles;
      const degradations: Degradations = {};
      const thresholds: ThresholdSet = {};

      for (const measurement of CALIBRATED_MEASUREMENTS) {
        const input = inputs[measurement];

        const series = parseSeries(input.pasted, measurement);
        if (series.values.length > 0) {
          profiles[measurement] = profileFromSeries(series, PLACEHOLDER_PROFILES[measurement]);
        }

        const degradation = Number(input.degradation);
        if (input.degradation.trim() !== '' && Number.isFinite(degradation) && degradation > 0) {
          degradations[measurement] = degradation;
        }

        const threshold = Number(input.threshold);
        if (input.threshold.trim() !== '' && Number.isFinite(threshold)) {
          thresholds[measurement] = threshold;
        }
      }

      const pairs = Math.max(1, Math.min(50_000, Number(pairsText) || DEFAULT_PAIRS));
      const seed = Number(seedText) || 1;

      const samples = generateSamples({ profiles, degradations, pairs, seed });
      const candidates = defaultThresholdCandidates(samples, focus);

      setOutput({
        samples,
        focus,
        curve: sweepMeasurement(samples, focus, candidates, degradations),
        rules: compareFlagRules(samples, thresholds, degradations),
        thresholds,
        usedRealData: realDataMeasurements,
        unjudged: unjudgedMeasurements(thresholds),
      });
      setRunning(false);
    }, 0);
  };

  const check = output ? crossCheck(output.samples) : null;

  return (
    <PageShell>
      <PageHeader
        title="Threshold calibration harness"
        subtitle="Development tool. Simulates athletes, drives the real comparison engine, and shows what each candidate threshold would get wrong."
      />

      {/*
        First thing on the page, before any number. Anybody who lands here has to understand
        immediately that everything below is arithmetic about invented athletes.
      */}
      <Notice tone="flag" title="Everything on this page is a simulation">
        The athletes below do not exist. The numbers are generated from a statistical model that
        somebody typed in, run through the real comparison engine, and counted.{' '}
        <strong>
          Nothing here is evidence about concussion, about any real athlete, or about what a
          threshold should be.
        </strong>{' '}
        If the model is wrong, the curve is wrong in exactly the same way and will look just as
        convincing. This page writes nothing — every threshold in the app stays unset until a human
        types one in after looking at a curve.
      </Notice>

      {/* ── How to use it ────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-2xl font-bold tracking-tight text-ink">What to paste</h2>
        <div className="mt-3 max-w-3xl space-y-3 text-base leading-relaxed text-ink-soft">
          <p>
            For each measurement, paste repeated readings from{' '}
            <strong className="text-ink">healthy</strong> people taken days apart — the same thing{' '}
            <code className="text-ink">/tools/noise-floor</code> collects. How much those readings
            move on their own is the only thing that decides how often a threshold will flag
            somebody who is fine.
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong className="text-ink">One number per line</strong> — repeated sittings by the
              same person.
            </li>
            <li>
              <strong className="text-ink">Two numbers per line</strong> — a baseline and a retest
              from one person, one pair per line. Better if you have it: pairs separate one person
              wobbling from different people differing, and only the first of those matters here.
            </li>
          </ul>
          <p>
            Blank lines and anything after a <code className="text-ink">#</code> are ignored. A
            measurement you leave blank falls back to the {PLACEHOLDER_LABEL.toLowerCase()}, and the
            output says so.
          </p>
          <p>
            <strong className="text-ink">Degradation is yours to choose and has no default.</strong>{' '}
            It is how much worse an impaired athlete is, in that measurement&apos;s own units, always
            a positive number — 60 for &ldquo;60 ms slower&rdquo;, 2 for &ldquo;2 fewer trials
            correct&rdquo;. Leave it blank and the harness will refuse to report a miss rate for
            that measurement rather than assume an effect size.
          </p>
        </div>
      </section>

      {/* ── Run controls ─────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-bold text-ink">Simulated athletes of each kind</span>
              <input
                type="number"
                value={pairsText}
                onChange={(event) => setPairsText(event.target.value)}
                className="mt-2 block min-h-14 w-full rounded-xl border-2 border-line-strong bg-paper px-4 text-base text-ink"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-ink">Seed</span>
              <input
                type="number"
                value={seedText}
                onChange={(event) => setSeedText(event.target.value)}
                className="mt-2 block min-h-14 w-full rounded-xl border-2 border-line-strong bg-paper px-4 text-base text-ink"
              />
              <span className="mt-1 block text-xs text-ink-soft">
                Same seed, same numbers. Change it to see whether a result is real or noise.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-ink">Curve for</span>
              <select
                value={focus}
                onChange={(event) => setFocus(event.target.value as CalibratedMeasurement)}
                className="mt-2 block min-h-14 w-full rounded-xl border-2 border-line-strong bg-paper px-4 text-base text-ink"
              >
                {CALIBRATED_MEASUREMENTS.map((measurement) => (
                  <option key={measurement} value={measurement}>
                    {MEASUREMENT_SHAPES[measurement].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button className="mt-5" onClick={run} disabled={running}>
            {running ? 'Running…' : 'Run simulation'}
          </Button>
        </Card>
      </section>

      {/* ── The per-measurement inputs ───────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-2xl font-bold tracking-tight text-ink">Your measurements</h2>
        <div className="mt-4 space-y-4">
          {CALIBRATED_MEASUREMENTS.map((measurement) => {
            const shape = MEASUREMENT_SHAPES[measurement];
            const series = parseSeries(inputs[measurement].pasted, measurement);
            const hasData = series.values.length > 0;

            return (
              <Card key={measurement}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-ink">{shape.label}</h3>
                  <p className="text-sm text-ink-soft">
                    {shape.unit} ·{' '}
                    {hasData ? (
                      <strong className="text-ink">
                        {series.values.length} values pasted
                        {series.pairs.length > 0 ? ` (${series.pairs.length} pairs)` : ''}
                      </strong>
                    ) : (
                      <span>using the placeholder profile</span>
                    )}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <label className="block">
                    <span className="text-sm font-bold text-ink">
                      Repeated healthy readings
                    </span>
                    <textarea
                      value={inputs[measurement].pasted}
                      onChange={(event) => update(measurement, 'pasted', event.target.value)}
                      rows={4}
                      spellCheck={false}
                      placeholder={'412\n398\n431\n405'}
                      className="tabular mt-2 block w-full rounded-xl border-2 border-line-strong bg-paper p-3 text-base text-ink"
                    />
                  </label>

                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-sm font-bold text-ink">
                        Degradation to detect ({shape.unit.replace(/^out of \d+$/, 'units')})
                      </span>
                      <input
                        type="number"
                        value={inputs[measurement].degradation}
                        onChange={(event) => update(measurement, 'degradation', event.target.value)}
                        placeholder="your choice"
                        className="mt-2 block min-h-14 w-full rounded-xl border-2 border-line-strong bg-paper px-4 text-base text-ink"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-bold text-ink">
                        Candidate threshold (for the rule comparison)
                      </span>
                      <input
                        type="number"
                        value={inputs[measurement].threshold}
                        onChange={(event) => update(measurement, 'threshold', event.target.value)}
                        placeholder="leave blank = not judged"
                        className="mt-2 block min-h-14 w-full rounded-xl border-2 border-line-strong bg-paper px-4 text-base text-ink"
                      />
                    </label>
                  </div>
                </div>

                {hasData && (
                  <dl className="tabular mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
                    <div>
                      <dt className="inline font-bold text-ink">Mean </dt>
                      <dd className="inline">{series.mean.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold text-ink">Spread of values </dt>
                      <dd className="inline">{series.standardDeviation.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold text-ink">Within one athlete </dt>
                      <dd className="inline">
                        {series.withinAthleteSd === null
                          ? 'not separable from unpaired data'
                          : series.withinAthleteSd.toFixed(2)}
                      </dd>
                    </div>
                  </dl>
                )}

                {series.problems.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-ink">
                    {series.problems.map((problem) => (
                      <li key={problem}>• {problem}</li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Results ──────────────────────────────────────────────────────────────── */}
      {output && check && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Results</h2>

          {!check.ok && (
            <div className="mt-4">
              <Notice tone="flag" title="This run is not trustworthy">
                {check.refusedByEngine > 0 && (
                  <p>
                    The engine refused {check.refusedByEngine} of the generated pairs, so those
                    athletes are not ones the app would ever have judged.
                  </p>
                )}
                {check.disagreements > 0 && (
                  <p>
                    On {check.disagreements} pairs this harness disagreed with the real engine about
                    the symptom module. That means the harness has drifted away from the engine and
                    every number below describes something other than the app. Fix that before
                    reading any of it.
                  </p>
                )}
              </Notice>
            </div>
          )}

          <Card className="mt-4">
            <p className="text-base leading-relaxed text-ink-soft">
              {output.samples.healthy.length.toLocaleString()} healthy athletes and{' '}
              {output.samples.impaired.length.toLocaleString()} impaired athletes, seed{' '}
              {output.samples.seed}. Every pair was run through the real comparison engine, and this
              harness&apos;s symptom verdict matched the engine&apos;s on{' '}
              {check.disagreements === 0 ? 'all of them' : `all but ${check.disagreements}`}.
            </p>
            <p className="mt-3 text-base leading-relaxed text-ink-soft">
              Profiles came from your pasted numbers for{' '}
              <strong className="text-ink">
                {output.usedRealData.length === 0
                  ? 'no measurements'
                  : output.usedRealData
                      .map((m) => MEASUREMENT_SHAPES[m].label)
                      .join(', ')}
              </strong>
              . Everything else used the {PLACEHOLDER_LABEL.toLowerCase()}, so any curve for those is
              about invented numbers.
            </p>
          </Card>

          {/* The curve */}
          <h3 className="mt-8 text-xl font-bold text-ink">
            {MEASUREMENT_SHAPES[output.focus].label} — the whole tradeoff
          </h3>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink-soft">
            Read down the table, not across to a winner. A lower threshold catches more but flags
            more healthy athletes; a higher one flags fewer and misses more. Where to sit on that
            line is a judgement about consequences, and this page does not make it.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-line-strong text-sm uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4 font-bold">Threshold</th>
                  <th className="py-2 pr-4 font-bold">Flags a healthy athlete</th>
                  <th className="py-2 pr-4 font-bold">Misses an impaired one</th>
                  <th className="py-2 font-bold">Counts</th>
                </tr>
              </thead>
              <tbody className="tabular text-base">
                {output.curve.map((point) => (
                  <tr key={point.threshold} className="border-b border-line">
                    <td className="py-2 pr-4 font-bold text-ink">{point.threshold}</td>
                    <td className="py-2 pr-4 text-ink">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 rounded-sm bg-ink-soft"
                          style={{ width: `${Math.max(1, point.falsePositiveRate * 120)}px` }}
                        />
                        {percent(point.falsePositiveRate)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-ink">
                      {point.falseNegativeRate === null ? (
                        <span className="text-ink-soft">no degradation given</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="inline-block h-2 rounded-sm bg-line-strong"
                            style={{ width: `${Math.max(1, point.falseNegativeRate * 120)}px` }}
                          />
                          {percent(point.falseNegativeRate)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-sm text-ink-soft">
                      {point.healthyFlagged}/{point.healthyTotal} flagged ·{' '}
                      {point.impairedMissed}/{point.impairedTotal} missed
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The flag rule */}
          <h3 className="mt-10 text-xl font-bold text-ink">
            How the whole screen should decide
          </h3>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-ink-soft">
            The engine flags if <em>any</em> module flags. With ten measurements that is ten
            separate chances to raise a false alarm on an athlete who is fine. These rows use the
            candidate thresholds you typed above; measurements you left blank are not judged at
            all, and a measurement that is not judged can never flag.
          </p>

          {output.unjudged.length > 0 && (
            <div className="mt-4">
              <Notice title="Not everything below is being looked at">
                {output.unjudged.length} of {CALIBRATED_MEASUREMENTS.length} measurements have no
                candidate threshold, so they contribute nothing to these rates:{' '}
                {output.unjudged.map((m) => MEASUREMENT_SHAPES[m].label).join(', ')}. A rule that
                looks reassuringly specific may simply not be looking at much.
              </Notice>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-line-strong text-sm uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4 font-bold">Rule</th>
                  <th className="py-2 pr-4 font-bold">Flags a healthy athlete</th>
                  <th className="py-2 font-bold">Misses an impaired one</th>
                </tr>
              </thead>
              <tbody className="text-base">
                {output.rules.map((result) => (
                  <tr key={result.rule} className="border-b border-line">
                    <td className="py-3 pr-4 text-ink">{result.label}</td>
                    <td className="tabular py-3 pr-4 font-bold text-ink">
                      {percent(result.falsePositiveRate)}
                    </td>
                    <td className="tabular py-3 font-bold text-ink">
                      {percent(result.falseNegativeRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <Notice title="Before you copy a number out of here">
              These rates describe the model above and nothing else. They assume impairment shifts a
              score by a fixed amount and leaves its spread alone, that the two sittings are
              independent draws, and that whatever you pasted is representative of the athletes you
              will actually test. None of those is checked, and none of them is likely to be exactly
              true. Whatever you conclude, a threshold still has to be typed into{' '}
              <code className="text-ink">lib/engine/thresholds.ts</code> by hand, by a person, with
              a comment saying where it came from.
            </Notice>
          </div>
        </section>
      )}
    </PageShell>
  );
}
