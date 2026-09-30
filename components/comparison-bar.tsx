'use client';

// components/comparison-bar.tsx
//
// The visual half of the results screen's per-module comparison — CLAUDE.md's Task 3. The
// EXISTING ruled table (app/results/[id]/page.tsx) stays exactly as it was and remains the
// precise, textual record; this is a second, at-a-glance view of the same rows, not a
// replacement. It reads the same `ComparisonRow[]` the table reads (lib/engine/breakdown.ts) —
// there is exactly one place that decides what a baseline, a check and a threshold are, and
// this component draws them, it does not recompute anything.
//
// WHY THIS IS ITS OWN FILE, NOT PART OF components/ui.tsx: the "grow to their values" motion
// (CLAUDE.md's 2026-09-29 motion pass) needs a mount effect, and ui.tsx's whole point is a
// collection of building blocks that need no hooks and so can drop into a server or client
// component either way (see the note at the top of that file) — see components/reveal.tsx for
// the identical reasoning, applied there for the same kind of reason (IntersectionObserver).
//
// A NOTE ON WHAT THE BAR IS AND IS NOT ALLOWED TO SAY (CLAUDE.md → THE HARD RULE):
//   • No green, anywhere. The check bar is ink — the same neutral colour the rest of this
//     screen uses for "no signal" — and turns the flag red ONLY when `row.flagged` is true.
//   • A check that is NUMERICALLY BETTER than baseline gets no positive styling. The bar does
//     not know or care whether a check improved; it draws the same ink colour either way.
//   • A null-threshold (`row.unevaluated`) row draws no cut-off tick and says "Not judged yet"
//     out loud — the whole point of `unevaluated` (see lib/types.ts) is that "we did not look"
//     must never be allowed to render as "we looked and it was fine".

import { useEffect, useState } from 'react';
import type { ComparisonRow } from '@/lib/engine';

/**
 * One row's bar. Two bars share one track: a hollow, full-height outline for the baseline (the
 * reference the athlete is measured against), and a thinner, solid, centred bar drawn on top
 * for the check — the same "target vs. actual" shape as a standard bullet chart. A vertical
 * tick marks the point a change would have had to reach to flag, when a threshold exists.
 *
 * Both bars are scaled to THIS ROW'S OWN range, not a shared scale across every module — the
 * measurements here are not on the same units (points, counts, milliseconds), so a shared scale
 * would make most rows unreadably thin. This mirrors how the existing ruled table already
 * treats each row independently (its own baseline/check/threshold text, no shared column
 * scale), just drawn instead of printed.
 */
export function ComparisonBar({ row }: { row: ComparisonRow }) {
  // Bars start at 0 width and grow to their real value once mounted — CLAUDE.md's motion pass,
  // "about 400ms". The rAF delay (rather than setting `grown` in the same tick) gives the
  // browser one frame to paint the 0%-width state first, so there is something to transition
  // FROM; setting it immediately can otherwise collapse into no visible transition at all.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!row.compared || row.baselineValue === null || row.checkValue === null) {
    return (
      <div className="py-4">
        <p className="text-body text-ink">{row.label}</p>
        <p className="mt-1 text-meta text-ink-secondary">
          Not recorded in one of the two sittings — nothing to compare.
        </p>
      </div>
    );
  }

  const { baselineValue, checkValue, direction, threshold } = row;

  // The point a change would have had to reach to flag, in the same raw units as the values
  // above — null exactly when there is no threshold yet (`row.unevaluated`).
  const worsePoint =
    threshold === null
      ? null
      : direction === 'higher-is-worse'
        ? baselineValue + threshold
        : baselineValue - threshold;

  // This row's own scale. Only the higher-is-worse direction can push the threshold point past
  // both values (lower-is-worse's cut-off is a floor below them, never a ceiling above them),
  // and a small floor keeps a division by zero impossible when every value here is 0.
  const domainMax =
    Math.max(
      baselineValue,
      checkValue,
      direction === 'higher-is-worse' && worsePoint !== null ? worsePoint : 0,
      0.0001,
    ) * 1.15;

  const percent = (value: number) => `${Math.max(0, Math.min(100, (value / domainMax) * 100))}%`;

  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body text-ink">
          {row.label}
          {row.flagged && <span className="ml-2 font-semibold text-flag">flagged</span>}
        </p>
        {row.unevaluated && <p className="text-meta italic text-ink-secondary">Not judged yet</p>}
      </div>

      <div className="relative mt-3 h-6 rounded-full bg-surface" aria-hidden="true">
        {/* Baseline: the full-height, hollow reference bar. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full border-2 border-ink-secondary transition-[width] duration-[400ms] ease-out"
          style={{ width: grown ? percent(baselineValue) : '0%' }}
        />
        {/* Check: the thinner, solid bar on top. Red ONLY when this row actually flagged — see
            the file comment above. Never green, never a "better than baseline" colour. */}
        <div
          className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full transition-[width] duration-[400ms] ease-out ${
            row.flagged ? 'bg-flag' : 'bg-ink'
          }`}
          style={{ width: grown ? percent(checkValue) : '0%' }}
        />
        {/* The cut-off tick. Absent entirely when there is no threshold — a null-threshold row
            must show no band and imply no verdict at all, not even a faint one. */}
        {worsePoint !== null && (
          <div
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: percent(Math.max(0, worsePoint)) }}
          />
        )}
      </div>

      <div className="mt-1 flex items-center justify-between text-meta text-ink-secondary">
        <span>Baseline {row.baselineText}</span>
        <span>Check {row.checkText}</span>
      </div>
    </div>
  );
}

/**
 * The section heading and one-time legend, plus one ComparisonBar per row. A separate export
 * (rather than folding the legend into the results screen directly) so the screen only has to
 * import one thing to get the whole visual comparison, matching how it already imports
 * `ThresholdDisclaimer` as one self-contained block from components/ui.tsx.
 */
export function ComparisonBars({ rows }: { rows: ComparisonRow[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-title font-semibold text-ink">Baseline compared to this check</h2>
      <p className="mt-2 text-meta text-ink-secondary">
        The outline is the baseline. The solid bar is this check. The vertical line is where a
        change would have had to reach to flag, where a cut-off exists yet.
      </p>
      <div className="mt-2 divide-y divide-hairline">
        {rows.map((row) => (
          <ComparisonBar key={row.label} row={row} />
        ))}
      </div>
    </section>
  );
}
