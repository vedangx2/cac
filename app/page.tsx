import Image from 'next/image';
import Link from 'next/link';
import { ButtonLink, Kicker, Notice, Section } from '@/components/ui';

// The landing screen. Its job is to get someone to the roster fast, and to be completely
// unambiguous about what this app is and is not before they ever see a result.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// CUT DOWN 2026-09-29 — CLAUDE.md Task 5. This used to run four full sections: the hero, "What
// this app will never do," "How it works" (three steps), and "The tests" (all five, with a
// privacy paragraph beside them). The brief's own words: "Cut it to what a first-time visitor
// needs in ten seconds." Everything beyond the hero, the one-line hard rule, the one-line
// privacy note and the primary actions moved to app/about/page.tsx (Task 6, built first — see
// AI-USAGE.md for why) rather than being deleted outright; a "Read more" link is the door back
// to all of it for anyone who wants the detail.
// ═════════════════════════════════════════════════════════════════════════════════════
// Every safety sentence here is still the same claim as before, just said once instead of at
// length — see AI-USAGE.md for exactly what moved and what was only shortened.

export default function HomePage() {
  return (
    <>
    <Section tone="canvas" compact className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
      <div>
        <Kicker>Rebound · sideline concussion screening aid</Kicker>
        <h1 className="mt-3 text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-hero">
          Know what&rsquo;s normal for your athlete.
        </h1>
        <p className="mt-5 max-w-2xl text-title text-ink-secondary">
          Every athlete has a different normal. A reaction time that&rsquo;s fast for one player
          could be slow for another. This app records each athlete&rsquo;s normal so you can see
          what changed after a hit.
        </p>
        {/* Audience line — written by a human (the project owner); used verbatim, do not reword. */}
        <p className="mt-3 max-w-2xl text-body text-ink-secondary">
          For teams without an athletic trainer on the sideline.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/*
            "Start a baseline" goes to the roster, NOT straight to a test: a new athlete's
            practice pass and then their baseline begin from there. The practice gate stays.
          */}
          <ButtonLink href="/athletes">Start a baseline</ButtonLink>
          {/*
            The practice run: all six tests in order, scored and shown once, saved nowhere.
            Deliberately reachable with no athlete profile — and it is also how an athlete
            earns their practice pass, which a baseline requires (the first-exposure guard).
          */}
          <ButtonLink href="/practice" variant="secondary">
            Try a practice round
          </ButtonLink>
        </div>

        {/*
          THE ONE-LINE HARD RULE, and nothing longer. CLAUDE.md Task 5: "The homepage MUST keep
          one line stating the app flags and refers, never clears anyone, and to always see a
          medical professional." Everything this used to say about which measurements have a
          tested cut-off, and why, now lives at /about — this is the one sentence a first-time
          visitor must see before they ever reach a result, not the explanation behind it.
        */}
        <div className="mt-8 max-w-2xl space-y-3">
          <Notice tone="loud">
            This app only flags a possible change and refers you onward.{' '}
            <strong>
              It never diagnoses a concussion and never clears anyone to play.
            </strong>{' '}
            If there is any chance of a head impact, always see a medical professional.
          </Notice>

          {/* THE ONE LINE ON PRIVACY. */}
          <p className="text-body text-ink-secondary">
            Everything stays on this device: no account, no server, no upload.{' '}
            <Link href="/about" className="text-link underline underline-offset-4">
              Read more about how this works
            </Link>
            .
          </p>
        </div>
      </div>

      {/*
        ── Product image ─────────────────────────────────────────────────────────
        Apple lets product imagery carry visual weight while the surrounding UI stays
        monochrome. This app has no photography, but its dark instrument screens are its
        product — so a genuine screenshot of one, in a plain phone frame, stands in for it.

        The phone mockup. A genuine screenshot (public/images/pattern-span-screenshot.png) of
        the Tapped patterns module mid-practice-run, captured 2026-09-23 — not a mockup or an
        illustration, and no athlete data is visible in it (a practice run saves nothing and
        this one was never attached to an athlete). The hero photo, public/hero.jpg (a free Unsplash stock photo by TJ Dragotta, credited on the About page), sits
        in its own large band below (2026-10-11 Task 6, at the owner's direction): both stay.
      */}
      <div className="mt-8 flex justify-center lg:mt-0 lg:justify-end">
        <div className="w-full max-w-[380px] rounded-[2.5rem] border-[10px] border-ink bg-ink">
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
      ── Hero photograph ─────────────────────────────────────────────────────────
      public/hero.jpg is a free stock photo from Unsplash by TJ Dragotta (Unsplash License),
      NOT a photo taken by the team; it is credited at the bottom of the About page. It is
      2500x1666, landscape. On phones it is shown whole, uncropped, at full width. From sm up it
      is cropped to a 16:7 frame, and object-position keeps the basketball (spanning roughly
      30-78% of the way down the photo, centred horizontally) in view.
    */}
    <Section tone="canvas" compact className="!pt-0">
      <div className="overflow-hidden rounded-xs bg-surface">
        <Image
          src="/hero.jpg"
          alt="A basketball resting on a wet outdoor court, with a hoop and bare trees blurred behind it."
          width={2500}
          height={1666}
          sizes="(min-width: 1024px) 916px, 100vw"
          className="h-auto w-full sm:aspect-[16/7] sm:object-cover sm:object-[50%_55%]"
          priority
        />
      </div>
    </Section>
    </>
  );
}
