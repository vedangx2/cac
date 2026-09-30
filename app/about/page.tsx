import Link from 'next/link';
import { Kicker, PageHeader, Section } from '@/components/ui';
import { Reveal } from '@/components/reveal';

// app/about/page.tsx — CLAUDE.md Task 6.
//
// The longer explanation that used to live on the homepage: how the comparison works, where
// thresholds come from, what the app cannot do, and technical limits. Moved here so the
// homepage can be read in ten seconds (Task 5) while this detail stays one link away for
// anyone who wants it — a parent deciding whether to trust this, a judge, a teacher.
//
// WHAT DID NOT MOVE (CLAUDE.md's own list): the persistent footer, the full safety copy and
// transitional notice on the results screen, and the one-line hard rule on the homepage. All
// three stay exactly where they were; nothing here replaces any of them.
//
// SEQUENCING NOTE (see AI-USAGE.md): this page was built and linked BEFORE the homepage was
// cut down (Task 5), even though the brief numbers them the other way — so the content below
// always had somewhere to land before it was ever removed from the homepage, rather than a
// moment existing where it lived nowhere.

const STEPS = [
  {
    number: '1',
    title: 'Record a baseline',
    body:
      'While the athlete is well, they work through a short battery of tests. This is their personal reference point: how they perform normally, not how anyone else performs.',
  },
  {
    number: '2',
    title: 'Run a sideline check',
    body:
      'After a possible head impact, they take the exact same tests again, right there on the sideline, on the same phone or a different one.',
  },
  {
    number: '3',
    title: 'Compare and refer',
    body:
      'The app compares the new scores against that athlete’s own baseline, shows what changed, and tells you to get a professional opinion. Whatever the comparison finds.',
  },
];

const TESTS = [
  {
    href: '/tests/symptom',
    title: 'Symptom checklist',
    body: 'Ten common symptoms, each rated from none to severe.',
  },
  {
    href: '/tests/words',
    title: 'Word learning',
    body:
      'Study ten words, then pick them out of twenty. You are asked again at the end, so the same words are tested twice: once straight away and once after a delay.',
  },
  {
    href: '/tests/digits',
    title: 'Numbers backwards',
    body: 'Watch a run of numbers, then type them back in reverse order. Nine rounds, getting longer.',
  },
  {
    href: '/tests/pattern',
    title: 'Tapped patterns',
    body: 'Squares light up one after another; tap them back in the same order. Nine rounds, getting longer.',
  },
  {
    href: '/tests/gonogo',
    title: 'Go / no-go',
    body:
      'Tap the moment the signal says TAP, and do nothing when it says HOLD. Thirty short trials measuring both how fast you move and how well you hold back.',
  },
];

