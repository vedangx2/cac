# Submission notes

Raw material for the written questions and the video — not the answers themselves. Everything
below is pulled from this repo's code, tests, and commit history (`git log`, `SESSION-REPORT.md`,
`AI-USAGE.md`). Nothing here is invented; where a claim needed a number this project does not
have, it says so instead of guessing.

---

## Question 4 — "What technical difficulty did you face, and how did you address it?"

Every genuine candidate found in this project's history, in enough detail to pick from and write
in your own words. Pick the one or two that you can actually explain from memory on camera.

### The reaction-pad soft-lock (original battery, Phase 1/testing)

**What broke:** the original reaction test used `requestAnimationFrame` to refine its timing, and
the input phase was only reachable once that callback fired. `requestAnimationFrame` does not
fire in a backgrounded browser tab — put the phone to sleep or switch apps mid-test and the
callback simply never comes, so the screen never reaches the state where a tap counts. **Evidence:**
found by driving the finished app as a real user (`AI-USAGE.md`, "Testing and fixes"). **Fix:** the
clock is stamped **synchronously**, the instant the stimulus is painted, and `requestAnimationFrame`
is used only to *refine* that stamp afterwards, never to gate reachability. Later, when the same
task was rebuilt for pattern span, the same class of risk reappeared in a different shape — a
playback sequence driven entirely by chained timers, where a stalled chain could trap the athlete
before input was ever reachable — and was closed with an explicit watchdog timer
(`PLAYBACK_WATCHDOG_SLACK_MS` in `lib/modules/pattern.ts`) that force-completes playback if the
chain stalls. Both fixes are pinned by regression tests (`lib/regression.test.ts` guards #2 and
#2b).

### Judging a tap against stale React state instead of a ref (original number-scan; recurred in go/no-go)

**What broke:** the number-scan test judged each tap against a piece of React "state" — a value
that, when changed, is supposed to make the screen redraw. That redraw is *queued*, not
immediate, so state read back on the very next line can still be the *old* value. Rapid taps
landed faster than a state update could be applied, so some correct taps were judged against a
stale count and miscounted as errors. **Fix:** judge every tap against a `ref` — a plain mutable
box that updates immediately, with no redraw attached — never against state. **This bug recurred**
when go/no-go was built: a deliberately introduced mutation (M2, `SESSION-REPORT.md`, 2026-08-31)
confirmed the fix was tested, but a *second*, subtler version of the exact same bug (M7) — keeping
the correctly-guarded line the test checked for, but judging the trial's *outcome* against state
one line further down — slipped straight past the existing test. That is worth its own mention on
camera: a passing regression test proved a specific line was present, not that the underlying
property held everywhere it needed to. The fix was a **whole-handler guard** — asserting that an
entire function contains no reference to React state at all, not just checking for one line — which
does catch both mutations.

### The baseline-ordering safety bug

**What broke:** the comparison engine originally accepted any baseline on file, with no check on
which sitting came first in time. The dangerous path: a coach runs a sideline check on an athlete
with no baseline, the app has nothing to compare against, so the coach records a baseline **right
then** to fix the error — measuring a possibly-already-concussed athlete. Reopening the earlier
check would then compare an impaired athlete against himself impaired, and the app would show its
most reassuring screen about a kid who might be genuinely hurt. **Evidence:** found during a
dedicated adversarial safety review of the finished app against `CLAUDE.md`'s rules (`AI-USAGE.md`,
"Safety review"). **Fix:** the engine now refuses any baseline not strictly older than the check it
is being compared against, unconditionally, and the results screen no longer offers "record a
baseline" as an action from its no-baseline error state. Full detail and why it matters is in
`docs/HOW-IT-WORKS.md` §9.1.

### Silently rewriting a past check's result by recording a new baseline

