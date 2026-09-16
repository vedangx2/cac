# Noise floor experiment

**Who:** Vedang, healthy, no head injury during the collection window.
**What:** the standalone reaction instrument at `/tools/noise-floor`.
**Why:** every threshold in `lib/engine/thresholds.ts` is `number | null = null`.
A threshold has to sit above the amount a healthy score moves on its own.
Nobody can tell you that number. It has to be measured.

One run = 5 trials, reported as a median. Same phone, same hand, seated,
indoors, no music, every time.

Status: 14 runs across 4 sittings and 3 days.

---

## Raw data

| run | date | time      | trials (ms)             | median | false starts |
|-----|------|-----------|-------------------------|--------|--------------|
| 1   | 8/31 | afternoon | 261 270 364 245 261     | 261    | 0 |
| 2   | 8/31 | afternoon | 291 267 231 323 263     | 267    | 0 |
| 3   | 8/31 | afternoon | 264 292 272 383 234     | 272    | 0 |
| 4   | 8/31 | afternoon | 291 275 247 243 235     | 247    | 0 |
| 5   | 8/31 | afternoon | 245 227 443 264 267     | 264    | 1 |
| 6   | 9/1  | morning   | 229 206 234 274 224     | 229    | 0 |
| 7   | 9/1  | morning   | 249 241 255 245 255     | 249    | 0 |
| 8   | 9/1  | morning   | 247 231 230 245 250     | 245    | 0 |
| 9   | 9/1  | afternoon | 262 232 265 242 241     | 242    | 0 |
| 10  | 9/1  | afternoon | 250 247 231 253 244     | 247    | 0 |
| 11  | 9/1  | afternoon | 240 248 244 233 251     | 244    | 0 |
| 12  | 9/8  | evening   | 227 204 244 254 234     | 234    | 0 |
| 13  | 9/8  | evening   | 209 241 245 245 236     | 241    | 0 |
| 14  | 9/8  | evening   | 277 251 200 275 220     | 251    | 0 |

## By sitting

| sitting        | medians                 | mean  | sd   | mean within-run spread | lapses |
|----------------|-------------------------|-------|------|------------------------|--------|
| 8/31 afternoon | 261 267 272 247 264     | 262.2 | 9.4  | 126.4 ms               | 3/25   |
| 9/1 morning    | 229 249 245             | 241.0 | 10.6 | 34.0 ms                | 0/15   |
| 9/1 afternoon  | 242 247 244             | 244.3 | 2.5  | 24.3 ms                | 0/15   |
| 9/8 evening    | 234 241 251             | 242.0 | 8.5  | 54.3 ms                | 0/15   |

A "lapse" means a single trial more than 80 ms above the overall median.

---

## Finding 1: a large practice effect, and it survives a week off

Sitting 1 averaged 262 ms. Every sitting after it averaged 241 to 244.

My first reading, after two sittings, was that I am faster in the morning.
Sitting 3 killed that. It was an afternoon sitting and it matched the morning
one, not the previous afternoon. Sitting 4, a week later in the evening, landed
at 242. Time of day is not the driver.

Sitting 4 is the one that makes this conclusive. Seven days passed with no
practice. If the improvement had been warm-up or one good day, some of it
should have decayed. None of it did.

The within-run spread tells the same story:

```
sitting 1:  119   92  149   56  216 ms     (mean 126)
sitting 2:   68   14   20 ms               (mean 34)
sitting 3:   33   22   18 ms               (mean 24)
sitting 4:   50   36   77 ms               (mean 54)
```

I did not only get faster. I got dramatically more consistent, and stayed that
way.

**Why this is the most important finding in the project.**

This app compares an athlete to their own baseline. If the baseline is recorded
on the athlete's first ever attempt at the task, that baseline is inflated by
inexperience by roughly 20 ms, and the inflation is permanent because the
athlete never returns to that untrained state.

Every later check will beat that baseline, because they have practiced, not
because they are well. A concussion could take real ability away and still
produce a check score better than an untrained baseline. The app would see
improvement and flag nothing.

That is a silent false negative. Nothing in the data would look wrong. It is
invisible from inside the app, which is exactly the class of failure the hard
rule exists to prevent.

**Design consequence.** A baseline cannot be an athlete's first exposure.
Options:

1. Run an unsaved practice pass before the real baseline.
2. Record baselines two or three times and use the later ones, or their mean.
3. Discard the first baseline automatically and require a second sitting.

Option 1 is cheapest. Option 2 is most robust, and the sitting-to-sitting
variation argues for it independently.

TODO(VEDANG): pick one and implement it before any tester touches the app.

---

## Finding 2: how much a healthy score actually moves

**Within a single sitting:** sd 9.4, 10.6, 2.5, and 8.5 ms.

**Across sittings, after the practice effect settles (runs 6 to 14, n = 9):**

```
mean    242.4 ms
sd        7.1 ms
range   229 to 251  = 22 ms
2 sd     14.1 ms
```

The sd has not moved since it was first computed at n = 6. That is what a
stable estimate looks like.

Pooling all 14 runs including sitting 1 gives a wider spread, but that number
describes a learning curve rather than noise and must not be used to set a
threshold.

**What this means.** Published work puts concussion-related reaction time
change in the range of tens of milliseconds. My settled band is about 14 ms at
two standard deviations. There is room for a threshold above my noise, but the
margin is not large.

TODO(NEEDS_SOURCE): my noise floor is not every athlete's noise floor. A
threshold set from n = 1 is a starting point for testing, not a validated
cutoff.

---

## Finding 3: the median was the right choice, and here is the proof

3 of 25 trials in sitting 1 were lapses at 364, 383 and 443 ms. Lapses are
normal. People blink, get distracted, zone out.

Per run in that sitting, the mean sat 8 to 25 ms above the median purely
because of those three trials.

That gap is the same size as the effect this module is trying to detect. An
implementation reporting the mean of 5 trials would report a healthy athlete as
roughly 14 ms slower on average than a median-based one, from inattention
alone.

Sitting 4 makes the same point differently. Tired evening runs had wider
trial-to-trial spread (mean 54 ms versus 24 ms in the afternoon sitting) but
the medians barely moved, landing at 234, 241 and 251. Fatigue increased
variability without shifting the center, and the median absorbed it.

The module reports the median. This is why.

---

## Finding 4: five trials may be too few

Sitting 1 had a 12 percent lapse rate. With 5 trials at that rate, a single run
has a meaningful chance of catching two lapses, and two lapses will drag a
5-value median.

Later sittings had zero lapses, so the effect shrinks once someone is
practiced. But the athletes this app is built for will resemble sitting 1, not
sitting 4, and they will be taking it rattled.

TODO(VEDANG): recompute what the between-sitting spread would look like at 7
and 9 trials per run, and decide whether the extra 10 to 15 seconds buys enough
stability to be worth it.

---

## What this does not tell me

- Nothing about the other five modules. This instrument measures tap timing
  only. Word recall, delayed recognition, digit span and pattern span each need
  their own noise profile, and the battery is currently disabled so those
  cannot be collected yet.
- Nothing about anyone but me. n = 1.
- Nothing about concussion. Every subject here was healthy. This measures the
  floor, not the signal.

---

## Method notes, so this is reproducible

- Same device, same hand, seated, indoors, no music.
- Not immediately after exercise.
- 3 to 5 runs per sitting, sittings spread across separate days and times of
  day.
- Every run recorded, including bad ones. No run discarded after the fact.
- Sitting 1 is retained rather than deleted, because it is the finding.
