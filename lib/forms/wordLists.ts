/**
 * Parallel forms for the word-list learning module (module 2) and the
 * delayed-recognition module (module 3).
 *
 * Both modules read the SAME form within a session. `targets` are the words
 * shown during learning. The recognition array is `targets` + `distractors`
 * (20 items), shuffled at each presentation, so learning and delayed
 * recognition never show the grid in the same order.
 *
 * WHY PARALLEL FORMS: repeat testing improves scores for reasons unrelated to
 * injury. A different form each sitting is what keeps a retest score
 * comparable to baseline.
 *
 * CONSTRUCTION RULES (enforced by lib/forms/select.test.ts -- keep them when
 * adding forms):
 *   - 10 targets, 10 distractors, all concrete common nouns
 *   - plain lowercase single words, letters only
 *   - 1-3 syllables, readable by a 12-year-old
 *   - no target and distractor in the same form sharing their last three
 *     letters (the test's rhyme check)
 *   - no semantic clustering inside a list
 *   - no sport, injury, medical, or body words
 *   - all 120 words unique across all forms
 *
 * PROVENANCE: written fresh for this project. Checked against the word lists
 * used in widely published sideline assessments; no overlap. Do not add words
 * copied from any published battery.
 *
 * UNVERIFIED ASSUMPTION: parallel forms only work if the forms are equally
 * difficult. Nothing in the app checks this. `formId` is recorded on every
 * result so it can be checked against real data later. If one form's scores
 * sit consistently lower, that will show up in the collected data.
 * TODO(NEEDS_SOURCE): form-difficulty equivalence is asserted, not measured.
 */

export type WordFormId =
  | 'words-a'
  | 'words-b'
  | 'words-c'
  | 'words-d'
  | 'words-e'
  | 'words-f';

export type WordForm = {
  id: WordFormId;
  /** Shown one at a time during learning. Order as written. */
  targets: readonly string[];
  /** Never shown during learning. Fills out the recognition grid. */
  distractors: readonly string[];
};

export const WORD_FORMS: readonly WordForm[] = [
  {
    id: 'words-a',
    targets: [
      'tractor', 'pillow', 'hammer', 'river', 'marble',
      'biscuit', 'glove', 'cellar', 'walnut', 'ribbon',
    ],
    distractors: [
      'kettle', 'curtain', 'wrench', 'canyon', 'granite',
      'waffle', 'scarf', 'garage', 'almond', 'feather',
    ],
  },
  {
    id: 'words-b',
    targets: [
      'lantern', 'paddle', 'mustard', 'prairie', 'crayon',
      'radish', 'ladder', 'magnet', 'drawer', 'compass',
    ],
    distractors: [
      'torch', 'kayak', 'syrup', 'meadow', 'pencil',
      'spinach', 'staircase', 'hinge', 'closet', 'tripod',
    ],
  },
  {
    id: 'words-c',
    targets: [
      'pumpkin', 'whistle', 'trumpet', 'thimble', 'cabinet',
      'lettuce', 'chimney', 'spatula', 'harbor', 'envelope',
    ],
    distractors: [
      'melon', 'buzzer', 'banjo', 'needle', 'vineyard',
      'cabbage', 'rooftop', 'ladle', 'dockyard', 'package',
    ],
  },
  {
    id: 'words-d',
    targets: [
      'mattress', 'cactus', 'violin', 'pretzel', 'shovel',
      'muffin', 'tunnel', 'basket', 'mailbox', 'pancake',
    ],
    distractors: [
      'cushion', 'fern', 'cello', 'bagel', 'canteen',
      'scone', 'bridge', 'crate', 'sidewalk', 'omelet',
    ],
  },
  {
    id: 'words-e',
    targets: [
      'telescope', 'sponge', 'tulip', 'keyboard', 'socket',
      'saucer', 'cottage', 'rooster', 'hallway', 'anvil',
    ],
    distractors: [
      'mop', 'daisy', 'monitor', 'outlet', 'goblet',
      'cabin', 'sparrow', 'corridor', 'mallet', 'satchel',
    ],
  },
  {
    id: 'words-f',
    targets: [
      'pigeon', 'cinnamon', 'crater', 'hamster', 'wallet',
      'barrel', 'funnel', 'dolphin', 'lagoon', 'gravel',
    ],
    distractors: [
      'seagull', 'nutmeg', 'valley', 'gerbil', 'purse',
      'keg', 'siphon', 'badger', 'cove', 'boulder',
    ],
  },
] as const;

/** Max score on both the learning and delayed-recognition modules. */
export const WORDS_PER_FORM = 10;

/** Size of the recognition grid (targets + distractors). */
export const RECOGNITION_GRID_SIZE = 20;
