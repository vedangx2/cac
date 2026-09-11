// lib/session.ts
//
// The "battery session" — the thing that turns several separate test screens into ONE saved
// TestResult.
//
// The problem this solves: each module is its own page (see STEP_PATHS below). But a baseline
// (or a sideline check) is a single TestResult containing every module's scores. So we need
// somewhere to accumulate scores as the athlete moves from screen to screen, before anything
// is written to the real database.
//
// WHERE WE KEEP IT: sessionStorage, not IndexedDB and not React state.
//   • Not React state — that dies the moment you navigate to the next test screen.
//   • Not IndexedDB — a half-finished battery is not a result yet, and we never want a
//     partial sitting to look like a real saved record.
//   • sessionStorage survives navigation AND an accidental refresh, but is scoped to this
//     browser tab and is thrown away when the tab closes. That is exactly the lifetime of
//     "one athlete doing one sitting right now."
//
// PRACTICE comes in two forms (2026-09-10):
//   • STANDALONE: no active session at all. Any single test screen still works and saves
//     nothing — that lets anyone (including a judge watching a demo) try one test without
//     creating an athlete profile.
//   • A PRACTICE RUN: a real session with kind 'practice'. It chains all six modules in
//     order exactly like a sitting, accumulates scores in sessionStorage so a summary can
//     show them at the end — and then throws them away. It NEVER produces a TestResult. If
//     an athlete is attached, finishing it records only the FACT that a pass happened
//     (Athlete.practiceCompletedAt), which is what unlocks recording a baseline — see the
//     first-exposure guard note on that field in lib/types.ts.

import type { ModuleScores, TestResult } from './types';
import { getAthletes, saveAthlete, saveResult } from './storage';
import { CURRENT_SCHEMA_VERSION } from './schema';

const SESSION_KEY = 'active-battery-session';

/** A sitting that will be SAVED when it finishes — a baseline or a sideline check. */
export type RecordedBatterySession = {
  athleteId: string;
  athleteName: string; // copied in so test screens can show who they're testing
  kind: 'baseline' | 'check';
  startedAt: number;
  scores: ModuleScores;
};

/**
 * A practice pass through the whole battery. Same shape as a recorded sitting so the test
 * screens and the step-chaining logic treat it identically — the difference is entirely in
 * what happens at the end (nothing is saved) and in who may run one (no athlete needed).
 */
export type PracticeBatterySession = {
  /** null when nobody is attached — practice is deliberately reachable without a profile. */
  athleteId: string | null;
  athleteName: string | null;
  kind: 'practice';
  startedAt: number;
  scores: ModuleScores;
};

/**
 * A sitting in progress. The discriminated union is doing safety work: finishSession() only
 * accepts the recorded variant, so the compiler — not care — guarantees a practice run can
 * never be written to the database as a TestResult.
 */
export type BatterySession = RecordedBatterySession | PracticeBatterySession;

/** Which module a given test screen fills in. */
export type BatteryStep =
  | 'symptom'
  | 'wordLearning'
  | 'digitSpan'
  | 'patternSpan'
  | 'goNoGo'
  | 'wordRecognition';

/**
 * The order of the battery, defined in exactly one place so no screen can disagree about
 * what comes next.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * THE BATTERY IS BEING REBUILT. Modules are added here as each one lands.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * The original three-module battery (symptom + reaction + scan) has been replaced. Reaction and
 * number scan are gone and their screens were deleted. What is listed here is what has actually
 * been built and can honestly be run — nothing is listed in advance of its screen existing.
 *
 * WHY THE ORDER MATTERS once the word module lands: the two word screens are one module split in
 * half on purpose. `wordLearning` shows the words and tests them immediately; `wordRecognition`
 * asks again at the END of the battery, after the two span tasks have come in between. That gap
 * IS the measurement — it is what makes the second score a test of what was retained rather than
 * a second look at the same screen. So nothing may be appended after `wordRecognition`, and the
 * span tasks must stay between the pair.
 *
 * GO/NO-GO NOW EXISTS and sits between the span tasks and the delayed word screen. It went in
 * THERE rather than at the end for the reason above: appending it after `wordRecognition` would
 * have been the one move the ordering rule forbids. Sitting inside the pair it also lengthens the
 * gap between the two word screens, which makes the delayed score a slightly better test of what
 * was retained rather than a second look at the same grid.
 */
export const BATTERY_STEPS: BatteryStep[] = [
  'symptom',
  'wordLearning',
  'digitSpan',
  'patternSpan',
  'goNoGo',
  'wordRecognition',
];

export const STEP_PATHS: Record<BatteryStep, string> = {
  symptom: '/tests/symptom',
  wordLearning: '/tests/words',
  digitSpan: '/tests/digits',
  patternSpan: '/tests/pattern',
  goNoGo: '/tests/gonogo',
  wordRecognition: '/tests/words/recall',
};

export const STEP_LABELS: Record<BatteryStep, string> = {
  symptom: 'Symptom checklist',
  wordLearning: 'Word learning',
  digitSpan: 'Numbers backwards',
  patternSpan: 'Tapped patterns',
  goNoGo: 'Go / no-go',
  wordRecognition: 'Word recall',
};

/** An empty score sheet. Every module starts null and gets filled in as tests complete. */
function emptyScores(): ModuleScores {
  return {
    symptom: null,
    wordLearning: null,
    wordRecognition: null,
    digitSpan: null,
    patternSpan: null,
    goNoGo: null,
    balance: null,
  };
}