**What broke:** an `Athlete` holds exactly one `baselineId`. Before this was fixed, a check
resolved "the athlete's baseline" *lazily*, at the moment its result screen was opened — so
recording a new baseline for an athlete would silently change what every one of their *past*
checks compared against, and a result that once read FLAGGED could quietly become "no change" the
next time someone looked at it. **Fix:** `comparedToBaselineId` is stamped onto a check **at save
time**, freezing which baseline it is scored against permanently; the results screen resolves that
pin first and only falls back to the athlete's current baseline for checks saved before the field
existed. See `docs/HOW-IT-WORKS.md` §4.

### The battery-version problem (`schemaVersion`)

**What broke, or rather what had to be designed around before it broke anything:** the battery's
shape changed twice over this project's life. An old stored record simply does not have the
fields a newer battery measures — and the engine's existing, correct rule of skipping any
measurement missing from either side means an old-vs-new comparison would silently run on
whatever few fields happened to survive the change, and report on those with the same visual
confidence as a full comparison. **Fix:** every record is stamped with the shape-version it was
measured under, and the engine refuses to compare two records unless *both* match the version the
current build measures. See `docs/HOW-IT-WORKS.md` §7 for the full mechanism, including how the
type system — not discipline — forces every storage read through the function that fills this
field in for older records.

### The null-threshold trap

**What had to be designed around:** most of this battery's thresholds are honestly `null` — no
real cut-off derived yet. A `null` threshold can never be crossed, which is indistinguishable,
looking only at the whole-screen flag, from "checked and found fine." **Evidence it was a real
risk and not a hypothetical:** a deliberately introduced mutation removing the safeguard (letting
a `null` threshold silently never flag, with no separate record) was caught by **eight separate
tests** simultaneously — the single most heavily defended behaviour in the codebase.
**Fix:** `FlagOutcome.unevaluated`, and a dedicated results-screen state that never lets "we could
not judge this" render as "we looked and it was fine." Full detail in
`docs/HOW-IT-WORKS.md` §6 and §9.2.

### The practice-gate migration bug (`undefined !== null`)

**What broke:** the practice gate checks `practiceCompletedAt === null` to decide whether to
disable the baseline button. An athlete record saved *before* this field existed does not have
`null` there — it has nothing at all (`undefined`), and in JavaScript `undefined === null` is
`false`. Any read path that skipped the normaliser would see the check as satisfied and
**unlock the baseline button for an athlete who had never practised** — the opposite of the
guard's purpose, for every athlete who existed before the feature shipped. **Fix:** every storage
read path runs the raw record through a normaliser that coerces a missing field to an explicit
`null`, enforced by the type system the same way `schemaVersion` is, and pinned by a direct
behavioural test. Notably, this fix sat correctly written and tested but **undisclosed** in
`AI-USAGE.md` for several days — a real example of the gap between "the fix exists" and "the
paper trail says so," closed in the 2026-09-14 audit entry. Full detail in
`docs/HOW-IT-WORKS.md` §9.3.

### A form pool that was supposed to exist and didn't

**What broke:** a session brief assumed `lib/forms/wordLists.ts` and `lib/forms/digitSequences.ts`
already existed in the repo and said not to edit them. They did not exist anywhere — not in the
working tree, not in any commit, not in any tag, not in a stash. **Fix, and the honesty
constraint that shaped it:** rather than leave two modules unbuildable, AI generated both pools to
the documented construction rules, marked each file at the top as an AI-generated stand-in, and
made every construction rule machine-checkable (`lib/forms/select.test.ts`) so a human-written
replacement could be validated against the same rules rather than trusted blindly. They were later
replaced with hand-checked versions the same day (commit `28556c0`). The validation net caught a
real violation in AI's own hand-written pattern-span pool along the way (one form's path traced the
grid's anti-diagonal, an easier pattern than its siblings), which was fixed before merge.

### A stack-depth ceiling in the calibration harness

