# Session report — 10–11 September 2026

Autonomous session, resumed on 11 September after a usage limit cut the 10 September run off
mid-task. Branch: `feat/gonogo-and-calibration`. **Not merged. Branch pushed only.**

**Headline: all five tasks are complete. The one dangerous half-landed state the brief warned
about did not happen — task 3 landed whole, so go/no-go has never been able to flag on its own.
Task 5's timing half was the only thing genuinely unfinished, and it is now measured: the battery
has a floor of about 2 minutes 40 seconds, and the athlete-paced part of it is still unmeasured.**

Tests: **412 → 435**, all passing. `tsc --noEmit`, `eslint`, `next build` (18 routes) all clean.
No threshold value was invented. No statistic, source, citation or clinical red-flag list was
added. `CLAUDE.md` was not edited — the changes it needs are listed in §5.

---

## 1. What the resume found on disk

The brief said not to trust memory, and specifically to check whether task 3 had half-landed —
the 25 ms go/no-go threshold set but the flag rule still any-module. That state would have made
go/no-go the only module able to flag, so a single timing measurement could have produced a
verdict alone.

**It did not happen.** `lib/engine/thresholds.ts` carries `GO_NO_GO_SLOWER_MS = 25` *and*
`MODULES_REQUIRED_TO_FLAG = 2`, and `lib/engine/compare.ts:479` reads:

```ts
const flagged = modules.symptom || flaggedModuleCount >= MODULES_REQUIRED_TO_FLAG;
```

Symptoms alone, or any two modules together. One non-symptom module crossing its cut-off does
not raise the flag. Nothing had to be fixed before continuing.

| Task | State found | State now |
|---|---|---|
| 1 — Practice mode, six modules, saves nothing | Done (`a494203`) | Done |
| 2 — First-exposure guard | Done (`a494203`) | Done |
| 3 — 25 ms threshold + two-or-more flag rule | Done, whole (`981ed2a`) | Done |
| 4 — 180 ms anticipation floor on the noise-floor pad | Done (`2248677`) | Done |
| 5 — Unlock recording | Done (`38682f6`) | Done |
| 5 — Time the battery in the browser | **Never started** | **Done — §3** |

Two loose ends the cut-off also left, both now closed: a completed but uncommitted review pass
sitting in the working tree (committed as `5abb3fe`), and a missing `AI-USAGE.md` entry for
task 5 (written, along with one for the timing work).

---

## 2. The uncommitted work that was recovered

It was found green — 435 tests, `tsc`, `eslint`, `build` all clean — and committed unchanged as
`5abb3fe`. It pins both halves of the first-exposure guard, which nothing was guarding:

- **`lib/storage.test.ts` (new).** The gate checks `practiceCompletedAt === null`. An athlete
  record that skipped normalisation carries `undefined`, and `undefined === null` is false — so
  a bypassed normaliser would fail **open** and enable the baseline button for someone who never
  practised. The normaliser now has behavioural tests, and the two read paths in `storage.ts`
  get the same structural guard `lib/schema.test.ts` gives the `TestResult` read paths.
- **Regression guard #8** pins the `disabled` prop itself, the sentence explaining why, and the
  fact that the sideline-check button stays ungated.
- **Regression guard #7** pins the results screen's "Change found — below the flag rule" branch
  and its position above the transitional and calm branches. This one matters most: since the
  flag rule became two-or-more, a module can cross its cut-off without raising the flag, and if
  that branch is deleted or reordered a real crossed measurement renders under "no change
  detected". That is precisely the conflation the hard rule forbids.
- A compare test for a module missing from one side only, and a calibration test holding
  `applyFlagRule` against `MODULES_REQUIRED_TO_FLAG` so the harness cannot drift into describing
  a rule nobody runs.

---

## 3. The battery, timed in a real browser

### How it was measured

A Playwright script walked the full six-module run at a 390×844 viewport against `next dev`,
marking wall-clock at every module boundary. It ran the **practice** flow, and anonymously: a
practice run writes no `TestResult`, and with no athlete attached `finishPracticeRun` returns
before touching storage, so **nothing was written to IndexedDB at all**. Two complete runs.

### The numbers

| Module | Run 1 | Run 2 |
|---|---|---|
| Symptom checklist | 0.2 s | 0.1 s |
| Word learning | 23.7 s | 24.1 s |
| Numbers backwards | 52.1 s | 52.1 s |
| Tapped patterns | 30.7 s | 30.6 s |
| Go / no-go | 54.2 s | 52.8 s |
| Word recall | 0.4 s | 0.4 s |
| **Total** | **161.3 s** | **160.2 s** |

### What this number is, and what it is not

**It is a floor, not a prediction of a real sitting.** The script's input is instant, so the two
modules that are *purely* athlete-paced — the symptom checklist and both 20-word grids — register
as roughly zero and are effectively absent from the total. A real athlete reads ten symptom items
and picks from a twenty-word grid twice, and none of that is in these figures.

What it *does* measure exactly is the machine-paced time an athlete cannot speed up, and every
figure cross-checks against the constants in `lib/modules/`:

| Module | Predicted from the constants | Measured |
|---|---|---|
| Word study | 10 × (2000 + 300) = 23.0 s | 23.7 s |
| Numbers backwards | 43 digits × (900 + 250) = 49.5 s | 52.1 s |
| Tapped patterns | 34 cells × (600 + 250) = 28.9 s | 30.6 s |
| Go / no-go | 22 go × (1150 + 320) + 8 no-go × (1150 + 1500) ≈ 53.5 s | 52.8 s |

