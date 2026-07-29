// lib/forms/wordLists.ts
//
// ⚠️ READ THIS FIRST — WHO WROTE THIS FILE
// ═════════════════════════════════════════════════════════════════════════════════════
// The session brief said this file was already in the repo and told the AI session not to
// edit its contents. It was NOT in the repo: not in the working tree, not in any commit on
// any branch, not in the v1-three-module tag, not in a stash, and nowhere on the machine.
//
// Rather than leave the word-learning module unbuildable, the AI session generated the pool
// below to the exact shape the brief specified. So:
//
//   • This is AI-GENERATED STIMULUS CONTENT. The students did not write these words.
//   • It is a STAND-IN, meant to be replaced. If you have your own pool, overwrite this
//     whole file with it. Nothing that consumes this file looks at the words themselves —
//     only at the exported shape — so a wholesale replacement needs no other code changes.
//   • The construction rules below are machine-checked by lib/forms/select.test.ts. If your
//     replacement pool breaks one of them, those tests will say which.
//
// See AI-USAGE.md and SESSION-REPORT.md for the disclosure.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR
// ═════════════════════════════════════════════════════════════════════════════════════
// The word-learning module shows an athlete a list of TARGET words to remember. Later, after
// other tests have intervened, it shows a grid mixing those targets with the same number of
// DISTRACTORS and asks which ones they saw. Score is how well they sorted one from the other.
//
// Six interchangeable forms exist so that an athlete's baseline and their later checks can
// use DIFFERENT words. Reusing one list would measure how well they remember last month's
// test, not how they are doing today.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// CONSTRUCTION RULES — every one of these is enforced by select.test.ts
// ═════════════════════════════════════════════════════════════════════════════════════
// 1. NOT COPIED FROM ANY PUBLISHED ASSESSMENT. These words were written from scratch against
//    the rules below. No list, wording or scoring is taken from SCAT5, the SAC, ImPACT,
//    King-Devick or any other instrument. That is a hard requirement of this project, not a
//    preference — see CLAUDE.md.
//
// 2. Concrete, everyday nouns. Things a middle-schooler can picture. Abstract words are
//    remembered less consistently from person to person, which would add noise to exactly the
//    comparison this app depends on.
//
// 3. One or two syllables. Keeps the read-aloud pace even, so a long word does not eat more
//    of the athlete's rehearsal time than a short one.
//
// 4. No two words in a form share a semantic category. Within each form, all twenty words
//    come from twenty different everyday categories (kitchen thing, tool, animal, tree,
//    building, food, fabric, metal, shape, weather, and so on). If two targets were both
//    animals, an athlete could remember "there was an animal" and get both, which would make
//    that form easier than the others for reasons that have nothing to do with their memory.
//
// 5. Distractors are not phonologically confusable with any target in the same form. No
//    rhymes, no near-rhymes, no minimal pairs. Otherwise a wrong answer would be measuring
//    how similar two words SOUND rather than whether the athlete remembers one of them —
//    especially important because the targets may be read aloud on a noisy sideline.
//
// 6. Every word appears in exactly one form, across the whole pool. Forms have to be
//    genuinely independent for alternate-form testing to mean anything.
//
// 7. Nothing about injury, medicine or the body, and nothing emotionally loaded. A word like
//    "headache" in a concussion screener would plant the symptom it is trying to detect.

/** One interchangeable word-learning form. */
export type WordForm = {
  /** Stable id, stored on the result so we know which words produced a score. */
  id: string;
  /** The words the athlete is asked to remember. */
  targets: readonly string[];
  /** Same-sized set of words they were NOT shown, mixed into the recognition grid. */
  distractors: readonly string[];
};

/** How many target words each form holds (and, separately, how many distractors). */
export const WORDS_PER_FORM = 10;

/**
 * How many words appear in the recognition grid: every target plus every distractor.
 *
 * Kept as its own export because the grid layout needs it, and deriving it in the component
 * would let the two drift apart if a form's size ever changed.
 */
export const RECOGNITION_GRID_SIZE = WORDS_PER_FORM * 2;

export const WORD_FORMS: readonly WordForm[] = [
  {
    id: 'words-a',
    targets: ['kettle', 'sofa', 'hammer', 'jacket', 'tractor', 'badger', 'maple', 'trumpet', 'cabin', 'canyon'],
    distractors: ['pencil', 'crate', 'muffin', 'velvet', 'helmet', 'copper', 'circle', 'thunder', 'faucet', 'minute'],
  },
  {
    id: 'words-b',
    targets: ['skillet', 'dresser', 'wrench', 'sweater', 'ferry', 'otter', 'willow', 'fiddle', 'barn', 'meadow'],
    distractors: ['crayon', 'jar', 'pretzel', 'denim', 'glove', 'silver', 'square', 'breeze', 'mirror', 'hour'],
  },
  {
    id: 'words-c',
    targets: ['ladle', 'bookshelf', 'shovel', 'scarf', 'wagon', 'beaver', 'birch', 'banjo', 'tower', 'valley'],
    distractors: ['marker', 'bottle', 'waffle', 'cotton', 'whistle', 'iron', 'cube', 'frost', 'doorbell', 'season'],
  },
  {
    id: 'words-d',
    targets: ['teapot', 'bench', 'pliers', 'mitten', 'sled', 'heron', 'cactus', 'drum', 'mill', 'harbor'],
    distractors: ['notebook', 'pouch', 'biscuit', 'leather', 'hurdle', 'bronze', 'spiral', 'hail', 'hinge', 'decade'],
  },
  {
    id: 'words-e',
    targets: ['platter', 'stool', 'chisel', 'sandal', 'canoe', 'falcon', 'fern', 'flute', 'castle', 'ridge'],
    distractors: ['ruler', 'sack', 'pudding', 'linen', 'net', 'nickel', 'arch', 'lightning', 'ceiling', 'weekend'],
  },
  {
    id: 'words-f',
    targets: ['pitcher', 'cot', 'saw', 'apron', 'barge', 'weasel', 'ivy', 'harp', 'tunnel', 'dune'],
    distractors: ['folder', 'tray', 'noodle', 'wool', 'sneaker', 'zinc', 'diamond', 'rainbow', 'staircase', 'morning'],
  },
];
