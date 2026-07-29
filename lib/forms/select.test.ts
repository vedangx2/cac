// lib/forms/select.test.ts
//
// Two jobs:
//
//   1. Test form SELECTION — that pickForm is deterministic and that consecutive sittings for
//      one athlete never land on the same form.
//   2. Test the POOLS THEMSELVES against the construction rules written at the top of each
//      pool file.
//
// The second half matters more than it looks. Two of these pools (wordLists.ts and
// digitSequences.ts) are AI-generated stand-ins that the students intend to replace with their
// own, and the other two were written by hand. In both cases the construction rules are the
// only thing making one form comparable with another — a form with a rhyming distractor or a
// countable run of digits is easier than its siblings, and an athlete who happens to get it
// scores higher for a reason that has nothing to do with their head. Comments cannot enforce
// that. These tests can, including against a replacement pool dropped in later.

import { describe, expect, it } from 'vitest';
import {
  ALL_FORM_POOLS,
  DIGIT_FORMS,
  DIGIT_TRIALS_PER_FORM,
  DIGIT_TRIAL_LENGTHS,
  EmptyFormPoolError,
  GO_NO_FORMS,
  GO_NO_LEAD_IN_GO_TRIALS,
  GO_NO_NOGO_PER_FORM,
  GO_NO_TRIALS_PER_FORM,
  PATTERN_FORMS,
  PATTERN_GRID_SIZE,
  PATTERN_TRIALS_PER_FORM,
  PATTERN_TRIAL_LENGTHS,
  RECOGNITION_GRID_SIZE,
  WORDS_PER_FORM,
  WORD_FORMS,
  findFormById,
  pickForm,
  pickFormBySitting,
} from './index';

