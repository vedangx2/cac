# CLAUDE.md — read this before writing any code

This file is the source of truth for this project. It is written for whoever picks the
project up next — a future AI session, a teammate, or us six months from now. If anything
in the code contradicts this file, this file wins; fix the code or fix this file, don't
leave them disagreeing.

---

## What this is

A **free mobile web app that helps youth athletes, coaches, and parents catch a possible
concussion on the sideline when no athletic trainer is present.**

- Built for the **Congressional App Challenge, TX-17. Deadline: October 26, 2026.**
- How it works: an athlete takes a short battery of tests **while healthy** (a *baseline*).
  If they later take a hard hit, they retake the **same** tests (a *check*). The app
  compares the new scores against **that athlete's own baseline** and flags whether
  something looks off, then tells them to see a medical professional.
- The core idea is **comparing you to you** — not to a population average. A slow reaction
  time only means something relative to how fast *that specific athlete* normally is.
- Why it matters: professional tools (e.g. Sway Medical, Cleveland Clinic C3) exist but are
  expensive and built for certified athletic trainers. Most rec leagues and middle-school
  programs have neither the tool nor the trainer. Today, when a kid takes a hit, the
  assessment is a coach's gut feeling. This app is a structured, consistent second opinion.

---

## THE HARD RULE — never violate this

**This app FLAGS and REFERS. It never diagnoses and never clears anyone.**

- Every result path ends in **"see a medical professional."**
- **Never** write copy, a variable name, a CSS class, or a UI state that implies
  "cleared," "safe to play," "no concussion," "you're fine," or "healthy."
- A **no-flag** result must say three things:
  1. the screen found **no significant change from this athlete's baseline**, AND
  2. this **does not rule out a concussion**, AND
  3. they should **still monitor and see a professional if anything feels off.**
  Never show green. Never show a checkmark. "No change detected" is not "all clear."
- **Never** build return-to-play logic or recovery/progress tracking. We flag one moment
  in time; we do not manage a recovery.
- A **persistent footer on every screen**: "Student-built screening aid — not a medical
  device. Always consult a medical professional." This lives in the root layout so it
  cannot be forgotten on a screen.

Why we are this strict: a false "you're cleared" could send a concussed kid back onto the
field. The entire ethical and legal safety of this project depends on never crossing from
*screening* into *diagnosis*. When in doubt, refer out.

---

## No fabricated content

**Never invent statistics, sources, citations, testimonials, or user counts.**

- If a number or claim is needed and we don't have a real source, write
  `TODO(NEEDS_SOURCE): ...` in the code and tell the humans. Do not fill it with a
  plausible-looking fake.
- Placeholder copy must **look** like placeholder copy (e.g. "Placeholder — see us").
- This includes threshold values: the numbers in `lib/engine/thresholds.ts` are our own
  **placeholder** guesses for how big a change should trip a flag. They are clearly labeled
  as placeholders and are **not** clinically validated. The results screen says so too.

---

## Stack

- **Next.js (App Router) + TypeScript (strict) + Tailwind CSS.** (Currently Next 16,
  React 19, Tailwind v4.)
- **Client-side only.** No backend, no auth, no external API calls at runtime.
- **Storage is IndexedDB on the device.** Athlete data never leaves the phone. There is no
  server to send it to, by design — that is a privacy feature we can defend.
- **Deploys to Vercel** as a static/client app.
- Keep dependencies minimal. Do not add libraries that weren't asked for. Prefer clear,
  readable code over clever code — we have to explain every line of this on camera to
  judges.

---

## The data contract — build to these exactly. Do not rename or "improve" them.

The authoritative copy lives in [`lib/types.ts`](lib/types.ts). Reproduced here so a future
session sees it without opening the file:

