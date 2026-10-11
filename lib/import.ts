// lib/import.ts
//
// GETTING AN EXPORTED FILE BACK ONTO A PHONE.
//
// The export (lib/export.ts) was one-way until this file: data could leave the device but not
// return, so a cleared browser or a new phone meant every baseline was gone. This reads one of
// those exported files back and says, in plain words, whether it can be trusted.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE RULE: REFUSE ANYTHING WE DO NOT FULLY UNDERSTAND
// ═════════════════════════════════════════════════════════════════════════════════════
// A file picked from a downloads folder could be anything: hand-edited, truncated, from another
// app, or from a newer version of this one. Restoring a half-understood record is worse than
// restoring nothing, because a baseline with a wrong shape is compared field-by-field against a
// check, and that comparison is the safety-relevant step of the whole app. So this parser
// checks every field the app later reads and refuses the WHOLE file on the first problem. It
// never repairs, guesses, or skips a bad record.
//
// This file is pure — no storage, no DOM — so it can be tested directly. The write to
// IndexedDB lives in lib/storage.ts (restoreAthlete), and the "ask before replacing" step lives
// in the roster screen.

import type { Athlete, ModuleScores, TestResult } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { EXPORT_FORMAT_VERSION } from './export';

/** A hard ceiling so a wrong, enormous file is refused instead of freezing the tab. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ParsedImport = {
  /** The athlete as exported. Practice-pass fields are not in an export, so they are not here. */
  athlete: { id: string; name: string; baselineId: string | null; checkIds: string[] };
  results: TestResult[];
};

export type ImportParse = { ok: true; data: ParsedImport } | { ok: false; error: string };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 0;
const isBoolArray = (v: unknown): v is boolean[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'boolean');

/** Each module is null (not taken) or an object of exactly the fields the app reads. */
const MODULE_CHECKS: Record<keyof ModuleScores, (m: Obj) => boolean> = {
  symptom: (m) => Array.isArray(m.itemScores) && m.itemScores.every(isCount) && isCount(m.total),
  wordLearning: (m) =>
    isStr(m.formId) && isCount(m.hits) && isCount(m.falseAlarms) && isCount(m.correct),
  wordRecognition: (m) =>
    isStr(m.formId) && isCount(m.hits) && isCount(m.falseAlarms) && isCount(m.correct),
  digitSpan: (m) => isStr(m.formId) && isBoolArray(m.trialsCorrect) && isCount(m.correct),
  patternSpan: (m) => isStr(m.formId) && isBoolArray(m.trialsCorrect) && isCount(m.correct),
  goNoGo: (m) =>
    isStr(m.formId) &&
    isNum(m.medianMs) &&
    isCount(m.commissionErrors) &&
    isCount(m.omissionErrors),
  balance: (m) => isNum(m.swayScore),
};

const MODULE_KEYS = Object.keys(MODULE_CHECKS) as (keyof ModuleScores)[];

function checkScores(scores: unknown): string | null {
  if (!isObj(scores)) return 'a result has no scores';
  for (const key of MODULE_KEYS) {
    const value = scores[key];
    if (value === undefined) return `a result is missing the "${key}" scores`;
    if (value === null) continue;
    if (!isObj(value) || !MODULE_CHECKS[key](value)) return `a result has malformed "${key}" scores`;
  }
  return null;
}

const fail = (error: string): ImportParse => ({ ok: false, error });

