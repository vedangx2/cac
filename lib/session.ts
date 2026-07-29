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
// PRACTICE MODE: if there is no active session, the test screens still work — they just
// don't save anything. That lets anyone (including a judge watching a demo) try a test
// without first creating an athlete profile.

import type { ModuleScores, TestResult } from './types';
import { getAthletes, saveAthlete, saveResult } from './storage';
import { CURRENT_SCHEMA_VERSION } from './schema';

const SESSION_KEY = 'active-battery-session';

/** A sitting that is in progress but has not been saved yet. */
export type BatterySession = {
  athleteId: string;
  athleteName: string; // copied in so test screens can show who they're testing
  kind: 'baseline' | 'check';
  startedAt: number;
  scores: ModuleScores;
};

/** Which module a given test screen fills in. */
export type BatteryStep =
  | 'symptom'
  | 'wordLearning'
  | 'digitSpan'
  | 'patternSpan'
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
 * GO/NO-GO IS DELIBERATELY ABSENT. A student is writing that module by hand. It is not listed
 * here and there is no route stub, because a stub that wrote plausible-looking scores would be
 * fabricated data.
 */
export const BATTERY_STEPS: BatteryStep[] = [
  'symptom',
  'wordLearning',
  'digitSpan',
  'patternSpan',
  'wordRecognition',
];

export const STEP_PATHS: Record<BatteryStep, string> = {
  symptom: '/tests/symptom',
  wordLearning: '/tests/words',
  digitSpan: '/tests/digits',
  patternSpan: '/tests/pattern',
  wordRecognition: '/tests/words/recall',
};

export const STEP_LABELS: Record<BatteryStep, string> = {
  symptom: 'Symptom checklist',
  wordLearning: 'Word learning',
  digitSpan: 'Numbers backwards',
  patternSpan: 'Tapped patterns',
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
  const session: BatterySession = {
    athleteId,
    athleteName,
    kind,
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
 */
export async function finishSession(session: BatterySession): Promise<TestResult> {
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