```ts
type ModuleScores = {
  symptom:         { itemScores: number[]; total: number } | null;  // 10 items, 0-3 each
  wordLearning:    { formId: string; hits: number; falseAlarms: number; correct: number } | null;
  wordRecognition: { formId: string; hits: number; falseAlarms: number; correct: number } | null;
  digitSpan:       { formId: string; trialsCorrect: boolean[]; correct: number } | null;
  patternSpan:     { formId: string; trialsCorrect: boolean[]; correct: number } | null;
  goNoGo:          { formId: string; medianMs: number;
                     commissionErrors: number; omissionErrors: number } | null;
  balance:         { swayScore: number } | null;                    // stays null for now
};

type TestResult = {
  id: string;
  athleteId: string;
  takenAt: number;              // Date.now()
  kind: 'baseline' | 'check';
  scores: ModuleScores;
  schemaVersion: number;        // which ModuleScores shape this record was measured under.
                                // REQUIRED. Records come off disk without it, so the type only
                                // fits after lib/schema.ts normalises them — that is what makes
                                // the compiler, not our diligence, guarantee every read path
                                // normalises. The engine REFUSES to compare across versions.
  comparedToBaselineId?: string; // set on 'check' records at save time; pins which baseline
                                 // this check was scored against, so re-baselining can't
                                 // silently rewrite an old check's result. Absent on legacy
                                 // checks (they fall back to the athlete's current baselineId).
};

type Athlete = {
  id: string;
  name: string;
  baselineId: string | null;
  checkIds: string[];
  practiceCompletedAt: number | null; // when this athlete last completed a full practice pass,
                                       // or null if never. Gates recording a baseline — see
                                       // "Practice mode" below. Added 2026-09-10.
};

type FlagOutcome = {
  flagged: boolean;             // true if the symptom module flags on its own, OR if 2+
                                // modules flag together (MODULES_REQUIRED_TO_FLAG)
  modules: {
    symptom: boolean; wordLearning: boolean; wordRecognition: boolean;
    digitSpan: boolean; patternSpan: boolean; goNoGo: boolean; balance: boolean;
  };
  explanations: string[];       // plain language, shown to the user
  unevaluated: string[];        // measurements compared but with NO threshold set, so no verdict
                                // was formed. NOT the same as "no change" — see below.
};
```

### `unevaluated` is a safety field, not bookkeeping

Most thresholds for the new battery are deliberately `null` until we have collected real data.
A measurement with no threshold never sets its flag — which is **indistinguishable from having
been checked and found unremarkable.** Without this field an athlete could complete four tests,
have three go unjudged entirely, and be shown the calmest screen in the app.

So the engine reports them, the breakdown marks those rows "Not judged", and the results screen
has its own state that says no verdict was available. **"We did not look" must never render as
"we looked and it was fine."**

### Direction lives in `lib/engine/direction.ts`

The old battery got worse by getting *bigger*, every measurement. The new one mixes directions:
digit span, pattern span and the word scores are counts of things done **right**, so they get
worse by getting **smaller**. One reversed sign would make an athlete who declined read as
improved. Direction is declared once per measurement in one table, and every comparison
normalises through one function to "positive means worse". Do not do the subtraction by hand
anywhere else.

---

## Scope — hold this line

- **P0 (ship this):** athlete profiles, the test battery (symptom, word learning + delayed
  recall, numbers backwards, tapped patterns, and go/no-go — all six now built), the comparison
  engine, the result screen, and **thresholds derived from collected data**. The last item is
  not optional polish — without it the engine can compare but cannot judge. As of this file, one
  of ten thresholds (`GO_NO_GO_SLOWER_MS`) has a measured basis, from one person's self-collected
  data; the other nine are still `null`. Getting real thresholds set is still mostly outstanding.
- **P1 (only after P0 is polished):** balance test via motion sensors, history view.
- **Done, promoted out of P1:** **export to a file.** Thresholds have to come from collected
  measurements, that data lives in IndexedDB on individual phones, and there was no way to get
  it off them — so the JSON export (`lib/export.ts`) gates the whole threshold plan rather than
  being a convenience.
