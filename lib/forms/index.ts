// lib/forms/index.ts
//
// One front door for the stimulus pools, plus the rule for choosing which form an athlete gets.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THERE ARE MULTIPLE FORMS AT ALL
// ═════════════════════════════════════════════════════════════════════════════════════
// The memory modules can only be given to the same person once with honest results. Show an
// athlete the same ten words at their baseline in August and again after a hit in October and
// the second score is partly "how well do I remember August", which has nothing to do with the
// hit. That practice effect works in the dangerous direction for this app: it inflates the
// later score, making a struggling athlete look unchanged.
//
// So each module has six interchangeable forms and a sitting uses a different one from the
// sitting before it. That is the whole reason this file exists.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THE CHOICE IS DETERMINISTIC AND NOT RANDOM
// ═════════════════════════════════════════════════════════════════════════════════════
// Three reasons, in order of how much they matter:
//
//   1. A saved result has to stay readable. The form id is stored on the record, but a screen
//      re-opened later must be able to recompute the same choice without depending on stored
//      state that might be missing.
//   2. It is testable. A random pick can only be tested statistically; a deterministic one can
//      be asserted exactly, which is what select.test.ts does.
//   3. Random picking would sometimes hand an athlete the same form twice in a row, which is
//      precisely the thing forms exist to prevent.

import { WORD_FORMS } from './wordLists';
import { DIGIT_FORMS } from './digitSequences';
import { PATTERN_FORMS } from './patternGrids';
import { GO_NO_FORMS } from './goNo';

export {
  WORD_FORMS,
  WORDS_PER_FORM,
  RECOGNITION_GRID_SIZE,
  type WordForm,
} from './wordLists';

export {
  DIGIT_FORMS,
  DIGIT_TRIALS_PER_FORM,
  DIGIT_TRIAL_LENGTHS,
  type DigitForm,
} from './digitSequences';

export {
  PATTERN_FORMS,
  PATTERN_TRIALS_PER_FORM,
  PATTERN_TRIAL_LENGTHS,
  PATTERN_GRID_COLUMNS,
  PATTERN_GRID_ROWS,
  PATTERN_GRID_SIZE,
  type PatternForm,
} from './patternGrids';

export {
  GO_NO_FORMS,
  GO_NO_TRIALS_PER_FORM,
  GO_NO_NOGO_PER_FORM,
  GO_NO_LEAD_IN_GO_TRIALS,
  type GoNoForm,
  type GoNoTrial,
} from './goNo';

/** Anything with a stable id can be picked from. Keeps the helpers below pool-agnostic. */
type Identified = { id: string };

/** Thrown when asked to pick from a pool that has nothing in it. */
export class EmptyFormPoolError extends Error {
  constructor() {
    super(
      'Asked to choose a test form from an empty pool. A test cannot be presented without ' +
        'stimuli, and inventing some on the spot would produce a score that is not comparable ' +
        'with any other sitting.',
    );
    this.name = 'EmptyFormPoolError';
  }
}

/**
 * Choose a form from a pool, deterministically, from an arbitrary seed string.
 *
 * Same seed always gives the same form. Different seeds spread across the pool.
 *
 * THROWS on an empty pool rather than returning undefined. A caller that got `undefined` here
 * would most likely go on to render a test with no stimuli in it and save whatever the athlete
 * did with it, and a score from a test that did not really happen is worse than a crash.
 */
export function pickForm<T extends Identified>(forms: readonly T[], seed: string): T {
  if (forms.length === 0) throw new EmptyFormPoolError();

  return forms[hashString(seed) % forms.length];
}

/**
 * Choose the form for one athlete's Nth sitting, guaranteeing consecutive sittings differ.
 *
 * This is the one the module screens should use.
 *
 * HOW IT WORKS, and why it is not just pickForm with a combined seed: the athlete's id decides
 * where in the pool they START, and the sitting number then walks forward one step at a time.
 * Because it steps rather than re-hashes, sitting 4 and sitting 5 can never land on the same
 * form — which a hash of "athlete:4" versus "athlete:5" absolutely could, since two different
 * strings often hash into the same bucket. Getting the same word list twice in a row is the
 * exact failure forms exist to prevent, so it is worth being certain rather than probably fine.
 *
 * Two different athletes starting at different points also means they are rarely on the same
 * form on the same day, which keeps them from comparing answers with each other.
 *
 * @param sittingIndex How many sittings this athlete has already completed. Negative values are
 *                     treated as zero rather than throwing — a miscounted sitting should give a
 *                     usable test, not a crashed screen on a sideline.
 */
export function pickFormBySitting<T extends Identified>(
  forms: readonly T[],
  athleteId: string,
  sittingIndex: number,
): T {
  if (forms.length === 0) throw new EmptyFormPoolError();

  const start = hashString(athleteId);
  const step = Math.max(0, Math.floor(sittingIndex));

  return forms[(start + step) % forms.length];
}

/** Look a form up by the id stored on a saved result, or null if the pool no longer has it. */
export function findFormById<T extends Identified>(forms: readonly T[], id: string): T | null {
  return forms.find((form) => form.id === id) ?? null;
}

/**
 * A small, boring string hash (the FNV-1a algorithm).
 *
 * We only need "same string in, same number out, spread reasonably across the pool" — this is
 * not security and it is not cryptography. FNV-1a is about four lines, has no dependencies, and
 * is easy to explain out loud, which matters more here than sophistication.
 *
 * The `>>> 0` keeps the value an unsigned 32-bit integer. Without it JavaScript's bitwise
 * operators would let the number go negative, and a negative index modulo the pool length is
 * also negative, which would index off the front of the array and return undefined.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0; // multiply by the FNV prime, stay unsigned
  }

  return hash >>> 0;
}

/**
 * Every pool in one place, so a test can assert the shared construction rules across all of
 * them without importing each file separately.
 */
export const ALL_FORM_POOLS = {
  words: WORD_FORMS,
  digits: DIGIT_FORMS,
  pattern: PATTERN_FORMS,
  goNo: GO_NO_FORMS,
} as const;
