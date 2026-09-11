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
  finishPracticeRun,
  finishSession,
  getSession,
  saveStepScores,
  stepPosition,
} from '@/lib/session';

type BatteryState = {
  /** null while we're still reading sessionStorage on the client. */
  loaded: boolean;
  session: BatterySession | null;
  /**
   * 'battery' = this screen is one step of a CHAINED sitting and moves to the next step when
   * it completes — true for a baseline, a check, AND a practice run (kind 'practice'), which
   * walks the same six steps in the same order. 'practice' = standalone: someone opened one
   * test screen directly with no sitting at all, so it shows its score and offers a retry.
   * Whether anything is being RECORDED is a different question — that is `practice` below.
   */
  mode: 'battery' | 'practice';
  /**
   * Where this module sits in the battery, e.g. "Step 5 of 6".
   *
   * ALWAYS the position, even in practice mode. It used to say "Practice" instead, which
   * meant the one thing every test screen is required to show — where you are in the run —
   * was missing on exactly the screens somebody is most likely to be seeing for the first
   * time. Practice is announced by its own banner; it is not a position.
   */
  stepLabel: string;
  /**
   * True when nothing from this run will be saved as a result — standalone practice AND a
   * chained practice run alike. Drives the practice banner and any "Save" wording, never the
   * position. (A practice RUN still stores one fact at the end: that the pass happened, on
   * the attached athlete — see finishPracticeRun. Never its scores.)
   */
  practice: boolean;
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
      // Standalone practice (no sitting at all): measure, show the number, save nothing.
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
          router.push(session.kind === 'practice' ? '/practice' : '/athletes');
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

        // A finished PRACTICE pass. Record only the FACT that it happened on the attached
        // athlete — that is what unlocks recording a baseline — then show the summary, which
        // reads the scores straight out of sessionStorage. No TestResult is ever written;
        // the compiler enforces that, because a practice session does not fit finishSession.
        if (current.kind === 'practice') {
          try {
            await finishPracticeRun(current);
          } catch {
            // Storage refused the one fact we tried to write. The run itself lost nothing —
            // the summary re-reads the athlete and says plainly that the pass was not
            // recorded, which beats blocking someone at the end of six completed tests.
          }
          router.push('/practice/summary');
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
    stepLabel: stepPosition(step),
    practice: !session || session.kind === 'practice',
    complete,
    practiceDone,
    resetPractice: () => setPracticeDone(false),
    saving,
    saveError,
  };
}

/**
 * Shown when the final save failed. Never let a failed save look like a successful one.
 *
 * A solid reversed panel rather than a red-bordered one. Red in this app means "flagged" and
 * belongs to the results screen alone; a failed save is a different kind of bad news and
 * borrowing the accent for it would blunt the accent. On either surface, a solid block of
 * reversed type is the loudest object on the screen.
 */
export function SaveErrorNotice({ message, tone = 'dark' }: { message: string; tone?: 'dark' | 'light' }) {
  const box =
    tone === 'dark'
      ? 'bg-instrument-ink text-instrument'
      : 'bg-ink text-paper';
  return (
    <div role="alert" className={`mt-6 rounded-xl p-4 ${box}`}>
      <p className="text-title font-black">Not saved</p>
      <p className="mt-2 text-body">{message}</p>
    </div>
  );
}

/**
 * Shown on a test screen whenever nothing is being recorded — standalone practice AND a
 * chained practice run. It has to be unmistakable that this run is not being recorded, so a
 * coach never believes a check was saved when it wasn't.
 *
 * It reads the sitting itself rather than taking it as a prop, so the six test screens keep
 * rendering `<PracticeBanner />` unchanged. That read is safe here: every screen renders this
 * banner only after the battery hook has loaded on the client, so sessionStorage exists and
 * holds whatever the hook itself just read.
 *
 * `tone` exists because a test screen sits on the dark instrument surface while a document
 * screen is light — same message, two backgrounds.
 */
export function PracticeBanner({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const session = getSession();
  const practiceRun = session?.kind === 'practice' ? session : null;

  const styles =
    tone === 'dark'
      ? {
          box: 'border-2 border-instrument-ink-soft bg-instrument-panel',
          title: 'text-instrument-ink',
          body: 'text-instrument-ink-soft',
          link: 'text-instrument-ink',
        }
      : {
          box: 'border-2 border-ink/30 bg-paper',
          title: 'text-ink',
          body: 'text-ink-soft',
          link: 'text-ink',
        };

  return (
    <div className={`mb-6 rounded-xl p-4 ${styles.box}`}>
      <p className={`text-title font-black ${styles.title}`}>Practice run — nothing is saved</p>
      {practiceRun ? (
        <p className={`mt-2 text-body ${styles.body}`}>
          {practiceRun.athleteName ? (
            <>
              Practising as <strong className={styles.title}>{practiceRun.athleteName}</strong>. All
              six tests run in order; the scores are shown at the end and then thrown away.
              Finishing counts as their practice pass — the scores themselves are never stored.
            </>
          ) : (
            <>
              All six tests run in order; the scores are shown at the end and then thrown away.
              Nothing about this run is stored anywhere.
            </>
          )}
        </p>
      ) : (
        <p className={`mt-2 text-body ${styles.body}`}>
          No athlete is attached to this run.{' '}
          <Link
            href="/athletes"
            className={`inline-flex min-h-14 items-center font-bold underline underline-offset-4 ${styles.link}`}
          >
            Pick an athlete
          </Link>{' '}
          to record a real baseline or sideline check.
        </p>
      )}
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

  if (session.kind === 'practice') {
    return (
      <p className={`text-meta font-bold ${soft}`}>
        Practice run
        {session.athleteName && (
          <>
            {' '}
            · <span className={strong}>{session.athleteName}</span>
          </>
        )}
      </p>
    );
  }

  return (
    <p className={`text-meta font-bold ${soft}`}>
      {session.kind === 'baseline' ? 'Recording baseline' : 'Sideline check'} ·{' '}
      <span className={strong}>{session.athleteName}</span>
    </p>
  );
}
