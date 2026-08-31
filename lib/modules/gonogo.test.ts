// lib/modules/gonogo.test.ts
//
// Tests for the go/no-go rules. Everything worth getting wrong in this module is a decision
// about a single number — was that tap too fast, did that timer fire on time, what does an
// empty run score — so all of it is testable without rendering anything.
//
// The screen's own timing guards (the synchronous stimulus stamp, judging against a ref) are
// structural guards in lib/regression.test.ts, for the reason written at the top of that file:
// they are defects that only exist inside React's render model and we have no DOM harness.

import { describe, expect, it } from 'vitest';
import {
  GO_NO_MAX_TRIAL_REPEATS,
  GO_NO_MAX_GAP_MS,
  GO_NO_MIN_GAP_MS,
  GO_NO_MIN_PLAUSIBLE_RESPONSE_MS,
  GO_NO_STIMULUS_WINDOW_MS,
  GO_NO_TIMER_SLACK_MS,
  GO_NO_TOTAL_TRIALS,
  type TrialOutcome,
  gapDelayMs,
  isGoTrial,
  judgeResponse,
  judgeWindowClose,
  scoreGoNoGo,
  toStoredScore,
  windowIsWithinPlausibleCeiling,
} from './gonogo';
import { GO_NO_FORMS, GO_NO_NOGO_PER_FORM, GO_NO_TRIALS_PER_FORM } from '../forms';
import { MAX_PLAUSIBLE_REACTION_MS } from '../engine/thresholds';

/* ═══════════════════════════════════════════════════════════════════════════════════
   judgeResponse — is this tap a real response?
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('judgeResponse — anticipations are discarded, never recorded and never an error', () => {
  it('calls a tap faster than the plausible minimum an anticipation', () => {
    expect(judgeResponse(0).kind).toBe('anticipation');
    expect(judgeResponse(40).kind).toBe('anticipation');
    expect(judgeResponse(GO_NO_MIN_PLAUSIBLE_RESPONSE_MS - 1).kind).toBe('anticipation');
  });

  it('accepts a tap exactly at the plausible minimum', () => {
    // The boundary in the safe direction. A rule that also threw away legitimate fast responses
    // would bias the median upwards and make a genuinely quick athlete look slower than they are.
    expect(judgeResponse(GO_NO_MIN_PLAUSIBLE_RESPONSE_MS)).toEqual({
      kind: 'response',
      ms: GO_NO_MIN_PLAUSIBLE_RESPONSE_MS,
    });
  });

  it('accepts an ordinary response and rounds it to whole milliseconds', () => {
    expect(judgeResponse(312.6)).toEqual({ kind: 'response', ms: 313 });
  });

  it('accepts a slow response right up to the end of the window', () => {
    // A slowed response is the signal this whole module exists to measure. It must be recorded
    // as a number, not converted into an omission error, or the slowing disappears from the data.
    expect(judgeResponse(GO_NO_STIMULUS_WINDOW_MS)).toEqual({
      kind: 'response',
      ms: GO_NO_STIMULUS_WINDOW_MS,
    });
  });

  it('calls anything past the window stale rather than recording it', () => {
    // Past the window the only way a tap reaches us is that the closing timer was throttled —
    // the tab was backgrounded. That is not a measurement of the athlete.
    expect(judgeResponse(GO_NO_STIMULUS_WINDOW_MS + 1).kind).toBe('stale');
    expect(judgeResponse(9000).kind).toBe('stale');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   judgeWindowClose — did the timer fire when it was supposed to?
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('judgeWindowClose — a throttled timer must not invent omission errors', () => {
  it('treats an on-time close as a real close', () => {
    expect(judgeWindowClose(GO_NO_STIMULUS_WINDOW_MS)).toBe('closed');
    expect(judgeWindowClose(GO_NO_STIMULUS_WINDOW_MS + 10)).toBe('closed');
  });

  it('tolerates ordinary lateness, since timers are never exact', () => {
    expect(judgeWindowClose(GO_NO_STIMULUS_WINDOW_MS + GO_NO_TIMER_SLACK_MS)).toBe('closed');
  });

  it('refuses to believe a timer that fired seconds late', () => {
    // The phone-in-a-pocket case. Believing this would write a page of attention failures for an
    // athlete who was never shown anything.
    expect(judgeWindowClose(GO_NO_STIMULUS_WINDOW_MS + GO_NO_TIMER_SLACK_MS + 1)).toBe('stale');
    expect(judgeWindowClose(30_000)).toBe('stale');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   scoreGoNoGo — turning trials into the three numbers
   ═══════════════════════════════════════════════════════════════════════════════════ */

