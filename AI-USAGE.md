# AI usage log

This project was built by two high school students with assistance from an AI coding
assistant (Claude). This file is an honest record of where AI was used, so our process is
transparent. We (the students) understand every part of the code — the AI explained its work
as it went, and we can defend each decision.

Each entry below corresponds to one build phase.

---

- **Phase 0 — Foundation.** AI set up the project scaffold (Next.js App Router, TypeScript
  strict, Tailwind v4) and wrote the foundation files: `CLAUDE.md` (project rules and data
  contract), `lib/types.ts` (the shared data contract), `lib/storage.ts` (an IndexedDB
  wrapper for on-device storage, with explanations of how IndexedDB works), and
  `lib/engine/thresholds.ts` (placeholder flag thresholds). It created placeholder route
  stubs for every screen, added the persistent "not a medical device" safety footer to the
  root layout, and wrote this file plus the README and .gitignore.

- **Phase 1 — The three test modules.** AI built the reaction test (`performance.now()`,
  `pointerdown` attached natively, pad painted through refs so no React render happens
  between the green signal and the tap), the number scan (Fisher-Yates shuffle, start button,
  live stopwatch driven by `requestAnimationFrame` writing to a single text node), and the
  symptom checklist (ten plainly-worded items, 0-3, real radio inputs for keyboard support).
  It also wrote `lib/session.ts`, which chains the three separate test screens into one saved
  sitting, and a practice mode so any test can be tried without saving.

- **Phase 2 — Engine and results.** AI wrote `lib/engine/compare.ts` (the comparison engine),
  `lib/engine/breakdown.ts` (the per-measurement table), `lib/engine/units.ts` (shared
  wording), and 40 unit tests covering no change, single and multiple flags, threshold
  boundaries, missing modules, and the must-error cases (no baseline on file, two different
  athletes). It built the result screen with its flagged / no-change / could-not-compare
  states, and wired the athlete list and athlete detail to storage.

- **Phase 3 — Make it real.** AI designed and applied the "sideline instrument" look (light
  document surfaces for reading, dark instrument surfaces for the timed tests), made every
  screen work from a 375px phone up to a desktop layout, added the PWA manifest, a service
  worker for offline use, app icons generated from code by `scripts/generate-icons.mjs`, a
  `global-error` screen that restates the safety disclaimer, and the accessibility floor
  (skip link, visible keyboard focus, reduced-motion support, large tap targets).

- **Testing and fixes.** AI drove the finished app in a real browser as a user — adding an
  athlete, recording a baseline, running a sideline check — and fixed four defects it found
  that way: the reaction pad could soft-lock if `requestAnimationFrame` never fired, fast taps
  on the number scan could be miscounted as errors, the results screen displayed a scan
  difference that did not match the two values shown beside it, and the focus ring on the
  symptom ratings was invisible because it was drawn on a visually-hidden input.

- **Safety review.** AI then ran a separate adversarial review of the finished code against
  the rules in CLAUDE.md, and fixed the defects that survived it. The most important was a
  safety hole: the engine accepted a baseline recorded *after* a check, so a coach who
  recorded a baseline to fix the "no baseline" error would be comparing an already-injured
  athlete against himself injured — and would be shown "no significant change". The engine now
  refuses any baseline that is not older than the check, that screen no longer invites
  recording a baseline on the spot, and there are unit tests for the exact scenario. Also
  fixed: a failed save could silently look like a successful one, the final "Save and continue"
  could be double-tapped, and a storage read failure left the results screen loading forever.

- **2026-07-27 — Baseline pinning + regression tests.** AI added one optional field,
  `TestResult.comparedToBaselineId`, which stamps each sideline check, at save time, with the id
  of the baseline that was on file at that moment (`lib/session.ts`); the results screen now
  compares against that pinned baseline first and only falls back to the athlete's current
  baseline for older checks saved before the field existed (`app/results/[id]/page.tsx`, new pure
  helper `resolveComparedBaselineId` in `lib/engine/resolveBaseline.ts`). This stops a newly-recorded baseline from
  silently rewriting the outcome of a past check; the existing "baseline must predate the check"
  guard was left unchanged. AI also added `lib/engine/pinning.test.ts` (9 tests) and
  `lib/regression.test.ts` (10 tests) locking in four previously-fixed bugs — rapid number-scan
  taps, the reaction pad recovering when `requestAnimationFrame` never fires, a no-baseline check
  refusing without inviting a baseline, and an unchanged check never showing a green/"cleared"
  state. AI changed no threshold values, no safety copy, and added no clinical claims or sources.