/** Begin a new sitting for an athlete and store it. Overwrites any previous session. */
export function startSession(athleteId: string, athleteName: string, kind: 'baseline' | 'check'): void {
  const session: RecordedBatterySession = {
    athleteId,
    athleteName,
    kind,
    startedAt: Date.now(),
    scores: emptyScores(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Begin a practice pass, with or without an athlete attached. Overwrites any previous
 * session — one tab holds one sitting of any kind, so a practice run and a real sitting can
 * never interleave.
 */
export function startPracticeSession(athlete: { id: string; name: string } | null): void {
  const session: PracticeBatterySession = {
    athleteId: athlete?.id ?? null,
    athleteName: athlete?.name ?? null,
    kind: 'practice',
    startedAt: Date.now(),
    scores: emptyScores(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Read the active session, or null if there isn't one (practice mode).
 *
 * Wrapped in try/catch because sessionStorage can throw (private browsing, storage disabled)
 * and because the stored string could in principle be corrupt. A broken session should
 * degrade to practice mode, never crash a test screen mid-sitting.
 */
export function getSession(): BatterySession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BatterySession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing useful to do — the session is disposable by design.
  }
}

/** Record one module's scores into the active session. No-op in practice mode. */
export function saveStepScores<K extends BatteryStep>(step: K, value: ModuleScores[K]): void {
  const session = getSession();
  if (!session) return;
  session.scores[step] = value;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** The step after this one, or null if this was the last one. */
export function nextStep(current: BatteryStep): BatteryStep | null {
  const index = BATTERY_STEPS.indexOf(current);
  const next = BATTERY_STEPS[index + 1];
  return next ?? null;
}

/** Human-readable position, e.g. "Step 2 of 3". */
export function stepPosition(step: BatteryStep): string {
  return `Step ${BATTERY_STEPS.indexOf(step) + 1} of ${BATTERY_STEPS.length}`;
}

/**
 * Finish the sitting: write the TestResult to IndexedDB, point the athlete at it, and clear
 * the temporary session.
 *
 * Returns the saved TestResult so the caller knows where to navigate next.
 *
 * WHY we update the athlete too: an Athlete holds `baselineId` and `checkIds`. Saving a
 * result without updating those pointers would leave a result nothing links to.
 *
 * Takes the RECORDED variant only. A practice session does not fit this parameter, so the
 * compiler makes "a practice run saved as a real result" an impossible bug rather than a
 * guarded-against one. Practice runs end in finishPracticeRun below.
 */
export async function finishSession(session: RecordedBatterySession): Promise<TestResult> {
  // Re-read the athlete FIRST, rather than trusting a stale copy. We do this before building the
  // result (it used to happen after the save) because a check needs to know which baseline is on
  // file RIGHT NOW so it can pin it — see below.
  const athletes = await getAthletes();
  const athlete = athletes.find((a) => a.id === session.athleteId);

  const result: TestResult = {
    id: crypto.randomUUID(),
    athleteId: session.athleteId,
    takenAt: Date.now(),
    kind: session.kind,
    scores: session.scores,

    // Stamp the shape this record was measured under, at the moment it is written. A record
    // must carry the version of the battery that produced it, not the version of whatever
    // build happens to read it later — that is the whole point. See lib/schema.ts.
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  // Pin a CHECK to the baseline that is on file at this exact moment.
  //
  // WHY: an Athlete holds one `baselineId`, and recording a new baseline replaces it. If a check
  // only ever resolved "the athlete's current baseline" when it was later opened, then recording
  // a new baseline would silently change which baseline that old check is scored against — quietly
  // rewriting a past result. Stamping the baseline in use now freezes this check's comparison for
  // good. If the athlete has no baseline yet, we leave it unset: that is a genuinely
  // baseline-less check, which the results screen must refuse, not a legacy record.
  if (result.kind === 'check' && athlete?.baselineId) {
    result.comparedToBaselineId = athlete.baselineId;
  }

  await saveResult(result);

  // Then update the right pointer on the athlete.
  if (athlete) {
    if (session.kind === 'baseline') {
      // The newest baseline replaces the old one for FUTURE checks — but the old baseline record
      // is left in storage untouched, so any check already pinned to it can still resolve it.
      athlete.baselineId = result.id;
    } else {
      athlete.checkIds = [...athlete.checkIds, result.id];
    }
    await saveAthlete(athlete);
  }

  clearSession();
  return result;
}

/**
 * Finish a PRACTICE pass: record only the fact that it happened, never its scores.
 *
 * Writes exactly one thing — `practiceCompletedAt` on the attached athlete — because that
 * fact is what unlocks recording a baseline (the first-exposure guard, see lib/types.ts).
 * It deliberately writes NO TestResult and copies nothing out of `session.scores`: practice
 * numbers are first-exposure numbers, which is precisely the data this guard exists to keep
 * out of the database.
 *
 * With no athlete attached (or an athlete deleted mid-run) there is nothing to mark, and
 * nothing anywhere records that the run happened — that is the point of anonymous practice.
 *
 * It does NOT clear the session: the summary screen still needs the scores in
 * sessionStorage to show them once. The summary clears the session when the person leaves.
 */
export async function finishPracticeRun(session: PracticeBatterySession): Promise<void> {
  if (!session.athleteId) return;

  const athletes = await getAthletes();
  const athlete = athletes.find((a) => a.id === session.athleteId);
  if (!athlete) return;

  athlete.practiceCompletedAt = Date.now();
  await saveAthlete(athlete);
}