- **P2 (do NOT build):** dashboards, notifications, accounts, return-to-play, any "cleared"
  logic.

If asked for something outside P0 before P0 is finished and tested, say so out loud.
**A polished simple app beats a buggy ambitious one** — that is literally how the challenge
is scored.

---

## The battery (what each module measures and produces)

Reaction time and number scan were **removed** in the 2026-07-29 rebuild and their screens
deleted. The 5-trial reaction protocol survives as a measurement tool only, at
`/tools/noise-floor` — it is not part of the battery and writes nothing. Since 2026-09-10 it
also discards and repeats any trial under a **180ms anticipation floor** (too fast to be a real
reaction — `TODO(NEEDS_SOURCE)` on the exact value), the same rule go/no-go applies to its own
taps. This is a **comparability break in collected data**: readings taken before 2026-09-10 could
contain anticipations that dragged their median down; readings taken after cannot. Treat the two
as not directly comparable when deriving a threshold from noise-floor data.

- **Symptom checklist** (`/tests/symptom`): 10 common symptoms, each rated 0–3, total out of
  30. Use plain common symptom names; **do not** reproduce a specific copyrighted instrument
  (e.g. SCAT/its exact wording and scoring). Produces `ModuleScores.symptom`.
- **Word learning** (`/tests/words`): study 10 words at a **fixed** exposure, then pick them out
  of a 20-word grid. Produces `ModuleScores.wordLearning`.
- **Numbers backwards** (`/tests/digits`): 9 fixed trials at lengths 3,3,4,4,5,5,6,6,7; type each
  sequence back in reverse. Scored as trials reproduced **exactly**, out of 9. No partial credit
  inside a trial. Produces `ModuleScores.digitSpan`.
- **Tapped patterns** (`/tests/pattern`): 9 fixed trials at lengths 2,2,3,3,4,4,5,5,6 on a 3×3
  grid; tap the cells back in the same order. Same scoring rule as digit span. Produces
  `ModuleScores.patternSpan`.
- **Word recall** (`/tests/words/recall`): the **same** 20-word grid again, at the very end.
  Produces `ModuleScores.wordRecognition`.
- **Go / no-go** (`/tests/gonogo`): 30 trials — tap the instant the signal says TAP, do nothing
  on HOLD. Sits in `BATTERY_STEPS` between the two span tasks and the delayed word screen, the
  one place it could go without breaking ordering rule 1 below. Produces `ModuleScores.goNoGo`:
  a median response time on go trials, commission errors (responded on a no-go trial), and
  omission errors (missed a go trial). **Built by an AI session on 2026-08-31, at the project
  owner's direct written instruction** — see "Who owns what" below and the 2026-08-31 task 1
  entry in `AI-USAGE.md`. A line-by-line walkthrough for a reader who knows Java/Python but not
  TypeScript/React is at `docs/GONOGO-WALKTHROUGH.md`.

### Two ordering rules that are not stylistic

1. **The word module is one module across two screens.** `wordLearning` says whether the words
   went in; `wordRecognition` says whether they stayed. **The gap between them is the
   measurement**, so the span tasks must stay between the pair and **nothing may be appended to
   `BATTERY_STEPS` after `wordRecognition`.**
2. **Forms alternate between sittings.** Each memory module has six interchangeable forms
   (`lib/forms/`) because showing an athlete the same ten words twice makes the later score
   partly a memory of the earlier one — and that practice effect inflates it, making a
   struggling athlete look unchanged.

### Practice mode

Before an athlete can have a baseline recorded, they must complete one full **practice pass** of
the battery — all six tests, in order, scored and shown once at `/practice/summary`, then thrown
away. Nothing from a practice run is written to the database except one fact, stamped on the
athlete: `Athlete.practiceCompletedAt`.

