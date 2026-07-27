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
  symptom:  { itemScores: number[]; total: number } | null;   // 10 items, 0-3 each
  reaction: { trialsMs: number[]; medianMs: number; falseStarts: number } | null;
  scan:     { elapsedMs: number; errors: number } | null;
  balance:  { swayScore: number } | null;                     // stays null for now
};

type TestResult = {
  id: string;
  athleteId: string;
  takenAt: number;              // Date.now()
  kind: 'baseline' | 'check';
  scores: ModuleScores;
};

type Athlete = {
  id: string;
  name: string;
  baselineId: string | null;
  checkIds: string[];
};

type FlagOutcome = {
  flagged: boolean;             // true if ANY module flagged
  modules: { reaction: boolean; scan: boolean; symptom: boolean; balance: boolean };
  explanations: string[];       // plain language, shown to the user
};
```

---

## Scope — hold this line

- **P0 (ship this):** athlete profiles, the three tests (symptom, reaction, scan), the
  comparison engine, the result screen.
- **P1 (only after P0 is polished):** balance test via motion sensors, history view, export
  to a file.
- **P2 (do NOT build):** dashboards, notifications, accounts, return-to-play, any "cleared"
  logic.

If asked for something outside P0 before P0 is finished and tested, say so out loud.
**A polished simple app beats a buggy ambitious one** — that is literally how the challenge
is scored.

---

## The three tests (what each one measures and produces)

- **Reaction time** (`/tests/reaction`): tap-when-it-turns-green, 5 trials, report the
  **median** ms. Concussion can slow reaction time. Timing accuracy is the whole point —
  use `performance.now()`, `pointerdown`, and do not re-render React between "green" and the
  tap. Produces `ModuleScores.reaction`.
- **Number scan** (`/tests/scan`): tap numbers 1–15 in order as fast as possible; measures
  time + errors. Inspired by rapid-number-naming screening in general — **do not** reproduce
  the King-Devick test or any trademarked layout; this is our own version. Produces
  `ModuleScores.scan`.
- **Symptom checklist** (`/tests/symptom`): 10 common symptoms, each rated 0–3, total out of
  30. Use plain common symptom names; **do not** reproduce a specific copyrighted instrument
  (e.g. SCAT/its exact wording and scoring). Produces `ModuleScores.symptom`.

---

## The engine

`lib/engine/` takes an athlete's baseline `TestResult` and a new `check` `TestResult` and
returns a `FlagOutcome`. Rules:

- Compare **only** against that athlete's own baseline.
- **Every threshold comes from `lib/engine/thresholds.ts`.** No magic numbers anywhere else.
- Handle missing modules gracefully (a module can be `null`).
- `flagged` is true if **any** module flags.
- A check with **no baseline on file** must **error clearly** — never silently pass as
  "no flag."
- `explanations[]` must be readable by a parent, e.g.
  "Reaction time was 62ms slower than this athlete's baseline."

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