Go/no-go is the one module whose figure is close to a real athlete's, because the script **had**
to wait ~320 ms before each tap: `judgeResponse` calls anything under 150 ms an anticipation and
discards and repeats the trial, so an instant bot cannot finish the module at all. That the
anticipation rule blocks a machine from completing it is itself a useful result.

**No human-time estimate has been added to any of this.** Timing an athlete reading and deciding
needs an athlete. `TODO(NEEDS_SOURCE)`: the athlete-paced portion of the battery is unmeasured.

### The thing worth deciding

Numbers backwards and go/no-go are each about 52 seconds of unavoidable machine time, and together
they are two thirds of the floor. If the battery turns out to be too long for a sideline — and a
real sitting is the floor **plus** everything above — those two are where the time is, and both
are shortenable by construction (fewer trials, or a shorter no-go window) rather than by tuning
anything that decides a flag. Not proposing a change; recording where the cost sits.

---

## 4. Every file touched this session

| File | Change |
|---|---|
| `lib/storage.ts`, `lib/storage.test.ts` | Normaliser exported and tested — recovered work |
| `lib/regression.test.ts` | Guards #7 and #8 — recovered work |
| `lib/engine/compare.test.ts`, `lib/calibration/calibration.test.ts` | Two tests — recovered work |
| `components/battery.tsx` | `PracticeBanner` reads sessionStorage once — recovered work |
| `AI-USAGE.md` | Task 5 entry, and the timing entry |
| `SESSION-REPORT.md` | This section |

No file in the needs-agreement table was edited this session. No threshold value changed.

---

## 5. `CLAUDE.md` needs the owner, and I did not touch it

The brief said not to edit it. It is now out of step with the code in eight places. Listed
loudest first; the first three are the ones that change what "correct" means.

1. **"`flagged` is true if any module flags"** (§The engine) is now false. The rule is symptoms
   alone, or two modules together, via `MODULES_REQUIRED_TO_FLAG`. Since `CLAUDE.md` is the
   tie-breaker when code and intent disagree, this line currently says the shipped engine is
   wrong. **This is the one to fix first.**
2. **"Go / no-go: NOT BUILT"** and the student-owned rule that *"no AI session may create it,
   including as a stub"*. It was built by AI on 2026-08-31 at the owner's direction. The
   contradiction was flagged in the August report (§6.1) and is still open.
3. **`lib/engine/thresholds.ts` — the values** is listed as student-owned, with AI permitted to
   add only `null`. `GO_NO_GO_SLOWER_MS = 25` and `MODULES_REQUIRED_TO_FLAG = 2` were typed by
   AI at the owner's direction. The file records that; the ownership table does not.
4. **"Recording is currently DISABLED"** (§The battery) is no longer true. Recording is unlocked
   behind the practice gate, and the condition written there — *"until go/no-go exists **and**
   thresholds have been set from collected data"* — has arguably been met by one threshold out
   of ten. Worth saying explicitly which reading the owner intends.
5. **The `Athlete` type reproduced in §The data contract** is missing `practiceCompletedAt`, so
   the copy in `CLAUDE.md` no longer matches `lib/types.ts`.
6. **Practice mode is absent entirely** — `/practice`, `/practice/summary`, and the rule that a
   baseline requires a completed practice pass are nowhere in the file.
7. **P0 scope** still lists "thresholds derived from collected data" as outstanding. One of ten
   now exists, from n=1 self-collected data.
8. **The battery section** does not mention the 180 ms anticipation floor on
   `/tools/noise-floor`, which is a comparability break in the collected data: readings taken
   before 2026-09-10 could contain anticipations, readings after cannot. The code says so; the
   document does not.

---

## 6. Standing limitations, unchanged

- **Nine of ten thresholds are still `null`**, and every one carries `TODO(NEEDS_SOURCE)`. The
  engine can compare them but forms no verdict, they are reported as `unevaluated`, and the
  results screen says out loud that it could not judge them.
- **The one threshold that exists is n=1**, from one healthy person's self-collected noise-floor
  data. It clears the bar this project set — measured rather than guessed — and no other bar.
- **Structural guards are still text matching.** They prove the wiring is written, not that it
  runs. Stated openly at the top of `lib/regression.test.ts` and repeated here.
- **Timing was never validated against a second clock.** Every claim about response time rests
  on `performance.now()` measuring itself.
- **The athlete-paced half of the battery is unmeasured** — new this session, §3.

---

## 7. Say it out loud

> First thing: I checked the one dangerous possibility before touching anything. The worry was
> that yesterday's threshold work had half-landed — the go/no-go number set, but the rule still
> saying any single test can raise a flag. That would have meant one timing measurement could
> flag a kid on its own. It didn't happen. The rule needs the symptom checklist on its own, or
> any two tests together, and that's what's actually in the code.
>
> Four of the five tasks were already done. The one real gap was that nobody had ever timed the
> battery, so I did. It's about two minutes forty — but I want to be careful about that number,
> because it's a floor, not the real answer. I ran it with a script, and a script fills in the
> symptom checklist instantly. A real kid reading ten symptoms and picking words out of a grid
> twice adds time I haven't measured and won't guess at. What I can tell you exactly is the part
> nobody can speed up: the words take 24 seconds to show, the number rounds take 52, the tapping
> takes 31, and go/no-go takes 53. Those matched the code's own timing constants to within a
> couple of seconds, which is how I know the measurement is real.
>
> One nice accident: the script couldn't cheat. Go/no-go throws away any tap faster than 150
> milliseconds as guessing, so a bot tapping instantly can't finish the test at all. I had to
> make it wait a realistic third of a second. The anti-guessing rule works.
>
> If the battery ever turns out to be too long for a sideline, the time is in numbers-backwards
> and go/no-go — two thirds of it — and both can be shortened without touching anything that
> decides whether someone gets flagged.
>
> I also found yesterday's last piece of work sitting uncommitted. It was finished and passing,
> so I committed it. It's the tests that make sure the practice gate can't quietly break — the
> nastiest one being that an athlete record saved before this feature existed would have
> *unlocked* the baseline button instead of locking it, which is the wrong way to fail.
>
> Tests went 412 to 435. Everything builds. Nothing merged — the branch is pushed, that's all.
> Still nine of ten thresholds empty, and the one that exists came from one person's data.
>
> The thing I need from you is CLAUDE.md. It now disagrees with the code in eight places, and
> the worst is that it still says a flag is raised if *any* single test looks off. That file is
> the tie-breaker when the code and the rules disagree — so right now it says the engine we
> shipped is wrong. I listed all eight in the report and edited none of them, because you told
> me not to touch that file.

