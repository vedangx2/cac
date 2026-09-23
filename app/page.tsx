import Link from 'next/link';
import { ButtonLink, Kicker, Notice, PageShell } from '@/components/ui';

// The landing screen. Its job is to get someone to the roster fast, and to be completely
// unambiguous about what this app is and is not before they ever see a result.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// REDESIGNED 2026-09-22 (task 4) — see SESSION-REPORT.md for the full brief and process.
// ═════════════════════════════════════════════════════════════════════════════════════
// What changed here is DELIBERATELY not a coat of paint over the old structure: every
// section below used to be a uniform grid of equal-height Cards (three across, then two
// across). That is the exact "generic AI output" shape the brief asked to move away from,
// so "How it works" and "The tests" are rebuilt as ruled, alternating reading sections
// instead of card grids — see the comments at each one for why. Every safety sentence
// (the hard rule, the "early days" caveat) is carried over close to word-for-word; only
// its typesetting and surrounding layout changed.

const STEPS = [
  {
    number: '1',
    title: 'Record a baseline',
    body:
      'While the athlete is well, they work through a short battery of tests. This is their personal reference point — how they perform normally, not how anyone else performs.',
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
      'The app compares the new scores against that athlete’s own baseline, shows what changed, and tells you to get a professional opinion — whatever the comparison finds.',
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
      'Study ten words, then pick them out of twenty. You are asked again at the end, so the same words are tested twice — once straight away and once after a delay.',
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

export default function HomePage() {
  return (
    <PageShell className="font-read">
      {/* ── Hero ──────────────────────────────────────────────────────────────────── */}
      <section className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-16">
        <div>
          <Kicker>Sideline concussion screening aid</Kicker>
          {/*
            MIXED-WEIGHT HEADING — the brief's own phrase: "a bold phrase followed by
            regular text, which reads as typeset rather than templated." Same size token
            (text-display / sm:text-stimulus) throughout; only the weight changes.
          */}
          <h1 className="mt-3 text-display font-black leading-[1.05] tracking-tight text-ink sm:text-stimulus">
            Compare an athlete to themselves.{' '}
            <span className="font-normal text-ink-soft">Not to everyone else.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-title text-ink-soft">
            A slow reaction time only means something next to how fast that athlete normally
            is. This app records a healthy baseline, then re-runs the same tests after a hard
            hit and shows you exactly what moved.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/athletes">Get started</ButtonLink>
            {/*
              The practice run: all six tests in order, scored and shown once, saved nowhere.
              Deliberately reachable with no athlete profile — and it is also how an athlete
              earns their practice pass, which a baseline requires (the first-exposure guard).
            */}
            <ButtonLink href="/practice" variant="secondary">
              Run a practice battery
            </ButtonLink>
          </div>

          {/*
            WHAT THE APP CAN AND CANNOT JUDGE — said here, on the first screen, rather than
            left for someone to discover on a results screen. Recording was re-enabled on
            2026-09-10 (see app/athletes/[id]/page.tsx for the conditions and the practice
            gate); the honest caveat now is about how few measurements carry a tested cut-off.
          */}
          <div className="mt-8">
            <Notice tone="loud" title="Early days — most measurements are not judged yet">
              Recording works: an athlete runs one practice pass, records a baseline while well,
              and can be checked after a hit. But only two measurements have tested cut-offs so
              far — the symptom score, and go/no-go response time, whose cut-off comes from one
              student&apos;s self-collected data. Everything else is measured, shown, and marked
              as not judged.{' '}
              <strong>
                This app never diagnoses and never clears anyone. If an athlete may have hit
                their head, have them seen by a medical professional — whatever any screen here
                says.
              </strong>
            </Notice>
          </div>
        </div>

        {/* The hard rule, stated up front rather than buried in a footnote. */}
        <div className="mt-10 lg:mt-0">
          <div className="rounded-xl border-4 border-ink bg-ink p-6 text-paper sm:p-8">
            <h2 className="text-title font-black">What this app will never do</h2>
            <ul className="mt-4 space-y-4 text-body">
              <li className="border-t border-paper/20 pt-4 first:border-t-0 first:pt-0">
                It will <strong>never tell you someone is fine</strong>, cleared, or safe to
                play.
              </li>
              <li className="border-t border-paper/20 pt-4">
                It <strong>cannot diagnose a concussion</strong>. It can only spot that
                something measured differently than usual.
              </li>
              <li className="border-t border-paper/20 pt-4">
                Every result — including one that finds no change — ends the same way:{' '}
                <strong>see a medical professional.</strong>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/*
        ── How it works ──────────────────────────────────────────────────────────────
        Was a 3-across grid of equal-height Cards. Rebuilt as a single ruled column where
        each step alternates which side the prose is indented from — the alternating
        rhythm the brief asked for, instead of one repeating box three times.
      */}
      <section className="mt-20" aria-labelledby="how-heading">
        <Kicker>How it works</Kicker>
        <h2 id="how-heading" className="mt-2 text-display font-bold tracking-tight text-ink">
          Three steps, always in the same order
        </h2>

        <ol className="mt-8 divide-y divide-ink/10 border-t border-ink/10">
          {STEPS.map((step, index) => (
            <li
              key={step.number}
              // Alternating rhythm: the step number sits on the right for even steps
              // instead of always on the left. flex-row-reverse only ever reorders these
              // two flex children — it does not touch text direction or reading order for
              // a screen reader, which follows document order regardless.
              className={`flex flex-col gap-4 py-8 sm:flex-row sm:items-baseline sm:gap-8 ${
                index % 2 === 1 ? 'sm:flex-row-reverse' : ''
              }`}
            >
              <span
                className="tabular font-figure shrink-0 text-stimulus font-black text-clinic sm:w-[120px]"
                aria-hidden="true"
              >
                {step.number}
              </span>
              <div>
                <h3 className="text-title font-bold text-ink">{step.title}</h3>
                <p className="mt-2 max-w-xl text-body text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/*
        ── The tests ─────────────────────────────────────────────────────────────────
        Was a 2-across grid of equal-height Cards, which forced word learning's much
        longer description into the same box as the symptom checklist's one line. A ruled
        list lets each entry take exactly the room its own description needs — content
        deciding its own weight on the page, rather than a grid deciding it for them.
      */}
      <section className="mt-20 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div>
          <Kicker>The tests</Kicker>
          <h2 id="tests-heading" className="mt-2 text-display font-bold tracking-tight text-ink">
            The whole battery, five ways to try one
          </h2>
          <p className="mt-4 max-w-xl text-body text-ink-soft">
            The whole battery takes a few minutes. Try any single test right now without saving
            anything, or run all six in order as a practice battery, scored at the end and
            saved nowhere.
          </p>

          <ol className="mt-8 divide-y divide-ink/10 border-t border-ink/10">
            {TESTS.map((test) => (
              <li key={test.href} className="py-5">
                <h3 className="text-title font-bold text-ink">
                  <Link
                    href={test.href}
                    className="underline decoration-clinic decoration-2 underline-offset-4 hover:decoration-ink"
                  >
                    {test.title}
                  </Link>
                </h3>
                <p className="mt-1 max-w-xl text-body text-ink-soft">{test.body}</p>
              </li>
            ))}
          </ol>
        </div>

        {/*
          ── Privacy ─────────────────────────────────────────────────────────────────
          Narrower, offset column beside the test list rather than a full-width banner
          below it — the varying-width block the brief asked for, and it means this
          screen ends on the same two-column rhythm the hero opened with rather than a
          full-width strip.
        */}
        <div className="mt-12 lg:mt-0">
          <h2 className="sr-only">Privacy</h2>
          <div className="border-t-4 border-clinic pt-4">
            <p className="text-meta font-bold uppercase tracking-widest text-ink-soft">
              Everything stays on this device
            </p>
            <p className="mt-3 text-body text-ink-soft">
              There is no account, no server, and no upload. Every athlete and every result is
              stored in this browser&apos;s own storage, on this device. That also means
              results do not follow you to another phone or another browser — and that
              clearing your browser data will erase them.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
