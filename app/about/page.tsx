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
      'While well, the athlete takes a short set of tests. This is their normal.',
  },
  {
    number: '2',
    title: 'Run a sideline check',
    body:
      'After a possible head hit, they take the same tests again on the sideline.',
  },
  {
    number: '3',
    title: 'Compare and refer',
    body:
      'The app compares the new scores to that athlete’s own baseline. It shows what changed and tells you to see a medical professional.',
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
      'Study ten words, then pick them out of twenty. You are asked again at the end.',
  },
  {
    href: '/tests/digits',
    title: 'Numbers backwards',
    body: 'Watch some numbers, then type them back in reverse. Nine rounds, getting longer.',
  },
  {
    href: '/tests/pattern',
    title: 'Tapped patterns',
    body: 'Squares light up in order. Tap them back in the same order. Nine rounds, getting longer.',
  },
  {
    href: '/tests/gonogo',
    title: 'Go / no-go',
    body:
      'Tap when it says TAP. Do nothing when it says HOLD. Thirty short trials.',
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
            Each athlete is only compared to themselves. Never to other players or an average.
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
              You can practice, record a baseline, and run a check. But only two measurements
              have a tested cut-off: the symptom score and go/no-go response time. That cut-off
              comes from one student&apos;s own data. Everything else is shown as{' '}
              <strong className="text-ink">not judged</strong>, never as normal.
            </p>
            <p>
              A cut-off should come from how much a healthy athlete&apos;s scores vary between
              two normal sittings. Too low, and it flags everyone. Too high, and it flags no one.
              Most of that data is not collected yet.
            </p>
            <p className="font-semibold text-ink">
              This app never diagnoses and never clears anyone. If an athlete may have hit their
              head, see a medical professional, whatever any screen here says.
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
              The battery takes a few minutes. Try one test with nothing saved, or run all six
              as a practice round.
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
                It <strong>cannot diagnose a concussion</strong>. It only spots a change from
                usual.
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
              There is no account, no server, and no upload. Results are stored in this browser,
              on this device. They do not move to another phone or browser. Clearing your browser
              data erases them.
            </p>
            <p>
              One exception: the &ldquo;Print or save as PDF&rdquo; button on a result. A copy
              leaves the device only if a person chooses to print or save it.
            </p>
            <p>
              Two high school students built this app for the Congressional App Challenge. It is
              free. It is not a medical device, and no medical professional has reviewed it. Go
              to <Link href="/" className="text-link underline underline-offset-4">the home page</Link>{' '}
              to get started. <code className="text-meta text-ink-secondary">AI-USAGE.md</code> in
              the source lists where AI helped build it.
            </p>
          </div>
        </Section>
      </Reveal>
    </>
  );
}
