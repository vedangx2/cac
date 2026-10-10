// lib/storage.test.ts
//
// Tests for the athlete normaliser — the read-side half of the first-exposure guard.
//
// WHY THIS FILE EXISTS (review finding, 2026-09-10): `Athlete.practiceCompletedAt` was added
// with a fail-CLOSED promise — an athlete saved before the field existed reads back as
// "never practised", so the baseline gate stays locked. But the gate checks
// `practiceCompletedAt === null`, and a record that skipped normalisation carries
// `undefined`, which fails that check the WRONG way: the button would enable for an athlete
// who never practised. So the normaliser gets behavioural tests, and the two read paths in
// storage.ts get the same structural guard treatment lib/schema.test.ts gives the
// TestResult read paths — the pattern this file deliberately copies.
//
// (Behavioural tests for getAthlete/getAthletes themselves would need an IndexedDB stand-in;
// the structural guards below are the honest node-only equivalent, with the same limitation
// the other structural guards in this repo state openly: they prove the wiring is written,
// not that it runs.)

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type StoredAthlete, normaliseAthlete } from './storage';
import { PRACTICE_PASSES_REQUIRED, canRecordBaseline, practicePassesRemaining } from './practice';

const STORAGE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'storage.ts'),
  'utf8',
);

/* ── Behaviour ────────────────────────────────────────────────────────────────────── */

describe('normaliseAthlete fails closed', () => {
  it('treats an athlete saved before the field existed as never having practised', () => {
    // No practiceCompletedAt key at all — the on-disk shape from before 2026-09-10.
    const legacy: StoredAthlete = { id: 'a1', name: 'Jordan', baselineId: null, checkIds: [] };

    expect(normaliseAthlete(legacy).practiceCompletedAt).toBeNull();
  });

  it('leaves an explicit null alone', () => {
    const stored: StoredAthlete = {
      id: 'a1',
      name: 'Jordan',
      baselineId: null,
      checkIds: [],
      practiceCompletedAt: null,
    };

    expect(normaliseAthlete(stored).practiceCompletedAt).toBeNull();
  });

  it('preserves a recorded pass untouched', () => {
    const stored: StoredAthlete = {
      id: 'a1',
      name: 'Jordan',
      baselineId: 'b1',
      checkIds: ['c1'],
      practiceCompletedAt: 1_700_000_000_000,
    };

    const athlete = normaliseAthlete(stored);
    expect(athlete.practiceCompletedAt).toBe(1_700_000_000_000);
    expect(athlete.baselineId).toBe('b1');
    expect(athlete.checkIds).toEqual(['c1']);
  });

  it('returns a new object rather than mutating what was on disk', () => {
    const legacy: StoredAthlete = { id: 'a1', name: 'Jordan', baselineId: null, checkIds: [] };

    const athlete = normaliseAthlete(legacy);
    expect(athlete).not.toBe(legacy);
    expect('practiceCompletedAt' in legacy).toBe(false); // the raw record is untouched
  });

  it('never produces undefined — the value the gate cannot tell from "practised"', () => {
    // The precise failure this file guards: `undefined === null` is false, so an
    // un-normalised athlete would ENABLE the baseline button. Whatever comes in, the field
    // going out must be a number or null, never undefined.
    const shapes: StoredAthlete[] = [
      { id: 'a1', name: 'J', baselineId: null, checkIds: [] },
      { id: 'a2', name: 'J', baselineId: null, checkIds: [], practiceCompletedAt: undefined },
      { id: 'a3', name: 'J', baselineId: null, checkIds: [], practiceCompletedAt: null },
      { id: 'a4', name: 'J', baselineId: null, checkIds: [], practiceCompletedAt: 5 },
    ];

    for (const shape of shapes) {
      expect(normaliseAthlete(shape).practiceCompletedAt).not.toBeUndefined();
    }
  });
});

