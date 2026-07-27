'use client';

// components/service-worker.tsx
//
// Registers the service worker that makes the app installable and usable offline.
//
// It renders nothing — it exists purely for the side effect. It sits in the root layout so
// registration happens once, on whatever page the user happens to land on first.
//
// Registration is skipped in development on purpose: a service worker aggressively serving
// cached assets while you're editing code is a genuinely maddening way to lose an afternoon.

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Registering after `load` keeps the service worker from competing for bandwidth with
    // the page the user is actually waiting for.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is a bonus, not a requirement. If registration fails (unsupported
        // browser, private window, blocked by policy) the app still works normally, so there
        // is nothing worth interrupting the user about.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
