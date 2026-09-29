// components/ui.tsx
//
// Small, boring, shared building blocks. Deliberately plain: no clever abstractions, no
// component library, no variants engine. Each one is a function that returns markup with our
// design-system classes baked in, so every screen looks the same without re-typing Tailwind.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE RULES THESE COMPONENTS ENFORCE — see app/globals.css for the reasoning
// ═════════════════════════════════════════════════════════════════════════════════════
//   • The reading palette is Apple's, exactly seven colours plus flag. Anything else fails
//     the build.
//   • RED IS NOT AVAILABLE HERE. It means "flagged" and lives only on the results screen.
//     A warning, an error and a destructive action all use a heavy ink panel instead, which
//     on a white page is at least as loud and costs the accent nothing.
//   • Reading-screen buttons are pill-shaped and at least 44px tall. Instrument buttons keep
//     their own rounded-rectangle shape and 56px floor — see the tap-target comment below.
//
// None of these use React hooks, so they drop into a server or client component either way.

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/* ────────────────────────────────────────────────────────────────────────────────────
   Layout — the reading surface
   ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The standard reading-screen wrapper: capped at 980px, left-aligned content, comfortable
 * padding. Replaces the old centred 896px ("max-w-4xl") shell — see CLAUDE.md's spec for the
 * exact number.
 *
 * `animate` (default true) fades the content in with a slight rise on load — see the
 * `.animate-enter` rule in app/globals.css for the exact timing. The ONE place that passes
 * `animate={false}` is the results screen's flagged verdict: CLAUDE.md's brief for this pass
 * says a safety verdict must appear immediately, with no delay or animation, so that screen
 * opts out rather than the default silently growing an exception into every screen.
 */
