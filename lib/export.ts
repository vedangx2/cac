// lib/export.ts
//
// GETTING DATA OFF THE PHONE.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, AND WHY IT IS NOT A "NICE TO HAVE"
// ═════════════════════════════════════════════════════════════════════════════════════
// Every flagging threshold in this app is a placeholder guess, and the only honest way to
// replace a guess is with collected measurements. But the measurements live in IndexedDB, on
// individual phones, and by design nothing is ever sent to a server — so until now there was
// no way to get a single number out of the app and look at it.
//
// That made the whole threshold plan impossible, not merely inconvenient. This is the file that
// unblocks it: it turns one athlete's saved records into a JSON file the browser downloads.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHAT IT DELIBERATELY DOES NOT DO
// ═════════════════════════════════════════════════════════════════════════════════════
//   • It does not upload anything. There is no network call in here and there is no server to
//     call. The file lands in the phone's downloads folder and what happens next is a human
//     decision, which is the privacy property this project defends.
//   • It does not interpret, score, average or summarise. It copies the stored records out
//     verbatim. The moment an export starts computing a summary it becomes a second opinion
//     that could disagree with the app, and there would be no way to tell which was right.
//   • It does not anonymise. See the warning on buildAthleteExport.

import type { Athlete, TestResult } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';

/**
 * The shape of an exported file.
 *
 * Written down as a type because this file is the project's only data interchange format. Once
 * readings have been exported and analysed, changing this shape silently would strand them.
 */
export type AthleteExport = {
  /** What this file is, in plain words, for whoever opens it months from now. */
  readonly about: string;
  /** A standing warning that travels WITH the data, not just in the UI that produced it. */
  readonly notice: string;
  /** Format version of this envelope. Separate from the per-record schemaVersion below. */
  readonly exportFormatVersion: number;
  /** The battery version the exporting app was running. */
  readonly appSchemaVersion: number;
  /** When the export was taken, as an ISO timestamp. */
  readonly exportedAt: string;
  readonly athlete: {
    readonly id: string;
    readonly name: string;
    readonly baselineId: string | null;
    readonly checkIds: readonly string[];
  };
  /** Every stored sitting for this athlete, verbatim, oldest first. */
  readonly results: readonly TestResult[];
};

/** Bump only if the envelope above changes shape. */
export const EXPORT_FORMAT_VERSION = 1;

const ABOUT =
  'Raw test records exported from Sideline Check, a student-built concussion screening aid. ' +
  'Each entry under "results" is one sitting for one athlete, exactly as the app stored it. ' +
  'Scores are only meaningful compared against the same athlete\'s own baseline, and only ' +
  'between records sharing the same schemaVersion.';

const NOTICE =
  'NOT A MEDICAL RECORD. This file was produced by a screening aid built by high school ' +
  'students. It does not contain a diagnosis, it does not clear anyone to play, and the ' +
  'thresholds the app applies to these numbers are unvalidated placeholders. It also contains ' +
  'the athlete\'s name and is NOT anonymised — treat it as personal data.';

/**
 * Build the export object for one athlete.
 *
 * Pure: no storage, no DOM, no clock reading beyond the timestamp handed in. That is what makes
 * it testable, and the timestamp is a parameter rather than a Date.now() call for the same
 * reason.
 *
 * ⚠️ THIS IS NOT ANONYMISED. The athlete's name is included, because a folder of files named
 * after opaque ids is useless for the collection this is built to serve — you have to know whose
 * readings you are looking at. The consequence is that an exported file is personal data about a
 * minor, and it leaves the on-device guarantee the rest of the app makes the moment it is
 * created. The `notice` field says so inside the file itself, so the warning cannot be separated
 * from the data by forwarding it.
 *
 * @param results Every stored sitting for this athlete. Sorted oldest-first on the way out so
 *                readings are in the order they were taken, which is how they will be read.
 */
export function buildAthleteExport(
  athlete: Athlete,
  results: readonly TestResult[],
  exportedAt: number,
): AthleteExport {
  return {
    about: ABOUT,
    notice: NOTICE,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    appSchemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    athlete: {
      id: athlete.id,
      name: athlete.name,
      baselineId: athlete.baselineId,
      checkIds: [...athlete.checkIds],
    },
    // Copied, not referenced, and sorted. Records go out exactly as stored — no recomputing, no
    // filling in gaps, no dropping records the current build cannot compare. A sitting from an
    // older battery version is still real data and is still worth analysing; the schemaVersion
    // on each record is what tells the analyst which ones belong together.
    results: [...results].sort((a, b) => a.takenAt - b.takenAt),
  };
}

/**
 * A filename that sorts sensibly and says what it is.
 *
 * e.g. `sideline-check-jordan-lee-2026-07-29.json`
 *
 * The name is slugged rather than used raw because it ends up on a filesystem: spaces, quotes,
 * slashes and accents in a downloaded filename cause anything from an ugly name to a silently
 * failed save, depending on the platform.
 */
export function exportFilename(athleteName: string, exportedAt: number): string {
  const slug =
    athleteName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics becomes one hyphen
      .replace(/^-+|-+$/g, '') // no leading or trailing hyphens
      .slice(0, 40) || 'athlete'; // empty after slugging (e.g. a name in another script)

  const date = new Date(exportedAt).toISOString().slice(0, 10); // YYYY-MM-DD

  return `sideline-check-${slug}-${date}.json`;
}

/** Pretty-printed, because a human is going to open this in a text editor. */
export function serialiseExport(data: AthleteExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Hand a JSON string to the browser as a download. Browser-only.
 *
 * WHY THE OBJECT URL IS REVOKED: the Blob stays in memory for as long as a URL points at it.
 * Without the revoke, exporting repeatedly during a collection session would leak a copy of
 * every file until the tab was closed.
 *
 * The link is not added to the document. A detached element's click() triggers the download in
 * every browser we care about, and appending it risks a visible flash of a stray link on screen.
 */
export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.click();

  URL.revokeObjectURL(url);
}