/* ═══════════════════════════════════════════════════════════════════════════════════
   1. SELECTION
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('pickForm', () => {
  it('is deterministic — the same seed always gives the same form', () => {
    const first = pickForm(WORD_FORMS, 'athlete-1:sitting-3');
    const second = pickForm(WORD_FORMS, 'athlete-1:sitting-3');

    expect(first.id).toBe(second.id);
  });

  it('always returns a form that is actually in the pool', () => {
    const ids = WORD_FORMS.map((form) => form.id);

    for (let index = 0; index < 200; index += 1) {
      expect(ids).toContain(pickForm(WORD_FORMS, `seed-${index}`).id);
    }
  });

  it('spreads across the whole pool rather than favouring one form', () => {
    // Not a statistical claim — just a check that the hash is not degenerate. A hash that
    // returned the same bucket for everything would satisfy every other test in this file.
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      seen.add(pickForm(WORD_FORMS, `athlete-${index}`).id);
    }

    expect(seen.size).toBe(WORD_FORMS.length);
  });

  it('refuses an empty pool instead of returning undefined', () => {
    // A caller handed `undefined` would most likely render a test with no stimuli and then save
    // whatever the athlete did with it. A score from a test that did not really happen is worse
    // than a crash.
    expect(() => pickForm([], 'any-seed')).toThrow(EmptyFormPoolError);
  });

  it('works on every pool, not just words', () => {
    expect(pickForm(DIGIT_FORMS, 'seed').id).toMatch(/^digits-/);
    expect(pickForm(PATTERN_FORMS, 'seed').id).toMatch(/^pattern-/);
    expect(pickForm(GO_NO_FORMS, 'seed').id).toMatch(/^gonogo-/);
  });
});

describe('pickFormBySitting', () => {
  it('is deterministic for the same athlete and sitting', () => {
    expect(pickFormBySitting(WORD_FORMS, 'athlete-1', 2).id).toBe(
      pickFormBySitting(WORD_FORMS, 'athlete-1', 2).id,
    );
  });

  it('NEVER gives the same form on two consecutive sittings', () => {
    // The single most important assertion about selection. Repeating a word list means the
    // second score is partly "how well do I remember last time", and that practice effect
    // inflates the later score — making a struggling athlete look unchanged, which is the
    // dangerous direction for this app to be wrong in.
    for (const athleteId of ['athlete-1', 'athlete-2', 'jordan', '', 'x']) {
      for (let sitting = 0; sitting < 24; sitting += 1) {
        const current = pickFormBySitting(WORD_FORMS, athleteId, sitting);
        const next = pickFormBySitting(WORD_FORMS, athleteId, sitting + 1);

        expect(current.id).not.toBe(next.id);
      }
    }
  });

  it('walks the whole pool before repeating a form', () => {
    const ids = Array.from({ length: WORD_FORMS.length }, (_, sitting) =>
      pickFormBySitting(WORD_FORMS, 'athlete-1', sitting).id,
    );

    expect(new Set(ids).size).toBe(WORD_FORMS.length);
  });

  it('starts different athletes at different points in the rotation', () => {
    const starts = new Set(
      ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'].map(
        (id) => pickFormBySitting(WORD_FORMS, id, 0).id,
      ),
    );

    expect(starts.size).toBeGreaterThan(1);
  });

  it('treats a nonsense sitting index as the first sitting rather than crashing', () => {
    // A miscounted sitting should still give a usable test. Crashing on a sideline because a
    // counter went negative would be a worse outcome than showing form A twice.
    expect(() => pickFormBySitting(WORD_FORMS, 'athlete-1', -5)).not.toThrow();
    expect(pickFormBySitting(WORD_FORMS, 'athlete-1', -5).id).toBe(
      pickFormBySitting(WORD_FORMS, 'athlete-1', 0).id,
    );
  });

  it('refuses an empty pool', () => {
    expect(() => pickFormBySitting([], 'athlete-1', 0)).toThrow(EmptyFormPoolError);
  });
});

describe('findFormById', () => {
  it('finds a form that is in the pool', () => {
    expect(findFormById(WORD_FORMS, 'words-c')?.id).toBe('words-c');
  });

  it('returns null for a form the pool no longer has', () => {
    // This is what happens when a saved record names a form from a replaced pool. The caller
    // has to handle "the words that produced this score are gone" honestly, so it gets null
    // rather than a substitute form that would silently misdescribe the record.
    expect(findFormById(WORD_FORMS, 'words-zzz')).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   2. RULES SHARED BY EVERY POOL
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('every form pool', () => {
  const pools = Object.entries(ALL_FORM_POOLS);

  for (const [name, forms] of pools) {
    describe(name, () => {
      it('has six forms', () => {
        // Six is what the brief specifies for every pool. A replacement pool with a different
        // count is fine in principle, but it should be a deliberate decision that updates this
        // test rather than something nobody notices.
        expect(forms).toHaveLength(6);
      });

      it('has unique ids', () => {
        const ids = forms.map((form) => form.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('uses ids ending in a single letter a-f', () => {
        for (const form of forms) {
          expect(form.id).toMatch(/-[a-f]$/);
        }
      });

      it('is not empty', () => {
        expect(forms.length).toBeGreaterThan(0);
      });
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   3. WORD FORMS
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('word forms', () => {
  it('uses the ids the brief specifies', () => {
    expect(WORD_FORMS.map((f) => f.id)).toEqual([
      'words-a',
      'words-b',
      'words-c',
      'words-d',
      'words-e',
      'words-f',
    ]);
  });

  it('has the declared number of targets and distractors in every form', () => {
    for (const form of WORD_FORMS) {
      expect(form.targets).toHaveLength(WORDS_PER_FORM);
      expect(form.distractors).toHaveLength(WORDS_PER_FORM);
    }
  });

  it('agrees with RECOGNITION_GRID_SIZE', () => {
    for (const form of WORD_FORMS) {
      expect(form.targets.length + form.distractors.length).toBe(RECOGNITION_GRID_SIZE);
    }
  });

  it('never repeats a word inside a form', () => {
    // A word appearing as both a target and a distractor in the same form would be an
    // unanswerable question — it would be scored wrong whichever box the athlete ticked.
    for (const form of WORD_FORMS) {
      const all = [...form.targets, ...form.distractors];
      expect(new Set(all).size, `duplicate inside ${form.id}`).toBe(all.length);
    }
  });

  it('never repeats a word ACROSS forms', () => {
    // Rule 6. Forms have to be independent: if the athlete's baseline form and their check form
    // shared words, the check would be partly a re-test of words they already learned.
    const seen = new Map<string, string>();

    for (const form of WORD_FORMS) {
      for (const word of [...form.targets, ...form.distractors]) {
        const previous = seen.get(word);
        expect(previous, `"${word}" is in both ${previous} and ${form.id}`).toBeUndefined();
        seen.set(word, form.id);
      }
    }
  });

  it('uses plain lowercase single words', () => {
    for (const form of WORD_FORMS) {
      for (const word of [...form.targets, ...form.distractors]) {
        expect(word, `"${word}" in ${form.id}`).toMatch(/^[a-z]+$/);
        expect(word.length, `"${word}" in ${form.id}`).toBeGreaterThan(2);
      }
    }
  });

  it('has no target and distractor in the same form that rhyme', () => {
    // Rule 5, approximated the way it can be checked mechanically: matching final three
    // letters is a decent proxy for an English rhyme ("jacket" / "racket", "fiddle" /
    // "riddle"). A rhyming pair would measure how similar two words SOUND rather than whether
    // the athlete remembers one of them — and the targets may be read aloud on a noisy
    // sideline, where that difference matters most.
    for (const form of WORD_FORMS) {
      for (const target of form.targets) {
        for (const distractor of form.distractors) {
          const rhymes = target.slice(-3) === distractor.slice(-3);
          expect(rhymes, `${target} / ${distractor} rhyme in ${form.id}`).toBe(false);
        }
      }
    }
  });

  it('contains nothing about injury, medicine or the body', () => {
    // Rule 7. A word like "headache" in a concussion screener would plant the very symptom the
    // app is trying to detect. This is a coarse net, but it is the kind of mistake a
    // replacement pool could plausibly make.
    const forbidden =
      /head|brain|neck|blood|hurt|pain|ache|sick|dizzy|nausea|doctor|nurse|injur|concus|bruise|wound|bone/;

    for (const form of WORD_FORMS) {
      for (const word of [...form.targets, ...form.distractors]) {
        expect(forbidden.test(word), `"${word}" in ${form.id}`).toBe(false);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   4. DIGIT FORMS
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('digit forms', () => {
  it('uses the ids the brief specifies', () => {
    expect(DIGIT_FORMS.map((f) => f.id)).toEqual([
      'digits-a',
      'digits-b',
      'digits-c',
      'digits-d',
      'digits-e',
      'digits-f',
    ]);
  });

  it('has nine sequences per form', () => {
    for (const form of DIGIT_FORMS) {
      expect(form.sequences, form.id).toHaveLength(DIGIT_TRIALS_PER_FORM);
    }
  });

  it('follows the declared 3,3,4,4,5,5,6,6,7 ladder exactly', () => {
    for (const form of DIGIT_FORMS) {
      expect(
        form.sequences.map((sequence) => sequence.length),
        form.id,
      ).toEqual([...DIGIT_TRIAL_LENGTHS]);
    }
  });

  it('uses only the digits 1-9', () => {
    // Zero is excluded because it is read aloud two ways ("zero" and "oh"), and a stumble over
    // what to call it would be scored as a memory failure.
    for (const form of DIGIT_FORMS) {
      for (const sequence of form.sequences) {
        for (const digit of sequence) {
          expect(Number.isInteger(digit), `${form.id}: ${sequence}`).toBe(true);
          expect(digit, `${form.id}: ${sequence}`).toBeGreaterThanOrEqual(1);
          expect(digit, `${form.id}: ${sequence}`).toBeLessThanOrEqual(9);
        }
      }
    }
  });

  it('never repeats a digit within a sequence', () => {
    for (const form of DIGIT_FORMS) {
      for (const sequence of form.sequences) {
        expect(new Set(sequence).size, `${form.id}: ${sequence}`).toBe(sequence.length);
      }
    }
  });

  it('contains no three-digit run, ascending or descending', () => {
    // Rule 5. A run like 4-5-6 collapses into one chunk, so a sequence containing one is
    // materially easier than its length claims and is not comparable with the other trials at
    // that length.
    for (const form of DIGIT_FORMS) {
      for (const sequence of form.sequences) {
        for (let i = 0; i + 2 < sequence.length; i += 1) {
          const [a, b, c] = [sequence[i], sequence[i + 1], sequence[i + 2]];
          const ascending = b - a === 1 && c - b === 1;
          const descending = a - b === 1 && b - c === 1;

          expect(ascending || descending, `run at index ${i} in ${form.id}: ${sequence}`).toBe(false);
        }
      }
    }
  });

  it('never repeats a sequence anywhere in the pool', () => {
    const seen = new Map<string, string>();

    for (const form of DIGIT_FORMS) {
      for (const sequence of form.sequences) {
        const key = sequence.join('-');
        const previous = seen.get(key);
        expect(previous, `${key} is in both ${previous} and ${form.id}`).toBeUndefined();
        seen.set(key, form.id);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   5. PATTERN FORMS
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('pattern forms', () => {
  /** The eight straight lines on a 3x3 grid: three rows, three columns, two diagonals. */
  const LINES: readonly (readonly number[])[] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  it('has nine sequences per form on the declared ladder', () => {
    for (const form of PATTERN_FORMS) {
      expect(form.sequences, form.id).toHaveLength(PATTERN_TRIALS_PER_FORM);
      expect(
        form.sequences.map((sequence) => sequence.length),
        form.id,
      ).toEqual([...PATTERN_TRIAL_LENGTHS]);
    }
  });

  it('only ever names a cell that exists on the grid', () => {
    for (const form of PATTERN_FORMS) {
      for (const sequence of form.sequences) {
        for (const cell of sequence) {
          expect(Number.isInteger(cell), `${form.id}: ${sequence}`).toBe(true);
          expect(cell, `${form.id}: ${sequence}`).toBeGreaterThanOrEqual(0);
          expect(cell, `${form.id}: ${sequence}`).toBeLessThan(PATTERN_GRID_SIZE);
        }
      }
    }
  });

  it('never repeats a cell within a sequence', () => {
    for (const form of PATTERN_FORMS) {
      for (const sequence of form.sequences) {
        expect(new Set(sequence).size, `${form.id}: ${sequence}`).toBe(sequence.length);
      }
    }
  });

  it('never puts three consecutive taps on one straight line', () => {
    // Rule 4, the spatial equivalent of the digit no-runs rule. Three cells in a line are
    // remembered as a single stroke ("down the left side"), which makes that trial easier than
    // its length suggests.
    for (const form of PATTERN_FORMS) {
      for (const sequence of form.sequences) {
        for (let i = 0; i + 2 < sequence.length; i += 1) {
          const triple = [sequence[i], sequence[i + 1], sequence[i + 2]];
          const onALine = LINES.some((line) => triple.every((cell) => line.includes(cell)));

          expect(onALine, `line at index ${i} in ${form.id}: ${sequence}`).toBe(false);
        }
      }
    }
  });

  it('never repeats a sequence anywhere in the pool', () => {
    const seen = new Map<string, string>();

    for (const form of PATTERN_FORMS) {
      for (const sequence of form.sequences) {
        const key = sequence.join('-');
        const previous = seen.get(key);
        expect(previous, `${key} is in both ${previous} and ${form.id}`).toBeUndefined();
        seen.set(key, form.id);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   6. GO/NO-GO FORMS

   The pool only. The go/no-go MODULE is not built and must not be built by an AI session —
   a student is writing it by hand. These tests check the stimulus lists are well formed so
   that they are ready when it is.
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('go/no-go forms', () => {
  it('has the same number of trials in every form', () => {
    for (const form of GO_NO_FORMS) {
      expect(form.trials, form.id).toHaveLength(GO_NO_TRIALS_PER_FORM);
    }
  });

  it('has the same number of no-go trials in every form', () => {
    // Error counts are only comparable between two sittings if the chances to err were equal.
    for (const form of GO_NO_FORMS) {
      const nogo = form.trials.filter((trial) => trial === 'nogo');
      expect(nogo, form.id).toHaveLength(GO_NO_NOGO_PER_FORM);
    }
  });

  it('keeps go trials in the clear majority', () => {
    // If no-go trials were common, withholding would stop being effortful and the task would
    // measure nothing in particular.
    for (const form of GO_NO_FORMS) {
      const go = form.trials.filter((trial) => trial === 'go').length;
      expect(go, form.id).toBeGreaterThan(form.trials.length / 2);
    }
  });

  it('opens with the declared run of go trials before the first no-go', () => {
    // The automatic urge to respond has to be built before it can be tested.
    for (const form of GO_NO_FORMS) {
      const leadIn = form.trials.slice(0, GO_NO_LEAD_IN_GO_TRIALS);
      expect(leadIn.every((trial) => trial === 'go'), form.id).toBe(true);
    }
  });

  it('never puts two no-go trials next to each other', () => {
    // Back-to-back no-gos let an athlete settle into not responding, which turns the second one
    // into a free pass.
    for (const form of GO_NO_FORMS) {
      for (let i = 0; i + 1 < form.trials.length; i += 1) {
        const adjacent = form.trials[i] === 'nogo' && form.trials[i + 1] === 'nogo';
        expect(adjacent, `adjacent no-gos at index ${i} in ${form.id}`).toBe(false);
      }
    }
  });

  it('never ends on a no-go trial', () => {
    for (const form of GO_NO_FORMS) {
      expect(form.trials[form.trials.length - 1], form.id).toBe('go');
    }
  });

  it('contains only the two known trial kinds', () => {
    for (const form of GO_NO_FORMS) {
      for (const trial of form.trials) {
        expect(['go', 'nogo']).toContain(trial);
      }
    }
  });

  it('gives every form a distinct no-go pattern', () => {
    const patterns = GO_NO_FORMS.map((form) =>
      form.trials.map((trial) => (trial === 'nogo' ? 'N' : 'G')).join(''),
    );

    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
