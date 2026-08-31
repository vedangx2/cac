# Go / no-go, explained line by line

This walks `app/tests/gonogo/page.tsx` and `lib/modules/gonogo.ts` from top to bottom.

It assumes you know Java or Python and have written loops, functions and classes, but that you
have **not** written TypeScript or React. Every language feature is explained the first time it
turns up. Where a block is written in an odd-looking way, there is a section saying **what breaks
if you do it the obvious way instead** — because most of the odd-looking parts of this file are
odd on purpose, and each one is a bug this project already had once.

Read the three big ideas first. If you only remember three things before a camera, remember these.

---

## The three ideas in one paragraph each

**1. `performance.now()`, never `Date.now()`.** `Date.now()` reports what the wall clock says.
The wall clock can be *changed while you are using it* — the phone syncs with a time server, or
daylight saving flips — and it can jump backwards. If it jumps backwards by 200ms in the middle of
a trial, you record a reaction time of minus 50 milliseconds. `performance.now()` is a stopwatch,
not a calendar: it counts milliseconds forward from when the page loaded, it is guaranteed never
to go backwards, and it has fractions of a millisecond of precision instead of whole ones. You use
a calendar to say *when* something happened and a stopwatch to say *how long* it took, and a
reaction time is a how-long.

**2. A ref, not state.** In React, "state" is a value that, when you change it, makes the screen
redraw. That redraw does not happen immediately — React queues it and does it a moment later.
So if you write a new value into state and read it back on the very next line, **you get the old
value.** A "ref" is a plain mutable box with no redraw attached: write to it and the next line
sees the new value, exactly like a normal variable in Java or Python. Every decision this screen
makes about a tap — which trial are we on, when did the stimulus appear, was that a go or a no-go
— reads a ref, because a decision made from a stale value is a wrong decision, and here a wrong
decision means a fabricated error against a real athlete.

**3. Between the stimulus and the tap, nothing may happen.** JavaScript runs on a single thread
with a queue of jobs, called the event loop. Only one job runs at a time, and a job runs to
completion before the next one starts. When we paint the green stimulus we stamp the clock in that
same job, so nothing can get in between. When the athlete taps, the browser puts a job on the
queue; if React is busy re-rendering something, our tap job waits behind it, and every millisecond
it waits is added to the athlete's reaction time. So the run does not touch React at all: from the
first trial to the last, React has nothing to do, the queue stays empty, and the tap job runs
immediately.

---

## Part 1 — `lib/modules/gonogo.ts`, the rules

This file is pure logic. No screen, no timers, no React. Every rule in it is a function that takes
a number and returns an answer, which is why the tests can check all of it without opening a
browser.

### The task, in three numbers

Thirty trials. Most say **GO** and you tap as fast as you can. Eight say **NO-GO** and you must do
nothing. Because responding is the common case, tapping becomes automatic, and *not* tapping takes
real effort. That effort is the thing being measured.

It produces three numbers that are deliberately never added together:

| Number | What it means | How it goes wrong |
|---|---|---|
| **median response time** | how fast you are when you *should* move | gets bigger = worse |
| **commission errors** | you tapped on a NO-GO trial — could not hold back | gets bigger = worse |
| **omission errors** | you never tapped on a GO trial — attention gone | gets bigger = worse |

"Could not stop" and "was not there" are different findings about a person. If we added them into
one "errors" number we would destroy that difference forever, because you cannot get it back out
of the total.

### `export const` — what that means

```ts
export const GO_NO_STIMULUS_WINDOW_MS = 1500;
```

`const` is a constant, like `final` in Java. `export` means other files may import it — the
opposite of `private`. If it is not exported, it cannot be seen outside this file. `MS` on the end
of the name is a habit worth copying: a bare `WINDOW = 1500` invites somebody to assume seconds.

### Why the response window is 1500ms and not 1000ms

The window is how long the stimulus stays up and how long we will accept a tap.

