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
   * Reaction time: the raw milliseconds for every trial, the MEDIAN of those trials
   * (what we actually compare on — robust to one fluke tap), and how many false starts
   * (tapped too early) happened.
   */
  reaction: { trialsMs: number[]; medianMs: number; falseStarts: number } | null;

  /** Number scan: total time to tap 1-15 in order, and how many wrong taps happened. */
  scan: { elapsedMs: number; errors: number } | null;

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
 * `flagged` is true if ANY single module flagged. `modules` says which ones. `explanations`
 * is plain-language text we show the user (readable by a parent, not just a coder).
 *
 * Note there is deliberately NO "cleared" / "healthy" / "safe" field anywhere. The absence
 * of a flag is not a clearance — see CLAUDE.md, THE HARD RULE.
 */
export type FlagOutcome = {
  flagged: boolean; // true if ANY module flagged
  modules: { reaction: boolean; scan: boolean; symptom: boolean; balance: boolean };
  explanations: string[]; // plain language, shown to the user
};
