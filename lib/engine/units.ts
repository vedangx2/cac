// lib/engine/units.ts
//
// How measurements are turned into words. Shared by the engine's explanations and the
// results table so the two can never word the same number differently.
//
// ── THE ROUNDING PROBLEM THIS FILE EXISTS TO SOLVE ──────────────────────────────────────
// Scan times are stored in milliseconds and displayed in seconds to one decimal place. If we
// round each number on its own, the arithmetic on screen stops working:
//
//     baseline 411 ms  → "0.4 s"
//     check    561 ms  → "0.6 s"
//     raw difference 150 ms → "0.1 s"
//
// A parent reads "0.6 versus 0.4" and gets 0.2, but we printed 0.1. Nothing is actually
// wrong, but a result screen whose numbers appear not to add up is a result screen nobody
// should trust — and trust is the whole product here.
//
// So the DISPLAYED difference is computed from the same rounded values the reader can see.
// The engine's flag decision still uses the exact raw milliseconds, because that is the
// honest comparison; only the wording is reconciled.

/** Whole milliseconds, e.g. "251 ms". */
export function msText(value: number): string {
  return `${Math.round(value)} ms`;
}

/**
 * Seconds to one decimal, e.g. "5.5 s".
 *
 * Note it snaps to 100ms with Math.round BEFORE formatting rather than letting toFixed(1) do
 * the rounding. Those two disagree at exact half-way points: 1050ms is 1.05 in seconds, but
 * binary floating point stores that as very slightly less than 1.05, so toFixed(1) gives
 * "1.0" while Math.round(1050/100) gives 11 → "1.1". Using one rounding rule everywhere is
 * what keeps a displayed difference equal to the difference of the displayed values.
 */
export function secondsText(value: number): string {
  return `${(toDisplayedPrecision(value) / 1000).toFixed(1)} s`;
}

/** Round to the same 0.1s precision the reader sees, so displayed maths is consistent. */
function toDisplayedPrecision(ms: number): number {
  return Math.round(ms / 100) * 100;
}

/**
 * The difference between two millisecond values, snapped to the precision we display, so
 * "0.6 s versus 0.4 s" always reports "0.2 s" and never "0.1 s".
 */
export function displayedSecondsDifference(baselineMs: number, checkMs: number): number {
  return toDisplayedPrecision(checkMs) - toDisplayedPrecision(baselineMs);
}

/** "5 points" / "1 point". */
export function pointsText(value: number): string {
  return `${value} ${Math.abs(value) === 1 ? 'point' : 'points'}`;
}