**What broke:** `lib/calibration/simulate.ts` built a sweep range with
`Math.max(...someArray)` — the spread operator puts one argument, and therefore roughly one call
stack slot, per array element. **Evidence:** flagged during a branch review, initially miscategorised
as a live bug; measurement showed the actual ceiling on that Node build was roughly 125,000
elements against a page-enforced cap of 50,000 — about 2.5× headroom, engine- and
stack-size-dependent, not a live failure. **Fix:** rewritten as a plain loop, with the measured
numbers left in the comment so the reasoning survives the person who found it. Worth mentioning
for the correction itself, not just the bug: the first write-up called it a live defect and that
claim was corrected in the code comment, the test, and the report rather than left standing once
measurement disagreed with the initial impression.

### The noise-floor pad had no lower bound

**What broke:** `/tools/noise-floor` discarded implausibly *slow* trials but accepted a tap
landing immediately after the stimulus as a fast, real reaction — no matter how fast. **Evidence:**
the project owner's own collected runs contained three trials under 200ms, one at 131ms, and one
of those measurably moved a run's median by 11ms. **Fix:** a 180ms anticipation floor — a tap
faster than that is judged as a guess, discarded, and the trial repeated, the same treatment
go/no-go already gives its own anticipations. Recorded as a **comparability break**: readings
taken before this fix could contain anticipations; readings after cannot, so the two should not be
pooled naively when a threshold is eventually derived from this data.

---

## Question 6 — "What would you change in a 2.0?"

### Explicitly out of scope, and why (`CLAUDE.md`'s P2 list)

Dashboards, notifications, accounts, return-to-play logic, and any "cleared"/"healthy"/"safe to
play" state are banned outright, not merely deferred. **Why:** the entire ethical and legal
footing of this project is that it screens and refers, and never diagnoses or clears. A
return-to-play feature would require this app to make a claim about recovery it has no basis to
make; the risk is a false "cleared" sending a still-concussed kid back onto the field.

### Deferred to P1

- **Balance testing via a phone's motion sensors.** `ModuleScores.balance` and its threshold
  (`BALANCE_SWAY_INCREASE`) already exist in the data contract and in `thresholds.ts`, entirely
  unused, specifically so this slots in without another schema change. Deferred because it needs
  new sensor-handling work the other six modules don't, and because P0 — a working battery with
  even one real threshold — was the higher priority given the timeline.
- **A history view** across an athlete's past sittings, beyond the flat list already on the
  athlete page.

### Design choices that were considered and deliberately rejected (not oversights)

- **A staircase scoring method for digit span and pattern span** (stop increasing length once the
  athlete fails, report the longest span reached) was considered and rejected in favour of
  fixed-trial scoring (every athlete sees all nine trials, scored as how many were exact). A
  staircase's stopping point depends on the athlete's own answers, so two sittings from the same
  person can end at different lengths and become awkward to compare — and comparing one athlete to
  their own earlier self is this app's entire premise.
- **Partial credit within a single digit-span or pattern-span trial** (crediting a sequence with
  one digit out of place) was rejected in favour of all-or-nothing scoring. Any partial-credit
  scheme would be a weighting this project invented, and it would then be doing real, undisclosed
  work inside a comparison the app asks people to trust.
- **A corrected-recognition formula for the word modules** (some combination of hits and false
  alarms into a single adjusted score, as some published memory tests use) was considered and
  rejected in favour of plain arithmetic — hits plus correct rejections, both raw counts also
  stored separately. A borrowed formula would be exactly the kind of instrument reproduction
  `CLAUDE.md` prohibits.
- **A 4×4 pattern-span grid** (a more standard size for this kind of task) was rejected for a 3×3
  grid, because this battery runs on a phone outdoors: nine cells keep every tap target well above
  the accessible-size floor, where a smaller grid's mis-tap would score as a memory failure that
  was actually a fat-finger error.
- **A tighter go/no-go response window** (many published versions of this task use roughly a
  second or less) was rejected for a wider 1500ms window. A tight window would convert a
  genuinely *slowed* response — the exact signal this app is trying to detect — into an omission
  error instead, hiding it in a different number entirely.