function outcomes(...items: TrialOutcome[]): TrialOutcome[] {
  return items;
}

describe('scoreGoNoGo', () => {
  it('takes the median of the go-trial responses', () => {
    const score = scoreGoNoGo(
      'gonogo-a',
      outcomes(
        { kind: 'go-response', ms: 300 },
        { kind: 'go-response', ms: 500 },
        { kind: 'go-response', ms: 400 },
      ),
    );

    expect(score?.medianMs).toBe(400);
    expect(score?.formId).toBe('gonogo-a');
  });

  it('keeps the raw response times in the order they happened', () => {
    // The order carries information a median cannot: drifting slower across a run and being
    // erratic throughout are the same median and very different sittings.
    const score = scoreGoNoGo(
      'gonogo-a',
      outcomes(
        { kind: 'go-response', ms: 500 },
        { kind: 'go-response', ms: 300 },
        { kind: 'go-response', ms: 400 },
      ),
    );

    expect(score?.goTrialsMs).toEqual([500, 300, 400]);
  });

  it('counts commission and omission errors separately, never added together', () => {
    // "Could not stop" and "was not there" are different findings. Collapsing them into one
    // number would throw the distinction away.
    const score = scoreGoNoGo(
      'gonogo-b',
      outcomes(
        { kind: 'go-response', ms: 350 },
        { kind: 'nogo-commission' },
        { kind: 'nogo-commission' },
        { kind: 'go-omission' },
        { kind: 'nogo-withheld' },
      ),
    );

    expect(score?.commissionErrors).toBe(2);
    expect(score?.omissionErrors).toBe(1);
  });

  it('counts a correct withhold towards nothing at all', () => {
    const withCorrectWithholds = scoreGoNoGo(
      'gonogo-b',
      outcomes(
        { kind: 'go-response', ms: 350 },
        { kind: 'nogo-withheld' },
        { kind: 'nogo-withheld' },
      ),
    );

    expect(withCorrectWithholds?.commissionErrors).toBe(0);
    expect(withCorrectWithholds?.omissionErrors).toBe(0);
    expect(withCorrectWithholds?.goTrialsMs).toEqual([350]);
  });

  it('returns null rather than inventing a median when nothing was responded to', () => {
    // A test nobody took must not produce a score. There is no honest median of no responses,
    // and every way of manufacturing one — zero, the window length, the baseline — is a
    // fabrication that would then be compared against a real number.
    const score = scoreGoNoGo(
      'gonogo-c',
      outcomes({ kind: 'go-omission' }, { kind: 'go-omission' }, { kind: 'nogo-withheld' }),
    );

    expect(score).toBeNull();
  });

  it('returns null for a run with no trials at all', () => {
    expect(scoreGoNoGo('gonogo-c', [])).toBeNull();
  });

  it('scores a single response without falling over', () => {
    const score = scoreGoNoGo('gonogo-a', outcomes({ kind: 'go-response', ms: 421 }));
    expect(score?.medianMs).toBe(421);
  });

  it('rounds an even-length median to a whole millisecond', () => {
    const score = scoreGoNoGo(
      'gonogo-a',
      outcomes({ kind: 'go-response', ms: 300 }, { kind: 'go-response', ms: 305 }),
    );

    // median is 302.5 — a stored score should be a whole number of milliseconds.
    expect(score?.medianMs).toBe(303);
    expect(Number.isInteger(score?.medianMs)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   toStoredScore — what actually reaches the record
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('toStoredScore', () => {
  it('carries exactly the four fields the data contract defines', () => {
    const run = scoreGoNoGo(
      'gonogo-a',
      outcomes(
        { kind: 'go-response', ms: 300 },
        { kind: 'nogo-commission' },
        { kind: 'go-omission' },
      ),
    );
    const stored = toStoredScore(run!);

    expect(Object.keys(stored).sort()).toEqual([
      'commissionErrors',
      'formId',
      'medianMs',
      'omissionErrors',
    ]);
  });

  it('does not smuggle the raw trial times into the record', () => {
    // Adding a field to ModuleScores.goNoGo means bumping CURRENT_SCHEMA_VERSION, which makes
    // every baseline already on a phone unreadable. If that is ever done it must be done on
    // purpose, not by a score object quietly growing a field.
    const run = scoreGoNoGo('gonogo-a', outcomes({ kind: 'go-response', ms: 300 }));
    expect(toStoredScore(run!)).not.toHaveProperty('goTrialsMs');
  });

  it('keeps the numbers identical to the run they came from', () => {
    const run = scoreGoNoGo(
      'gonogo-a',
      outcomes(
        { kind: 'go-response', ms: 300 },
        { kind: 'go-response', ms: 500 },
        { kind: 'nogo-commission' },
      ),
    )!;

    expect(toStoredScore(run)).toEqual({
      formId: run.formId,
      medianMs: run.medianMs,
      commissionErrors: run.commissionErrors,
      omissionErrors: run.omissionErrors,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   Pacing
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('pacing', () => {
  it('draws the gap between the two bounds', () => {
    expect(gapDelayMs(() => 0)).toBe(GO_NO_MIN_GAP_MS);
    expect(gapDelayMs(() => 1)).toBe(GO_NO_MAX_GAP_MS);
    expect(gapDelayMs(() => 0.5)).toBe((GO_NO_MIN_GAP_MS + GO_NO_MAX_GAP_MS) / 2);
  });

  it('has a gap range wide enough that the rhythm cannot be learned', () => {
    // A fixed gap would let the athlete move on the beat instead of on the stimulus, which turns
    // the response times into a measure of their sense of timing and lands taps on no-go trials.
    expect(GO_NO_MAX_GAP_MS - GO_NO_MIN_GAP_MS).toBeGreaterThanOrEqual(500);
  });

  it('keeps the response window under the app-wide plausible-reaction ceiling', () => {
    // No timed trial anywhere in this app may accept a three-second "reaction". Widening the
    // window past that ceiling has to fail here rather than silently start recording garbage.
    expect(windowIsWithinPlausibleCeiling()).toBe(true);
    expect(GO_NO_STIMULUS_WINDOW_MS).toBeLessThanOrEqual(MAX_PLAUSIBLE_REACTION_MS);
  });

  it('allows a repeat budget that is finite, so a broken run cannot loop forever', () => {
    expect(GO_NO_MAX_TRIAL_REPEATS).toBeGreaterThan(0);
    expect(Number.isFinite(GO_NO_MAX_TRIAL_REPEATS)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   The trial list comes from the pool, never from this module
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('trials come from the form pool', () => {
  it('takes its trial count from the pool rather than a number of its own', () => {
    expect(GO_NO_TOTAL_TRIALS).toBe(GO_NO_TRIALS_PER_FORM);
  });

  it('reads a trial kind through one function, so nothing compares the string inline', () => {
    expect(isGoTrial('go')).toBe(true);
    expect(isGoTrial('nogo')).toBe(false);
  });

  it('agrees with the pool about how many go trials a run contains', () => {
    // The screen tells the athlete how many go trials got a response, out of this number. If the
    // two ever disagreed the screen would report a fraction of a run that does not exist.
    for (const form of GO_NO_FORMS) {
      const goTrials = form.trials.filter(isGoTrial).length;
      expect(goTrials, form.id).toBe(GO_NO_TOTAL_TRIALS - GO_NO_NOGO_PER_FORM);
    }
  });
});