**Why this exists (the first-exposure guard):** the project owner's own noise-floor collection
measured a ~20ms practice effect on reaction time that survived a week off. An athlete's very
first attempt at these tests reads worse than their true normal — so a baseline recorded on a
first attempt is permanently skewed, and the free improvement that comes with familiarity on the
NEXT sitting can cancel out, and hide, a real decline. That is the exact failure this app exists
to prevent, arriving through the front door.

- `/practice` starts a run. It works with an athlete attached (`?athlete=<id>` — finishing counts
  as that athlete's pass) or with none at all (fully anonymous, nothing recorded, reachable by
  anyone including a judge watching a demo).
- `/practice/summary` shows the scores once, from `sessionStorage`, then discards them.
- A practice run walks the same six screens in the same order as a baseline or check
  (`BatterySession` in `lib/session.ts` is a discriminated union of
  `'baseline' | 'check' | 'practice'`), so the compiler — not discipline — makes it impossible to
  hand a practice session to `finishSession()` and have it produce a `TestResult`.
- "Start a sideline check" is never gated on practice. The guard protects baseline quality only —
  see "Recording" below.

### Recording is gated, not fully disabled

**"Start a sideline check" is enabled unconditionally.** The guard that used to block both
buttons existed to protect baseline quality, and it must never stand between a coach and the
referral screen: a check with no baseline on file still warns on screen, and the engine still
refuses to compare it against nothing rather than silently passing it as "no flag."

