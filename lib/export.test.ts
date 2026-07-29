// lib/export.test.ts
//
// Tests for the JSON export.
//
// The export is what unblocks the whole threshold plan — until it existed there was no way to
// get a single recorded number off a phone and look at it. So the thing worth testing hardest is
// that it copies records out FAITHFULLY: no interpreting, no summarising, no quietly dropping
// records the current build cannot compare. An export that silently omitted the old sittings
// would take the analyst's data away at exactly the moment they went looking for it.
//
// The download itself (downloadJson) is not tested here: it is four lines of DOM calls, there is
// no DOM in this environment, and giving it one would mean a new dependency, which CLAUDE.md
// rules out.

import { describe, expect, it } from 'vitest';
import type { Athlete, ModuleScores, TestResult } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';
import {
  EXPORT_FORMAT_VERSION,
  buildAthleteExport,
  exportFilename,
  serialiseExport,
} from './export';

/* ── Fixtures ─────────────────────────────────────────────────────────────────────── */

const EXPORTED_AT = Date.UTC(2026, 6, 29, 14, 30, 0); // 29 July 2026
const BASELINE_TIME = Date.UTC(2026, 5, 1, 9, 0, 0);
const CHECK_TIME = Date.UTC(2026, 6, 20, 17, 0, 0);

function scores(): ModuleScores {
  return {
    symptom: { itemScores: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], total: 1 },
    reaction: { trialsMs: [301, 288, 315, 297, 330], medianMs: 301, falseStarts: 1 },
    scan: { elapsedMs: 21_400, errors: 0 },
    balance: null,
  };
}

function result(
  id: string,
  kind: 'baseline' | 'check',
  takenAt: number,
  schemaVersion = CURRENT_SCHEMA_VERSION,
): TestResult {
  return { id, athleteId: 'a1', takenAt, kind, scores: scores(), schemaVersion };
}

function athlete(): Athlete {
  return { id: 'a1', name: 'Jordan Lee', baselineId: 'b1', checkIds: ['c1'] };
}

/* ── The envelope ─────────────────────────────────────────────────────────────────── */