### What is unfinished, in priority order

1. **Nine of ten flagging thresholds are still `null`.** This is the actual bottleneck on
   everything else — the engine can compare but cannot judge most of what it measures, and
   recording real baselines and checks stays gated behind the practice pass until this is further
   along. Getting here needs repeated same-person measurements over time from more than one
   person, which this project has not had the population or the time to collect.
2. **Two fields the go/no-go module computes but the data contract has no home for**:
   `goTrialsMs` (every individual go-trial response time, currently only shown on screen to be
   copied down by hand) and a nullable `medianMs` (so a run where nobody responded to any go trial
   could still record its omission count instead of being discarded entirely). Both are cheap to
   add before real collection starts and expensive after, because either one requires a
   `schemaVersion` bump that makes every already-recorded baseline unreadable.
3. **Structural regression guards mostly prove wiring, not behaviour.** Several pin that a
   specific line of source text is present rather than exercising the running component. The
   M7 mutation (above) is the concrete proof this matters: it passed every line-based guard while
   reintroducing the exact bug those guards existed to catch. Upgrading these into real rendered
   interaction tests (mounting a component, firing a sequence of taps, withholding
   `requestAnimationFrame`) is real work, not yet done.
4. **Form alternation is probable, not guaranteed.** The screens seed form selection from
   `athleteId:startedAt`, making a repeat form unlikely (roughly 1 in 6) but not impossible.
   `pickFormBySitting` already exists and *would* guarantee no repeat, but it needs a persisted
   per-athlete sitting counter nothing currently writes.
5. **The battery's timing has only ever been measured against itself.** Every response-time claim
   in this app rests on the browser's own `performance.now()`. Nothing has compared it against an
   independent clock.
6. **The athlete-paced portion of the battery is completely unmeasured.** The one real timing
   measurement this project has (§ below) is a script-driven floor with instant input; a real
   athlete reading symptom items and scanning two word grids adds unmeasured time on top of it.

---

## Every number in this project that is measured rather than assumed

Read each of these as "this is what was actually observed," not as a validated clinical
threshold — see the next section for the distinction the app is built to preserve.

| Number | Value | What it's based on |
|---|---|---|
| `GO_NO_GO_SLOWER_MS` | 25ms | n=1 self-collected noise-floor data from the project owner: 2-sigma noise band ≈24.6ms, difference noise ≈17.4ms, expected false-alarm rate ≈4% with an averaged baseline. The only threshold in `lib/engine/thresholds.ts` with any measured basis. |
| Practice effect on reaction time | ≈20ms, survived a week off | The project owner's own noise-floor collection; the entire justification for the practice gate (`docs/HOW-IT-WORKS.md` §8). |
| Battery timing floor | 161.3s and 160.2s, two full runs | A Playwright script driving the real six-module practice flow at 390×844 against `next dev`, marking wall-clock at every module boundary. Per-module figures cross-check against the code's own presentation constants (e.g. word study: 10 × (`WORD_EXPOSURE_MS` 2000 + `WORD_GAP_MS` 300) = 23.0s predicted vs 23.7s measured). This is a **floor**, not a real sitting: the script's input is instant, so the two purely athlete-paced modules (symptom, both word grids) measure as ≈0s. |
| Calibration comparison, flag-on-any vs flag-on-two | ≈30% vs ≈3% simulated healthy-athlete false-alarm rate | `lib/calibration/`, driving the real comparison engine over synthetic athletes. Nine of the ten measurement profiles behind this specific run were placeholders (invented round numbers), so treat this as a demonstration of shape, not a validated rate. |
| Contrast ratios across the app | lowest measured: 5.88:1 | Computed directly from the ten defined colour tokens' actual hex values, against a 4.5:1 AA floor. |
| Tap targets | zero interactive elements under 56px, after fixing two found at 21px and 49px | A rendered measurement sweep across all six modules. |
| Test suite / build state (as of this session, 2026-09-14) | 435 tests passing across 20 files; `tsc --noEmit`, `eslint`, and `next build` (17 routes) all clean | Run directly this session. |
| Node's practical argument-spread stack ceiling on the build used | ≈125,000 elements | Measured directly while investigating the `Math.max(...array)` finding above; specific to that engine and stack size, not a portable constant. |