/** Parse and fully validate the text of an exported file. */
export function parseAthleteExport(text: string): ImportParse {
  if (text.length > MAX_IMPORT_BYTES) return fail('That file is too large to be a Sideline Check export.');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('That file is not valid JSON, so it cannot be a Sideline Check export.');
  }

  if (!isObj(raw)) return fail('That file is not a Sideline Check export.');
  if (raw.exportFormatVersion !== EXPORT_FORMAT_VERSION) {
    return fail('That file is not a Sideline Check export, or comes from an incompatible version.');
  }
  if (!isObj(raw.athlete) || !Array.isArray(raw.results)) {
    return fail('That export is missing its athlete or its results.');
  }

  const a = raw.athlete;
  if (!isStr(a.id) || !isStr(a.name) || !a.name.trim()) {
    return fail('The athlete in that file has no id or name.');
  }
  if (a.baselineId !== null && !isStr(a.baselineId)) {
    return fail('The athlete baseline reference in that file is malformed.');
  }
  if (!Array.isArray(a.checkIds) || !a.checkIds.every(isStr)) {
    return fail('The athlete list of checks in that file is malformed.');
  }

  const results: TestResult[] = [];
  const ids = new Set<string>();

  for (const entry of raw.results) {
    if (!isObj(entry)) return fail('One of the results is malformed.');
    if (!isStr(entry.id)) return fail('A result has no id.');
    if (ids.has(entry.id)) return fail('The same result appears twice in that file.');
    ids.add(entry.id);
    if (entry.athleteId !== a.id) return fail('A result in that file belongs to a different athlete.');
    if (!isNum(entry.takenAt)) return fail('A result has no valid date.');
    if (entry.kind !== 'baseline' && entry.kind !== 'check') {
      return fail('A result is neither a baseline nor a check.');
    }
    if (!Number.isInteger(entry.schemaVersion) || (entry.schemaVersion as number) < 1) {
      return fail('A result has no valid schema version.');
    }
    if ((entry.schemaVersion as number) > CURRENT_SCHEMA_VERSION) {
      return fail('That file was made by a newer version of the app. Update the app and try again.');
    }
    if (entry.comparedToBaselineId !== undefined && !isStr(entry.comparedToBaselineId)) {
      return fail('A check has a malformed baseline reference.');
    }
    const scoresProblem = checkScores(entry.scores);
    if (scoresProblem) return fail(`That file is malformed: ${scoresProblem}.`);

    results.push(entry as unknown as TestResult);
  }

  // Cross-references: the athlete record may only point at results that are in the file.
  if (a.baselineId !== null && !ids.has(a.baselineId)) {
    return fail('The athlete baseline is not included in that file.');
  }
  if (!(a.checkIds as string[]).every((id) => ids.has(id))) {
    return fail('The athlete lists a check that is not included in that file.');
  }

  return {
    ok: true,
    data: {
      athlete: {
        id: a.id,
        name: a.name,
        baselineId: a.baselineId as string | null,
        checkIds: [...(a.checkIds as string[])],
      },
      results,
    },
  };
}

/**
 * Work out what, if anything, importing would collide with. Pure.
 *
 * `existingResultOwners` maps result id -> athleteId for results already on the device.
 *   - `replaces` is the athlete already on the device that this file would overwrite: same id,
 *     or the same name (the roster refuses duplicate names, so same name counts too). The
 *     person is asked before that happens.
 *   - `blocked` is set when the file cannot be restored safely at all, so it is refused
 *     outright rather than asked about.
 */
export function planImport(
  parsed: ParsedImport,
  existingAthletes: readonly Athlete[],
  existingResultOwners: ReadonlyMap<string, string>,
): { replaces: Athlete | null; blocked: string | null } {
  const sameId = existingAthletes.find((x) => x.id === parsed.athlete.id) ?? null;
  const sameName =
    existingAthletes.find(
      (x) => x.name.trim().toLowerCase() === parsed.athlete.name.trim().toLowerCase(),
    ) ?? null;

  if (sameId && sameName && sameId.id !== sameName.id) {
    return { replaces: null, blocked: 'That file matches two different athletes already on this device.' };
  }
  const replaces = sameId ?? sameName;

  for (const result of parsed.results) {
    const owner = existingResultOwners.get(result.id);
    if (owner !== undefined && owner !== replaces?.id) {
      return { replaces: null, blocked: 'A result in that file already belongs to a different athlete here.' };
    }
  }
  return { replaces, blocked: null };
}
