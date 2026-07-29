// lib/session.test.ts
//
// Tests for the SAVE side of baseline pinning (Task 1).
//
// lib/engine/pinning.test.ts covers the READ side — given a check that already carries a pin,
// which baseline gets resolved. This file covers the half that happens earlier and only once:
// at the moment a sideline check is saved, finishSession() must stamp it with the baseline that
// is on file RIGHT THEN. If that stamp is never written, every check is un-pinned forever and
// the read-side logic silently falls back to "whatever baseline is current" — the exact bug
// pinning exists to prevent. So the stamp itself needs its own test.
//
// WHY MOCKING STORAGE IS ENOUGH: finishSession's only job beyond building the record is talking
// to storage. Swapping lib/storage for a tiny in-memory stand-in lets us assert exactly what
// finishSession tried to write, with no IndexedDB and no browser. finishSession takes the
// session as an argument, so no sessionStorage is needed either; the clearSession() it calls at
// the end is a no-op when there is no window, which is the case here.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Athlete, ModuleScores, TestResult } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';

/* ── An in-memory stand-in for lib/storage ────────────────────────────────────────── */

const athletes = new Map<string, Athlete>();
const saved: TestResult[] = [];

vi.mock('./storage', () => ({
  getAthletes: async () => [...athletes.values()],
  saveAthlete: async (athlete: Athlete) => {
    athletes.set(athlete.id, { ...athlete });
  },
  saveResult: async (result: TestResult) => {
    saved.push(result);
  },
}));

// Imported AFTER vi.mock so the mock is the one it binds to.
const { finishSession } = await import('./session');

/* ── Fixtures ─────────────────────────────────────────────────────────────────────── */

const ATHLETE = 'athlete-1';

function emptyScores(): ModuleScores {
  return {
    symptom: null,
    reaction: { trialsMs: [300], medianMs: 300, falseStarts: 0 },
    scan: null,
    balance: null,
  };
}

function session(kind: 'baseline' | 'check') {
  return {
    athleteId: ATHLETE,
    athleteName: 'Jordan',
    kind,
    startedAt: 1_700_000_000_000,
    scores: emptyScores(),
  };
}

function putAthlete(baselineId: string | null): Athlete {
  const athlete: Athlete = { id: ATHLETE, name: 'Jordan', baselineId, checkIds: [] };
  athletes.set(ATHLETE, athlete);
  return athlete;
}

beforeEach(() => {
  athletes.clear();
  saved.length = 0;
});

/* ── The stamp ────────────────────────────────────────────────────────────────────── */

describe('finishSession pins a check to the baseline on file at save time', () => {
  it('stamps comparedToBaselineId with the athlete current baseline', async () => {
    putAthlete('b1');

    const result = await finishSession(session('check'));

    expect(result.kind).toBe('check');
    expect(result.comparedToBaselineId).toBe('b1');
    // The record that actually went to storage carries the pin too — not just the returned copy.
    expect(saved[0]?.comparedToBaselineId).toBe('b1');
  });

  it('pins to the baseline current at THAT moment, so a later re-baseline cannot move it', async () => {
    putAthlete('b1');
    const firstCheck = await finishSession(session('check'));
    expect(firstCheck.comparedToBaselineId).toBe('b1');

    // The athlete records a new baseline; finishSession moves the pointer to it.
    const newBaseline = await finishSession(session('baseline'));
    expect(athletes.get(ATHLETE)?.baselineId).toBe(newBaseline.id);

    // A check taken now pins to the NEW baseline...
    const secondCheck = await finishSession(session('check'));
    expect(secondCheck.comparedToBaselineId).toBe(newBaseline.id);

    // ...while the earlier check's pin is untouched. This is the whole point: two checks on the
    // same athlete can legitimately be scored against two different baselines.
    expect(firstCheck.comparedToBaselineId).toBe('b1');
    expect(secondCheck.comparedToBaselineId).not.toBe(firstCheck.comparedToBaselineId);
  });

  it('leaves a BASELINE recording un-pinned — the field is only ever set on checks', async () => {
    putAthlete('b1');

    const result = await finishSession(session('baseline'));

    expect(result.kind).toBe('baseline');
    expect(result.comparedToBaselineId).toBeUndefined();
  });

  it('leaves a check un-pinned when the athlete has no baseline at all', async () => {
    putAthlete(null);

    const result = await finishSession(session('check'));

    // Deliberately absent rather than null or "": this is a genuinely baseline-less check, which
    // the results screen must REFUSE. It must not look like a legacy record, and it must never
    // be handed a stand-in id that would make the comparison look possible.
    expect(result.comparedToBaselineId).toBeUndefined();
  });

  it('does not crash when the athlete cannot be loaded at all', async () => {
    // No athlete in storage. The sitting is still saved rather than lost, just without a pin.
    const result = await finishSession(session('check'));

    expect(result.comparedToBaselineId).toBeUndefined();
    expect(saved).toHaveLength(1);
  });

  it('still updates the athlete pointers alongside the pin', async () => {
    putAthlete('b1');

    const check = await finishSession(session('check'));

    // The check is appended to checkIds and the baseline pointer is left alone.
    expect(athletes.get(ATHLETE)?.checkIds).toContain(check.id);
    expect(athletes.get(ATHLETE)?.baselineId).toBe('b1');
  });
});

/* ── The schema stamp ─────────────────────────────────────────────────────────────── */

describe('finishSession stamps the schema version on every record it writes', () => {
  // The write half of record versioning. lib/schema.test.ts covers the read half — filling
  // the field in for records that predate it. This covers the half that has to happen at save
  // time, because a record's version describes the battery that PRODUCED it and nothing read
  // later can reconstruct that. If this stamp stopped happening, every new sitting would come
  // back off disk labelled "legacy" by the normaliser, and once the current version moves past
  // 1 the guard would start refusing records this very build had just written.

  it('stamps a baseline with the current version', async () => {
    putAthlete(null);

    const result = await finishSession(session('baseline'));

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(saved[0]?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('stamps a check with the current version', async () => {
    putAthlete('b1');

    const result = await finishSession(session('check'));

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(saved[0]?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('writes a real version number, never undefined', async () => {
    // Guards the specific slip of adding the field to the returned object but not to the one
    // that goes to storage, which would be invisible until months-old records were read back.
    putAthlete('b1');

    await finishSession(session('check'));

    expect(saved[0]?.schemaVersion).toBeTypeOf('number');
    expect(saved[0]?.schemaVersion).toBeGreaterThan(0);
  });
});
