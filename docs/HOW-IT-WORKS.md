# How this app works

Study material, written for someone who knows Java or Python but not TypeScript or React. Not
marketing copy — if a sentence here sounds like a pitch, that is a mistake, tell whoever reads
this next to fix it.

Where a TypeScript or React idea shows up, it is explained in Java/Python terms the first time it
appears and then used freely afterwards.

---

## 1. What the app does, in three sentences

An athlete takes a short battery of tests while healthy, and the app stores those scores as their
**baseline**. If they later take a hard hit, they take the *same* tests again as a **check**, and
the app compares the check to that one athlete's own baseline rather than to any population
average. The app never decides whether someone has a concussion — it only decides whether
something changed enough to be worth a trained person's attention, and it always ends by telling
someone to go see one.

---

## 2. The six modules

Each module is its own screen. A finished sitting (baseline or check) is one `TestResult` object
holding one score object per module, defined by the `ModuleScores` type in `lib/types.ts`. A
module that was not run in a given sitting is `null` for that sitting — think of `null` here as
Java's `null` or Python's `None`, meaning "this field genuinely has nothing in it," not zero.

| Module | Route | What it measures | What it reports (`ModuleScores` field) |
|---|---|---|---|
| Symptom checklist | `/tests/symptom` | 10 common symptoms, each rated 0–3 | `symptom`: the 10 item scores plus their total, 0–30 |
| Word learning | `/tests/words` | Study 10 words, then pick them out of a 20-word grid, immediately | `wordLearning`: which form was shown, hits, false alarms, and a plain correct-count |
| Numbers backwards | `/tests/digits` | 9 fixed trials, lengths 3–7, type the sequence back in reverse | `digitSpan`: pass/fail per trial, and how many of the 9 were exact |
| Tapped patterns | `/tests/pattern` | 9 fixed trials, lengths 2–6, tap a lit-up path back on a 3×3 grid | `patternSpan`: same shape as digit span |
| Go / no-go | `/tests/gonogo` | 30 trials: tap fast on GO, hold still on NO-GO | `goNoGo`: median response time on GO trials, commission errors (tapped on NO-GO), omission errors (missed a GO) |
| Word recall | `/tests/words/recall` | The *same* 20-word grid again, at the very end of the sitting | `wordRecognition`: same shape as `wordLearning`, same form |

`goNoGo` and `patternSpan` never got a partial-credit scheme — a trial is exactly right or it
counts as wrong, nothing in between. That is a deliberate choice: any "close enough" weighting
would be a formula the app invented, and the whole point of this project is not inventing
numbers. See §9 in `SUBMISSION-NOTES.md` for the full list of what is measured versus assumed.

A seventh field, `balance`, exists in the type and always stays `null` — balance testing via a
phone's motion sensors is P1, not built.

---

## 3. Why the session runs in the order it does

The order is one array, `BATTERY_STEPS` in `lib/session.ts`:

```
symptom → wordLearning → digitSpan → patternSpan → goNoGo → wordRecognition
```

Two rules decide that order, and neither is arbitrary:

1. **`wordLearning` and `wordRecognition` are one module wearing two screens.** The first says
   whether the ten words went in; the second, asked again at the very end, says whether they
   *stayed*. The gap between them is the actual measurement — a short gap barely tests memory at
   all, a longer one does. So `digitSpan`, `patternSpan`, and `goNoGo` are deliberately placed
   *inside* that gap, and nothing may ever be appended to `BATTERY_STEPS` after
   `wordRecognition` — doing so would shrink the one thing that makes the delayed score mean
   anything.
2. **Each memory module has six interchangeable forms** (different word lists, different digit
   sequences, and so on, in `lib/forms/`). Showing an athlete the same ten words at their
   baseline and again at a check would let the check score partly measure "how well do I
   remember that day," not "how well am I doing right now" — and that effect only helps the
   score, which is exactly backwards for a screening tool. `lib/forms/index.ts` picks a
   different form each sitting so that never happens.

---

## 4. How a baseline is stored, and how a check is compared against it

Storage is IndexedDB — the browser's own on-device database, not a server. Think of it as two
tables: `athletes` and `results`. There is no equivalent of a Java `Connection` to a remote
database anywhere in this app; `lib/storage.ts` opens a local connection, does one read or write,
and closes it again.

An `Athlete` record holds `baselineId` — the id of the one `TestResult` currently treated as that
athlete's baseline — and `checkIds`, a list of every check they have taken. Recording a new
baseline overwrites `baselineId`; the *old* baseline record is never deleted, it is just no
longer pointed at for new comparisons.

