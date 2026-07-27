import type { MetadataRoute } from 'next';

// The PWA manifest, which is what lets a phone install this to a home screen and run it like
// an app (no browser address bar). Next.js serves this file at /manifest.webmanifest.
//
// Written as TypeScript rather than a static .json file so the fields are type-checked — a
// typo'd key in a hand-written manifest fails silently and the install prompt just never
// appears, which is a miserable thing to debug.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sideline Concussion Screen',
    // Home screens have very little room — this is what shows under the icon.
    short_name: 'Sideline Screen',
    description:
      "A screening aid that compares an athlete's test scores against their own healthy baseline and refers them to a medical professional. Not a medical device.",
    start_url: '/',
    display: 'standalone',
    background_color: '#f1f3f4',
    theme_color: '#0b0f12',
    orientation: 'portrait',
    categories: ['health', 'sports', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable icon is drawn with padding so Android can crop it to a circle, a squircle
      // or a rounded square without slicing the mark.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Athletes',
        short_name: 'Athletes',
        description: 'Open the roster to record a baseline or run a sideline check',
        url: '/athletes',
      },
    ],
  };
}
