// lib/types.ts
//
// THE DATA CONTRACT. This is the single source of truth for the shapes that flow through
// the whole app: what a test produces, what we store, and what the engine returns.
//
// Rule for this file: do not rename fields or "improve" these shapes. The tests, storage,
// and engine are all built against exactly these definitions. If a shape needs to change,
// change it here first, on purpose, and update everything that depends on it.
//
// (The only things added versus the original brief are the `export` keyword, so other files
// can import these types, and ONE optional field on TestResult — `comparedToBaselineId` — which
// pins a check to the exact baseline it was scored against at save time. It is optional so
// every existing record and shape stays valid; nothing else is renamed or changed. See the
// note on that field below and CLAUDE.md's data-contract section.)

/**
 * The scores from one sitting of the test battery.
 *
 * Each module is either its result object, or `null` if that module wasn't taken this
 * time. Keeping every module optional (nullable) is deliberate: an athlete might do a quick
 * sideline check with only reaction + symptom, and the engine must handle the gaps.
 */
export type ModuleScores = {
  /** Symptom checklist: 10 items rated 0-3 each, plus the running total (0-30). */
  symptom: { itemScores: number[]; total: number } | null; // 10 items, 0-3 each

  /**
   * Word learning — IMMEDIATE recognition, taken moments after the words were shown.
   *
   * `formId` records which word list produced this score. It has to be stored: the pools are
   * interchangeable but not identical, and a score means nothing without knowing which twenty
   * words it came from.
   *
   * `hits` are targets correctly identified, `falseAlarms` are distractors wrongly claimed.
   * Both are kept raw rather than folded into one number, because they mean different things —
   * missing words and inventing words are not the same failure — and because any summary we
   * invented now would be a summary nobody could recompute later.
   *
   * `correct` is the plain count of grid words classified correctly (hits plus correct
   * rejections), out of RECOGNITION_GRID_SIZE. Deliberately arithmetic, not a corrected
   * recognition score: any weighting would be a formula we made up.
   */
  wordLearning: { formId: string; hits: number; falseAlarms: number; correct: number } | null;

  /**
   * Word learning — DELAYED recognition, asked again after other tests have intervened.
   *
   * Same shape and same form as `wordLearning`, on purpose: the pair is only meaningful read
   * together. The immediate score says whether the words went in; the delayed score says
   * whether they stayed. Either alone is close to uninterpretable, which is why the two screens
   * ship as one module.
   */
  wordRecognition: { formId: string; hits: number; falseAlarms: number; correct: number } | null;

  /**
   * Digit span backward: nine fixed trials, scored as how many were reproduced exactly.
   *
   * `trialsCorrect` is per-trial pass/fail in presentation order, kept so the raw pattern
   * survives into an export — "failed both sixes" and "failed two threes" are the same score
   * and very different sittings. `correct` is simply how many of the nine are true. No partial
   * credit inside a trial: a sequence with two digits swapped is a failed trial, not most of a
   * pass.
   */
  digitSpan: { formId: string; trialsCorrect: boolean[]; correct: number } | null;

  /** Pattern span: same fixed-trial structure and same scoring rule as digit span. */
  patternSpan: { formId: string; trialsCorrect: boolean[]; correct: number } | null;

  /**
   * Go / no-go. NOT BUILT YET — a student is writing this module by hand, so this stays null
   * and `goNoGo` is deliberately absent from BATTERY_STEPS. The shape is defined here anyway so
   * the module has a contract to build against and the engine already knows how to read it.
   *
   * Two error kinds are kept separate on purpose. A COMMISSION error is responding on a no-go
   * trial — failing to hold back. An OMISSION error is not responding on a go trial — losing
   * attention entirely. Collapsing them into one "errors" count would throw away the difference
   * between "could not stop" and "was not there".
   */
  goNoGo: {
    formId: string;
    medianMs: number;
    commissionErrors: number;
    omissionErrors: number;
  } | null;

  /** Balance: a single sway score. Stays null for now — balance is a P1 feature. */
  balance: { swayScore: number } | null; // stays null for now
};

/**
 * One stored test sitting for one athlete.
 *
 * `kind` is the important part: a 'baseline' is taken while healthy and is what we compare
 * against; a 'check' is taken after a possible hit and is what we compare.
 */