Lots of tasks like this use a second or less. We use one and a half, and the reason is the whole
point of the app. **A slowed response is the signal we are trying to measure.** If the window were
tight, a genuinely slowed athlete would fail to answer in time and their trial would be recorded
as an *omission error* instead of as a slow response time. The slowing would vanish out of the
number we were watching and reappear in a different number entirely. A wide window keeps a slow
answer as what it is: a slow answer.

### The gap before each stimulus is random

```ts
export const GO_NO_MIN_GAP_MS = 700;
export const GO_NO_MAX_GAP_MS = 1600;
```

**What breaks if you use a fixed gap:** the athlete learns the rhythm within about four trials and
starts tapping on the beat instead of on the stimulus. Their response times then measure their
sense of timing rather than their reaction, *and* — much worse — a tap fired on the beat will
sooner or later land on a no-go trial, so the error counts become noise too. The gap is drawn at
random for each trial so there is no beat to find.

```ts
export function gapDelayMs(random: () => number = Math.random): number {
  return GO_NO_MIN_GAP_MS + random() * (GO_NO_MAX_GAP_MS - GO_NO_MIN_GAP_MS);
}
```

`random: () => number = Math.random` is a **parameter whose type is a function**: "something you
can call with no arguments that gives you back a number", defaulting to `Math.random`. That is
there purely so the test can pass in a fake that always returns `0`, or always `1`, and check the
bounds exactly. Randomness you cannot pin down is randomness you cannot test.

### Anticipations: discard the trial, do not record it

```ts
export const GO_NO_MIN_PLAUSIBLE_RESPONSE_MS = 150;
```

A tap that lands less than 150ms after the stimulus was already on its way down before the athlete
could possibly have seen and processed anything. They guessed the timing.

**Why we discard rather than keep it:** an anticipation is a very small number, and small numbers
drag a median downwards. Now imagine the athlete anticipates a few times *at their baseline*,
while they are healthy and bored. Their baseline median comes out artificially fast. Months later
they take an honest sitting after a hit, and the comparison against that too-fast baseline says
they have slowed down. **We would have manufactured a flag out of the athlete's own impatience.**

So the trial is thrown away and run again. It is never recorded as a response and it is never
counted as an error either — we did not measure that trial, so we say nothing about it. This is
the same rule the existing `/tools/noise-floor` pad already uses for implausibly slow trials.

### The judging functions

```ts
export type ResponseJudgement =
  | { kind: 'anticipation' }
  | { kind: 'stale' }
  | { kind: 'response'; ms: number };
```

This is a **discriminated union** — TypeScript's version of "one of these three shapes". Java would
reach for an enum plus a field, or subclasses. The `kind` field is the tag that says which shape
you are holding, and TypeScript is smart enough that once you have written
`if (judged.kind === 'response')`, it knows `judged.ms` exists inside that block and will refuse to
compile if you read `.ms` outside it. It is a compile-time guarantee that you cannot read a field
that is not there.

```ts
export function judgeResponse(elapsedMs: number): ResponseJudgement {
  if (elapsedMs < GO_NO_MIN_PLAUSIBLE_RESPONSE_MS) return { kind: 'anticipation' };
  if (elapsedMs > GO_NO_STIMULUS_WINDOW_MS) return { kind: 'stale' };
  return { kind: 'response', ms: Math.round(elapsedMs) };
}
```

Notice what this function does **not** know: whether the trial was go or no-go. That is on purpose.
"Was that a real response?" and "what does a real response *mean* on this trial?" are two separate
questions, and keeping them apart means each can be tested on its own. Mixing them would give one
function four possible outcomes crossed with two trial types, which is where the mistakes live.

### `stale` — the phone-in-a-pocket problem

This one is worth understanding properly because it prevents invented data.

The response window is closed by a timer. **Browsers throttle timers in a tab that is not
visible** — put the phone in a pocket, or switch to another app, and a timer set for 1500ms can
fire many seconds later, or not until you come back.