- **2026-07-27 (same day, second session) — Verification of the above, plus one test gap closed.**
  The session that wrote the entry above was interrupted before it could verify its own work, so a
  second AI session audited it from the code rather than trusting it. It confirmed the pinning
  change was complete and that vitest, `tsc --noEmit`, lint and build were all already clean. To
  check that the four regression tests genuinely fail against the OLD behaviour (rather than
  passing no matter what), it temporarily reverted each of the seven fixes those tests guard, one
  at a time, confirmed the matching test failed, and restored the file — the app's own code was
  left byte-for-byte unchanged by that exercise. It found one real gap: nothing tested that
  `finishSession` actually WRITES the pin at save time, which is the mechanism the whole feature
  rests on. It added `lib/session.test.ts` (6 tests) covering that, using a small in-memory
  stand-in for `lib/storage` and no new dependencies. It also corrected the file name cited in the
  entry above, which named the helper function as though it were the file. No threshold values, no
  safety copy, no clinical claims, and no product behaviour were changed in this session.

---

## 2026-07-29 — Battery rebuild (one entry per step)

This session rebuilt the test battery around a new set of modules. It ran autonomously
against a written brief. Each step below was a separate commit.

- **2026-07-29, step 0 — Standalone noise-floor instrument.** AI wrote
  `app/tools/noise-floor/page.tsx`, a new page that runs the same 5-trial reaction protocol
  the battery's reaction test ran, and prints the five raw trial times, the median and the
  false-start count in large type so they can be copied onto paper. Its purpose is to measure
  how much a healthy person's reaction time varies between sittings, which is the number the
  project needs before any real flagging threshold can be chosen. AI reproduced the original
  timing handling exactly (`performance.now()`, natively-attached `pointerdown`, a synchronous
  clock stamp plus a `requestAnimationFrame` refinement, no React re-render between the green
  stimulus and the tap, and discarding any trial slower than the plausible-reaction limit).
  The page deliberately imports none of `lib/types.ts`, `lib/engine/**` or `lib/session.ts`,
  writes to no storage at all, and is not linked from the athlete flow — so that the battery
  rebuild happening in the later steps cannot change how it measures. It carries the root
  layout's safety footer and is labelled on screen as a measurement tool that is not a
  concussion test and says nothing about anyone's health. The plausible-reaction limit is a
  deliberate local copy of the engine constant rather than an import, for that same isolation
  reason; the comment in the file says so.

- **2026-07-29, step 1 — Record versioning plumbing, no behaviour change.** AI added one
  required field, `TestResult.schemaVersion`, and a new file `lib/schema.ts` holding the
  version constants and a normaliser. The reason: a stored sitting's `scores` object has the
  shape of whatever the battery measured at the time, so once the battery changes, an old
  record and a new one are both valid but not comparable — the modules one of them never
  measured read as `null`, which every consumer correctly skips, producing a comparison that
  ran on almost nothing and still rendered a calm-looking screen. Records are now stamped with
  their version on write (`lib/session.ts`) and normalised on read (`lib/storage.ts`), where
  the normaliser fills the field in for records saved before it existed. The normaliser
  deliberately does not migrate or relabel anything — relabelling an old record as current
  would be the exact bug being prevented. AI made the field required rather than optional so
  the compiler, not human diligence, guarantees no read path skips normalisation: a raw read
  is typed `StoredTestResult` and will not fit a `TestResult` return. Both read paths in
  storage.ts (`getResult`, `getResultsFor`) are covered. AI added `lib/schema.test.ts` (26
  tests) covering the missing-field, present-field, future-version and malformed-version cases
  plus a structural guard that every result-returning read in storage.ts calls the normaliser,
  and 3 tests to `lib/session.test.ts` for the write-side stamp. All 69 pre-existing tests
  still pass unchanged in behaviour; five test fixture factories gained the new required
  field. No threshold value, no safety copy, and no app behaviour was changed.