describe('buildAthleteExport', () => {
  it('includes the athlete profile', () => {
    const data = buildAthleteExport(athlete(), [], EXPORTED_AT);

    expect(data.athlete.id).toBe('a1');
    expect(data.athlete.name).toBe('Jordan Lee');
    expect(data.athlete.baselineId).toBe('b1');
    expect(data.athlete.checkIds).toEqual(['c1']);
  });

  it('stamps the export format version and the app battery version', () => {
    // Two different versions on purpose: one describes this envelope, the other describes what
    // the records inside mean. An analyst needs both.
    const data = buildAthleteExport(athlete(), [], EXPORTED_AT);

    expect(data.exportFormatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(data.appSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('records when the export was taken, as an ISO timestamp', () => {
    expect(buildAthleteExport(athlete(), [], EXPORTED_AT).exportedAt).toBe('2026-07-29T14:30:00.000Z');
  });

  it('carries a warning inside the file, not only in the UI', () => {
    // The warning has to travel WITH the data. Once the file is forwarded, whatever the screen
    // said when it was produced is gone.
    const { notice } = buildAthleteExport(athlete(), [], EXPORTED_AT);

    expect(notice).toMatch(/not a medical record/i);
    expect(notice).toMatch(/not anonymised/i);
    expect(notice).toMatch(/placeholder/i);
  });

  it('never claims anyone is fine', () => {
    const data = buildAthleteExport(athlete(), [result('b1', 'baseline', BASELINE_TIME)], EXPORTED_AT);
    const text = serialiseExport(data);

    expect(text).not.toMatch(/cleared|safe to play|healthy|no concussion/i);
  });
});

/* ── Faithfulness of the records ──────────────────────────────────────────────────── */

describe('buildAthleteExport copies records out faithfully', () => {
  it('includes every record', () => {
    const results = [result('b1', 'baseline', BASELINE_TIME), result('c1', 'check', CHECK_TIME)];

    expect(buildAthleteExport(athlete(), results, EXPORTED_AT).results).toHaveLength(2);
  });

  it('sorts oldest first, whatever order it was handed', () => {
    const results = [result('c1', 'check', CHECK_TIME), result('b1', 'baseline', BASELINE_TIME)];
    const exported = buildAthleteExport(athlete(), results, EXPORTED_AT).results;

    expect(exported.map((r) => r.id)).toEqual(['b1', 'c1']);
  });

  it('preserves every field of a record, including the raw trial arrays', () => {
    // The raw per-trial numbers are the entire point of the export. A median can be recomputed;
    // the five individual trials it came from cannot.
    const original = result('b1', 'baseline', BASELINE_TIME);
    const exported = buildAthleteExport(athlete(), [original], EXPORTED_AT).results[0];

    expect(exported).toEqual(original);
    expect(exported.scores.reaction?.trialsMs).toEqual([301, 288, 315, 297, 330]);
    expect(exported.scores.reaction?.falseStarts).toBe(1);
    expect(exported.scores.symptom?.itemScores).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('keeps the schemaVersion on each record', () => {
    // What tells an analyst which records belong together. Without it a folder of exports is
    // just numbers of unknown provenance.
    const exported = buildAthleteExport(athlete(), [result('b1', 'baseline', BASELINE_TIME)], EXPORTED_AT);

    expect(exported.results[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('does NOT drop records from an older battery version', () => {
    // The important one. The engine refuses to COMPARE across versions, and it is right to. But
    // an old sitting is still real data and still worth analysing, so the export must not
    // quietly filter it out — that would silently shrink the dataset the thresholds depend on.
    const results = [
      result('old', 'baseline', BASELINE_TIME, CURRENT_SCHEMA_VERSION - 1),
      result('new', 'check', CHECK_TIME, CURRENT_SCHEMA_VERSION),
    ];

    const exported = buildAthleteExport(athlete(), results, EXPORTED_AT).results;

    expect(exported.map((r) => r.id)).toEqual(['old', 'new']);
    expect(exported[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION - 1);
  });

  it('adds no computed or summary fields of its own', () => {
    // An export that computed its own averages would become a second opinion that could disagree
    // with the app, with no way to tell which was right.
    const exported = buildAthleteExport(athlete(), [result('b1', 'baseline', BASELINE_TIME)], EXPORTED_AT);

    expect(Object.keys(exported.results[0]).sort()).toEqual(
      ['athleteId', 'id', 'kind', 'schemaVersion', 'scores', 'takenAt'].sort(),
    );
  });

  it('does not mutate or alias the array it was given', () => {
    const results = [result('c1', 'check', CHECK_TIME), result('b1', 'baseline', BASELINE_TIME)];
    const before = results.map((r) => r.id);

    buildAthleteExport(athlete(), results, EXPORTED_AT);

    expect(results.map((r) => r.id)).toEqual(before);
  });

  it('handles an athlete with no records at all', () => {
    const data = buildAthleteExport({ ...athlete(), baselineId: null, checkIds: [] }, [], EXPORTED_AT);

    expect(data.results).toEqual([]);
    expect(data.athlete.baselineId).toBeNull();
  });
});

/* ── Filenames ────────────────────────────────────────────────────────────────────── */

describe('exportFilename', () => {
  it('builds a readable, date-stamped name', () => {
    expect(exportFilename('Jordan Lee', EXPORTED_AT)).toBe('sideline-check-jordan-lee-2026-07-29.json');
  });

  it('strips characters that break filesystems', () => {
    // A raw name reaches a filesystem here. Slashes, quotes and accents cause anything from an
    // ugly name to a silently failed save depending on the platform.
    expect(exportFilename('Ana "Nana" O\'Brien-Ruiz/2', EXPORTED_AT)).toBe(
      'sideline-check-ana-nana-o-brien-ruiz-2-2026-07-29.json',
    );
  });

  it('never produces leading or trailing hyphens in the slug', () => {
    expect(exportFilename('  Sam  ', EXPORTED_AT)).toBe('sideline-check-sam-2026-07-29.json');
  });

  it('falls back to a usable name when nothing survives slugging', () => {
    // A name written entirely in a non-Latin script slugs to an empty string. A file called
    // "sideline-check--2026-07-29.json" is confusing; falling back is kinder.
    expect(exportFilename('日本語', EXPORTED_AT)).toBe('sideline-check-athlete-2026-07-29.json');
    expect(exportFilename('', EXPORTED_AT)).toBe('sideline-check-athlete-2026-07-29.json');
  });

  it('caps a very long name', () => {
    const name = exportFilename('a'.repeat(200), EXPORTED_AT);

    expect(name.length).toBeLessThan(80);
    expect(name.endsWith('-2026-07-29.json')).toBe(true);
  });
});

/* ── Serialisation ────────────────────────────────────────────────────────────────── */

describe('serialiseExport', () => {
  it('produces valid, re-readable JSON', () => {
    const data = buildAthleteExport(athlete(), [result('b1', 'baseline', BASELINE_TIME)], EXPORTED_AT);
    const parsed = JSON.parse(serialiseExport(data));

    expect(parsed.athlete.name).toBe('Jordan Lee');
    expect(parsed.results[0].scores.reaction.medianMs).toBe(301);
  });

  it('is pretty-printed, because a human opens this in a text editor', () => {
    const text = serialiseExport(buildAthleteExport(athlete(), [], EXPORTED_AT));

    expect(text).toContain('\n  ');
    expect(text.endsWith('\n')).toBe(true);
  });
});
