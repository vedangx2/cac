// lib/modules/words.test.ts
//
// Tests for the word module's pure logic — grid construction and scoring.
//
// The scoring is shared by both halves of the module (immediate and delayed) precisely so the two
// numbers stay comparable. That makes it worth testing directly: if scoring drifted between the
// two screens the comparison the module exists for would quietly stop meaning anything.

import { describe, expect, it } from 'vitest';
import { RECOGNITION_GRID_SIZE, WORDS_PER_FORM, WORD_FORMS, type WordForm } from '../forms';
import { MAX_WORD_CORRECT, buildGrid, scoreSelections } from './words';

const FORM: WordForm = WORD_FORMS[0];

describe('buildGrid', () => {
  it('contains every target and every distractor', () => {
    const grid = buildGrid(FORM, 'seed-a');
    const words = grid.map((tile) => tile.word);

    for (const target of FORM.targets) expect(words).toContain(target);
    for (const distractor of FORM.distractors) expect(words).toContain(distractor);
  });

  it('is exactly the declared grid size', () => {
    expect(buildGrid(FORM, 'seed-a')).toHaveLength(RECOGNITION_GRID_SIZE);
  });

  it('marks targets and distractors correctly', () => {
    for (const tile of buildGrid(FORM, 'seed-a')) {
      expect(tile.isTarget).toBe(FORM.targets.includes(tile.word));
    }
  });

  it('shuffles, so the targets are not simply the first ten tiles', () => {
    // An unshuffled grid would let an athlete score full marks by noticing the layout rather than
    // remembering a word. Check several different seeds because one shuffle can coincidentally
    // look sorted.
    const attempts = Array.from({ length: 20 }, (_, index) =>
      buildGrid(FORM, `seed-${index}`)
        .slice(0, WORDS_PER_FORM)
        .every((tile) => tile.isTarget),
    );

    expect(attempts.some((allTargetsFirst) => !allTargetsFirst)).toBe(true);
  });

  /*
    THE REGRESSION THIS GUARDS AGAINST (fixed 2026-09-27): buildGrid used to shuffle with
    Math.random(), so calling it twice — once on the server, once again when the client hydrated
    — produced two different tile orders for the identical form. React caught the mismatch and
    discarded the server-rendered tree, but for a moment the wrong order was on screen and
    interactive: an athlete tapping a tile by its position could have the tap land on a different
    word than the one shown there once the client's render won. The fix makes the shuffle a pure
    function of `form` and `seed` — same two inputs, same order, forever — which is what these
    tests actually check, not "it looks shuffled."
  */
  describe('order stability across repeated calls — the 2026-09-27 hydration fix', () => {
    it('gives the same form and seed the same tile order, every time', () => {
      const first = buildGrid(FORM, 'athlete-1:1700000000000:study-grid');
      for (let attempt = 0; attempt < 20; attempt++) {
        expect(buildGrid(FORM, 'athlete-1:1700000000000:study-grid')).toEqual(first);
      }
    });

    it('gives the study grid and the recall grid different orders for the same sitting', () => {
      // The two screens derive their seed from the same base (see app/tests/words/page.tsx and
      // app/tests/words/recall/page.tsx) but append different suffixes. If they ever collapsed
      // onto the same seed, an athlete could recall a tile's POSITION from the study screen
      // instead of the word that was on it, since both grids hold the same twenty words.
      const studyGrid = buildGrid(FORM, 'athlete-1:1700000000000:study-grid');
      const recallGrid = buildGrid(FORM, 'athlete-1:1700000000000:recall-grid');

      expect(studyGrid.map((tile) => tile.word)).not.toEqual(recallGrid.map((tile) => tile.word));
    });

    it('gives two different sittings different orders even on the same form', () => {
      const sittingOne = buildGrid(FORM, 'athlete-1:1700000000000:study-grid');
      const sittingTwo = buildGrid(FORM, 'athlete-1:1800000000000:study-grid');

      expect(sittingOne.map((tile) => tile.word)).not.toEqual(sittingTwo.map((tile) => tile.word));
    });
  });
});