- **2026-07-29, step 2 — The version guard.** AI added rule 7 to the comparison engine: both
  sittings must have been measured by the version of the battery the app currently runs, or the
  comparison is refused with a new `SchemaVersionMismatchError` (`lib/engine/compare.ts`). The
  reason this is a safety guard rather than housekeeping: an old sitting holds only the fields
  the old battery measured, so a newer engine reading it finds `null` for everything else, and
  the engine's existing and correct behaviour of skipping anything it cannot compare would make
  it silently report on whatever few fields happened to overlap — a one-module comparison
  rendered with the same confidence as a full one. The guard requires both records to match the
  current version rather than merely each other, because two old records are consistent with one
  another but this build no longer knows what its comparison would be leaving out. AI gave the
  error its own class so the result screen can explain it differently (`app/results/[id]/page.tsx`
  gained a `schema-mismatch` state) and added a warning to the athlete detail screen
  (`app/athletes/[id]/page.tsx`) so an out-of-date baseline is visible before someone runs a
  check rather than after. Both screens keep the existing safety copy: no green, no checkmark,
  and every path still ends in seeing a medical professional. The pre-existing ordering guard was
  left byte-identical, verified by diffing it against the `v1-three-module` tag. AI added
  `lib/engine/schemaGuard.test.ts` (13 tests) using fixtures, since the guard cannot fire in the
  app today — every record and the app itself are both version 1. Tests 98 → 111. No threshold
  value and no clinical claim was added.

- **2026-07-29, step 3 — Form pools, form selection, and JSON export.**

  **Disclosure that matters most in this entry:** `lib/forms/wordLists.ts` and
  `lib/forms/digitSequences.ts` are **AI-GENERATED STIMULUS CONTENT that the students did not
  write.** The brief said both files were already in the repo and told the session not to edit
  them; they were not there — not in the working tree, not in any commit on any branch, not in
  the `v1-three-module` tag, not in a stash, and nowhere on the machine. Rather than leave the
  word-learning and digit-span modules unbuildable, AI generated both pools to the exact shape
  the brief specified, marked them at the top of each file as replaceable stand-ins, and made
  every construction rule machine-checkable so a student-written replacement can be validated
  against the same rules. AI also wrote `lib/forms/patternGrids.ts` and `lib/forms/goNo.ts`,
  which it was asked to author.

  **`app/tests/gonogo` does not exist and was not created.** A student is writing the go/no-go
  module by hand. `lib/forms/goNo.ts` is the stimulus pool ONLY — trial lists, no behaviour, no
  route, no scoring. No stub route was created, because a stub that wrote plausible-looking
  scores would be fabricated data.

  All four pools were written from scratch against documented construction rules; no stimuli,
  wording, ratios or scoring were taken from SCAT5, the SAC, ImPACT, King-Devick or any other
  published assessment. The rules exist so one form is as hard as another — words that rhyme
  with a distractor, digit sequences containing a countable run, or grid patterns tracing a
  straight line are all easier than their siblings, and an athlete who happened to get one would
  score higher for reasons unrelated to their head. AI wrote `lib/forms/index.ts` with
  `pickForm` (deterministic selection from a seed) and `pickFormBySitting` (which steps through
  the pool rather than re-hashing, so consecutive sittings for one athlete can never land on the
  same form — repeating a word list would let practice inflate the later score, making a
  struggling athlete look unchanged). `lib/forms/select.test.ts` (57 tests) enforces every
  documented rule; it caught a real violation in AI's own hand-written pattern pool
  (`pattern-c` opened on the grid's anti-diagonal), which was fixed.

  **Export.** AI wrote `lib/export.ts` and a download button on the athlete detail screen. Every
  threshold in the app is a placeholder guess, the only honest way to replace one is with
  collected measurements, and those measurements were previously unreachable inside IndexedDB on
  individual phones — so this gates the entire threshold plan rather than being a convenience.
  The export copies stored records out verbatim: it computes nothing, summarises nothing, and
  deliberately does not drop records from an older battery version (the engine refuses to
  *compare* across versions, but old sittings are still real data). It uploads nothing — there
  is no server. It is **not anonymised**: the athlete's name is included because a folder of
  files named after opaque ids is useless for collection, and a warning saying so is embedded in
  the file itself so it cannot be separated from the data by forwarding. `lib/export.test.ts`
  (24 tests). Nothing consumes the form pools yet. Tests 111 → 188. No dependency was added, no
  threshold value was set, and no safety copy was changed.

- **2026-07-29, step 4 — The breaking step: new battery, new engine.** AI replaced the
  three-module data contract with a seven-key one (`lib/types.ts`): symptom, wordLearning,
  wordRecognition, digitSpan, patternSpan, goNoGo, balance. It deleted `app/tests/reaction` and
  `app/tests/scan`, cut `BATTERY_STEPS` to `['symptom']`, and disabled "Record a baseline" and
  "Start sideline check" behind a plain notice explaining that the battery is being rebuilt and
  has no tested cut-offs yet.

  **The four "a baseline must predate the check" guards were ported FIRST**, into their own
  `lib/engine/ordering.test.ts`, and verified green against the untouched engine before
  `compare.ts` was edited — so the rewrite had to satisfy the original expectations rather than a
  fresh set written to fit whatever it produced. The guard itself was confirmed **byte-identical**
  to the `v1-three-module` tag by diff after the rewrite.

  AI wrote `lib/engine/direction.ts`, which is the safety core of this step. The old battery got
  worse by getting *bigger* in every measurement, so the engine could hard-code one subtraction.
  The new battery mixes directions — digit span, pattern span and the word scores are counts of
  things done *right*, so they get worse by getting *smaller*. A single reversed sign would make
  an athlete who declined read as improved, which is the exact outcome this project exists to
  prevent. Direction is now declared once per measurement in one table, every comparison goes
  through one function that normalises to "positive means worse", and
  `lib/engine/direction.test.ts` checks every measurement in both directions plus the table's
  completeness.

  **All new thresholds are `number | null = null` with `TODO(NEEDS_SOURCE)`.** No value was
  estimated, tuned or inferred. That created a real hazard AI had to design around: a null
  threshold means a measurement never sets its flag, which is indistinguishable from having been
  checked and found unremarkable — so an athlete could complete four tests, have three go unjudged,
  and see the calmest screen in the app. `FlagOutcome` therefore gained an `unevaluated` list, the
  engine reports every unjudged measurement while still showing the size of the change, the
  breakdown marks those rows "Not judged", and the results screen has a new state that explicitly
  says no verdict was available and that this is *not* a "no change" result. No green, no
  checkmark, and every path still ends in seeing a medical professional.

  `lib/regression.test.ts` was handled in the same commit as the deletion, since it read the
  deleted pages at module load and would otherwise have taken the whole file down. Guard #2 (the
  requestAnimationFrame soft-lock) **survives intact, re-pointed** at `app/tools/noise-floor`,
  which carries the identical fix — no gap in coverage. Guard #1 (judge a tap against a ref, not
  React state) has no subject until pattern span exists, so it is a `describe.todo` that announces
  itself on every run, with the bug and the required fix written out for whoever builds that
  screen. Tests 188 → 211. Two of the original 69 are parked in that todo; the other 67 survive.