---

# Session report — 31 August 2026 *(previous session, kept for the record)*

Autonomous session. Project: `C:\Users\vedan\Downloads\cac-main\cac-main`.
Branch: `feat/gonogo-and-calibration`. **Nothing merged, nothing pushed, tag untouched.**

Tag confirmed at the end: `v1-three-module` → `a7f2843`. Still points there.

**Headline: all five tasks completed. Go/no-go is built and is step 5 of 6. The calibration
harness is built and already produced one finding worth acting on — flag-on-any raised a false
alarm on 30% of healthy simulated athletes against 3% for flag-on-two. All four requested
mutations were caught, and two extra mutations I invented were NOT, which found two missing
tests that are now written. Every threshold is still `null`, and recording is still off.**

Tests: **272 → 402**, all passing. `tsc`, `lint`, `build` all clean. 16 routes.

---

## 0. Task status

| Task | State |
|---|---|
| **0 — gstack section in CLAUDE.md** | ✅ Committed on its own. The only edit to that file. |
| **1 — Go/no-go module** | ✅ Built, plus the walkthrough doc |
| **2 — Calibration harness** | ✅ `lib/calibration/` + `/tools/calibration` |
| **3 — Design pass across six modules** | ✅ Implemented, audited, fixed |
| **4 — Find the gaps** | ✅ Review + QA + 7 mutations |
| **5 — Disclosure** | ✅ One `AI-USAGE.md` entry per task |

Eight commits, one per task or sub-step. Not merged, not pushed.

---

## 1. What changed, file by file

### Created (14 code/doc files)

| File | One line |
|---|---|
| `app/tests/gonogo/page.tsx` | The go/no-go screen. 30 trials, all timing in refs, zero renders mid-run |
| `lib/modules/gonogo.ts` | Pacing constants, the anticipation and stale-timer rules, scoring |
| `lib/modules/gonogo.test.ts` | 35 tests on the rules and the scoring |
| `docs/GONOGO-WALKTHROUGH.md` | Line-by-line explanation for someone who knows Java/Python, not TS/React |
| `lib/calibration/random.ts` | Seeded generator; normal, binomial and Poisson draws |
| `lib/calibration/profiles.ts` | What each measurement is, its range, and the noise-profile shape |
| `lib/calibration/generate.ts` | Synthetic athletes as real `TestResult` records |
| `lib/calibration/simulate.ts` | Drives the real engine; rates, sweeps, and the flag-rule comparison |
| `lib/calibration/parse.ts` | Turns pasted measurements into a noise profile |
| `lib/calibration/index.ts` | Front door |
| `lib/calibration/calibration.test.ts` | 52 tests, including the engine cross-check |
| `app/tools/calibration/page.tsx` | The dev-only page. Gated out of production builds |
| `lib/design.test.ts` | 41 tests holding the design system in place |
| `docs/screenshots/**` | Before/after for all six modules, plus results and the harness |

### Modified (18)

| File | What changed |
|---|---|
| `CLAUDE.md` | **Task 0 only.** The `## gstack` section, verbatim. Nothing else, all session |
| `lib/session.ts` | `goNoGo` added to `BATTERY_STEPS` at position 5, plus its path and label |
| `lib/forms/goNo.ts` | Header updated: the module it was waiting for now exists |
| `lib/regression.test.ts` | Guards #5 and #6 for go/no-go, plus two more after mutation testing |
| `app/globals.css` | The design system rewritten: 10 colours, 5 type sizes, both namespaces reset |
| `components/ui.tsx` | New button variants, `Notice` tones, `ModuleIntro`, `InstrumentPanel` |
| `components/battery.tsx` | `stepLabel` is always the position; new `practice` flag; notices restyled |
| `app/layout.tsx` | Chrome is dark on every screen; `main` is a flex column |
| `app/tests/symptom/page.tsx` | Moved from the light document surface to the dark instrument surface |
| `app/tests/words/page.tsx` | One-line instruction, `ModuleIntro`, button variants |
| `app/tests/digits/page.tsx` | Same |
| `app/tests/pattern/page.tsx` | Same |
| `app/tests/words/recall/page.tsx` | Same; the refusal panel is now ink, not red |
| `app/tools/noise-floor/page.tsx` | Token sweep; the WAIT state is no longer red |
| `app/page.tsx` | Go/no-go test card added; recording notice reworded |
| `app/athletes/page.tsx` | Delete confirmation is ink, not red; button overrides removed |
| `app/athletes/[id]/page.tsx` | Notice reworded (battery complete, thresholds still missing) |
| `app/results/[id]/page.tsx` | **Colour classes only.** Red is now on flagged states alone |
| `app/not-found.tsx` | Token sweep |
| `.gitignore` | Reverted a stray edit, then re-added `.gstack/` deliberately — see §6.6 |

**No file was deleted.**

---

## 2. Every judgment call, and why

