# Sideline Concussion Screen

A free mobile web app that helps youth athletes, coaches, and parents catch a **possible**
concussion on the sideline when no athletic trainer is present.

An athlete records a **baseline** (the same tests, taken while healthy). After a hard hit,
they retake the tests as a **check**. The app compares the new scores against **that
athlete's own baseline** — comparing you to you, not to a population average — flags whether
something looks off, and refers them to a medical professional.

Built for the **Congressional App Challenge, TX-17** (deadline October 26, 2026).

---

## ⚠️ The hard rule

**This app FLAGS and REFERS. It never diagnoses and never clears anyone.** Every result path
ends in "see a medical professional." There is no "cleared," "safe to play," or "healthy"
state anywhere — a no-flag result means only that the screen found no significant change from
baseline, which does **not** rule out a concussion. It is a screening aid, **not a medical
device.** See [`CLAUDE.md`](CLAUDE.md) for the full rules.

---

## Stack

- **Next.js (App Router) + TypeScript (strict) + Tailwind CSS** — Next 16, React 19, Tailwind v4.
- **Client-side only.** No backend, no auth, no external API calls at runtime.
- **Storage is IndexedDB on the device.** Athlete data never leaves the phone.
- Deploys to **Vercel**.

## Getting started

Requires **Node.js** (we build with Node 24 LTS). Then:

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. To test on a phone on the same Wi-Fi, run
`npm run dev -- -H 0.0.0.0` and visit `http://<your-computer-ip>:3000`.

Run the unit tests (the comparison engine):

```bash
npm test
```

## Project structure

```
app/                     Next.js App Router routes
  page.tsx               home / landing
  layout.tsx             app shell + the persistent safety footer
  global-error.tsx       crash screen (restates the disclaimer — see the note in the file)
  manifest.ts            PWA manifest
  athletes/              athlete list + [id] detail
  tests/                 symptom / reaction / scan test screens
  results/[id]/          result screen for one check
lib/
  types.ts               THE DATA CONTRACT (shared shapes)
  storage.ts             IndexedDB wrapper (on-device storage)
  session.ts             the in-progress sitting that chains the three tests together
  stats.ts, shuffle.ts   median, Fisher-Yates
  engine/
    compare.ts           the comparison engine (baseline vs check -> FlagOutcome)
    breakdown.ts         per-measurement rows for the results table
    units.ts             shared number wording
    thresholds.ts        every threshold lives here (placeholders for now)
    *.test.ts            unit tests
components/              shared UI, the battery flow hook, storage-loading hook
scripts/generate-icons.mjs   draws the app icons and writes them as PNGs (npm run icons)
CLAUDE.md                source of truth: rules, contract, scope — read this first
AI-USAGE.md              log of how AI assistance was used
```

## The three tests

- **Symptom checklist** — ten common symptoms, each rated 0–3, totalled out of 30.
- **Reaction time** — tap when the pad turns green, five trials, reported as the **median**
  so one distracted tap can't skew the result.
- **Number scan** — tap 1–15 in order; records total time and wrong taps.

Any test can be tried on its own from the home page. Reaching one directly puts it in
**practice mode**, where nothing is saved.

## Design

Used outdoors, in daylight, one-handed, by someone in a hurry. The interface splits in two:
screens you **read** (roster, results) are a high-contrast light "document", and the timed
**tests** are near-black "instruments" so the stimulus is the only bright thing on screen.
Two accent colours carry meaning and nothing else does — blue for actions, red for a flagged
result. There is deliberately no success green anywhere, because there is no success state to
report.

## Data & privacy

All athlete data is stored **only** on the device via IndexedDB. There is no server and no
account, so the data is never uploaded anywhere. That is a deliberate privacy design choice.
It also means results don't follow you to another phone or browser, and clearing browser data
erases them.

The app installs to a home screen and works offline, which matters at fields with no signal.

## Status

**Phases 0–3 complete.** Athlete profiles, all three tests, the comparison engine with unit
tests, the result screen, the responsive design, PWA install and offline support are all
built. Still to come (P1): the balance test, a history view, and export to a file.