- **2026-07-29, step 5a — Word learning and delayed recognition.** AI built `/tests/words` (study
  ten words one at a time, then pick them out of a twenty-word grid) and `/tests/words/recall`
  (the same question again at the end of the battery), plus the shared pure logic in
  `lib/modules/words.ts` and 13 tests for it. They ship as one module because neither half means
  much alone: the first says whether the words went in, the second whether they stayed, and a low
  score on both is a different finding from a good score then a low one. The gap between them is
  the measurement, so nothing may be appended to `BATTERY_STEPS` after `wordRecognition`.
  Study exposure is FIXED rather than self-paced: if the athlete controlled the pace they could
  study for thirty seconds at baseline and four at the check, and the drop would measure their
  patience instead of their memory. The recall screen reads the form id back out of the recorded
  score rather than re-deriving it, and REFUSES to run if that id is missing or unknown — testing
  a different ten words than the athlete studied would score every target as a false alarm and
  produce a near-zero for reasons unconnected to their head. Selected tiles are marked with a
  heavy border, never a green fill and never a tick. Scoring is plain arithmetic (hits plus
  correct rejections) with hits and false alarms also stored raw; no corrected-recognition formula
  was invented. The logic was placed in `lib/` rather than beside the screens because
  `vitest.config.ts` only collects `lib/**/*.test.ts` — AI initially wrote the test under `app/`
  where it silently did not run, and moved it to follow the project's existing convention. Tests
  211 → 224.

- **2026-07-29, step 5b — Digit span backward.** AI built `/tests/digits` plus the pure logic in
  `lib/modules/digits.ts` and 20 tests. Nine fixed trials at lengths 3,3,4,4,5,5,6,6,7, scored as
  how many were reproduced exactly out of nine, with no partial credit inside a trial. Fixed-trial
  rather than a staircase (an approved decision) because a staircase's stopping point depends on
  the athlete's own answers, so two sittings end up different lengths and are awkward to compare —
  and this app exists to compare one athlete's sitting against their own earlier one. All-or-nothing
  scoring is the honest choice: any per-digit part-marking would be a weighting AI invented, and it
  would then be doing real work in a comparison we ask people to trust. The screen deliberately
  gives NO per-trial right/wrong feedback, for two reasons — a "correct" affordance would need a
  green flash or a tick, which is exactly how a no-green rule erodes, and an athlete who knows they
  have failed three in a row starts guessing, which stops the remaining trials measuring anything.
  `digitSpan` was appended to `BATTERY_STEPS` between the two word screens, since the gap between
  the word pair is what makes the delayed score meaningful. Tests 224 → 244.
