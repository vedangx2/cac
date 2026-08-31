import Link from 'next/link';
import { ButtonLink, Card, Notice, PageShell } from '@/components/ui';

// The landing screen. Its job is to get someone to the roster fast, and to be completely
// unambiguous about what this app is and is not before they ever see a result.

const STEPS = [
  {
    number: '1',
    title: 'Record a baseline',
    body:
      'While the athlete is well, they work through a short battery of tests. This is their personal reference point — how they perform normally.',
  },
  {
    number: '2',
    title: 'Run a sideline check',
    body:
      'After a possible head impact, they take the exact same tests again, right there on the sideline.',
  },
  {
    number: '3',
    title: 'Compare and refer',
    body:
      'The app compares the new scores against that athlete’s own baseline, shows what changed, and tells you to get a professional opinion.',
  },
];

export default function HomePage() {
  return (
    <PageShell>
      {/* ── Hero ──────────────────────────────────────────────────────────────────── */}
      <section className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-12">
        <div>
          <p className="text-meta font-black uppercase tracking-widest text-ink-soft">
            Sideline concussion screening aid
          </p>
          <h1 className="mt-3 text-display font-black leading-[1.05] tracking-tight text-ink sm:text-stimulus">
            Compare an athlete to <span className="text-ink">themselves</span>, not to
            everyone else.
          </h1>
          <p className="mt-4 max-w-2xl text-title text-ink-soft sm:text-title">
            A slow reaction time only means something next to how fast that athlete normally
            is. This app records a healthy baseline, then re-runs the same tests after a hard
            hit and shows you exactly what moved.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/athletes">Get started</ButtonLink>
            {/* Points at a test that exists. /tests/reaction was deleted in the battery rebuild. */}
            <ButtonLink href="/tests/symptom" variant="secondary">
              Try a test first
            </ButtonLink>
          </div>

          {/*
            THE BATTERY IS MID-REBUILD AND RECORDING IS TURNED OFF.
            Said here, on the first screen, rather than left for someone to discover after they
            have created an athlete and tapped a disabled button. See app/athletes/[id]/page.tsx.
          */}
          <div className="mt-6">
            <Notice tone="loud" title="Recording is turned off right now">
              The tests below are all built now, but none of them has a tested cut-off yet — so the
              app can measure a change and still has no basis for saying whether that change
              matters. You can try every test, but baselines and sideline checks cannot be recorded
              until real data has been collected and those cut-offs set.{' '}
              <strong>
                This app is not ready to be used on an athlete who may have hit their head.
              </strong>
            </Notice>
          </div>
        </div>

        {/* The hard rule, stated up front rather than buried in a footnote. */}
        <div className="mt-8 lg:mt-0">
          <div className="rounded-xl border-4 border-ink bg-ink p-6 text-paper">
            <h2 className="text-title font-black">What this app will never do</h2>
            <ul className="mt-4 space-y-3 text-body">
              <li>
                It will <strong>never tell you someone is fine</strong>, cleared, or safe to
                play.
              </li>
              <li>
                It <strong>cannot diagnose a concussion</strong>. It can only spot that
                something measured differently than usual.
              </li>
              <li>
                Every result — including one that finds no change — ends the same way:{' '}
                <strong>see a medical professional.</strong>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────────────── */}
      <section className="mt-16" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-display font-bold tracking-tight text-ink sm:text-display">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number}>
              <Card className="h-full">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-title font-black text-paper">
                  {step.number}
                </span>
                <h3 className="mt-4 text-title font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-body text-ink-soft">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The tests ─────────────────────────────────────────────────────────────── */}
      <section className="mt-16" aria-labelledby="tests-heading">
        <h2 id="tests-heading" className="text-display font-bold tracking-tight text-ink sm:text-display">
          The tests
        </h2>
        <p className="mt-2 max-w-2xl text-body text-ink-soft">
          The whole battery takes a few minutes. You can try any of them right now without saving
          anything.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TestCard
            href="/tests/symptom"
            title="Symptom checklist"
            body="Ten common symptoms, each rated from none to severe."
          />
          <TestCard
            href="/tests/words"
            title="Word learning"
            body="Study ten words, then pick them out of twenty. You are asked again at the end, so the same words are tested twice — once straight away and once after a delay."
          />
          <TestCard
            href="/tests/digits"
            title="Numbers backwards"
            body="Watch a run of numbers, then type them back in reverse order. Nine rounds, getting longer."
          />
          <TestCard
            href="/tests/pattern"
            title="Tapped patterns"
            body="Squares light up one after another; tap them back in the same order. Nine rounds, getting longer."
          />
          <TestCard
            href="/tests/gonogo"
            title="Go / no-go"
            body="Tap the moment the signal says TAP, and do nothing when it says HOLD. Thirty short trials measuring both how fast you move and how well you hold back."
          />
        </div>
      </section>

      {/* ── Privacy ───────────────────────────────────────────────────────────────── */}
      <section className="mt-16" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="sr-only">
          Privacy
        </h2>
        <Notice title="Everything stays on this device">
          There is no account, no server, and no upload. Every athlete and every result is
          stored in this browser&apos;s own storage, on this device. That also means results do
          not follow you to another phone or another browser — and that clearing your browser
          data will erase them.
        </Notice>
      </section>
    </PageShell>
  );
}

function TestCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Card className="h-full">
      <h3 className="text-title font-bold text-ink">
        <Link
          href={href}
          className="underline decoration-ink/40 decoration-2 underline-offset-4 hover:decoration-ink"
        >
          {title}
        </Link>
      </h3>
      <p className="mt-2 text-body text-ink-soft">{body}</p>
    </Card>
  );
}