describe('scoreSelections', () => {
  it('scores a perfect answer as full marks', () => {
    const score = scoreSelections(FORM, FORM.targets);

    expect(score.hits).toBe(WORDS_PER_FORM);
    expect(score.falseAlarms).toBe(0);
    expect(score.correct).toBe(MAX_WORD_CORRECT);
  });

  it('scores picking nothing as every distractor correctly rejected and no hits', () => {
    // Deliberately NOT zero. Leaving all twenty alone means the athlete got the ten distractors
    // right, and the arithmetic has to say so — otherwise "picked nothing" and "picked everything
    // wrong" would score the same, which they are not.
    const score = scoreSelections(FORM, []);

    expect(score.hits).toBe(0);
    expect(score.falseAlarms).toBe(0);
    expect(score.correct).toBe(WORDS_PER_FORM);
  });

  it('scores picking everything as all hits but all false alarms too', () => {
    const score = scoreSelections(FORM, [...FORM.targets, ...FORM.distractors]);

    expect(score.hits).toBe(WORDS_PER_FORM);
    expect(score.falseAlarms).toBe(WORDS_PER_FORM);
    expect(score.correct).toBe(WORDS_PER_FORM); // 10 hits + 0 correct rejections
  });

  it('counts a mixed answer correctly', () => {
    const score = scoreSelections(FORM, [
      ...FORM.targets.slice(0, 7), // 7 hits
      ...FORM.distractors.slice(0, 2), // 2 false alarms
    ]);

    expect(score.hits).toBe(7);
    expect(score.falseAlarms).toBe(2);
    expect(score.correct).toBe(7 + (WORDS_PER_FORM - 2)); // 7 hits + 8 correct rejections
  });

  it('records which form produced the score', () => {
    // Without the form id the score is uninterpretable later — forms are interchangeable but not
    // identical.
    expect(scoreSelections(FORM, []).formId).toBe(FORM.id);
  });

  it('never counts the same word twice', () => {
    // A duplicate in the selection must not inflate hits past the number of targets.
    const score = scoreSelections(FORM, [FORM.targets[0], FORM.targets[0], FORM.targets[0]]);

    expect(score.hits).toBe(1);
  });

  it('ignores a word that is not in this form at all', () => {
    // A stale selection carried over from another form must not crash or score. Losing the whole
    // sitting to a bad tile would be a far worse outcome than ignoring it.
    const score = scoreSelections(FORM, [FORM.targets[0], 'notinthisformatall']);

    expect(score.hits).toBe(1);
    expect(score.falseAlarms).toBe(0);
  });

  it('keeps correct within 0 and the grid size for every plausible answer', () => {
    for (let hits = 0; hits <= WORDS_PER_FORM; hits += 1) {
      for (let falseAlarms = 0; falseAlarms <= WORDS_PER_FORM; falseAlarms += 1) {
        const score = scoreSelections(FORM, [
          ...FORM.targets.slice(0, hits),
          ...FORM.distractors.slice(0, falseAlarms),
        ]);

        expect(score.correct).toBeGreaterThanOrEqual(0);
        expect(score.correct).toBeLessThanOrEqual(MAX_WORD_CORRECT);
      }
    }
  });

  it('treats more hits as a higher score and more false alarms as a lower one', () => {
    // The direction the engine relies on. If this inverted, an athlete doing worse would produce a
    // higher `correct` and the engine would read a decline as an improvement.
    const fewHits = scoreSelections(FORM, FORM.targets.slice(0, 3));
    const manyHits = scoreSelections(FORM, FORM.targets.slice(0, 8));
    expect(manyHits.correct).toBeGreaterThan(fewHits.correct);

    const fewAlarms = scoreSelections(FORM, [...FORM.targets, ...FORM.distractors.slice(0, 1)]);
    const manyAlarms = scoreSelections(FORM, [...FORM.targets, ...FORM.distractors.slice(0, 6)]);
    expect(manyAlarms.correct).toBeLessThan(fewAlarms.correct);
  });
});