**"Record a baseline" is enabled only after that athlete has completed one practice pass**
(`Athlete.practiceCompletedAt` — see "Practice mode" above). Recording was re-enabled on
2026-09-10, at the project owner's direction, once the battery itself was complete (go/no-go
built) — it was **not** re-enabled because thresholds are in place. As of this file, **9 of 10
flagging thresholds are still `null`**; only the symptom score (a placeholder carried over from
the original battery) and the go/no-go response time (set from one person's self-collected data)
have any tested cut-off at all. Every measurement without one is reported to the athlete as **not
judged**, never as normal — see `FlagOutcome.unevaluated` in the data contract above.

---

## The engine

`lib/engine/` takes an athlete's baseline `TestResult` and a new `check` `TestResult` and
returns a `FlagOutcome`. Rules:

- Compare **only** against that athlete's own baseline.
- **Every threshold comes from `lib/engine/thresholds.ts`.** No magic numbers anywhere else.
- Handle missing modules gracefully (a module can be `null`).
- `flagged` is true if the **symptom module** flags on its own, or if **two or more modules**
  flag together (`MODULES_REQUIRED_TO_FLAG` in `lib/engine/thresholds.ts`). A single
  non-symptom module past its cut-off does **not** flag the whole screen by itself — but it
  still shows up in `modules`, and the result screen has its own state for that case ("Change
  found — below the flag rule"), never folded into "no change."
- A check with **no baseline on file** must **error clearly** — never silently pass as
  "no flag."
- `explanations[]` must be readable by a parent, e.g.
  "Reaction time was 62ms slower than this athlete's baseline."

---

## Who owns what

> **PROPOSED WORDING — not settled.** This section was drafted by an AI session because no
> ownership document existed and one was asked for. Change anything here that does not match how
> you actually want to work; it is a starting point, not a ruling.

The point of this section is narrow: to stop two people (or a person and an AI session) editing
the same file with different intentions, and to make it obvious which files carry consequences
if they are changed carelessly.

### Student-owned — an AI session must not write these

| Path | Why |
|---|---|
| `app/tests/gonogo/**` | Built in full by an AI session on 2026-08-31, at the project owner's direct written instruction — see the 2026-08-31 task 1 entry in `AI-USAGE.md` and the human-written note at the end of that file. That instruction superseded this row's original blanket ban on AI creating even a stub. Going forward this path is still the student's to own: an AI session should not modify it without that same kind of direct, explicit instruction. |
| `lib/engine/thresholds.ts` — *the values* | Every number here has to come from collected data. An AI session may add a new threshold **as `null` with `TODO(NEEDS_SOURCE)`**, edit the comments, or type in a value **the human supplies verbatim, together with its derivation** (this happened once: `GO_NO_GO_SLOWER_MS` and `MODULES_REQUIRED_TO_FLAG`, both set 2026-09-10 at the owner's direction — see the comments in the file and `AI-USAGE.md`). An AI session must never itself estimate, tune, or infer a value. |
| `AI-USAGE.md` — *the students' own entries* | The disclosure log. AI appends its own dated entries and never edits or deletes a human-written one. |

### Needs agreement before editing — say so first, in writing

These are the files where a careless change is either dangerous or breaks stored data. Anyone —
human or AI — should flag the intended change and get a yes before making it.

| Path | What is at stake |
|---|---|
| `lib/types.ts` | The data contract. Change a shape and every stored record on every phone becomes a different shape from the code reading it. Requires a `schemaVersion` bump in `lib/schema.ts`, which makes existing baselines unreadable and forces athletes to re-record. |
| `lib/schema.ts` | `CURRENT_SCHEMA_VERSION` decides which stored records the app will still compare. Bumping it needlessly throws away valid baselines; failing to bump it when the shape changed is worse — it lets old records be compared field-by-field against fields they do not contain. |
| `lib/engine/direction.ts` | Which way each measurement gets worse. A reversed sign makes a declining athlete read as improved. |
| `lib/engine/compare.ts` — *rules 1–7* | The refusals. Especially **rule 6** (a baseline must predate the check) and **rule 5** (no baseline is an error, never a pass). |
| `app/results/[id]/page.tsx` | Every safety-copy rule lands here: no green, no checkmark, no clearance, every path ends in referral. |
| `app/layout.tsx` — *the footer* | The persistent "not a medical device" line. It lives in the root layout so it cannot be forgotten on a screen. |
| `CLAUDE.md` | This file. It is the tie-breaker when code and intent disagree, so changing it changes what "correct" means. |

### Free to edit, with the usual care

`app/**` screens other than the results screen, `components/**`, `lib/modules/**`,
`lib/forms/patternGrids.ts`, `lib/forms/goNo.ts`, `lib/format.ts`, styling, and all test files.

### The stimulus pools are a special case

`lib/forms/wordLists.ts` and `lib/forms/digitSequences.ts` are **AI-generated stand-ins**, clearly
marked as such at the top of each file. They were generated only because the files were expected
to be in the repo and were not. **Replace them wholesale whenever you like** — nothing reads the
stimuli themselves, only the exported shape, and `lib/forms/select.test.ts` will check a
replacement against the same construction rules.

---

## How we work (so we can defend this to judges)

- Explain what you're writing and why, in plain language, as you go.
- Prefer clear, readable code. No dense one-liners, no unexplained abstractions, no
  libraries we didn't ask for.
- If a simpler approach exists that we'd understand better, propose it even if it's less
  elegant.
- Comment the **non-obvious** parts with **WHY**, not what.
- Build in phases and **stop after each phase** to let the humans test on real phones.
- After each phase, append a line to [`AI-USAGE.md`](AI-USAGE.md) describing what was done.

---

## Build phases (stop after each one and wait)

- **Phase 0 — Foundation:** this file, the scaffold, `lib/types.ts`, `lib/storage.ts`,
  `lib/engine/thresholds.ts`, route stubs, `.gitignore`, `README.md`, `AI-USAGE.md`.
- **Phase 1 — The three test modules** (reaction, scan, symptom).
- **Phase 2 — Engine and results** (comparison logic + unit tests + result screen +
  athlete list/detail wired to storage).
- **Phase 3 — Make it real** (full phone flow, PWA install, a real high-contrast outdoor
  design, accessibility floor).

## gstack
Available skills: /guard, /careful, /freeze, /unfreeze, /review, /qa, /qa-only,
/investigate, /plan-design-review, /design-review, /browse, /learn.
DO NOT run /ship or /document-release in this repo. /document-release rewrites
CLAUDE.md automatically and this file holds the safety rules that govern the
whole project.