That creates a real hazard: if a check only ever asked "what is this athlete's *current*
baseline right now," then recording a new baseline would silently change what an *old* check
compares against, and a result that once read FLAGGED could quietly become "no change." So a
check does not resolve its baseline lazily. At the moment a check is **saved**, `lib/session.ts`
stamps it with `comparedToBaselineId` — literally freezing which baseline it is scored against,
for good. When the results screen opens an old check, it looks for that pin first and only falls
back to the athlete's current baseline for checks saved before this field existed
(`lib/engine/resolveBaseline.ts` does that fallback, in one small pure function so it can be
tested on its own).

---

## 5. What the comparison engine actually does, step by step

`lib/engine/compare.ts` exports one function, `compareToBaseline(baseline, check)`. It runs
through seven rules, in this order, on every call:

1. **No baseline → throw, never return a quiet "fine."** If `baseline` is `null` or `undefined`,
   the function throws `MissingBaselineError` before doing anything else. In Java/Python terms,
   this is a checked exception the caller (the results screen) must catch and handle — there is
   no code path where a missing baseline turns into a result object.
2. **Different athletes → throw.** `baseline.athleteId !== check.athleteId` is always a bug
   somewhere upstream, so it throws `InvalidComparisonError` rather than comparing anyway.
3. **The "baseline" record must actually be a baseline** (`kind === 'baseline'`), not a check
   mistakenly passed in as one.
4. **The baseline must predate the check** (`baseline.takenAt < check.takenAt`). See §9 below —
   this is the fix for a real, dangerous bug this project already had once.
5. **Both records must be from the current battery version** (`schemaVersion` match). See §7.
6. **Compare every measurement it can, and only what it can.** A loop walks a table of eleven
   measurements (one per row in the table in §2, minus `balance`, which currently has nothing to
   compare). For each one: if either side is missing that value, it is reported as "not
   compared," never silently treated as "no change." Otherwise it computes how much *worse* the
   check is than the baseline (see §6 for why "worse" needs its own function), compares that
   against the measurement's threshold from `lib/engine/thresholds.ts`, and writes one
   plain-language sentence either way.
7. **Decide the whole-screen flag** from what the loop found. This is its own step, described in
   §6.

The return value is a `FlagOutcome`: `flagged` (the whole-screen verdict), `modules` (which
individual modules crossed their own cut-off, regardless of the whole-screen verdict),
`explanations` (the sentences), and `unevaluated` (see §6). Nothing in this object, or in any
sentence it produces, ever says "concussion," "cleared," or "healthy" — see CLAUDE.md's hard
rule.

---

## 6. The flag rule: why it takes two

The naive rule — flag if *any single* measurement crosses its cut-off — sounds cautious but is
not. With eleven measurements, that is eleven separate chances to be wrong about a healthy
athlete, and false alarms compound: `lib/calibration/` (a harness that generates synthetic
athletes and runs them through this real engine) measured roughly a **30% false-alarm rate** on
simulated healthy athletes under flag-on-any, against roughly **3%** under flag-on-two. An alarm
that goes off on a third of the healthy kids trains everyone to ignore it, which protects nobody.
(Nine of the ten measurement profiles behind that specific 30%/3% comparison were placeholders,
not real data — read it as a demonstration of the *shape* of the problem, not as a validated
number. See `SUBMISSION-NOTES.md`.)

So the actual rule, in `MODULES_REQUIRED_TO_FLAG` (`lib/engine/thresholds.ts`) and applied in
`compare.ts`:

> The symptom checklist may flag the whole screen **on its own**. Every other module needs **at
> least one other module** to also have crossed its cut-off before the whole screen flags.

The symptom exception is the project owner's decision, not AI's, and its stated reason —
published work suggesting self-reported symptoms carry real weight and that athletes underreport
them — has no citation on file, so the code marks it `TODO(NEEDS_SOURCE)` rather than stating it
as settled fact.

This creates a state that could not exist under flag-on-any: **one non-symptom module crosses
its cut-off, but the whole screen does not flag**, because nothing else moved with it. That is
not the same as "no change," and the app treats it as its own thing — `modules` still records
that the individual module crossed, and the results screen has a dedicated headline for it
("Change found — below the flag rule") that is louder than the calm state and quieter than
FLAGGED.

