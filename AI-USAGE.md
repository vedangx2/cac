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