describe('practicePassCount migration — a legacy athlete is NOT unlocked', () => {
  // An earlier migration of this guard unlocked old records by mistake. The old rule needed
  // ONE pass; the new rule needs TWO, so a record with the old single timestamp is one pass in
  // and must still be locked.
  const base = { id: 'a1', name: 'Jordan', baselineId: 'b1', checkIds: [] as string[] };

  it('counts a legacy single practiceCompletedAt as exactly ONE pass', () => {
    const athlete = normaliseAthlete({ ...base, practiceCompletedAt: 1_700_000_000_000 });
    expect(athlete.practicePassCount).toBe(1);
    expect(canRecordBaseline(athlete)).toBe(false);
    expect(practicePassesRemaining(athlete)).toBe(1);
  });

  it('counts a legacy never-practised athlete as zero, locked', () => {
    for (const legacy of [
      { ...base },
      { ...base, practiceCompletedAt: null },
      { ...base, practiceCompletedAt: undefined },
    ] as StoredAthlete[]) {
      const athlete = normaliseAthlete(legacy);
      expect(athlete.practicePassCount).toBe(0);
      expect(canRecordBaseline(athlete)).toBe(false);
    }
  });

  it('keeps an existing baseline pointer — nothing is invalidated', () => {
    expect(normaliseAthlete({ ...base, practiceCompletedAt: 5 }).baselineId).toBe('b1');
  });

  it('keeps a stored count of two, and unlocks only then', () => {
    const athlete = normaliseAthlete({ ...base, practiceCompletedAt: 5, practicePassCount: 2 });
    expect(athlete.practicePassCount).toBe(2);
    expect(canRecordBaseline(athlete)).toBe(true);
  });

  it('a stored count wins over the timestamp (one stamp, two passes is not one)', () => {
    expect(normaliseAthlete({ ...base, practiceCompletedAt: 5, practicePassCount: 1 }).practicePassCount).toBe(1);
  });

  it('treats unusable counts as untrusted: falls back to the timestamp, never unlocks', () => {
    for (const bad of [NaN, -3, 1.5, Infinity]) {
      const athlete = normaliseAthlete({ ...base, practiceCompletedAt: null, practicePassCount: bad });
      expect(athlete.practicePassCount).toBe(0);
      expect(canRecordBaseline(athlete)).toBe(false);
    }
    const withStamp = normaliseAthlete({ ...base, practiceCompletedAt: 5, practicePassCount: NaN });
    expect(withStamp.practicePassCount).toBe(1);
    expect(canRecordBaseline(withStamp)).toBe(false);
  });

  it('the gate itself fails closed on a record that skipped normalisation', () => {
    // @ts-expect-error — deliberately the un-normalised shape the compiler normally prevents
    expect(canRecordBaseline({})).toBe(false);
    // @ts-expect-error — NaN/undefined must not compare their way to "unlocked"
    expect(canRecordBaseline({ practicePassCount: undefined })).toBe(false);
    expect(canRecordBaseline({ practicePassCount: NaN })).toBe(false);
    expect(canRecordBaseline({ practicePassCount: -1 })).toBe(false);
    expect(canRecordBaseline({ practicePassCount: 1 })).toBe(false);
    expect(canRecordBaseline({ practicePassCount: 2 })).toBe(true);
  });

  it('requires two passes', () => {
    expect(PRACTICE_PASSES_REQUIRED).toBe(2);
  });
});

/* ── The read paths (structural guards, same technique as lib/schema.test.ts) ────────── */

describe('every athlete read path in storage.ts is normalised (structural guard)', () => {
  it('types both raw reads as StoredAthlete, so skipping the normaliser cannot compile', () => {
    expect(STORAGE_SRC).toMatch(/const athletes: StoredAthlete\[\]/);
    expect(STORAGE_SRC).toMatch(/const athlete: StoredAthlete \| undefined/);
  });

  it('getAthletes maps every record through normaliseAthlete', () => {
    expect(STORAGE_SRC).toMatch(/athletes\.map\(normaliseAthlete\)/);
  });

  it('getAthlete normalises the single record it returns', () => {
    expect(STORAGE_SRC).toMatch(/athlete \? normaliseAthlete\(athlete\) : null/);
  });
});