**`unevaluated` is the other half of the flag rule's safety, and it is not optional bookkeeping.**
Nine of the ten thresholds are currently `null` — no real cut-off exists yet, because none has
been derived from enough real measurements (see `SUBMISSION-NOTES.md` for exactly what "enough"
would mean). A `null` threshold can never be crossed, which means a measurement with no threshold
*never sets a flag* — and that is indistinguishable, looking only at `flagged`, from a
measurement that was checked and found fine. Without a separate signal, an athlete could complete
four tests, have three of them go completely unjudged, and be shown the calmest screen the app
has. So every measurement compared against a `null` threshold is pushed into `unevaluated`
instead, and the results screen has yet another state for that — "No verdict available" —
because "we did not look" must never render as "we looked and it was fine." See §9 for how this
was proven to matter, not just asserted.

---

## 7. `schemaVersion`: what it is for, and what happens on a mismatch

The battery has changed shape twice (three modules → seven-key contract → the current six
built modules). A `TestResult` saved under one shape does not have the same fields as one saved
under another — an old three-module record simply has no `wordLearning` field to read, the same
way an old row in a database table has no value for a column that did not exist yet when the row
was written.

`schemaVersion` is a plain integer stamped onto every `TestResult` at the moment it is written
(`CURRENT_SCHEMA_VERSION` in `lib/schema.ts`, currently `1`). The engine's rule 5 (§5 above)
refuses to compare two records unless **both** match the version this build of the app currently
measures — not merely each other. That "both, not just each other" detail matters: two old
records agree with each other about their own shape, but this build no longer knows what its own
comparison logic would be silently leaving out if it read one.

On a mismatch the engine throws `SchemaVersionMismatchError` instead of returning a result. The
results screen catches it and shows its own state — not "no comparison," a *different* state,
because the explanation and the fix are different from every other refusal: nothing is wrong
with the data, the app simply moved on, and the only way forward is recording a fresh baseline
on the current tests. The cost is real and is accepted on purpose: after any battery change,
every athlete's existing baseline stops opening and has to be re-recorded, rather than the app
quietly comparing whatever fields happened to survive the change.

One more piece worth knowing: records written before `schemaVersion` existed at all do not carry
the field. `lib/schema.ts`'s `normaliseTestResult()` fills it in as `1` on every read — every
pre-versioning record really was measured under the original three-module shape, so "field
absent" and "version 1" describe the same fact, not a guess. This is enforced by the type
system, not by discipline: the raw value read off disk is typed `StoredTestResult` (which allows
a missing `schemaVersion`), and that type does not fit anywhere a `TestResult` is expected, so
code that forgets to normalise simply does not compile — the same idea as Java's type checker
refusing to let you pass an `Optional<T>` where a `T` is required without unwrapping it first.

---

## 8. The practice gate, and why it exists

"Record a baseline" is disabled for an athlete until they have completed one full **practice
pass** — all six tests, in the real order, scored and shown once, then thrown away.

**Why:** the project owner's own self-collected noise-floor data measured a practice effect of
roughly 20ms on reaction time that survived a full week off. That means an athlete's very first
attempt at these tests is measurably worse than their true normal — so a baseline recorded on a
first attempt is permanently skewed low, and the free improvement that shows up on the *next*
sitting, purely from familiarity, can cancel out and hide a real decline on the day it actually
matters. That is precisely the failure this whole app exists to prevent, walking in through the
front door disguised as a baseline.

The mechanism: `Athlete.practiceCompletedAt` is `null` until a practice pass finishes for that
athlete, and the "Record a baseline" button is disabled while it is `null`. A practice run stores
**only that fact** — never the scores. `BatterySession` (the in-progress-sitting type in
`lib/session.ts`) is what TypeScript calls a **discriminated union**: think of it as an abstract
type with exactly three concrete subclasses — `'baseline'`, `'check'`, `'practice'` — that share
a `kind` tag. `finishSession()`, the function that writes a real `TestResult`, is typed to accept
only the `'baseline' | 'check'` subclasses. A `'practice'` session simply does not fit that
parameter's type, the same way you cannot pass a `Cat` to a method that takes a `Dog` even if
both extend `Animal` — so "a practice run gets saved as a real result" is not a bug the tests
have to catch, it is a program the compiler refuses to build in the first place.

"Start a sideline check" is **never** gated on practice. The guard exists to protect baseline
*quality* — it must never stand between a coach and the referral screen when a kid is actually
hurt. A check with no baseline on file still runs, still warns on screen, and the engine still
refuses to compare it against nothing (§5, rule 1) rather than quietly showing "no flag."

---

## 9. Three failure modes this project found and fixed

Each of these was a real bug at some point in this project's history, not a hypothetical. Each
one shares the same shape: a state that *looks* like "everything is fine" but actually means "we
never checked" or "we checked the wrong thing" — which is the one category of bug this app cannot
afford, because the entire ethical basis of a screening tool is that it never gives false
reassurance.

