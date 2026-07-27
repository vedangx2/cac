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
    // 'default' keeps the iOS status bar legible against our light app chrome.
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  // The browser chrome picks up our ink colour, so an installed app looks deliberate.
  themeColor: '#0b0f12',
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
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-3 focus:font-bold focus:text-white"
        >
          Skip to main content
        </a>

        <header className="border-b border-line bg-paper">
          <nav
            aria-label="Main"
            className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8"
          >
            <Link href="/" className="font-black tracking-tight text-ink">
              Sideline&nbsp;Screen
            </Link>
            <div className="flex items-center gap-4 text-sm font-bold">
              <Link href="/athletes" className="text-ink underline underline-offset-4 hover:text-signal">
                Athletes
              </Link>
            </div>
          </nav>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        {/*
          PERSISTENT SAFETY FOOTER.
          This lives in the ROOT layout on purpose, so it renders on EVERY screen and can
          never be forgotten on an individual page. See CLAUDE.md → THE HARD RULE.
          Do not remove this or soften its wording.
        */}
        <footer className="border-t border-line bg-paper px-4 py-4 text-center text-xs leading-relaxed text-ink-soft">
          <p className="mx-auto max-w-2xl">
            Student-built screening aid — not a medical device. Always consult a medical
            professional.
          </p>
        </footer>

        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
