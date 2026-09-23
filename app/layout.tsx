import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/service-worker';

export const metadata: Metadata = {
  title: 'Sideline Concussion Screen',
  description:
    "A free, on-device screening aid that compares an athlete's post-hit test scores to " +
    'their own healthy baseline and refers them to a medical professional. Not a medical device.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Sideline Screen',
    // The app chrome is near-black on every screen now, so the iOS status bar matches it.
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  // The browser chrome picks up our ink colour, so an installed app looks deliberate.
  themeColor: '#080b0d',
  // viewportFit: 'cover' lets the layout reach into the safe areas on notched phones.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-surface text-ink antialiased">
        {/*
          ACCESSIBILITY: a skip link is the first thing in the tab order, so a keyboard user
          can jump straight past the navigation instead of tabbing through it on every page.
          It stays off-screen until it receives focus.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-canvas focus:px-4 focus:py-4 focus:font-bold focus:text-ink"
        >
          Skip to main content
        </a>

        {/*
          THE CHROME IS DARK ON EVERY SCREEN, and that is a deliberate change.

          It used to be a white bar. On the six test screens — which are near-black so that the
          stimulus is the only bright thing your eye can land on — a white bar across the top was
          the brightest object on the display, sitting directly above the thing the athlete is
          supposed to be watching. Making the chrome dark everywhere costs the document screens
          nothing (a dark band top and bottom frames the white page) and gives the instrument
          screens the one property they need.
        */}
        <header className="bg-instrument text-instrument-ink">
          <nav
            aria-label="Main"
            className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-8"
          >
            <Link
              href="/"
              className="inline-flex min-h-14 items-center text-meta font-black uppercase tracking-widest"
            >
              Sideline&nbsp;Screen
            </Link>
            <Link
              href="/athletes"
              className="inline-flex min-h-14 items-center text-meta font-bold underline underline-offset-4"
            >
              Athletes
            </Link>
          </nav>
        </header>

        {/* A flex column so a full-bleed instrument screen can stretch to fill it. */}
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>

        {/*
          PERSISTENT SAFETY FOOTER.
          This lives in the ROOT layout on purpose, so it renders on EVERY screen and can
          never be forgotten on an individual page. See CLAUDE.md → THE HARD RULE.
          Do not remove this or soften its wording.
        */}
        <footer className="bg-instrument px-4 py-4 text-center text-meta text-instrument-ink-soft">
          <p className="mx-auto max-w-2xl">
            Student-built screening aid. Not a medical device. Always consult a medical
            professional.
          </p>
        </footer>

        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