### 9.1 The baseline-ordering bug

**The bug:** early in the project, the comparison engine would compare a check against *any*
baseline on file, with no check on which came first in time. **The dangerous path:** a coach runs
a sideline check on an athlete with no baseline recorded yet, the app has nothing to compare
against — so the coach records a baseline **right there, on the spot**, to make the error go
away. That baseline is measured from an athlete who may already be concussed. If the coach then
reopens the earlier check, the engine would compare an impaired athlete against *himself,
impaired* — the two sittings would look nearly identical, and the app would show its calmest,
most reassuring screen, about a kid who may genuinely be hurt.

**Why it's dangerous:** this is the hard rule's nightmare scenario made concrete — a false
"nothing changed" produced by the tool's own design, at the exact moment someone is relying on
it.

**How it's prevented now:** rule 4 in `compare.ts` — `baseline.takenAt >= check.takenAt` throws
`InvalidComparisonError` unconditionally. A baseline recorded at the same time as, or after, a
check can never be used to score that check, no exceptions. The results screen was also changed
to stop *inviting* a baseline recording from its no-baseline error state — the old copy offered
"Record a baseline for this athlete" right there, which is exactly the click that caused the bug.
Both are pinned by regression tests (`lib/regression.test.ts` guard #3, plus dedicated ordering
tests in `lib/engine/ordering.test.ts`).

### 9.2 The null-threshold trap

**The bug (or rather, the trap that had to be designed around from the start):** nine of ten
thresholds in this app are honestly `null` — no real cut-off has been derived yet. A `null`
threshold can never be crossed. Looking only at the whole-screen `flagged` boolean, "no threshold
exists for this yet" and "we checked and it was normal" are indistinguishable. An athlete could
run all six tests, have most of them come back with no real threshold to judge them against, and
see the single calmest screen the app produces.

**Why it's dangerous:** it would make the *least* judged sitting look identical to the *most*
reassuring one — a screening tool whose silence about something it never actually looked at reads
as a clean bill of health.

**How it's prevented now:** `FlagOutcome.unevaluated` — every measurement compared against a
`null` threshold is listed there explicitly, and the results screen has a dedicated "No verdict
available" state, separate from and louder than "no change detected." This was proven to matter,
not just asserted: during the 2026-08-31 session, a deliberately introduced mutation that removed
this guard (so a `null` threshold silently never flagged, with no `unevaluated` record) was caught
by **eight separate tests** — the most heavily defended single behaviour anywhere in this
codebase, including one test named for exactly this scenario: an athlete who came back unjudged on
every module still must produce `flagged: false` with every one of those modules correctly listed
in `unevaluated`, never silently passing as fine.

### 9.3 The practice-gate migration case

**The bug:** when `Athlete.practiceCompletedAt` was added, the gate that reads it checks
`practiceCompletedAt === null` to decide whether the "Record a baseline" button should be
disabled. But an `Athlete` record written to IndexedDB *before* this field existed does not have
`null` there — it has nothing at all, which JavaScript calls `undefined`. And in JavaScript,
`undefined === null` evaluates to `false`. So any code path that read an old athlete record
without first running it through the normaliser (`normaliseAthlete` in `lib/storage.ts`, which
turns a missing field into an explicit `null`) would see `practiceCompletedAt !== null`, judge the
gate satisfied, and **enable the baseline button for an athlete who has never practised** — the
exact opposite of what the guard exists to do.

**Why it's dangerous:** it is a *fail-open* bug hiding inside a safety feature. The whole feature
exists because a first-attempt baseline is measurably worse than an athlete's true normal (§8);
silently bypassing the gate for every pre-existing athlete record would have defeated the guard
for exactly the population it was added to protect — anyone who used the app before this feature
shipped.

**How it's prevented now:** every read path in `lib/storage.ts` that returns an `Athlete`
(`getAthletes`, `getAthlete`) runs the raw record through `normaliseAthlete` before it reaches any
other code, coercing a missing field to `null` — fail **closed**: an athlete the app knows nothing
about is treated as never having practised, not as exempt from the requirement. `lib/storage.ts`'s
raw read is typed so that skipping normalisation does not compile, the same mechanism §7 describes
for `TestResult`. And `lib/storage.test.ts` pins the *behaviour*, not just the wiring: it directly
asserts that a record missing the field normalises to `practiceCompletedAt: null`, so the gate is
provably closed rather than assumed closed. This is also the clearest example in the project of a
gap between "the code was written" and "the disclosure log said so" — see `AI-USAGE.md`'s
2026-09-14 audit entry for the full story of how this fix sat committed but undisclosed for three
days.
