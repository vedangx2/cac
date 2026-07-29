// lib/format.ts
//
// Shared display formatting. Kept out of the components so a date looks identical on every
// screen.

/** e.g. "12 Oct 2026, 4:31 pm". */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** e.g. "12 Oct 2026". */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Which modules actually got recorded in a sitting.
 *
 * Takes `unknown` per field rather than importing ModuleScores because all it ever does is ask
 * "is there something here?" — it has no business knowing the shape of a score.
 *
 * Go/no-go is included: the module is not built yet, so it will always be null for now, but
 * listing it here means the day the student's screen lands, saved sittings describe themselves
 * correctly with no change to this file.
 */
export function completedModules(scores: {
  symptom: unknown;
  wordLearning: unknown;
  wordRecognition: unknown;
  digitSpan: unknown;
  patternSpan: unknown;
  goNoGo: unknown;
}): string[] {
  const done: string[] = [];
  if (scores.symptom) done.push('Symptoms');
  if (scores.wordLearning) done.push('Word learning');
  if (scores.digitSpan) done.push('Numbers backwards');
  if (scores.patternSpan) done.push('Tapped patterns');
  if (scores.wordRecognition) done.push('Word recall');
  if (scores.goNoGo) done.push('Go / no-go');
  return done;
}
