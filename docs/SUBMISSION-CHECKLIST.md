# Sideline Check — submission checklist

**Deadline: 12:00 pm EDT, Monday, October 26, 2026.**
Written as of September 11. Six weeks.

Rubric is 30 points, two halves of 15.
CONCEPT = ideology, impact, structure (structure is entirely the video).
TECHNOLOGY = function, code, UI (code is judged through the video).
**Up to 15 of 30 rides on the video.**

---

## 0. Do first — small things that block bigger things

- [ ] Commit `docs/NOISE-FLOOR.md`. It has never been in the repo. It is the
      strongest evidence in the project and currently lives only in a chat log.
- [ ] Update it with the 9/9 and 9/10 sittings, the widened noise band
      (mean 244, sd 12.3, 2sd 24.6), and the anticipation finding (three trials
      under 200ms, one at 131ms, below the physiological floor).
- [ ] Confirm CAC registration went through. Log in and check the entry shows
      as started, not just that the account exists.
- [ ] Decide and record: individual entry or team entry with your partner. If
      team, one of you creates the team profile and invites the other.

---

## 1. App — must be true before you film

- [ ] **Take the full six-module battery on a phone, start to finish.** Nobody
      has done this. A bot walked it, not a person.
- [ ] Time it with a stopwatch, per module. Bot floor was 2:40. Real time is
      unknown.
- [ ] Decide whether numbers-backwards (9 sequences) and go/no-go (30 trials)
      get trimmed. They are two thirds of the machine-paced time and neither
      affects the flag decision.
- [ ] Record a real baseline, then a real check, and read the result screen as
      a coach would.
- [ ] Verify the practice gate: a fresh athlete cannot record a baseline until
      one practice pass is done.
- [ ] Verify the flag rule end to end: one bad module does not flag, two do,
      symptoms alone do.
- [ ] Verify the transitional state: modules with null thresholds never look
      like they contributed to a verdict.
- [ ] Confirm nowhere in the app shows green, a checkmark, "cleared", "safe to
      play", or "healthy".
- [ ] Try to break it. Tap early repeatedly. Background the tab mid-trial. Run
      a check on an athlete with no baseline. Close the tab mid-session.
- [ ] Export an athlete's data and open the file. Confirm it is readable.
- [ ] Merge `feat/gonogo-and-calibration` to `main` so production stops being
      the July three-module app.
- [ ] Confirm the production URL loads the real app and works on a phone.
- [ ] Bump `CACHE_NAME` before the final deploy.

## 2. Data

- [ ] Noise profiles for the five modules the reaction page does not cover.
      Run the full battery on yourself 3+ times in practice mode.
- [ ] Paste real numbers into `/tools/calibration` and read the curves.
- [ ] Set thresholds for the remaining modules, or decide deliberately to leave
      them null and make the app say so.
- [ ] Every threshold that gets a value needs a provenance comment and a
      `TODO(NEEDS_SOURCE)`.

## 3. Testers — five is enough

- [ ] Text 3-5 people this week. Ask for 20 minutes, three separate sittings
      over a week. Do not lead with the competition.
- [ ] Watch at least one person take it without helping. Write down every
      hesitation.
- [ ] Have one person take it twice, a day apart, to check the practice effect
      generalises beyond you.
- [ ] Log what testing found. Bugs and confusion are more valuable than scores.

---

## 4. Video — 15 of 30 points, hard 3 minute cap

Six elements the rules require:
- [ ] Name(s) of each participant
- [ ] Name of the app
- [ ] Purpose, in one clear sentence
- [ ] Target audience
- [ ] Tools and coding languages used
- [ ] Functionality showcase

Plus, because your district judges CODE through the video:
- [ ] **You on camera explaining your own code.** Not a silent screen
      recording with music, that scores a 1.

Production:
- [ ] Write the shot list. Three minutes, timed with a stopwatch on paper
      before filming.
- [ ] Open with the origin story. You have had concussions playing basketball.
      That is the first 15 seconds and it is what last year's district winner
      did well.
- [ ] Segment on the noise floor experiment: what you measured, the practice
      effect, why it matters.
- [ ] Segment on go/no-go: `performance.now()` vs `Date.now()`, why a ref and
      not React state, what the anticipation guard does.
- [ ] Screen recording of a real run on a real phone, not a simulator.
- [ ] Say plainly that the app flags and refers and never clears anyone.
- [ ] Disclose AI usage.
- [ ] Watch it once at full length with a stopwatch. Over 3:00 means cut.
- [ ] Upload to YouTube or Vimeo. **Set to public.** Private or unlisted fails.
- [ ] Open the link in a private browser window to confirm it plays.

---

## 5. Written answers — six questions

- [ ] 1. Title of the app
- [ ] 2. Purpose
- [ ] 3. What inspired you — the origin story, in your own words
- [ ] 4. Technical difficulty and how you addressed it — use
      `docs/SUBMISSION-NOTES.md`, lead with the noise floor and the practice
      effect
- [ ] 5. What you learned — the strongest answer is the pattern you found:
      three separate times, something that reported success was wrong
      (tests passing while the pinning stamp was deletable, a structural guard
      being walked past, a disclosure audit creating its own gaps)
- [ ] 6. What you would change in 2.0 — dual-task tandem gait and vestibular
      screening, with the evidence and why you scoped them out
- [ ] Read every answer aloud. If it sounds like something you did not write,
      rewrite it.

---

## 6. Repo, before judges could look at it

Judges may request source code access. Refusing is immediate disqualification.

- [ ] `AI-USAGE.md` current and honest through the final commit
- [ ] `CLAUDE.md` matches what the code actually does
- [ ] README explains what the app is and how to run it
- [ ] No secrets, no personal data, no real athlete names in the repo
- [ ] Repo loads and builds from a fresh clone
- [ ] Decide whether the repo goes public before submitting

---

## 7. Schedule

**Week of Sep 15** — phone run and timing, merge to main, text testers,
partner writes the shot list.

**Week of Sep 22** — testers baseline, collect module noise profiles, set
remaining thresholds.

**Week of Sep 29** — retest testers, fix what testing exposed.

**Week of Oct 6** — last code changes. Write all six answers.

**Oct 12 — FREEZE THE CODE.** No changes after this.

**Week of Oct 13** — film, edit, upload.

**Week of Oct 20** — submit. Do not wait for the 26th.

**Oct 26, 12:00 pm EDT** — hard deadline. Submissions cannot be modified after
the period closes.

---

## The two things most likely to go wrong

1. **The video gets left to the last week.** It is half the score and it has
   not been started. Your partner should be writing the shot list against an
   unfinished app right now.

2. **Nobody takes the battery on a phone until October.** Everything in
   section 1 is unverified by a human being. A bot is not a user.