---

## Every number in this project that is assumed or placeholder — never state one of these as fact

| Number | Value | Status |
|---|---|---|
| `SYMPTOM_INCREASE` | 5 | Placeholder, carried over from the original battery, not clinically validated. |
| `BALANCE_SWAY_INCREASE` | 1 | Placeholder; currently unused because balance is not built. |
| `MODULES_REQUIRED_TO_FLAG` | 2 (symptom checklist may flag alone) | A policy decision, not a measurement. Informed by the calibration harness's flag-on-any-vs-flag-on-two comparison above — but that comparison itself ran on mostly-placeholder profiles, so "2" reflects a judgement about acceptable false-alarm rates under a demonstration, not a number derived from real athlete data. The symptom-alone exception rests on a stated rationale (published work on self-reported symptoms) with **no citation on file** — recorded in the code as the reason given, not as an established fact. |
| `WORD_LEARNING_FEWER_CORRECT`, `WORD_LEARNING_MORE_FALSE_ALARMS`, `WORD_RECOGNITION_FEWER_CORRECT`, `WORD_RECOGNITION_MORE_FALSE_ALARMS`, `DIGIT_SPAN_FEWER_CORRECT`, `PATTERN_SPAN_FEWER_CORRECT`, `GO_NO_GO_MORE_COMMISSION_ERRORS`, `GO_NO_GO_MORE_OMISSION_ERRORS` | all `null` | Not numbers at all — deliberately absent. Each is reported to the athlete as **not judged**, never as normal. This is the majority of the app's thresholds; see Question 6 above. |
| The 180ms noise-floor anticipation cutoff | 180ms | Informed by real observed data (real sub-200ms and one 131ms trial existed in collected runs), but the specific cutoff value itself was a round-number judgement call, not a statistically derived figure the way `GO_NO_GO_SLOWER_MS` was. Marked `TODO(NEEDS_SOURCE)` in the code. |
| `MAX_PLAUSIBLE_REACTION_MS` | 3000ms | A deliberately generous, invented ceiling ("well beyond any real reaction, healthy or concussed") meant only to catch inattention, not to measure anything. |
| Go/no-go pacing constants | `GO_NO_STIMULUS_WINDOW_MS` 1500, `GO_NO_MIN_PLAUSIBLE_RESPONSE_MS` 150, `GO_NO_MIN_GAP_MS`/`GO_NO_MAX_GAP_MS` 700–1600, `GO_NO_TIMER_SLACK_MS` 750, `GO_NO_MAX_TRIAL_REPEATS` 3, `GO_NO_MESSAGE_MS` 900 | All the project's own choices, not taken from any published protocol. They don't decide flagging, but they decide task difficulty — changing one after real collection starts makes earlier and later readings non-comparable, the same caveat as the anticipation floor above. |
| Word/digit/pattern presentation pacing | `WORD_EXPOSURE_MS` 2000, `WORD_GAP_MS` 300, `DIGIT_EXPOSURE_MS` 900, `DIGIT_GAP_MS` 250, `CELL_ON_MS` 600, `CELL_GAP_MS` 250 | Same status as the go/no-go pacing constants directly above: chosen, not derived, and frozen once real collection starts. |
| The calibration harness's placeholder noise profile | round invented numbers | Explicitly labelled in the one place it lives as "PLACEHOLDER — invented round numbers, not measurements of anybody." Used only to exercise the harness's machinery before real data existed. |