1. **I built `app/tests/gonogo`, which `CLAUDE.md` reserves as student-owned and off-limits to
   AI.** The brief for this session told me to, in detail, with the timing rules spelled out. A
   direct instruction from the person who wrote the ownership note supersedes the note. **The note
   is now out of date and I did not fix it**, because Task 0 said the gstack section was my only
   edit to that file. See §6.1 for the exact wording that needs changing.

2. **Go/no-go went into `BATTERY_STEPS` at position 5, between pattern span and word recall.** The
   ordering rule forbids appending anything after `wordRecognition`, so the end was the one place
   it could not go. Inside the word pair it also lengthens the gap between the two word screens,
   which makes the delayed score slightly more a test of retention.

3. **`goTrialsMs` is computed and displayed but NOT saved.** The brief says the module reports it.
   `ModuleScores.goNoGo` has no field for it, and adding one means bumping
   `CURRENT_SCHEMA_VERSION`, which makes every baseline already on a phone unreadable. That is not
   a change to make in passing, so the raw times are printed on screen to be written down — the
   same workflow as `/tools/noise-floor` — and widening the contract is proposed in §6.2.

4. **A run where no go trial got a response returns `null` rather than a median.** There is no
   honest median of no responses. Zero is not a response time; neither is the window length. The
   cost is real and is stated in the code: the omission count in that situation is itself a
   striking finding and it gets thrown away with everything else.

5. **Two rules I added that the brief did not ask for.** A window-closing timer that fires far too
   late means the tab was throttled, so the trial is repeated rather than recorded as an omission
   the athlete never had a chance at — otherwise a phone in a pocket writes a page of attention
   failures. And a trial may only be repeated three times before the whole run is abandoned with
   nothing saved, so a face-down phone cannot loop forever. Both are conservative: they discard
   data rather than invent it.

6. **The response window is 1500 ms, wider than usual for this task.** A tighter window converts a
   genuinely slowed response into an omission error, which moves the signal we are trying to
   measure into a different number entirely.

7. **Red now means exactly one thing.** It carried four (flagged, refused, errored, switched-off).
   It now appears only on the results screen's flagged states. Everything else that was red is a
   heavy ink panel, which on a white page is at least as loud. This is the change most likely to
   be argued with, so it is machine-checked in `lib/design.test.ts`.

8. **That required touching `app/results/[id]/page.tsx`, which needs agreement first.** I changed
   **colour classes only** — no copy, no logic, no states. The copy guards in
   `lib/regression.test.ts` still pass unchanged, and I re-read the rendered screen against a real
   flagged result (§4).

9. **The symptom checklist moved to the dark surface, reversing a documented earlier decision.**
   The old reasoning — a questionnaire belongs on the document surface — was defensible on its own
   and wrong in sequence: it flashed white for one screen out of six, mid-run, on a phone whose
   brightness is already up for daylight.

10. **The app chrome went dark on every screen.** A white nav bar above a near-black test screen
    was the brightest object on the display, directly above the thing the athlete is meant to be
    watching.

11. **Tailwind's colour and type namespaces are reset to `initial`.** That deletes the built-in
    palettes, so the ten colours and five sizes are the only ones that exist and a stray
    `text-blue-500` or `text-xs` cannot survive. The counts in §5 are enforced by the build, not by
    my discipline.

12. **The calibration harness applies the candidate threshold itself.** It could not do otherwise:
    every threshold is `null`, so the engine has no cut-off to be asked about. What keeps that
    honest is a cross-check that runs on every pair of every run — symptom is the one measurement
    with a real threshold, so the harness's verdict is held against the engine's on all of them,
    and the page refuses to look confident if they ever disagree.

13. **The harness models the count measurements with a binomial and the error tallies with a
    Poisson, not a bell curve.** A bell curve produces 9.7 correct out of 9, and negative error
    counts. The whole question a threshold answers is about small integer changes near the top of
    a bounded scale, which is exactly where that choice matters.

14. **The dev calibration page is gated out of production builds.** A page full of percentages
    labelled "false negative rate" is exactly the sort of thing that gets screenshotted and
    mistaken for clinical evidence.

15. **I auto-decided the interactive gates in `/plan-design-review`, `/design-review` and
    `/review`.** Each opens by asking the user to confirm scope. This session was told not to stop
    for questions, so I took scope to be "the six test modules on this branch" and carried on.

16. **I did not spawn subagents.** `/review` and `/design-review` both call for specialist
    subagents; my standing instructions say not to use the Agent tool unless asked. I ran the
    review passes myself instead.

17. **`.gitignore`: I reverted an unintended edit, then deliberately re-made it.** A skill appended
    `.gstack/` and my `git add -A` swept it into the task 1 commit. I reverted it as
    out-of-scope — then found that the directory it names holds the browse daemon's runtime state
    **including `terminal-internal-token`, a credential**. Leaving that untracked and unignored is
    worse than the stray line, so the rule went back in on purpose with the reason beside it.

---

## 3. Mutation results — every one, caught or not caught

Each mutation was applied in isolation from a clean tree, the full suite was run, then the file was
restored and confirmed byte-identical (`git status --porcelain` empty) before the next.

Baseline: **0 failing, 400 passing.**

### The four the brief asked for

| # | Mutation | Result | Caught by |
|---|---|---|---|
| **M1** | Removed the synchronous stimulus stamp in go/no-go, leaving only `requestAnimationFrame` | **CAUGHT** (1 failed) | `#5 … > stamps synchronously and only then asks rAF to refine it` |
| **M2** | Judged a go/no-go tap against React state instead of the ref | **CAUGHT** (1 failed) | `#6 … > keeps the pad phase in a ref and reads it in the tap handler` |
| **M3** | Deleted the commission-error increment (`+= 1` → `+= 0`) | **CAUGHT** (1 failed) | `scoreGoNoGo > counts commission and omission errors separately, never added together` |
| **M4** | Removed the null-threshold guard so a null silently never flags | **CAUGHT (8 failed)** | 5 × `a measurement with no threshold yet is reported as UNJUDGED, never as fine`, 3 × `breakdown rows stay consistent with the engine verdict` |

