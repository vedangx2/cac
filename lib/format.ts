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

/** Which of the three tests actually got recorded in a sitting. */
export function completedModules(scores: {
  symptom: unknown;
  reaction: unknown;
  scan: unknown;
}): string[] {
  const done: string[] = [];
  if (scores.symptom) done.push('Symptoms');
  if (scores.reaction) done.push('Reaction');
  if (scores.scan) done.push('Scan');
  return done;
}