Without a guard, here is what happens: the phone goes dark, thirty timers eventually fire in a
rush, and every go trial in that period is recorded as *no response* — an omission error. You
would end up with a page full of attention failures belonging to an athlete who was never shown
anything at all. That is fabricated data, produced by the phone's power saving.

```ts
export function judgeWindowClose(elapsedMs: number): 'closed' | 'stale' {
  return elapsedMs > GO_NO_STIMULUS_WINDOW_MS + GO_NO_TIMER_SLACK_MS ? 'stale' : 'closed';
}
```

So when the timer finally fires we ignore the fact that it fired and ask the **real clock** how
much time actually passed. Ordinary lateness (timers are never exact — that is the 750ms of slack)
is fine. Wildly late means we do not trust that trial in either direction: discard it and run it
again, exactly like an anticipation.

`condition ? a : b` is the ternary operator, the same as Java's. `'closed' | 'stale'` as a return
type means "this function returns one of exactly these two strings" — misspell one and it will not
compile.

### The repeat budget, so a broken run cannot loop forever

"Discard and repeat" fixes one bad trial. But a phone left face-down would discard, repeat,
discard, repeat, for ever. So a trial may be repeated at most `GO_NO_MAX_TRIAL_REPEATS` (3) times,
after which the **whole run is abandoned and nothing at all is recorded.**

An abandoned run is honest. A run stitched together out of trials the athlete never saw is not.

### Scoring, and the one case where we refuse to produce a score

```ts
export function scoreGoNoGo(formId, outcomes): GoNoGoRunResult | null
```

`| null` in the return type means the function may hand back nothing, and TypeScript will force
every caller to check for that before using the result. In Java this is `Optional`; the difference
is that here the compiler enforces the check.

It walks the outcomes, collects go-trial response times, counts the two error kinds, and takes the
**median** of the response times — the middle value, not the average.

**Why the median and not the mean:** one distracted trial at 1400ms drags a mean of five values up
by two hundred milliseconds and could raise a flag on a perfectly fine athlete. The median just
ignores an outlier and reports the middle of the pack.

And the refusal:

```ts
if (goTrialsMs.length === 0) return null;
```

If not one go trial got a response, there is no median. Not a median of zero — zero is not a
response time — and not the window length either. **The athlete did not do the task.** Every way of
manufacturing a number here is a fabrication, and that fake number would then be compared against
a real one on some future sideline. So we return `null`, the screen says nothing could be measured,
and no score is saved. A test nobody took must not produce a score.

There is a real cost, and it is written into the code comment so nobody thinks we missed it: an
athlete who omitted every single trial is itself a striking finding, and returning `null` throws
that away. Fixing that properly means letting `medianMs` be null in the stored data contract, which
means bumping the schema version and making every baseline already saved on a phone unreadable.
That is not a change to make quietly, so it is written up as a proposal in `SESSION-REPORT.md`
instead.

### `toStoredScore` — why the raw times are not saved

The run produces five things. Only four get stored:

```ts
export function toStoredScore(run: GoNoGoRunResult): GoNoGoStoredScore
```

`goTrialsMs` — every individual response time — is genuinely the most useful thing this module
produces for working out thresholds later. But the saved-record shape in `lib/types.ts` has no
field for it, and adding one changes what a stored record looks like. That requires bumping
`CURRENT_SCHEMA_VERSION`, and bumping it makes every baseline already recorded on every phone
unreadable, forcing every athlete to start again.

So the raw times are **printed on screen at the end of a run** — write them down, same workflow as
the noise-floor page — and the record keeps the four fields the contract defines. There is a test
(`does not smuggle the raw trial times into the record`) that fails if that ever changes by
accident rather than on purpose.

---

## Part 2 — `app/tests/gonogo/page.tsx`, the screen

### `'use client'` on line 1