**M4 is the trap the brief named, and it is the best-defended thing in the codebase** — eight
separate tests fail, including one named `an athlete who collapsed on every unjudged module STILL
produces flagged=false`, which exists specifically so nobody mistakes that state for working
correctly.

**An honest note on M1 and M2.** Both were caught by *structural* guards — tests that read the
source file as text and check the fix is still written there. That proves the fix is present, not
that it works. `lib/regression.test.ts` says so at the top, and it is why I went looking for
subtler mutations.

### Three more I invented, because a passed mutation test proves less than it looks

| # | Mutation | Result |
|---|---|---|
| **M5** | Deleted the rAF stale-callback token guard | **NOT CAUGHT** → missing test |
| **M6** | Recorded a missed go trial as a correct withhold instead of an omission | **CAUGHT** (1 failed) |
| **M7** | Kept the guarded line `const phase = phaseRef.current;` and judged the **outcome** against React state | **NOT CAUGHT** → missing test |

**M7 is the important one.** It is the same bug as M2 wearing a different hat — a tap that landed
during a no-go trial gets recorded as a reaction time, the commission error vanishes, and the
median is contaminated by that same tap — and it walked straight past every guard, because a
line-by-line structural guard pins the line it names and nothing else.

**Both gaps are now closed**, and I re-ran M5 and M7 to prove it:

- A **whole-handler guard**: the tap handler's entire body must contain no reference to `runState`,
  the only React state on that screen. That kills the class, not the instance. M7 now fails it.
- A **token guard** for the rAF fix. M5 now fails it.

Re-run after the fix: M5 **CAUGHT**, M7 **CAUGHT**. Tree byte-identical after each.

---

## 4. What `/review` and `/qa` found

### `/review` — three findings, all fixed

1. **`lib/calibration/simulate.ts`** built the sweep range with `Math.max(...worsenings)`, which
   puts one stack slot per sample. **I initially reported this as a live bug and it is not** — I
   measured the limit on this Node build at roughly 125,000 elements, and the page caps a run at
   50,000. It was within about 2.5× of a limit that varies by engine and by the stack a browser
   gives the tab. Now a plain loop, with the real numbers in the comment.
2. **`app/tests/gonogo`**: a late rAF callback from trial N could refine trial N+1's stamp, making
   a real response look fast enough to be discarded as an anticipation. Each stimulus now carries a
   token. (This is the fix M5 then proved had no test.)
3. **`app/athletes`**: the delete-confirmation buttons overrode the shared button height down to
   48px with `!important` utilities. Removed.

Noted, not a defect: the destructive delete button no longer looks different from a primary action,
because red is reserved for flagged. The confirmation sentence and the "Keep" alternative carry
that weight instead. That is a real cost of the one-accent rule and you may disagree with it.

### `/qa` — clean

- All 12 routes return the expected status; `/no-such-page` correctly 404s.
- **The safety footer renders on every single one**, including the 404 and the dev tool.
- No console errors on any screen.
- No tick glyph and no green pixel found anywhere by a computed-style sweep.
- The words "cleared", "safe to play" and "healthy" appear on exactly two screens, and I read every
  sentence: `"It will never tell you someone is fine, cleared, or safe to play"`, `"records a
  healthy baseline"`, and `"how much a healthy person's reaction time varies"`. All three are safe.
- **Both recording buttons are still `disabled`**, with the notice above them.

### The end-to-end run, which mattered most

I seeded a sitting into `sessionStorage` — no code change, and it does not enable the disabled
buttons — and walked the chain:

- Completing symptom navigated to `/tests/words`. Ordering holds.
- With only go/no-go missing, the chain routed to `/tests/gonogo`. **The new module really is in
  the battery.**
- A full baseline saved and returned to the athlete page; a worse check saved and landed on a real
  results screen.
- **That results screen is in `docs/screenshots/after/results-flagged.png`** and it is correct: a
  solid red FLAGGED panel, "Stop activity now and have QA Athlete evaluated by a medical
  professional", an explicit "This screen cannot tell you whether QA Athlete has a concussion", and
  **every other measurement badged NOT JUDGED** because their thresholds are null. Red appears
  nowhere else on the page.

I also drove a complete 30-trial go/no-go run in a real browser: 30/30 trials, 22/22 go trials
answered, median 226 ms, 0 commission errors. The anticipation path fired repeatedly during that
run (the robot tapper is not reacting to anything) and the module discarded and repeated those
trials rather than recording them, which is exactly the designed behaviour.

The QA athlete was deleted afterwards.

---

## 5. Design: token count, type scale, contrast

### Colour — exactly 10, and the build enforces it

`--color-*: initial` deletes Tailwind's palette, so these are the only colours that exist.

| # | Token | Job |
|---|---|---|
| 1 | `paper` `#ffffff` | Cards and the light page |
| 2 | `surface` `#eef1f2` | The page behind the cards, so cards have an edge |
| 3 | `ink` `#0a0e11` | All primary text on light; primary buttons |
| 4 | `ink-soft` `#46525a` | Secondary text on light |
| 5 | `instrument` `#080b0d` | The dark page, and the app chrome |
| 6 | `instrument-panel` `#161c21` | A raised panel on the dark page |
| 7 | `instrument-ink` `#f4f6f7` | Primary text on dark |
| 8 | `instrument-ink-soft` `#a9b6be` | Secondary text on dark |
| 9 | `flag` `#c8102e` | **The one accent.** Flagged, and nothing else, ever |
| 10 | `pad-go` `#00a651` | The GO stimulus. A target to hit, not a verdict |

