// lib/session.ts
//
// The "battery session" — the thing that turns three separate test screens into ONE saved
// TestResult.
//
// The problem this solves: the routes are /tests/symptom, /tests/reaction and /tests/scan,
// three separate pages. But a baseline (or a sideline check) is a single TestResult
// containing all three module scores. So we need somewhere to accumulate scores as the
// athlete moves from screen to screen, before anything is written to the real database.
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
export type BatteryStep = 'symptom' | 'reaction' | 'scan';

/**
 * The order of the battery, defined in exactly one place so no screen can disagree about
 * what comes next.
 *
 * WHY this order: the symptom checklist first, while the athlete is still sitting still and
 * before two timed tasks can tire or frustrate them. Then reaction (short), then the number
 * scan (longest and most demanding).
 */
export const BATTERY_STEPS: BatteryStep[] = ['symptom', 'reaction', 'scan'];

export const STEP_PATHS: Record<BatteryStep, string> = {
  symptom: '/tests/symptom',
  reaction: '/tests/reaction',
  scan: '/tests/scan',
};

export const STEP_LABELS: Record<BatteryStep, string> = {
  symptom: 'Symptom checklist',
  reaction: 'Reaction time',
  scan: 'Number scan',
};

/** An empty score sheet. Every module starts null and gets filled in as tests complete. */
function emptyScores(): ModuleScores {
  return { symptom: null, reaction: null, scan: null, balance: null };
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
  const result: TestResult = {
    id: crypto.randomUUID(),
    athleteId: session.athleteId,
    takenAt: Date.now(),
    kind: session.kind,
    scores: session.scores,
  };

  await saveResult(result);

  // Re-read the athlete rather than trusting a stale copy, then update the right pointer.
  const athletes = await getAthletes();
  const athlete = athletes.find((a) => a.id === session.athleteId);
  if (athlete) {
    if (session.kind === 'baseline') {
      // The newest baseline replaces the old one — we always compare against the most
      // recent healthy measurement for this athlete.
      athlete.baselineId = result.id;
    } else {
      athlete.checkIds = [...athlete.checkIds, result.id];
    }
    await saveAthlete(athlete);
  }

  clearSession();
  return result;
}