Next.js renders most pages on the server and sends finished HTML. A page that needs timers, taps
and a clock has to run in the browser. `'use client'` is how you say so. Without it the file would
not even build, because `performance.now()` does not exist on a server.

### The imports

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

Curly braces mean "take these specific named things out of that module" — Python's
`from react import useCallback, ...`. Those five names are React **hooks**: functions that may only
be called at the top level of a component, never inside a loop or an `if`. React identifies them by
the order they are called in, so calling one conditionally would shift every hook after it and
scramble which stored value belongs to which hook.

- **`useState`** — a value that redraws the screen when it changes.
- **`useRef`** — a mutable box that does *not* redraw. The workhorse of this file.
- **`useCallback`** — remembers a function between redraws instead of rebuilding it.
- **`useEffect`** — run something *after* the screen has been drawn (attaching listeners, cleanup).
- **`useMemo`** — remember a computed value so it is not recomputed on every redraw.

### The trials come from a file, never from this screen

```ts
const form = useMemo(() => pickForm(GO_NO_FORMS, seed), [seed]);
```

`GO_NO_FORMS` is six fixed lists of thirty trials in `lib/forms/goNo.ts`. `pickForm` chooses one
deterministically from a seed string built out of the athlete's id and the time their sitting
started.

**This screen never generates a trial.** If it made up a random run each time, a saved score could
never be traced back to the run that produced it, and two sittings by the same athlete would not be
comparable — which is the only thing this whole app does.

`() => pickForm(...)` is an **arrow function**, a function with no name: Python's `lambda`, Java's
`() -> ...`. `[seed]` is the dependency list: recompute only if `seed` changes. `useMemo` matters
here because a new `form` object on every redraw would make every function that depends on it new
as well, and that cascade is exactly what we are trying to avoid.

### The state machine, and why almost all of it is refs

```ts
const [runState, setRunState] = useState<RunState | null>(null);

const phaseRef = useRef<PadPhase>('idle');
const stimulusAtRef = useRef(0);
const trialIndexRef = useRef(0);
const outcomesRef = useRef<TrialOutcome[]>([]);
const repeatsRef = useRef(0);
const timerRef = useRef<...>(null);
```

`const [runState, setRunState] = useState(...)` is **array destructuring**: `useState` returns a
two-element array — the current value and a function to change it — and this unpacks both in one
line. Python's `a, b = pair`.

There is **exactly one** piece of React state, and it is written **exactly once, when the run
ends.** Everything the run itself uses is a ref.

A ref is an object with a single property, `.current`. `useRef(0)` gives you `{ current: 0 }`, and
React hands you the *same object* on every redraw. Writing `phaseRef.current = 'go'` is a plain
assignment to a field — it takes effect on the next line, and it does not tell React anything.

#### What breaks if you use state here instead

This is the number one bug in the project's history, and it has already happened twice.

Suppose the current phase lived in state and the tap handler read it. React batches updates: when
you call `setPhase('go')`, the variable you can see does not change — React schedules a redraw and
gives you the new value *next time the component runs*. So:

1. The stimulus appears. Code calls `setPhase('go')`.
2. Before React gets around to redrawing, the athlete taps. Fast athletes tap in ~250ms; React is
   usually quicker than that, but "usually" is not a guarantee, and several taps inside one frame
   is routine.
3. The tap handler reads `phase` and sees **`'gap'`** — the old value.
4. It concludes the athlete tapped before the stimulus, calls it an anticipation, and throws away
   a perfectly good trial.

The deleted number-scan screen had exactly this shape of bug and it produced **14 phantom errors**
against an athlete who was tapping fast and accurately. It scored a good answer as a bad one. In
go/no-go it is worse still: a stale phase can make a tap that landed during a NO-GO trial look like
a response to a GO trial, which turns a commission error into a reaction time. The error
disappears and the median gets contaminated by the same tap.

With a ref, step 3 reads `phaseRef.current`, which was set synchronously in step 1. It is right,
always, no matter what React is doing.