Ten, so no justification budget is needed. Borders are `ink` or `instrument-ink` at low opacity
rather than tokens of their own, which is what keeps the count at ten and stops a divider drifting
away from the text beside it. **Blue is gone entirely.** There is no success green: `pad-go` is a
stimulus that is on screen for under two seconds and never appears on a results screen.

### Type — exactly 5 sizes, one family

`--text-*: initial` deletes Tailwind's steps.

| Token | Size | Used for |
|---|---|---|
| `stimulus` | 64px | The thing you react to: the pad word, a digit, a score readout |
| `display` | 32px | The name of the screen you are on |
| `title` | 22px | A heading inside a screen |
| `body` | **17px** | Every sentence in the app |
| `meta` | 16px | Uppercase tracked labels only, never a sentence |

Body is 17px and the smallest size in the system is 16px, so nothing in the app is below the
16px mobile floor — including the labels. A rendered sweep of the six modules found only
16/17/22/32/64px on screen, and exactly **one** font family.

### Contrast — lowest measured ratio: **5.88:1**

Every foreground/background pair, computed from the actual token values:

| Ratio | Pair |
|---|---|
| 19.38:1 | `ink` on `paper` — body and headings on a card |
| 19.38:1 | `paper` on `ink` — reversed type in a loud panel / primary button |
| 18.21:1 | `instrument-ink` on `instrument` — primary text on a test screen |
| 18.21:1 | `instrument` on `instrument-ink` — a selected chip / instrument button |
| 17.07:1 | `ink` on `surface` |
| 15.85:1 | `instrument-ink` on `instrument-panel` |
| 9.51:1 | `instrument-ink-soft` on `instrument` |
| 8.28:1 | `instrument-ink-soft` on `instrument-panel` |
| 8.03:1 | `ink-soft` on `paper` |
| 7.07:1 | `ink-soft` on `surface` |
| 6.18:1 | `instrument` on `pad-go` — the word TAP on the go stimulus |
| **5.88:1** | **`paper` on `flag` — white type on the flagged headline** |
| 5.88:1 | `flag` on `paper` — flagged values in the results table |

**Lowest: 5.88:1**, against a 4.5:1 AA floor for normal text. Every pair passes.

### The rest of the required list

- **Spacing** from 4/8/12/16/24/32/48/64 only. A source sweep found no off-scale value and no
  arbitrary `[...px]` value in the six modules.
- **Tap targets**: a rendered measurement of every `a`, `button` and `label` on all six modules
  found **zero** interactive elements under 56px. Two were found during the audit at 21px and 49px
  and are fixed.
- **Instructions**: one line per module, in the header, with a second short line at most in the
  start panel.
- **Battery position**: every module shows `STEP n OF 6` — verified rendered, 1 through 6 in order.
  It used to say "Practice" instead of the position when no sitting was in progress, which removed
  it from exactly the screens somebody sees first.
- **No horizontal scroll** on any module at 390px.
- **Banned list**: no gradient, no backdrop blur, no drop shadow, no emoji, no decorative
  animation, no "AI"/"smart"/"powered by". All asserted in `lib/design.test.ts`.

---

## 6. Things I am unsure about, or that need you

### 6.1 `CLAUDE.md` now contradicts the code, and I did not fix it

Task 0 said the gstack section was my only edit. These are now wrong and are yours to change:

- **"Who owns what" → student-owned table**: the `app/tests/gonogo/**` row says no AI session may
  create it, "including as a stub". An AI session created the whole thing, on your instruction.
- **"The battery" section**: says go/no-go is **NOT BUILT** and that there is deliberately no
  route. Both are now false.
- **Ordering rule 1**: still correct, but should mention that go/no-go sits inside the word pair.
- **"Recording is currently DISABLED"**: still true, but the reason has changed — the battery is
  complete now; only the thresholds are missing.
- **Build phases**: still describes the original three-module plan.
- Consider adding `lib/calibration/**` to the free-to-edit list, and a line saying the harness must
  never write a threshold.

### 6.2 The data contract cannot hold everything go/no-go measures

Two proposals, both needing a `schemaVersion` bump, which makes every stored baseline unreadable:

- `goNoGo.goTrialsMs: number[]` — the raw per-trial times. The single most useful thing the module
  produces for threshold work, currently only printed on screen.
- `goNoGo.medianMs: number | null` — so a run where the athlete responded to nothing can still
  record its omission count instead of being discarded whole.

Neither is urgent while recording is off. Both are cheap **if done before anyone records a real
baseline**, and expensive after.

### 6.3 The pacing numbers are mine, and they freeze on the day collection starts

`GO_NO_STIMULUS_WINDOW_MS = 1500`, `GO_NO_MIN_PLAUSIBLE_RESPONSE_MS = 150`, the 700–1600 ms gap,
`GO_NO_TIMER_SLACK_MS = 750`, `GO_NO_MAX_TRIAL_REPEATS = 3`. Every one has a reason written beside
it and none is taken from any published protocol. They decide nothing about flagging, so they are
not thresholds — but they do decide difficulty, and changing one after collection starts makes the
earlier readings non-comparable. Same warning as `WORD_EXPOSURE_MS` and friends.

### 6.4 Structural guards are still text matching

