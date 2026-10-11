// lib/import.test.ts
//
// Tests for restoring an exported file. The centrepiece is a real round trip: build an export
// with the real exporter, serialise it to the exact text a downloaded file holds, parse it
// back, and require the records to come out identical. The rest checks that malformed files
// are refused with a plain error rather than repaired, and that a collision is reported
// instead of being overwritten.
//
// The IndexedDB write (restoreAthlete) is not run here: this harness is node-only and adding a
// fake IndexedDB would be a new dependency. It uses `add`, not `put`, so an unexpected
// collision fails the transaction instead of overwriting.

import { describe, expect, it } from 'vitest';
import type { Athlete, ModuleScores, TestResult } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { buildAthleteExport, serialiseExport } from './export';
import { parseAthleteExport, planImport } from './import';

function scores(): ModuleScores {
  return {
    symptom: { itemScores: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], total: 1 },
    wordLearning: { formId: 'words-b', hits: 9, falseAlarms: 0, correct: 19 },
    wordRecognition: { formId: 'words-b', hits: 7, falseAlarms: 2, correct: 15 },
    digitSpan: { formId: 'digits-b', trialsCorrect: [true, true, false], correct: 2 },
    patternSpan: { formId: 'pattern-b', trialsCorrect: [true, false], correct: 1 },
    goNoGo: { formId: 'gng-b', medianMs: 412.5, commissionErrors: 1, omissionErrors: 0 },
    balance: null,
  };
}

function result(id: string, kind: 'baseline' | 'check', takenAt: number): TestResult {
  return {
    id,
    athleteId: 'ath-1',
    takenAt,
    kind,
    scores: scores(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...(kind === 'check' ? { comparedToBaselineId: 'r-base' } : {}),
  };
}

const athlete: Athlete = {
  id: 'ath-1',
  name: 'Jordan Reyes',
  baselineId: 'r-base',
  checkIds: ['r-check'],
  practiceCompletedAt: 123,
  practicePassCount: 2,
};
const results = [result('r-base', 'baseline', 1000), result('r-check', 'check', 2000)];

function exportedText(): string {
  return serialiseExport(buildAthleteExport(athlete, results, Date.UTC(2026, 9, 11)));
}

function mutate(edit: (file: Record<string, any>) => void): string {
  const file = JSON.parse(exportedText());
  edit(file);
  return JSON.stringify(file);
}

describe('import: round trip', () => {
  it('restores exactly what the exporter wrote', () => {
    const parsed = parseAthleteExport(exportedText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.athlete).toEqual({
      id: 'ath-1',
      name: 'Jordan Reyes',
      baselineId: 'r-base',
      checkIds: ['r-check'],
    });
    expect(parsed.data.results).toEqual(results);
  });

  it('keeps a null module null and does not invent one', () => {
    const parsed = parseAthleteExport(exportedText());
    if (!parsed.ok) throw new Error('should parse');
    expect(parsed.data.results[0].scores.balance).toBeNull();
  });
});

describe('import: refuses malformed files with a plain error', () => {
  const cases: [string, string][] = [
    ['not JSON', '{ nope'],
    ['not an export', JSON.stringify({ hello: 'world' })],
    ['an array', '[]'],
    ['wrong format version', mutate((f) => { f.exportFormatVersion = 99; })],
    ['no athlete name', mutate((f) => { f.athlete.name = ''; })],
    ['result from another athlete', mutate((f) => { f.results[0].athleteId = 'someone-else'; })],
    ['duplicate result id', mutate((f) => { f.results[1].id = f.results[0].id; })],
    ['bad kind', mutate((f) => { f.results[0].kind = 'cleared'; })],
    ['missing schemaVersion', mutate((f) => { delete f.results[0].schemaVersion; })],
    ['newer schemaVersion', mutate((f) => { f.results[0].schemaVersion = CURRENT_SCHEMA_VERSION + 1; })],
    ['missing module key', mutate((f) => { delete f.results[0].scores.goNoGo; })],
    ['wrong type inside a module', mutate((f) => { f.results[0].scores.digitSpan.correct = 'nine'; })],
    ['negative count', mutate((f) => { f.results[0].scores.wordLearning.hits = -1; })],
    ['baseline not in file', mutate((f) => { f.athlete.baselineId = 'ghost'; })],
    ['check not in file', mutate((f) => { f.athlete.checkIds = ['ghost']; })],
  ];

  it.each(cases)('%s', (_name, text) => {
    const parsed = parseAthleteExport(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(10);
  });
});

describe('import: collisions are reported, never overwritten silently', () => {
  const parsed = (() => {
    const p = parseAthleteExport(exportedText());
    if (!p.ok) throw new Error('should parse');
    return p.data;
  })();

  it('a clean device has nothing to replace', () => {
    expect(planImport(parsed, [], new Map())).toEqual({ replaces: null, blocked: null });
  });

  it('same athlete id is flagged as a replacement, to be confirmed', () => {
    const plan = planImport(parsed, [athlete], new Map([['r-base', 'ath-1']]));
    expect(plan.replaces?.id).toBe('ath-1');
    expect(plan.blocked).toBeNull();
  });

  it('same name under a different id is also a replacement', () => {
    const other = { ...athlete, id: 'ath-9' };
    expect(planImport(parsed, [other], new Map()).replaces?.id).toBe('ath-9');
  });

  it('a result id owned by a different athlete is refused outright', () => {
    const plan = planImport(parsed, [], new Map([['r-base', 'ath-other']]));
    expect(plan.blocked).not.toBeNull();
  });
});
