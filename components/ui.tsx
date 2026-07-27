// components/ui.tsx
//
// Small, boring, shared building blocks. Deliberately plain: no clever abstractions, no
// component library, no variants-engine. Each one is a function that returns some markup
// with our design-system classes baked in, so every screen looks the same without us
// re-typing the same Tailwind strings everywhere.
//
// None of these use React hooks, which means they can be dropped into either a server
// component or a client component without any ceremony.

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/* ────────────────────────────────────────────────────────────────────────────────────
   Layout
   ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * The standard light "document" page wrapper: centered, capped width, comfortable padding.
 *
 * `max-w-5xl` is the web-first choice — on a laptop the content uses a real page width
 * instead of a phone-sized ribbon — while the padding steps down on small screens so a
 * phone still gets edge-to-edge usable space.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10 lg:py-14">{children}</div>;
}

/** Page title, optional supporting line, and an optional "back" link above it. */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
}: {
  title: string;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-8">
      {backHref && (
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          <span aria-hidden="true">←</span> {backLabel ?? 'Back'}
        </Link>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">{subtitle}</p>}
    </header>
  );
}

/** A white panel on the light grey page background. The basic content container. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-paper p-5 sm:p-6 ${className}`}>{children}</div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Actions
   ──────────────────────────────────────────────────────────────────────────────────── */

// Shared button shape. min-h-14 (56px) comfortably clears the ~44px accessible minimum tap
// target, because this gets pressed on a sideline by someone in a hurry.
const buttonBase =
  'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-6 text-center ' +
  'text-base font-bold leading-tight transition-colors disabled:cursor-not-allowed ' +
  'disabled:opacity-40 sm:text-lg';

const buttonVariants = {
  /** Primary action. */
  signal: 'bg-signal text-white hover:bg-signal-deep',
  /** Secondary action. */
  neutral: 'border-2 border-line-strong bg-paper text-ink hover:bg-surface',
  /** Destructive / serious. Used sparingly — see the design note in globals.css. */
  flag: 'bg-flag text-white hover:bg-flag-deep',
  /** Used on the dark instrument screens. */
  instrument: 'border-2 border-instrument-line bg-instrument-panel text-instrument-ink hover:border-instrument-ink-soft',
} as const;

type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = 'signal',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/** Same look as Button, but navigates. Used when the action is "go somewhere". */
export function ButtonLink({
  variant = 'signal',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

/* ────────────────────────────────────────────────────────────────────────────────────
   Messaging
   ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * A bordered callout for disclaimers, placeholder warnings, and error messages.
 *
 * Note the tones available: 'neutral' and 'flag'. There is intentionally no 'success' tone,
 * because this app has no success state to communicate. See CLAUDE.md → THE HARD RULE.
 */
export function Notice({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'flag';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-line-strong bg-paper text-ink',
    flag: 'border-flag bg-flag/5 text-ink',
  } as const;

  return (
    <div className={`rounded-lg border-l-4 border-y border-r ${tones[tone]} p-4`}>
      {title && <p className="mb-1 font-bold">{title}</p>}
      <div className="text-sm leading-relaxed sm:text-base">{children}</div>
    </div>
  );
}

/**
 * The placeholder-threshold disclaimer.
 *
 * This is its own component so the exact wording lives in ONE place and every screen that
 * shows a comparison shows the identical caveat. Required by the no-fabricated-content rule:
 * our thresholds are guesses, and we always say so.
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
   Instrument screens (the dark test surfaces)
   ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Full-bleed dark wrapper for the test screens.
 *
 * The `instrument` class is what re-colors the keyboard focus ring to white (see
 * globals.css) so it stays visible against near-black.
 */
export function InstrumentShell({ children }: { children: ReactNode }) {
  return (
    <div className="instrument min-h-[calc(100vh-8rem)] bg-instrument text-instrument-ink">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">{children}</div>
    </div>
  );
}

/** Header for a test screen: which test, which step, and who it's for. */
export function InstrumentHeader({
  title,
  step,
  children,
}: {
  title: string;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {step && (
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-instrument-ink-soft">{step}</p>
      )}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {children && <div className="mt-3 text-base leading-relaxed text-instrument-ink-soft">{children}</div>}
    </header>
  );
}