Seven of the go/no-go guards read the source file and check a pattern is present. M7 showed exactly
what that is worth. The whole-handler guard I added is stronger — it asserts a property of a whole
function rather than one line — but it is still not behaviour. Upgrading these properly needs a DOM
test harness (jsdom plus a rendering library) that can mount the component, fire fifteen taps in
one frame, and withhold `requestAnimationFrame`. That is a real piece of work and it is the single
highest-value test investment left in this project.

### 6.5 Form alternation is still probable rather than guaranteed

Unchanged from last session and it now applies to go/no-go too: the screens seed `pickForm` with
`athleteId:startedAt`, which makes a repeated form unlikely (~1 in 6) but not impossible.
`pickFormBySitting` guarantees it, but needs a persisted per-athlete sitting counter that nothing
writes yet.

### 6.6 `.gitignore` has stray NUL bytes

Pre-existing, not something this session caused. It is why git calls the file binary and why every
diff against it is unreadable. **The ignore rules still parse correctly** — `git check-ignore`
resolves `node_modules`, `.next` and `*.tsbuildinfo` — so this is cosmetic. Rewriting it as plain
ASCII is a one-minute job for whoever wants readable diffs. See judgment call 17 for the `.gstack/`
line I added on purpose.

### 6.7 The harness's own placeholder profile is invented, and looks exactly as convincing

`PLACEHOLDER_PROFILES` is round numbers somebody typed. The page says so in the one place the
string lives and repeats it in the results panel, but a curve drawn from it looks identical to a
curve drawn from real data. The only defence is the label. Read it every time.

### 6.8 Timing was never validated against a second clock

Every claim about the go/no-go timing rests on `performance.now()` measuring itself. Nothing in
this session compared the app's numbers against an external reference. If you ever want to state a
response time as a real quantity rather than a within-athlete comparison, that needs doing.

---

## 7. What the calibration harness assumes, and what it cannot tell you

### What it actually does

Generates synthetic athletes from a noise profile, applies a degradation **you** supply, builds
both sittings as real `TestResult` records, and pushes every pair through
`compareToBaseline` — the real engine, with all seven refusal rules — using the engine's own
`worseningFor` for the direction-aware subtraction. It then reports, for each candidate threshold,
how often it would flag a healthy athlete and how often it would miss an impaired one.

### The assumptions, stated plainly

1. **Impairment shifts a score by a fixed amount and leaves its spread alone.** Real impairment
   probably also makes an athlete more erratic. The harness does not model that, and a more erratic
   athlete is easier to detect, so this assumption is likely **pessimistic** about detection.
2. **The two sittings are independent draws around the athlete's own centre.** No practice effect,
   no fatigue, no time-of-day, no learning. The forms exist precisely because practice effects are
   real, so this one is doing real work.
3. **Whatever you paste is representative of the athletes you will test.** Nothing checks that.
4. **Counts behave binomially and error tallies behave Poisson.** Defensible shapes, but shapes.
5. **A measurement's noise is independent of every other measurement's.** In reality a tired
   athlete is slower *and* remembers less, so real flags cluster. Correlation would make
   flag-on-two-or-more look better than the harness says.
6. **The engine's refusals never fire on a simulated pair.** Checked every run and reported.

### What it cannot tell you

- **Nothing about concussion.** It contains no clinical knowledge. It is arithmetic about invented
  athletes with the properties you described.
- **What a threshold should be.** It shows the tradeoff and stops. Where to sit between missing a
  concussion and crying wolf is a judgement about consequences.
- **Whether your degradation parameter is the right one.** If you ask "how well would we catch a
  60 ms slowing", it answers that and nothing else. It cannot tell you a concussion causes 60 ms.
- **Anything at all until you paste real data.** With the placeholder profile it is exercising the
  machinery, not measuring anything.

### The finding it already produced

With real pasted go/no-go data for the response time and the placeholder for everything else, at
the candidate thresholds I typed:

| Rule | Flags a healthy athlete | Misses an impaired one |
|---|---|---|
| **Any one module flags** (what the engine does today) | **30.1%** | 35.3% |
| Two or more modules must flag | **3.0%** | 86.0% |
| Symptom alone is enough; otherwise two or more | 4.5% | 85.0% |

Read it as a shape, not as numbers: **flagging on any one of ten measurements gives ten separate
chances to raise a false alarm on an athlete who is fine**, and the harness makes that concrete
for the first time. The engine currently does exactly that. Whether a 30% false alarm rate is
acceptable for a smoke alarm is a real design decision and nobody has made it yet. Do not act on
these particular numbers — nine of the ten measurements used invented profiles.

---

## 8. Manual test script

Run `npm run dev -- -H 0.0.0.0` and open the Network URL on a phone. Steps 6, 9 and 12 are the
ones that matter most.

