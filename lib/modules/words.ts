// lib/modules/words.ts
//
// The pure parts of the word-learning module, shared by its two screens.
//
// WHY THIS LIVES IN lib/ AND NOT BESIDE THE SCREENS: this project keeps pure logic in lib/ so it
// can be unit-tested with no React and no fake DOM (see vitest.config.ts). The two screens
// (immediate on /tests/words, delayed on
// /tests/words/recall) must score identically and must build their grid identically. If each
// screen carried its own copy, one could drift and the two numbers would stop being comparable
// — which would quietly break the only comparison this module exists to make. Keeping the logic
// here also means it can be unit-tested without rendering anything.

import { type WordForm, RECOGNITION_GRID_SIZE, WORDS_PER_FORM } from '../forms';
import { shuffle } from '../shuffle';

/** One tile in the recognition grid. */
export type GridWord = {
  word: string;
  /** True if this word was actually shown during the study phase. */
  isTarget: boolean;
};

/**
 * How long each word stays on screen during the study phase, in milliseconds.
 *
 * NOT A THRESHOLD, so it does not belong in lib/engine/thresholds.ts — it decides nothing about
 * flagging. It is a presentation parameter, and it lives here beside the screen that uses it.
 *
 * WHY A FIXED EXPOSURE RATHER THAN SELF-PACED: this app compares an athlete's sitting today
 * against their own sitting weeks ago. If the athlete controlled the pace, they could study for
 * thirty seconds at baseline and four seconds at the check, and the drop would measure their
 * patience rather than their memory. A fixed exposure is the only version of this test whose two
 * scores mean the same thing.
 *
 * CHANGED 2026-09-20, from 2000 to 3500 (+1.5s). No real baseline existed on any device yet, so
 * this was the one free moment to move it before a change here would make an old baseline
 * incomparable with a future check — see CURRENT_SCHEMA_VERSION in lib/schema.ts, which was
 * bumped in the same session specifically because this value changed.
 */
export const WORD_EXPOSURE_MS = 3500;

/** A beat of blank screen between words, so two words never blur into one another. */
export const WORD_GAP_MS = 300;

/**
 * Build the recognition grid: every target plus every distractor, in random order.
 *
 * Shuffled because an unshuffled grid would put all ten targets first, and an athlete who
 * noticed that could score full marks without remembering a single word.
 */
export function buildGrid(form: WordForm): GridWord[] {
  return shuffle([
    ...form.targets.map((word) => ({ word, isTarget: true })),
    ...form.distractors.map((word) => ({ word, isTarget: false })),
  ]);
}

export type WordScore = {
  formId: string;
  hits: number;
  falseAlarms: number;
  correct: number;
};

/**
 * Score a set of selections against the form.
 *
 * `hits` are targets the athlete correctly picked. `falseAlarms` are distractors they wrongly
 * picked. `correct` is how many of the twenty tiles they got right overall — the hits plus the
 * distractors they correctly left alone.
 *
 * WHY `correct` IS PLAIN ARITHMETIC and not a corrected-recognition formula: any weighting of
 * hits against false alarms would be a formula we invented, and it would then be doing real work
 * in a comparison we ask people to trust. Hits and false alarms are both stored raw, so anyone
 * analysing the exported data can compute whatever they can actually justify.
 *
 * @param selected The words the athlete ticked. Extra words not in the grid are ignored rather
 *                 than crashing — a stale selection must not lose the whole sitting.
 */
export function scoreSelections(form: WordForm, selected: Iterable<string>): WordScore {
  const targets = new Set(form.targets);
  const distractors = new Set(form.distractors);

  let hits = 0;
  let falseAlarms = 0;

  for (const word of new Set(selected)) {
    if (targets.has(word)) hits += 1;
    else if (distractors.has(word)) falseAlarms += 1;
  }

  // Correct rejections are the distractors left un-ticked.
  const correctRejections = WORDS_PER_FORM - falseAlarms;

  return {
    formId: form.id,
    hits,
    falseAlarms,
    correct: hits + correctRejections,
  };
}

/** The best possible `correct` value, for showing "x out of 20" on screen. */
export const MAX_WORD_CORRECT = RECOGNITION_GRID_SIZE;
