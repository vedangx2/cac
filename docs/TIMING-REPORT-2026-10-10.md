# Go/no-go timing report — 2026-10-10 (read-only; no code was changed)

Prompted by a tester who is often rejected as "too fast" while appearing to react normally.

## 1. The anticipation cut-offs

| Where | Value | File |
|---|---|---|
| Go/no-go | **150 ms** | `GO_NO_MIN_PLAUSIBLE_RESPONSE_MS`, `lib/modules/gonogo.ts` |
| Noise-floor tool | **180 ms** | `MIN_PLAUSIBLE_REACTION_MS`, `app/tools/noise-floor/page.tsx` |

**They differ, and nothing in the repo says the difference is deliberate.** Go/no-go's 150 came
first (the go/no-go build commit, `5dc2c10`). The noise-floor 180 was added 2026-09-10 from the
owner's own data (a 131 ms trial and three under 200 ms). `CLAUDE.md` and the noise-floor comment
both say noise-floor applies "the same rule" go/no-go does, which is true of the rule but not the
number. The noise-floor page keeps local copies of constants so rebuilding the engine cannot change
it, but that reason does not apply: go/no-go's constant lives in `lib/modules`, not `lib/engine`.
Both are marked `TODO(NEEDS_SOURCE)` as the owner's own choice. Treat them as an unreconciled
inconsistency, not a decision.

Also: go/no-go shows the **same** "TOO SOON" message for a tap under 150 ms after the stimulus and
for a tap during the blank WAIT gap (before anything appeared). A tester cannot tell which
happened. A second tap on the screen that starts the run, or a finger drumming during the gap, is
rejected as TOO SOON even though the person was not anticipating a stimulus.

## 2. When the stimulus time is stamped, and can measured RT be shorter than real?

In `showStimulus` (`app/tests/gonogo/page.tsx`): the DOM is painted (`paintPad`), then
`performance.now()` is stamped **synchronously**, then re-stamped inside `requestAnimationFrame`.
A tap is timed in a `pointerdown` handler as `performance.now() - stimulusAt`, read when the
handler runs (not from `event.timeStamp`).

- The rAF callback runs **before** the browser paints that frame, so the final stamp is at or
  **before** the moment the pixels reach the screen, never after. The code comment calls it "the
  moment the stimulus became visible"; it is really the start of the frame that will show it.
- The handler runs at or after the finger touches the glass (input latency), never before.
- So `measured = real + (stamp-to-pixels gap) + (touch-to-handler gap)`, both terms non-negative.
  **Under normal conditions the measured time cannot come out shorter than the real one**; it errs
  long. The synchronous-only stamp (used if rAF never fires) is at most about one frame early too.
- **How much longer is not measured in this repo.** The stamp-to-pixels gap is at least the rest of
  one frame (up to ~16.7 ms at 60 Hz, ~8.3 ms at 120 Hz) plus display pipeline latency that varies
  by device. I did not measure it and will not put a number on it.
- **One caveat could make it shorter:** if a browser coarsens `performance.now()` (privacy
  settings, e.g. Firefox resistFingerprinting), both reads are rounded and the error could go either
  way by up to the clock's resolution. Not checked for the tester's browser.

So a tester rejected under 150 ms "while reacting normally" is most likely **not** being undercut by
the timing code. More likely: a tap in the WAIT gap (same message, see 1), a real anticipation
(the gap is 700-1600 ms random, so a steady rhythm can land near the stimulus), or a clock
resolution effect. Which one it is for this tester cannot be told from the stored data.

## 3. Are rejected taps recorded anywhere?

**No.** `discardAndRepeat` increments a per-trial counter (`repeatsRef`) that is reset after each
completed trial, shows the message, and re-arms. Nothing is saved, exported, or shown as a count at
the end (the result text only says discarded rounds were "run again"). Only if one trial is
discarded more than `GO_NO_MAX_TRIAL_REPEATS` (3) times is the run abandoned, and then nothing is
recorded. Noise-floor behaves the same way. This is why the tester's rejection rate can't be
diagnosed after the fact.

**Not done, by instruction:** no cut-off or timing change. If you want to follow up, the smallest
non-timing step is to count rejected taps (and say gap taps vs. too-fast taps) in memory, without
changing any rule. That would need your go-ahead since it touches the go/no-go module.
