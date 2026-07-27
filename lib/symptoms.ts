// lib/symptoms.ts
//
// The ten symptoms on our checklist, and the 0-3 rating scale.
//
// These live in their own file so the test screen and the results screen can never disagree
// about what item 4 was, and so the wording can be reviewed in one place.
//
// ── ORIGINALITY NOTE ─────────────────────────────────────────────────────────────────────
// These are plain, everyday descriptions of common post-head-impact symptoms, written by us.
// This is intentionally NOT a copyrighted clinical instrument. The SCAT, for example, uses a
// different number of items, different wording, and a 0-6 scale; we use ten plainly-worded
// items on a 0-3 scale. Do not replace these with the exact item list or scoring scheme from
// any published assessment.
//
// The scale is a total out of 30 (10 items x 3). It is a rough severity tally for comparing
// an athlete against their OWN earlier answers — it is not a diagnostic score and it means
// nothing on its own.

export const SYMPTOM_ITEMS: string[] = [
  'Headache',
  'Pressure in the head',
  'Dizziness',
  'Nausea or upset stomach',
  'Blurred or double vision',
  'Bothered by light',
  'Bothered by noise',
  'Feeling slowed down or "in a fog"',
  'Trouble concentrating or remembering',
  'Feeling unsteady or off balance',
];

/** 0-3, with a plain word for each step so nobody has to guess what "2" means. */
export const SYMPTOM_SCALE: { value: number; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Severe' },
];

/** The highest possible total: 10 items x 3 points. */
export const MAX_SYMPTOM_TOTAL = SYMPTOM_ITEMS.length * 3;