export function PageShell({
  children,
  className = '',
  animate = true,
}: {
  children: ReactNode;
  className?: string;
  animate?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[980px] px-4 py-8 sm:px-8 sm:py-12 ${animate ? 'animate-enter' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A full-width background band with 980px-capped, left-aligned content inside it —
 * Apple's own way of separating sections: alternating canvas/surface bands, never a
 * floating box. Use on pages that have more than one distinct section (the home page);
 * a single-section screen can use PageShell directly and skip this.
 *
 * `animate` (default true) is the same on-load fade-and-rise as PageShell — see the note
 * there. It is a separate prop from the scroll-triggered reveal in components/reveal.tsx:
 * this one plays once when the section first paints, the other plays once when a section
 * below the fold scrolls into view. A section should use exactly one of the two, never both.
 */
export function Section({
  tone = 'canvas',
  divider = false,
  animate = true,
  children,
  className = '',
  ...rest
}: {
  tone?: 'canvas' | 'surface';
  /** A full-width hairline along the top edge, for two adjacent bands of the same tone. */
  divider?: boolean;
  animate?: boolean;
  children: ReactNode;
  className?: string;
} & ComponentProps<'div'>) {
  return (
    <div
      className={`${tone === 'surface' ? 'bg-surface' : 'bg-canvas'} ${divider ? 'border-t border-hairline' : ''}`}
      {...rest}
    >
      <div
        className={`mx-auto w-full max-w-[980px] px-4 py-16 sm:px-8 sm:py-24 ${animate ? 'animate-enter' : ''} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Page title, optional supporting line, and an optional "back" link above it.
 *
 * `title` takes a ReactNode rather than a plain string so a page can mix weights in one
 * heading — a bold phrase followed by a regular-weight continuation.
 *
 * `eyebrow` is the small label above the title. Sentence case, semibold, in the secondary
 * text colour — NOT all-caps, NOT letter-spaced. See CLAUDE.md's typography spec: an
 * eyebrow like "Sideline concussion screening aid" is small print, not a shouted kicker.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-8">
      {backHref && (
        <Link
          href={backHref}
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-meta font-semibold text-ink-secondary hover:text-link"
        >
          <span aria-hidden="true">←</span> {backLabel ?? 'Back'}
        </Link>
      )}
      {eyebrow && <p className="mb-2 text-meta font-semibold text-ink-secondary">{eyebrow}</p>}
      <h1 className="text-display font-semibold leading-[1.1] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {subtitle && <p className="mt-3 max-w-2xl text-body text-ink-secondary">{subtitle}</p>}
    </header>
  );
}

/**
 * A small sentence-case label in the secondary text colour. For a section heading that
 * wants the same small-print treatment as PageHeader's `eyebrow` but sits inside the body
 * of a page rather than at its top — e.g. "How it works", "The tests".
 */
export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-meta font-semibold text-ink-secondary">{children}</p>;
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Actions
   ──────────────────────────────────────────────────────────────────────────────────── */

const buttonBase =
  'inline-flex items-center justify-center gap-2 text-center text-body font-semibold ' +
  'leading-tight transition disabled:cursor-not-allowed disabled:opacity-40';

const buttonVariants = {
  /**
   * Primary action on a reading screen. Pill-shaped, #0071e3 fill, white text. 44px is
   * the reading-screen tap-target floor (see CLAUDE.md) — smaller than the instrument
   * floor below because a reading screen is tapped once, calmly, not repeatedly under
   * time pressure.
   *
   * `active:` classes are the reading-screen press feedback from CLAUDE.md's motion pass:
   * a quick opacity dip plus a slight scale down, ~150ms (buttonBase's `transition` covers
   * both colour and transform, so widening it here is not needed). Reading screens only —
   * see the note on `instrument` below for why the two instrument variants do not get this.
   */
  primary: 'min-h-11 rounded-full bg-action px-6 py-2 text-canvas hover:opacity-90 active:scale-[0.98] active:opacity-80 duration-150',
  /** Secondary action on a reading screen. Transparent, 1px #0071e3 border and text. */
  secondary:
    'min-h-11 rounded-full border border-action bg-transparent px-6 py-2 text-action hover:bg-surface active:scale-[0.98] active:bg-surface/80 duration-150',
  /**
   * Primary action on a dark instrument screen. Unchanged shape and size from before this
   * pass — 56px tall, rounded rectangle — because a test screen is pressed one-handed, in a
   * hurry, on a sideline, and a mis-hit there is recorded as an answer. Only the colours
   * moved (see app/globals.css); this class name and its geometry did not.
   *
   * DELIBERATELY NO PRESS ANIMATION. CLAUDE.md's motion brief is explicit that nothing may
   * animate on the six test modules — this button variant is used there (and on the tool
   * pages that share the instrument look), so it gets none of the `active:` scale/opacity
   * classes the reading-screen variants above carry.
   */
  instrument: 'min-h-14 rounded-xl px-6 py-4 bg-instrument-ink text-instrument hover:bg-instrument-ink-soft',
  /** Secondary action on a dark instrument screen. Same geometry and no-motion note as above. */
  'instrument-quiet':
    'min-h-14 rounded-xl px-6 py-4 border-2 border-instrument-ink-soft bg-instrument-panel text-instrument-ink hover:border-instrument-ink',
} as const;

type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/** Same look as Button, but navigates. Used when the action is "go somewhere". */
export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Messaging
   ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A callout for disclaimers, refusals, warnings and errors.
 *
 * TONES, and note what is NOT here:
 *   'neutral' — a hairline-outlined panel. Context you should read.
 *   'loud'    — a solid ink panel with reversed type. Something is wrong, or switched off,
 *               or refused. On a white page this is the most dominant object available.
 *
 * There is no 'success' tone, because this app has no success state to communicate. And
 * there is no red tone, because red means "flagged" and belongs to the results screen
 * alone. A loud ink panel does the job of a warning without spending the accent.
 */
export function Notice({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'loud';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border border-hairline bg-canvas text-ink',
    loud: 'border border-ink bg-ink text-canvas',
  } as const;

  return (
    <div className={`rounded-lg p-4 ${tones[tone]}`}>
      {title && <p className="mb-2 text-title font-semibold">{title}</p>}
      <div className="text-body">{children}</div>
    </div>
  );
}

/**
 * The placeholder-threshold disclaimer.
 *
 * Its own component so the exact wording lives in ONE place and every screen showing a
 * comparison shows the identical caveat. Required by the no-fabricated-content rule: our
 * thresholds are guesses, and we always say so.
 */
export function ThresholdDisclaimer() {
  return (
    <Notice title="About these thresholds">
      The cut-offs used to decide what counts as a meaningful change are{' '}
      <strong>placeholder values chosen by the students who built this app</strong>. They are
      not clinically validated and have not been reviewed by a medical professional. Treat
      this screen as a prompt to get a real evaluation, never as a measurement you can rely
      on.
    </Notice>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Instrument screens (the six test modules)
   ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Full-bleed dark wrapper for a test screen.
 *
 * UNCHANGED BY THIS PASS except for the colours the `instrument` tokens now resolve to
 * (see app/globals.css) — the six test modules keep their dark instrument treatment, and
 * every class name and every pixel of geometry here is exactly what it was before.
 *
 * The `instrument` class re-colours the keyboard focus ring to near-white (see globals.css)
 * so it stays visible against near-black.
 */
export function InstrumentShell({ children }: { children: ReactNode }) {
  return (
    <div className="instrument flex flex-1 flex-col bg-instrument text-instrument-ink">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}

/**
 * The header of a test screen: where you are in the battery, what this test is called, and
 * ONE line telling you what to do.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════
 * WHY THE INSTRUCTION IS ONE LINE AND NOT A PARAGRAPH
 * ═════════════════════════════════════════════════════════════════════════════════════
 * The person reading it has possibly just been hit in the head, is standing up, holding the
 * phone in one hand, and wants this over with. Three paragraphs of explanation do not get
 * read — they get skipped, which is worse than not writing them, because the one sentence
 * that mattered was buried in the middle of them.
 *
 * So each module gets exactly one sentence. If a rule cannot fit in that sentence, it is
 * either not important enough to be on this screen or it belongs on the screen where it
 * actually applies.
 */
export function InstrumentHeader({
  title,
  step,
  instruction,
  children,
}: {
  title: string;
  /** Position in the battery, e.g. "Step 5 of 6". Always shown — see BatteryPosition. */
  step?: string;
  /** ONE line. Not a paragraph. */
  instruction?: ReactNode;
  children?: ReactNode;
}) {
  /*
   * THE PROGRESS BAR — CLAUDE.md Task 7.
   *
   * Battery position used to be text only ("Step 5 of 6"). This parses that same string back
   * into numbers so a thin bar can sit under it, rather than widening the `step` prop into a
   * {current, total} shape and touching all six call sites that pass it — see lib/session.ts's
   * stepPosition, which is the only place this string is built.
   *
   * WHY IT CANNOT ANIMATE OR APPEAR MID-TIMING (both required by the brief): this header is
   * rendered once when a module page mounts and `step` does not change again until the athlete
   * navigates to the NEXT module (a fresh mount, a fresh header). Nothing inside a single
   * module's run — a trial advancing, a stimulus appearing — ever changes it, so the bar has
   * nothing to animate and sits entirely above the timed regions those screens paint through
   * refs (see app/tests/gonogo/page.tsx's timing rules for why those regions avoid React
   * entirely). `aria-hidden` because the text right above it already says the same thing; a
   * screen reader does not need to hear it twice.
   */
  const stepNumbers = step?.match(/^Step (\d+) of (\d+)$/);
  const current = stepNumbers ? Number(stepNumbers[1]) : null;
  const total = stepNumbers ? Number(stepNumbers[2]) : null;

  return (
    <header className="mb-6">
      {step && (
        <>
          <p className="mb-2 text-meta font-semibold uppercase tracking-widest text-instrument-ink-soft">
            {step}
          </p>
          {current !== null && total !== null && total > 0 && (
            <div
              aria-hidden="true"
              className="mb-4 h-1 w-full overflow-hidden rounded-full bg-instrument-panel"
            >
              <div
                className="h-full rounded-full bg-instrument-ink-soft"
                style={{ width: `${(current / total) * 100}%` }}
              />
            </div>
          )}
        </>
      )}
      <h1 className="text-display font-semibold">{title}</h1>
      {instruction && <p className="mt-2 text-body text-instrument-ink-soft">{instruction}</p>}
      {children && <div className="mt-2">{children}</div>}
    </header>
  );
}

/**
 * The opening panel of a test module: the one-line instruction restated large, and a Start
 * button big enough to hit without looking.
 *
 * Everything a module used to say in three paragraphs now has to survive as one heading and
 * at most one supporting line. If it does not fit, it was not going to be read.
 */
export function ModuleIntro({
  heading,
  detail,
  actionLabel = 'Start',
  onStart,
}: {
  heading: string;
  /** At most one short line. Optional — most modules do not need it. */
  detail?: ReactNode;
  actionLabel?: string;
  onStart: () => void;
}) {
  return (
    <div className="rounded-xl border border-instrument-ink/20 bg-instrument-panel p-4 sm:p-6">
      <h2 className="text-title font-semibold">{heading}</h2>
      {detail && <p className="mt-2 text-body text-instrument-ink-soft">{detail}</p>}
      <Button variant="instrument" className="mt-6 w-full" onClick={onStart}>
        {actionLabel}
      </Button>
    </div>
  );
}

/**
 * A panel on a dark instrument screen.
 */
export function InstrumentPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-instrument-ink/20 bg-instrument-panel p-4 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
