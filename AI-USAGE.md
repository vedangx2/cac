AI usage log
Who did what

This app was built by two high school students, Vedang and Aryaman. We used AI tools, and the usage is recorded in this file. This first section is our account of the project. The session-by-session log further down was written along with a AI coding tool after each session and records its side in detail.

What we did

The idea and the rules

Chose the problem after rejecting several other ideas: youth athletes who take a hit when no athletic trainer is on the sideline, so the call is left to a coach's judgment.
Set the rule the whole app is built around. It flags a possible change and refers to a medical professional. It never diagnoses a concussion and never clears anyone to play. There is no green "you're fine" screen anywhere.
Set the no-fabrication rule. No invented statistics, sources, or numbers appear in the app.

The architecture decisions

A web app instead of a native app, so testers and judges can open it from a link.
All data stays on the phone, with no accounts and no server, because we did not want to hold health information about other minors.
Simple, explainable statistics instead of a trained model.

The test battery

Decided the original reaction and number-scan tests were too easy to measure real change, and replaced them with six tests modeled on the kinds of tasks used in standardized sideline assessments.
Required that every test's content be original and not copied from any published assessment.

The measurement work

Collected 20 reaction-time runs on Vedang across six sittings over five days while healthy, to measure how much a healthy score moves on its own.
Found a practice effect. The first sitting averaged 262 ms. Every later sitting averaged between 235 and 257 ms, and the improvement held after a week off. We concluded that a baseline recorded on someone's first attempt can hide a real decline later.
Noticed responses as fast as 131 ms in our own data, faster than a person can physically react, and had a lower cutoff added so guesses are thrown out.
Chose the go/no-go threshold of 25 ms after working through our own noise numbers.
Chose the rule that two tests must agree before the app flags, after comparing false alarm rates in simulation.
Recruited and ran two more testers. One showed the same practice effect, 58 ms faster after a practice run, which is why the app now requires two practice runs before a baseline.
Approved preliminary thresholds for four more tests based on our testers' data.

Testing on real phones

These problems were found by us using the app on a phone:

Tapped patterns gave no feedback when a cell was tapped, so a repeated tap silently used up the next answer.
Long digit sequences wrapped onto two lines on a phone screen.
Words and digits disappeared too quickly, and tests felt too hard on a first try. This led to longer display times and unscored demo rounds before each test.
Go/no-go showed the same "too soon" message for two different mistakes, which confused one of our testers. The messages are now separate.
A suspicion that go/no-go delays followed a pattern, which we had investigated before changing anything. It turned out to be random, and nothing was changed.

Design

Rejected several designs as generic and chose the references the final design follows.
Wrote the homepage headline and paragraph, the button labels, the audience line, and the footer wording. Chose the square corners. Vedang took the homepage photo.

Directing the AI

Every build session ran from a written brief stating what to build, what must not change, and which safety rules could not be broken. The briefs were drafted with help from an AI assistant, based on our decisions.
We read every session's report, accepted or overruled its judgment calls, and ran the app ourselves after changes.
We merged and deployed every release.
What AI did

AI coding tool (Claude Code)

Wrote most of the code from our briefs, including all six test modules, the comparison engine, storage, the design implementation, and the automated tests.
Connected those pieces into one working app.
Made some implementation decisions on its own and found some bugs through its own reviews and tests. Each one is recorded in the log below.

AI assistant (Claude, in chat)

Helped plan the project and research the science behind the tests, and found the athletic trainer study cited on the About page.
Drafted the build briefs from our decisions.
Analyzed our noise floor data and worked through the threshold math with us.
Generated the word lists and digit sequences used in the memory tests.
Wrote docs/NOISE-FLOOR.md and docs/SUBMISSION-CHECKLIST.md from our data and plans.
What we understand

[We can explain how the app decides to flag. It compares an athlete to their own baseline and flags if symptoms go up by 5 points or more, or if at least two tests drop past their cutoffs. We set those cutoffs from our own testing, based on how much healthy scores moved between sittings, and we checked the rule with a normal check that didn’t flag and a faked bad one that did.]

Correction to an entry below

The 2026-09-14 audit entry says the word list and digit sequence files were replaced by a human editing pass and that no AI disclosure was owed for them. That is wrong. Both replacement files were generated by our AI chat assistant, then checked against the app's own automated tests before being committed.

This section was drafted with an AI assistant from our account of the project, then reviewed and edited by us.

Session-by-session log

Written by the AI coding tool at the end of each session.