export type TestResult = {
  id: string;
  athleteId: string;
  takenAt: number; // Date.now()
  kind: 'baseline' | 'check';
  scores: ModuleScores;

  /**
   * Which version of the ModuleScores shape this record was saved under.
   *
   * WHY THIS EXISTS: `scores` is the one field in here whose SHAPE changes when the battery
   * changes. A record saved when the battery was symptom + reaction + scan holds different
   * keys from one saved after those modules are replaced. Both are perfectly valid records —
   * they just are not comparable with each other, because the fields one of them is missing
   * are not fields the other measured.
   *
   * Without a version stamp there is no way to tell them apart at read time. The engine
   * would compare a new check against an old baseline, find `null` where it expected a
   * module, quietly skip it, and report on whatever few fields happened to overlap. That is
   * the specific failure this app cannot have: a comparison that ran on almost nothing and
   * still rendered a calm-looking screen.
   *
   * So: every record carries the version it was written under, the engine refuses to compare
   * two records whose versions differ, and it says plainly that it refused. See lib/schema.ts
   * for the normaliser that puts this field on records saved before it existed.
   *
   * It is REQUIRED, not optional, on purpose. Records come off disk without it, so the type
   * only fits after `normaliseTestResult` has run — which makes the compiler, rather than
   * our own diligence, the thing that guarantees no read path skips normalisation.
   */
  schemaVersion: number;

  /**
   * Which baseline this sitting was compared against, pinned at save time.
   *
   * WHY THIS EXISTS: an Athlete holds exactly ONE `baselineId`, and recording a new baseline
   * replaces it. Without this field a check is always re-scored against whatever the athlete's
   * CURRENT baseline happens to be when the result is opened — so recording a new baseline
   * silently changes the outcome of every past check. That is dangerous: a result that once
   * read "flagged" could quietly turn into "no change detected".
   *
   * So at the moment a CHECK is saved we stamp the baseline that was on file right then. The
   * results screen honours that pin first and only falls back to the athlete's current
   * `baselineId` when this field is ABSENT — i.e. for legacy checks saved before this field
   * existed. It is only ever set on `kind: 'check'` records; baselines leave it undefined.
   */
  comparedToBaselineId?: string; // set on 'check' records at save time
};

/**
 * One athlete profile.
 *
 * `baselineId` points at the TestResult we treat as this athlete's baseline (or null if
 * they haven't recorded one yet). `checkIds` is the list of sideline checks they've taken.
 */
export type Athlete = {
  id: string;
  name: string;
  baselineId: string | null;
  checkIds: string[];
};

/**
 * The engine's answer: did anything look off compared to this athlete's own baseline?
 *
 * `modules` marks every module that crossed its OWN cut-off. `flagged` applies the
 * whole-screen rule on top of that (changed 2026-09-10, see thresholds.ts): the symptom
 * module alone is enough, and otherwise at least MODULES_REQUIRED_TO_FLAG modules must have
 * crossed together. A single non-symptom module past its cut-off therefore produces
 * flagged=false with its entry in `modules` still true — the results screen renders that
 * state explicitly, never as "no change". `explanations` is plain-language text we show the
 * user (readable by a parent, not just a coder).
 *
 * Note there is deliberately NO "cleared" / "healthy" / "safe" field anywhere. The absence
 * of a flag is not a clearance — see CLAUDE.md, THE HARD RULE.
 */
export type FlagOutcome = {
  flagged: boolean; // symptom crossed, or two or more modules crossed — see thresholds.ts
  modules: {
    symptom: boolean;
    wordLearning: boolean;
    wordRecognition: boolean;
    digitSpan: boolean;
    patternSpan: boolean;
    goNoGo: boolean;
    balance: boolean;
  };
  explanations: string[]; // plain language, shown to the user

  /**
   * Measurements that WERE recorded in both sittings and compared, but which no threshold
   * exists to judge yet — so the engine formed no opinion about them.
   *
   * WHY THIS FIELD IS A SAFETY REQUIREMENT AND NOT BOOKKEEPING: most of this battery's
   * thresholds are deliberately `null` until real data has been collected. Without this field,
   * a measurement with no threshold simply never sets its flag — which is indistinguishable
   * from a measurement that was checked and found fine. An athlete could complete four tests,
   * have three of them go unjudged entirely, and be shown the calmest screen in the app.
   *
   * So the engine reports them, and the result screen has to say out loud that it could not
   * judge them. "We did not look" must never render as "we looked and it was fine".
   */
  unevaluated: string[];
};
