'use client';

// components/battery.tsx
//
// The glue shared by all three test screens: figure out whether we're in a real sitting or
// just practising, and know where to go when this test finishes.
//
// Keeping this in one hook means the reaction/scan/symptom screens only have to worry about
// measuring their own thing. None of them contains any navigation logic.

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeviceData } from './use-device-data';
import type { ModuleScores } from '@/lib/types';
import {
  BATTERY_STEPS,
  type BatterySession,
  type BatteryStep,
  STEP_PATHS,
  finishSession,
  getSession,
  saveStepScores,
  stepPosition,
} from '@/lib/session';

type BatteryState = {
  /** null while we're still reading sessionStorage on the client. */
  loaded: boolean;
  session: BatterySession | null;
  /** 'battery' = part of a real baseline/check. 'practice' = standalone, nothing is saved. */
  mode: 'battery' | 'practice';
  /** e.g. "Step 2 of 3", or "Practice" when there's no sitting in progress. */
  stepLabel: string;
  /** Call when the test produces its scores. Saves and moves the athlete along. */
  complete: (value: ModuleScores[BatteryStep]) => Promise<void>;
  /** True once a practice run has finished (so the screen can offer a retry). */
  practiceDone: boolean;
  resetPractice: () => void;
  /** True while the final save is in flight, so screens can disable their button. */
  saving: boolean;
  /** Set if saving the sitting failed. Must be shown — a silent failure loses the sitting. */
  saveError: string | null;
};

export function useBatteryStep(step: BatteryStep): BatteryState {
  const router = useRouter();
  const [practiceDone, setPracticeDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A ref as well as state: the state drives the disabled button, but a second tap can arrive
  // before React re-renders, and only a ref is updated synchronously enough to block it.
  const savingRef = useRef(false);

  // sessionStorage only exists in the browser, so the sitting is read after mount. Rendering
  // the same "not loaded yet" markup on the server and on the first client render is what
  // keeps React from complaining about a hydration mismatch.
  const readSession = useCallback(async () => getSession(), []);
  const { data: session, loading } = useDeviceData(readSession);
  const loaded = !loading;

  const complete = useCallback(
    async (value: ModuleScores[BatteryStep]) => {
      // Practice mode: measure, show the number, save nothing.
      if (!session) {
        setPracticeDone(true);
        return;
      }

      if (savingRef.current) return; // already committing — ignore a second tap
      savingRef.current = true;
      setSaving(true);
      setSaveError(null);

      try {
        saveStepScores(step, value);

        // Re-read the sitting so we can see everything recorded so far.
        const current = getSession();
        if (!current) {
          router.push('/athletes');
          return;
        }

        // Move to the next step that still has no scores, rather than assuming the steps were
        // done in order. Someone who opened a test screen directly could otherwise finish a
        // sitting that is missing modules — and because finishing REPLACES the athlete's
        // baseline, a half-empty sitting could quietly overwrite a complete one.
        const missing = BATTERY_STEPS.find((candidate) => current.scores[candidate] === null);
        if (missing) {
          router.push(STEP_PATHS[missing]);
          return;
        }

        const saved = await finishSession(current);

        // A baseline goes back to the athlete's page. A check goes straight to its result,
        // because that is the thing the person on the sideline is waiting for.
        if (saved.kind === 'check') {
          router.push(`/results/${saved.id}`);
        } else {
          router.push(`/athletes/${saved.athleteId}?baseline=saved`);
        }
      } catch {
        // Storage can genuinely fail — private browsing, a full disk, storage disabled by
        // policy. Swallowing that would be the worst outcome available: the coach would think
        // the check was recorded when nothing was written. So we say so, loudly, and leave the
        // sitting in place so they can try again without redoing the tests.
        setSaveError(
          'This sitting could not be saved to this device. Nothing has been recorded. Try again — and if it keeps failing, this browser may be blocking storage (private browsing does this).',
        );
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [router, session, step],
  );

  return {
    loaded,
    session,
    mode: session ? 'battery' : 'practice',
    stepLabel: session ? stepPosition(step) : 'Practice',
    complete,
    practiceDone,
    resetPractice: () => setPracticeDone(false),
    saving,
    saveError,
  };
}

/** Shown when the final save failed. Never let a failed save look like a successful one. */
export function SaveErrorNotice({ message, tone = 'dark' }: { message: string; tone?: 'dark' | 'light' }) {
  const box =
    tone === 'dark'
      ? 'border-flag bg-instrument-panel text-instrument-ink'
      : 'border-flag bg-paper text-ink';
  return (
    <div role="alert" className={`mt-6 rounded-lg border-l-4 border-y border-r p-4 ${box}`}>
      <p className="font-bold">Not saved</p>
      <p className="mt-1 text-sm leading-relaxed">{message}</p>
    </div>
  );
}

/**
 * Shown on a test screen when nobody is mid-sitting. It has to be unmistakable that this run
 * is not being recorded, so a coach never believes a check was saved when it wasn't.
 *
 * `tone` exists because the reaction and scan tests sit on the dark instrument surface while
 * the symptom checklist sits on the light document surface — same message, two backgrounds.
 */
export function PracticeBanner({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const styles =
    tone === 'dark'
      ? {
          box: 'border-instrument-line bg-instrument-panel',
          title: 'text-instrument-ink',
          body: 'text-instrument-ink-soft',
          link: 'text-instrument-ink',
        }
      : {
          box: 'border-line-strong bg-paper',
          title: 'text-ink',
          body: 'text-ink-soft',
          link: 'text-signal',
        };

  return (
    <div className={`mb-6 rounded-lg border-l-4 border-y border-r p-4 ${styles.box}`}>
      <p className={`font-bold ${styles.title}`}>Practice run — nothing is being saved</p>
      <p className={`mt-1 text-sm leading-relaxed ${styles.body}`}>
        You reached this test directly, so there is no athlete attached to it. Try it as many
        times as you like.{' '}
        <Link href="/athletes" className={`font-semibold underline underline-offset-4 ${styles.link}`}>
          Pick an athlete
        </Link>{' '}
        to record a real baseline or sideline check.
      </p>
    </div>
  );
}

/** Small "Sideline check · Jordan" line so it's always clear who this is for. */
export function SittingLabel({
  session,
  tone = 'dark',
}: {
  session: BatterySession | null;
  tone?: 'dark' | 'light';
}) {
  if (!session) return null;
  const soft = tone === 'dark' ? 'text-instrument-ink-soft' : 'text-ink-soft';
  const strong = tone === 'dark' ? 'text-instrument-ink' : 'text-ink';
  return (
    <p className={`text-sm font-semibold ${soft}`}>
      {session.kind === 'baseline' ? 'Recording baseline' : 'Sideline check'} ·{' '}
      <span className={strong}>{session.athleteName}</span>
    </p>
  );
}