`lib/regression.test.ts` has a test called *"keeps the pad phase in a ref and reads it in the tap
handler"* whose only job is to fail if somebody converts these back to state.

### `paintPad` — writing to the screen without React

```ts
const paintPad = useCallback((phase: PadPhase, main: string, sub: string) => {
  phaseRef.current = phase;
  if (padRef.current) padRef.current.className = `${PAD_BASE} ${PAD_PHASE_CLASSES[phase]}`;
  if (padMainRef.current) padMainRef.current.textContent = main;
  if (padSubRef.current) padSubRef.current.textContent = sub;
}, []);
```

Normally in React you change state and let React update the DOM. Here we reach into the DOM
ourselves and set `className` and `textContent` directly.

`padRef` is a ref attached to a real element via `<div ref={padRef}>`, so `padRef.current` is the
actual `<div>`. The `if (padRef.current)` checks exist because a ref is `null` until the element
has been created; TypeScript will not let you touch it without checking.

Backticks make a **template literal** — string interpolation, like Python f-strings.
`` `${PAD_BASE} ${PAD_PHASE_CLASSES[phase]}` `` glues two class strings together.

**Why not do this the normal React way?** Because the normal way is `setPhase('go')`, which
schedules a redraw. A redraw means React re-runs the component function, diffs the result against
what is on screen, and applies changes — real work, on the single thread, at the exact moment we
need that thread free to handle a tap. Direct DOM writes are one assignment each and are done
before the next line runs.

Note also that the class strings are written out in full at the top of the file rather than built
up at runtime. Tailwind generates its stylesheet by **scanning the source files as text**, so a
class name assembled from pieces at runtime never makes it into the CSS and silently produces an
unstyled element.

### `showStimulus` — the most important function in the file

```ts
if (go) paintPad('go', 'TAP', '');
else paintPad('nogo', 'HOLD', '');

stimulusAtRef.current = performance.now();
requestAnimationFrame(() => {
  if (stimulusAtRef.current !== 0) stimulusAtRef.current = performance.now();
});

timerRef.current = setTimeout(closeWindow, GO_NO_STIMULUS_WINDOW_MS);
```

Four things happen, in this order, and the order is the design.

**Paint first.** Set the colour and the word so the pixels are on their way.

**Stamp the clock synchronously.** `performance.now()` right now, in the same job, with nothing in
between. This stamp is very slightly early — we have asked for the paint but the screen has not
physically updated yet, so we are up to one frame (about 16ms on a 60Hz phone) ahead of reality.

**Then let `requestAnimationFrame` refine it.** `requestAnimationFrame` (rAF) runs your function
immediately *before* the browser paints the next frame. So the stamp taken inside it marks the
moment the stimulus genuinely became visible. That is the accurate one.

#### Why both stamps, and what breaks if you keep only the rAF one

This is the bug that soft-locked the old reaction pad, and the brief calls it out by name.

**`requestAnimationFrame` is not guaranteed to run.** The browser stops firing it entirely for a
tab that is not visible — there is no point painting frames nobody can see. It also never fires in
an environment that is not painting at all.

The old pad stamped the clock *only* inside rAF. So: athlete starts a trial, phone is backgrounded
for a moment, rAF never fires, `greenAt` stays `0`. Now every tap is measured against zero, which
produces an enormous nonsense number, which gets discarded as implausible, which repeats the
trial... which does the same thing again. **The pad stopped responding with no way out and no
error message.**

With both stamps the worst case is being one frame early — about 16ms, on a measurement where the
differences we care about are much larger — and the normal case is still frame-accurate. Losing a
little precision to guarantee the thing never locks is a trade worth making every time.

The `if (stimulusAtRef.current !== 0)` inside the rAF callback is a second, subtler guard. rAF
callbacks can arrive late. If a trial has already been answered and cleared (`stimulusAt` set back
to `0`), a straggling callback would otherwise overwrite the stamp and corrupt the timing of the
**next** trial. So it only refines a stamp that is still live.