| # | Do this | Expected result |
|---|---|---|
| 1 | Open the home page. | Dark bar top and bottom, white page between. The footer reads "Student-built screening aid — not a medical device…" and is on **every** screen from here on. A black notice says recording is turned off because the tests have no tested cut-offs. |
| 2 | Read the five test cards. | Symptom checklist, Word learning, Numbers backwards, Tapped patterns, **and Go / no-go**, all linked. |
| 3 | Tap **Go / no-go**. | Dark screen. `STEP 5 OF 6` above the title. **One line** of instruction. A practice banner saying nothing is saved. |
| 4 | Tap the pad to begin, then play it properly: tap the instant it says **TAP**, do nothing on **HOLD**. | 30 trials, about a minute. Never any right/wrong feedback. At the end: a median in ms, "Tapped on hold", "Missed a tap", and the raw list of every go-trial response to write down. |
| 5 | Run it again and deliberately tap during **HOLD** three or four times. | Those count under "Tapped on hold". The run still finishes. |
| 6 | 🔑 Run it again and tap **as fast as you possibly can, before anything appears**, several times in a row. | Each early tap shows **TOO SOON** and that round runs again. It is never recorded as an error. After 3 early taps on the same round the run **stops** with "This run was stopped" and saves nothing. |
| 7 | 🔑 Start a run, then **switch to another app for ~15 seconds** and come back. | It must never be stuck. Either the round says **SKIPPED** and repeats, or the run has stopped with nothing recorded. It must not silently fill up "Missed a tap". |
| 8 | Walk the other four test screens. | All dark. Each shows `STEP n OF 6` and one line of instruction. Nothing is green, there are no ticks, and no round ever tells you whether you were right. |
| 9 | 🔑 On the symptom screen, check the rating chips. | Four chips per symptom, each at least a fingertip tall (56px). A selected chip is **white**, never green. |
| 10 | Go to **Athletes**, add `Test One`, open them. | 🔑 **Record baseline** and **Start sideline check** are both greyed out and unclickable, each saying "Unavailable until the tests have tested cut-offs", with a black notice above explaining why and telling you to see a professional regardless. **If either button works, that is the bug.** |
| 11 | Tap **Delete Test One**, then read the confirmation. | An ink-bordered panel, a sentence saying it cannot be undone, and two full-size buttons: "Delete permanently" and "Keep". Note the delete button is **not red** — red is reserved for a flagged result. |
| 12 | 🔑 On a laptop, open `/tools/calibration`. Paste 8–10 repeated healthy readings into any box, type a degradation, type candidate thresholds, and run it. | A red-bordered notice at the very top saying everything on the page is a simulation. A tradeoff table, and a rule-comparison table. It must never suggest a threshold. **Nothing in `lib/engine/thresholds.ts` changes.** |
| 13 | Open `/tools/noise-floor`. | Banner: measurement tool, not part of the battery. The WAIT state is now a dark panel rather than red; GO is still green. Five trials, then a median and a false-start count to write down. |
| 14 | Read every screen you reached. | Every path ends in seeing a medical professional. No "cleared", "safe to play", "healthy" or "you're fine" as a verdict about anyone. No green anywhere except the go stimulus. No ticks. |

### Forcing a fresh load past the service worker

Unchanged from last session: the service worker is **not registered in development**, so with
`npm run dev` a hard refresh is enough. For a real deploy, `CACHE_NAME` in `public/sw.js` is still
`v2` — **bump it to `v3` before you deploy this**, because six screens changed appearance and
`/tests/gonogo` is a new route. Otherwise: a Private/Incognito tab, or clear site data (which also
wipes IndexedDB and your test athletes).

---

## 9. Final state

| Check | Before | After |
|---|---|---|
| `npx vitest run` | ✅ 272 tests, 16 files | ✅ **402 tests, 19 files** |
| `npx tsc --noEmit` | ✅ | ✅ |
| `npm run lint` | ✅ | ✅ |
| `npm run build` | ✅ 14 routes | ✅ **16 routes** |
| Thresholds set | 0 new | **0 new** — 9 still `number \| null = null`, 11 `TODO(NEEDS_SOURCE)` |
| Recording | disabled | **disabled** |
| `v1-three-module` | `a7f2843` | `a7f2843` |

Nine commits on `feat/gonogo-and-calibration`. **Not merged. Not pushed.** No threshold value was
invented, no statistic or citation was added, no clinical red-flag list was written, nothing was
copied from any published assessment, and no screen anywhere says anybody is fine.

---

## Say-it-out-loud summary

> Go/no-go is built. It's step 5 of 6, it reads its thirty trials from the list file that was
> already there, and it never makes up a trial. The timing is the part worth talking about: the
> clock is stamped the instant the signal appears rather than waiting for the browser's animation
> callback, because that callback doesn't fire when your phone's screen is off and that's what
> froze the old reaction test. Nothing on that screen touches React while a trial is running, so
> there's nothing sitting between the finger landing and the clock being read. Tap too early and
> the round is thrown away and run again, never counted against you. There's a full walkthrough
> doc so I can explain any line of it from memory.
>
> Second thing: I built the machine that turns collected data into thresholds. It invents thousands
> of athletes, runs every one through the real comparison engine, and draws the tradeoff curve for
> any cut-off you're considering. It writes nothing — every threshold is still null. And it already
> told us something: flagging when any single test looks off would raise a false alarm on about a
> third of healthy athletes, because with ten measurements you get ten chances to be wrong.
> Requiring two brings that to three percent. Nobody had looked at that before and it's a real
> design decision waiting to be made.
>
> Third: the design. Red now means exactly one thing — this screening found a change worth looking
> at — and it appears on one screen only. It used to also mean delete, error and warning, which
> spends the colour you need most. Blue's gone entirely. All six tests are dark now, including the
> symptom checklist, which used to flash white in the middle of the run. Ten colours, five type
> sizes, and the build actually fails if you use anything else. Lowest contrast anywhere is 5.88 to
> 1 against a 4.5 requirement.
>
> Last, and this is the bit I'd lead with: I broke the code on purpose seven times to see whether
> the tests noticed. The four you asked for were all caught — including the null-threshold trap,
> which eight separate tests catch. But two mutations I made up myself slipped through, and one of
> them was nasty: I kept the exact line the test was checking for and broke the logic right next to
> it. That's a real lesson about what those tests were worth, so I wrote a stronger one that checks
> the whole function instead of one line, and both now get caught.
>
> Tests went 272 to 402. Nothing's merged, nothing's pushed, the tag hasn't moved, and recording is
> still switched off — which is right, because we still have no thresholds. The one thing I need
> from you is CLAUDE.md: it still says go/no-go must never be built by an AI, and I built it
> because you told me to. That contradiction is written up in the report rather than fixed, because
> you told me to touch that file exactly once.