export default function AboutPage() {
  return (
    <>
      <Section tone="canvas">
        <PageHeader
          eyebrow="About"
          title="How this app works, and what it cannot do"
          subtitle="The short version lives on the home page. This is the rest of it."
        />
      </Section>

      {/* ── How the comparison works ──────────────────────────────────────────────── */}
      <Reveal>
        <Section tone="surface" divider aria-labelledby="how-heading" animate={false}>
          <Kicker>How the comparison works</Kicker>
          <h2 id="how-heading" className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            Three steps, always in the same order
          </h2>

          <ol className="mt-8 divide-y divide-hairline border-t border-hairline">
            {STEPS.map((step) => (
              <li
                key={step.number}
                className="flex flex-col gap-4 py-8 sm:flex-row sm:items-baseline sm:gap-8"
              >
                <span className="tabular shrink-0 text-title font-semibold text-ink-secondary sm:w-12" aria-hidden="true">
                  {step.number}
                </span>
                <div>
                  <h3 className="text-title font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 max-w-xl text-body text-ink-secondary">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-8 max-w-2xl text-body text-ink-secondary">
            The comparison only ever runs against that specific athlete&apos;s own baseline —
            never against anyone else&apos;s scores, and never against a population average. A
            slow reaction time only means something next to how fast that athlete normally is.
          </p>
        </Section>
      </Reveal>

      {/* ── Where thresholds come from ────────────────────────────────────────────── */}
      <Reveal>
        <Section tone="canvas" animate={false}>
          <Kicker>Where the thresholds come from</Kicker>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            Most measurements are not judged yet
          </h2>
          <div className="mt-6 max-w-2xl space-y-4 text-body text-ink-secondary">
            <p>
              Recording works: an athlete runs one practice pass, records a baseline while well,
              and can be checked after a hit. But only two measurements have a tested cut-off so
              far: the symptom score, and go/no-go response time, whose cut-off comes from one
              student&apos;s self-collected data. Everything else is measured, shown, and marked
              as <strong className="text-ink">not judged</strong> — never as normal.
            </p>
            <p>
              A cut-off has to come from watching how much a healthy athlete&apos;s own score
              wobbles between two sittings that are not connected to any head impact at all. Set
              it too low and the app flags everybody, which trains people to ignore it. Set it
              too high and it flags nobody. That measurement takes real data, collected over
              time, and most of it has not been collected yet.
            </p>
            <p className="font-semibold text-ink">
              This app never diagnoses and never clears anyone. If an athlete may have hit their
              head, have them seen by a medical professional, whatever any screen here says.
            </p>
          </div>
        </Section>
      </Reveal>

      {/* ── The battery ────────────────────────────────────────────────────────────── */}
      <Reveal>
        <Section
          tone="surface"
          divider
          animate={false}
          className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-16"
        >
          <div>
            <Kicker>The battery</Kicker>
            <h2 id="tests-heading" className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
              The whole battery, five ways to try one
            </h2>
            <p className="mt-4 max-w-xl text-body text-ink-secondary">
              The whole battery takes a few minutes. Try any single test right now without
              saving anything, or run all six in order as a practice battery, scored at the end
              and saved nowhere.
            </p>

            <ol className="mt-8 divide-y divide-hairline border-t border-hairline">
              {TESTS.map((test) => (
                <li key={test.href} className="py-5">
                  <Link href={test.href} className="group flex items-baseline justify-between gap-4">
                    <span className="text-title font-semibold text-ink group-hover:text-link">
                      {test.title} <span aria-hidden="true">›</span>
                    </span>
                  </Link>
                  <p className="mt-1 max-w-xl text-body text-ink-secondary">{test.body}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* ── What this app cannot do ──────────────────────────────────────────── */}
          <div className="mt-12 lg:mt-0">
            <h2 className="text-meta font-semibold text-ink-secondary">What this app cannot do</h2>
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
              <li className="py-4 text-body text-ink">
                It will <strong>never tell you someone is fine</strong>, cleared, or safe to
                play.
              </li>
              <li className="py-4 text-body text-ink">
                It <strong>cannot diagnose a concussion</strong>. It can only spot that
                something measured differently than usual.
              </li>
              <li className="py-4 text-body text-ink">
                Every result, including one that finds no change, ends the same way:{' '}
                <strong>see a medical professional.</strong>
              </li>
            </ul>
          </div>
        </Section>
      </Reveal>

      {/* ── Technical limits ──────────────────────────────────────────────────────── */}
      <Reveal>
        <Section tone="canvas" animate={false}>
          <Kicker>Technical limits</Kicker>
          <h2 className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            Everything stays on this device
          </h2>
          <div className="mt-6 max-w-2xl space-y-4 text-body text-ink-secondary">
            <p>
              There is no account, no server, and no upload. Every athlete and every result is
              stored in this browser&apos;s own storage, on this device. That also means results
              do not follow you to another phone or another browser, and that clearing your
              browser data will erase them.
            </p>
            <p>
              The one exception is a printed or saved copy of a result, made deliberately by
              someone using the &ldquo;Print or save as PDF&rdquo; button on a result — that is
              the only way anything from this app leaves the device it was recorded on, and it
              only happens when a person chooses to print or save it.
            </p>
            <p>
              This app is built by two high school students for the Congressional App
              Challenge. It is free, it is not a medical device, and it has not been reviewed by
              a medical professional. See <Link href="/" className="text-link underline underline-offset-4">the home page</Link>{' '}
              for how to get started, or <code className="text-meta text-ink-secondary">AI-USAGE.md</code> in
              the project&apos;s source for exactly where AI assistance was used to build it.
            </p>
          </div>
        </Section>
      </Reveal>
    </>
  );
}
