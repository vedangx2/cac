// lib/types.ts
//
// THE DATA CONTRACT. This is the single source of truth for the shapes that flow through
// the whole app: what a test produces, what we store, and what the engine returns.
//
// Rule for this file: do not rename fields or "improve" these shapes. The tests, storage,
// and engine are all built against exactly these definitions. If a shape needs to change,
// change it here first, on purpose, and update everything that depends on it.
//
// (The only thing added versus the original brief is the `export` keyword, so other files
// can import these types. The field names and types are untouched.)

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
