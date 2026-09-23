import Image from 'next/image';
import Link from 'next/link';
import { ButtonLink, Kicker, Notice, Section } from '@/components/ui';

// The landing screen. Its job is to get someone to the roster fast, and to be completely
// unambiguous about what this app is and is not before they ever see a result.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// REPLACED 2026-09-23 — this is Apple's web design system, applied as a spec, not an
// aesthetic. See SESSION-REPORT.md for the full brief and the token/typography changes in
// app/globals.css and components/ui.tsx. Sections are now full-width bands (alternating
// canvas/surface backgrounds) rather than a shell containing everything, which is what the
// spec means by "not boxes floating on a page" — so this file renders one <Section> per
// band instead of one <PageShell> around the whole page.
// ═════════════════════════════════════════════════════════════════════════════════════
// Every safety sentence (the hard rule, the "early days" caveat) is carried over exactly —
// see SESSION-REPORT.md for the separate, later pass that removes em dashes and British
// spelling from this copy. This commit is restyling only; no word changed.

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

export default function HomePage() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────────────── */}
      <Section tone="canvas" className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:gap-16">
        <div>
          <Kicker>Sideline concussion screening aid</Kicker>
          <h1 className="mt-3 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-hero">
            Compare an athlete to themselves.
            <br />
            <span className="text-ink-secondary">Not to everyone else.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-title text-ink-secondary">
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
          <div className="mt-8 max-w-2xl">
            <Notice tone="loud" title="Early days. Most measurements are not judged yet">
              Recording works: an athlete runs one practice pass, records a baseline while well,
              and can be checked after a hit. But only two measurements have tested cut-offs so
              far: the symptom score, and go/no-go response time, whose cut-off comes from one
              student&apos;s self-collected data. Everything else is measured, shown, and marked
              as not judged.{' '}
              <strong>
                This app never diagnoses and never clears anyone. If an athlete may have hit
                their head, have them seen by a medical professional, whatever any screen here
                says.
              </strong>
            </Notice>
          </div>
        </div>

        {/*
          ── Product image ─────────────────────────────────────────────────────────
          Apple lets product imagery carry visual weight while the surrounding UI stays
          monochrome. This app has no photography, but its dark instrument screens are its
          product — so a genuine screenshot of one, in a plain phone frame, stands in for it.

          The image is a real screenshot (public/images/pattern-span-screenshot.png) of the
          Tapped patterns module mid-practice-run, captured 2026-09-23 — not a mockup or an
          illustration, and no athlete data is visible in it (a practice run saves nothing and
          this one was never attached to an athlete).
        */}
        <div className="mt-12 flex justify-center lg:mt-0 lg:justify-end">
          <div className="w-full max-w-[280px] rounded-[2.5rem] border-[10px] border-ink bg-ink">
            <div className="relative overflow-hidden rounded-[2rem]">
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-ink"
              />
              <Image
                src="/images/pattern-span-screenshot.png"
                alt="The Tapped patterns test in progress on a phone: a 3-by-3 grid of squares, one square selected after being tapped, mid practice run."
                width={600}
                height={674}
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
        </div>
      </Section>

      {/*
        ── The hard rule ─────────────────────────────────────────────────────────────
        A full-width band, not a rounded panel floating in the hero's side column. Its
        content is safety copy and survives word for word — only its container changed
        from a boxed, rounded, side-column card to a full-bleed section of its own.
      */}
      <Section tone="canvas" divider>
        <h2 className="text-title font-semibold text-ink">What this app will never do</h2>
        <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
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
      </Section>

      {/*
        ── How it works ──────────────────────────────────────────────────────────────
        Its own full-width surface band, alternating away from the canvas bands around it —
        Apple's own way of separating sections, instead of a card grid or a boxed panel.
      */}
      <Section tone="surface" aria-labelledby="how-heading">
        <Kicker>How it works</Kicker>
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
      </Section>

      {/*
        ── The tests ─────────────────────────────────────────────────────────────────
        A ruled list — each row is a module name at weight 600 with a trailing chevron,
        a description underneath in the secondary colour, and a hairline between rows.
      */}
      <Section tone="canvas" className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div>
          <Kicker>The tests</Kicker>
          <h2 id="tests-heading" className="mt-2 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
            The whole battery, five ways to try one
          </h2>
          <p className="mt-4 max-w-xl text-body text-ink-secondary">
            The whole battery takes a few minutes. Try any single test right now without saving
            anything, or run all six in order as a practice battery, scored at the end and
            saved nowhere.
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

        {/*
          ── Privacy ─────────────────────────────────────────────────────────────────
          Narrower, offset column beside the test list rather than a full-width banner
          below it.
        */}
        <div className="mt-12 lg:mt-0">
          <h2 className="sr-only">Privacy</h2>
          <div className="border-t border-hairline pt-4">
            <p className="text-meta font-semibold text-ink-secondary">
              Everything stays on this device
            </p>
            <p className="mt-3 text-body text-ink-secondary">
              There is no account, no server, and no upload. Every athlete and every result is
              stored in this browser&apos;s own storage, on this device. That also means
              results do not follow you to another phone or another browser, and that
              clearing your browser data will erase them.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
