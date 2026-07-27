// lib/stats.ts
//
// One tiny statistics helper, kept separate so the reaction test and the engine can't drift
// apart on what "median" means.

/**
 * The middle value of a list of numbers.
 *
 * WHY the median and not the average, for reaction times: an average is dragged around by a
 * single bad trial. If an athlete gets distracted on one of five taps and posts 900ms, the
 * mean jumps by well over 100ms and we'd flag a perfectly fine athlete. The median just
 * ignores that outlier and reports the middle of the pack, which is a much more honest
 * summary of how fast they actually are.
 *
 * With an even number of values there is no single middle, so we average the two middle
 * ones. (Our reaction test always collects 5, but the helper shouldn't break on 4 or 6.)
 */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error('median() needs at least one value.');
  }

  // Copy before sorting — sort() rearranges the array in place, and silently reordering the
  // caller's trial list (which we display in the order it happened) would be a nasty bug.
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}
