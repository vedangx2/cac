// components/ui.tsx
//
// Small, boring, shared building blocks. Deliberately plain: no clever abstractions, no
// component library, no variants engine. Each one is a function that returns markup with our
// design-system classes baked in, so every screen looks the same without re-typing Tailwind.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// THE RULES THESE COMPONENTS ENFORCE — see app/globals.css for the reasoning
// ═════════════════════════════════════════════════════════════════════════════════════
//   • TEN colours exist. Anything else fails the build.
//   • FIVE type sizes exist: stimulus, display, title, body, meta. Same.
//   • Spacing comes from 4/8/12/16/24/32/48/64 only (Tailwind steps 1/2/3/4/6/8/12/16).
//   • RED IS NOT AVAILABLE HERE. It means "flagged" and lives only on the results screen.
//     A warning, an error and a destructive action all use a heavy ink panel instead, which
//     on a white page is at least as loud and costs the accent nothing.
//   • Every interactive control is at least 56px tall, because this gets pressed on a
//     sideline, one-handed, by somebody in a hurry.
//
// None of these use React hooks, so they drop into a server or client component either way.

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/* ────────────────────────────────────────────────────────────────────────────────────
   Layout — the document surface
   ──────────────────────────────────────────────────────────────────────────────────── */

/** The standard light "document" page wrapper: centred, capped width, comfortable padding. */
export function PageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  /** Extra classes on the wrapper. Added 2026-09-20 so the results screen alone can apply its
   * own reading typeface (see the two-typeface classes in app/globals.css) without every other
   * screen that uses this shell picking them up too. */
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-12 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Page title, optional supporting line, and an optional "back" link above it.
 *
 * `title` takes a ReactNode rather than a plain string (added 2026-09-22, task 4) so a
 * page can mix weights in one heading — a bold phrase followed by a regular-weight
 * continuation — instead of one uniform black slab. A plain string still works exactly
 * as before; nothing that already calls this changes.
 *
 * `eyebrow` (added 2026-09-22) is the small tracked label above the title — a section
 * kicker, in `clinic`, the one decorative accent the reading-screen redesign added. It is
 * always small print, never a verdict, and it is the only place on these screens `clinic`
 * is allowed to carry text — see the comment above --color-clinic in globals.css.
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
          className="mb-4 inline-flex min-h-14 items-center gap-2 text-meta font-bold text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          <span aria-hidden="true">←</span> {backLabel ?? 'Back'}
        </Link>
      )}
      {eyebrow && (
        <p className="mb-2 text-meta font-bold uppercase tracking-widest text-clinic">{eyebrow}</p>
      )}
      <h1 className="text-display font-black text-ink">{title}</h1>
      {subtitle && <p className="mt-3 max-w-2xl text-body text-ink-soft">{subtitle}</p>}
    </header>
  );
}

/** A white panel on the light grey page background. The basic content container. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink/15 bg-paper p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

/**
 * A small tracked label in `clinic`, the reading screens' one decorative accent. Added
 * 2026-09-22 (task 4) for section headings that want the same kicker treatment as
 * PageHeader's `eyebrow` prop but sit inside the body of a page rather than at its top —
 * e.g. "How it works", "The tests". Never a verdict, never anything about anyone's
 * health — see the comment above --color-clinic in globals.css.
 */
export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-meta font-bold uppercase tracking-widest text-clinic">{children}</p>;
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Actions
   ──────────────────────────────────────────────────────────────────────────────────── */

// min-h-14 is 56px. That number comes from the tap-target rule rather than the spacing
// scale: on a sideline, one-handed, in a hurry, a control smaller than this gets mis-hit,
// and on a test screen a mis-hit is recorded as a wrong answer.
const buttonBase =
  'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-6 py-4 text-center ' +
  'text-body font-bold leading-tight transition-colors disabled:cursor-not-allowed ' +
  'disabled:opacity-40';

const buttonVariants = {
  /** Primary action on a light document screen. Ink, not an accent — red is not for buttons. */
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  /** Secondary action on a light screen. */
  secondary: 'border-2 border-ink bg-paper text-ink hover:bg-surface',
  /** Primary action on a dark instrument screen. */
  instrument: 'bg-instrument-ink text-instrument hover:bg-instrument-ink-soft',
  /** Secondary action on a dark instrument screen. */
  'instrument-quiet':
    'border-2 border-instrument-ink-soft bg-instrument-panel text-instrument-ink hover:border-instrument-ink',
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
 *   'neutral' — an outlined panel. Context you should read.
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
    neutral: 'border-2 border-ink/30 bg-paper text-ink',
    loud: 'border-2 border-ink bg-ink text-paper',
  } as const;

  return (
    <div className={`rounded-xl p-4 ${tones[tone]}`}>
      {title && <p className="mb-2 text-title font-black">{title}</p>}
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
 * The `instrument` class re-colours the keyboard focus ring to near-white (see globals.css)
 * so it stays visible against near-black.
 */
export function InstrumentShell({ children }: { children: ReactNode }) {
  /*
    `flex-1` rather than a min-height calculation. The old version guessed at the height of the
    chrome with an arbitrary calc(), and when a module's content was short — the digit-span
    instruction screen, say — the page background showed through as a pale band between the
    dark screen and the dark footer. On an instrument screen the brightest thing on the display
    has to be the stimulus, and a stripe of light grey is not it.
  */
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
  return (
    <header className="mb-6">
      {step && (
        <p className="mb-2 text-meta font-bold uppercase tracking-widest text-instrument-ink-soft">
          {step}
        </p>
      )}
      <h1 className="text-display font-black">{title}</h1>
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
      <h2 className="text-title font-bold">{heading}</h2>
      {detail && <p className="mt-2 text-body text-instrument-ink-soft">{detail}</p>}
      <Button variant="instrument" className="mt-6 w-full" onClick={onStart}>
        {actionLabel}
      </Button>
    </div>
  );
}

/**
 * A panel on a dark instrument screen. The dark counterpart of Card.
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
