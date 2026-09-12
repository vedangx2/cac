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