**Open the window last.** `setTimeout(closeWindow, 1500)` says "run `closeWindow` in about 1500ms".
`setTimeout` returns a handle, which we keep in `timerRef` so we can cancel it — if the athlete
taps, the pending close must be cancelled or it would fire during a later trial and close the wrong
one.

### What the event loop is doing between the stimulus and the tap

This is the question worth being able to answer cold.

JavaScript has **one thread**. Not one thread per tab that does everything at once — one thread,
running one job at a time, taking each job to completion before starting the next. Timers, clicks,
network responses and React's own rendering work all become jobs on the same queue.

Here is the actual sequence for one trial:

1. **Job: the gap timer fires.** It calls `showStimulus`. Inside this single job, uninterrupted, we
   set the class, set the text, read `performance.now()`, register an rAF callback, and start the
   window timer. Nothing can slip in between those steps, because a job runs to completion. *This
   is why the synchronous stamp is trustworthy.*
2. **Job: rAF, just before the next paint** (~16ms later, if the tab is visible). It refines the
   stamp. Then the browser paints and the athlete's eyes finally receive the stimulus.
3. **The queue is empty.** This is the part that matters. For the next few hundred milliseconds
   there is *nothing to do*: no React render pending, no state update queued, no other timer due.
   The thread sits idle waiting.
4. **Job: `pointerdown`.** The athlete taps. The browser queues our handler, and because the queue
   is empty it runs **immediately**. The first thing it does is read `performance.now()`.

Now imagine step 3 had work in it. Suppose every trial called `setState` to update a counter.
React's render would be sitting in the queue, or worse, would start running just as the finger
lands. The tap job then waits behind it — and every millisecond it waits is silently added to the
athlete's reaction time. Not a crash, not an error: just a number that is wrong by however long
React happened to take, varying trial to trial.

That is why this screen keeps the queue empty. Even the trial counter (`Trial 7 of 30`) is written
straight to the DOM, and only ever at the *start of a gap* — never while a stimulus is showing —
so that not even that one small write can land between the stimulus and the tap.

### The tap handler

```ts
const handlePress = useCallback(() => {
  const phase = phaseRef.current;

  if (phase === 'go' || phase === 'nogo') {
    const elapsed = performance.now() - stimulusAtRef.current;
    if (stimulusAtRef.current === 0) return;
    const judged = judgeResponse(elapsed);
    ...
```

Read the order: the phase comes out of a **ref**, and the clock is read on the **first line** of
the branch, before any decision is made. Measure first, think afterwards. Any work done before that
subtraction is time added to the athlete's score.

`if (stimulusAtRef.current === 0) return;` is a safety net that should be unreachable — we always
stamp when we paint. It exists so that if some future change breaks the stamp, a tap produces
*nothing* rather than a measurement taken against page load, which would be a wildly inflated
number that looks superficially like a real (terrible) reaction time.

Then the three outcomes:

- **anticipation** → `discardAndRepeat`, nothing recorded either way.
- **stale** → `discardAndRepeat`, same.
- **response** → what it means depends on the phase: on a `go` trial it is a response time; on a
  `nogo` trial it is a **commission error**. One ternary, one place, easy to point at.

And a fourth case above them: a tap during the blank gap, when no stimulus exists at all. That is
an anticipation too, and the loudest kind — there was nothing there to react to.

There is deliberately **no right/wrong feedback** after any trial, the same as the digit-span and
pattern-span screens. Two reasons. Every conventional way of showing "correct" is a green flash or
a tick, and this app has neither anywhere. And an athlete who can see they are failing starts
guessing, which stops the remaining trials measuring anything at all.

### Attaching the listener natively

```ts
useEffect(() => {
  const pad = padRef.current;
  if (!pad) return;
  const onPointerDown = () => handlePressRef.current();
  pad.addEventListener('pointerdown', onPointerDown, { passive: true });
  ...
}, []);
```

