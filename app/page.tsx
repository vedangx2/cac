import Link from 'next/link';
import { ButtonLink, Card, Notice, PageShell } from '@/components/ui';

// The landing screen. Its job is to get someone to the roster fast, and to be completely
// unambiguous about what this app is and is not before they ever see a result.

const STEPS = [
  {
    number: '1',
    title: 'Record a baseline',
    body:
      'While the athlete is well, they take three short tests. This is their personal reference point — how they perform normally.',
  },
  {
    number: '2',
    title: 'Run a sideline check',
    body:
      'After a possible head impact, they take the exact same three tests again, right there on the sideline.',
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
          <p className="text-sm font-black uppercase tracking-[0.2em] text-ink-soft">
            Sideline concussion screening aid
          </p>
          <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Compare an athlete to <span className="text-signal">themselves</span>, not to
            everyone else.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">
            A slow reaction time only means something next to how fast that athlete normally
            is. This app records a healthy baseline, then re-runs the same tests after a hard
            hit and shows you exactly what moved.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/athletes">Get started</ButtonLink>
            <ButtonLink href="/tests/reaction" variant="neutral">
              Try a test first
            </ButtonLink>
          </div>
        </div>

        {/* The hard rule, stated up front rather than buried in a footnote. */}
        <div className="mt-10 lg:mt-0">
          <div className="rounded-xl border-4 border-ink bg-ink p-6 text-white">
            <h2 className="text-xl font-black">What this app will never do</h2>
            <ul className="mt-4 space-y-3 text-base leading-relaxed">
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
      <section className="mt-14" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.number}>
              <Card className="h-full">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-signal text-xl font-black text-white">
                  {step.number}
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-ink-soft">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The tests ─────────────────────────────────────────────────────────────── */}
      <section className="mt-14" aria-labelledby="tests-heading">
        <h2 id="tests-heading" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          The three tests
        </h2>
        <p className="mt-2 max-w-2xl text-base text-ink-soft">
          Each one takes well under a minute. You can try any of them right now without saving
          anything.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <TestCard
            href="/tests/symptom"
            title="Symptom checklist"
            body="Ten common symptoms, each rated from none to severe."
          />
          <TestCard
            href="/tests/reaction"
            title="Reaction time"
            body="Tap the moment the pad turns green. Five trials, reported as the median."
          />
          <TestCard
            href="/tests/scan"
            title="Number scan"
            body="Tap 1 to 15 in order as fast as you can. Measures time and mistakes."
          />
        </div>
      </section>

      {/* ── Privacy ───────────────────────────────────────────────────────────────── */}
      <section className="mt-14" aria-labelledby="privacy-heading">
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
      <h3 className="text-lg font-bold text-ink">
        <Link
          href={href}
          className="underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-signal"
        >
          {title}
        </Link>
      </h3>
      <p className="mt-2 text-base leading-relaxed text-ink-soft">{body}</p>
    </Card>
  );
}