The obvious React way is `<div onPointerDown={handlePress}>`. We do not do that, for two reasons.

**React's synthetic event system** attaches one listener at the root of the app and routes events
through its own machinery before calling your handler. That is a small amount of React's work
sitting between the finger landing and our clock read. A native listener is called by the browser
directly.

**`pointerdown`, not `click`.** `click` fires on *release*. Using it would make every measurement
include however long the athlete kept their finger down, which is a different thing from a reaction
time and varies from person to person.

`{ passive: true }` promises the browser we will not cancel the event, letting it proceed without
waiting to find out. `[]` as the dependency list means "run this once, when the component first
appears".

#### The `handlePressRef` dance

The listener is attached once and never re-attached, but `handlePress` is rebuilt on every redraw,
so the listener would be holding a stale copy of it forever. The fix is one level of indirection:

```ts
const handlePressRef = useRef(handlePress);
useEffect(() => { handlePressRef.current = handlePress; });
```

The listener calls `handlePressRef.current()`, so it always reaches the newest version. The
assignment lives in a `useEffect` rather than in the body of the component because mutating a ref
*while rendering* is not something React guarantees is safe.

The same trick appears as `armTrialRef` and `finishRunRef`, for a different reason: those functions
call each other in a cycle (arm → show → close → arm), and JavaScript will not let you reference a
`const` before it is defined. A ref breaks the cycle without collapsing all four into one giant
function.

Every `addEventListener` is paired with a `removeEventListener` in the function the effect returns.
That returned function is React's cleanup hook, and skipping it leaks a listener every time you
leave and come back.

### Finishing

```ts
const run = scoreGoNoGo(form.id, outcomesRef.current);
if (!run) { ...setRunState({ kind: 'unmeasurable' }); return; }
paintPad('done', 'FINISHED', 'Readings below');
setRunState({ kind: 'scored', run });
void battery.complete(toStoredScore(run));
```

Only now — after the last trial — does React get told anything. `setRunState` triggers the one
redraw of the whole run, which draws the summary panel.

`battery.complete` saves the score into the sitting and moves the athlete to the next test.
`void` in front of a promise means "I am deliberately not waiting for this"; without it the linter
warns about an unhandled promise. The `battery` hook handles its own failures — if the save fails
it shows a "Not saved" notice, because a failed save that looked successful would be the worst
outcome available.

### One last thing about green

The GO stimulus is green, and that is not a violation of the rule in `CLAUDE.md` that says this app
never shows green.

That rule is about never implying a person is **cleared, healthy or safe**. This green is a
physical target to hit. It says nothing about anybody's health, it is on screen for under two
seconds, and it never appears on a results screen. The same reasoning is already written into
`app/tools/noise-floor/page.tsx`, and it is written into the top of this page too so nobody
"fixes" it later.

The NO-GO stimulus is **near-white, not red** — two deliberate choices. Red in this app means
*flagged* and nothing else, and a green/red pair is the worst possible choice for a colour-blind
athlete. Both stimuli also carry a word (**TAP** / **HOLD**), so colour is never the only thing
telling them apart.

---

## If you are asked "what would you do differently"

Three honest answers:

1. **The structural regression guards are weaker than they look.** They read the source file as
   text and check the fix is still written there. That proves the fix is *present*, not that it
   *works*. Doing it properly needs a DOM test harness that can render the component and fire
   fifteen taps in one frame.
2. **`medianMs` cannot be null in the stored contract,** so a run where the athlete never responded
   is thrown away entirely, omission count and all. Widening the contract would fix it and costs a
   schema bump.
3. **The pacing numbers are our choices, not findings.** 1500ms, 150ms, 700–1600ms: each has a
   reason written beside it, and none is taken from any published protocol. Change one after
   collection starts and the readings taken before it stop being comparable with the ones after.
