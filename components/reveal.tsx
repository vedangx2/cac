'use client';

// components/reveal.tsx
//
// Wraps a section that sits below the fold so it fades in once, the first time it scrolls into
// view — CLAUDE.md's 2026-09-29 motion pass. Reading screens only; nothing on the six test
// modules ever uses this.
//
// WHY THIS IS A SEPARATE COMPONENT FROM Section's own `animate` prop (components/ui.tsx):
// Section's on-load fade plays once, immediately, when the page mounts — right for a section
// that is already visible (the hero). A section below the fold is already in the DOM at that
// moment even though nobody can see it yet, so playing an on-load animation on it would finish
// long before anyone scrolls down to look, and "fade in as it scrolls into view" would never be
// seen. This component instead waits for IntersectionObserver to say the section is actually on
// screen before adding the class that starts its fade. Use exactly one of the two on a given
// section, never both — see the note on Section's `animate` prop.
//
// This is the one component in this file that needs a hook (IntersectionObserver has no
// declarative/CSS-only equivalent), which is why it lives on its own rather than inside
// components/ui.tsx's collection of hook-free building blocks.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Always starts false, on the server AND on the client's first render — see the fix note
  // below for why this used to be a feature-detecting initialiser and no longer is.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver support (very old browser): show the content rather than
    // leaving it invisible forever. A missing enhancement should never hide real content.
    //
    // FIXED 2026-09-29, found live while verifying Task 6: this used to be decided in the
    // initial state — `useState(() => typeof IntersectionObserver === 'undefined')` — which
    // reads as "compute it once, avoid an extra render," but `typeof IntersectionObserver`
    // is NOT the same answer on the server and in the browser: Node has no such global at
    // all, so a server-rendered page always started `visible`, while a real browser's first
    // client render always started NOT visible. React caught the disagreement at hydration
    // and logged "A tree hydrated but some attributes... didn't match" — the exact bug this
    // component exists to avoid causing, on every single page load. Deciding it here, in an
    // effect that never runs during SSR, means server and client agree on `false` through
    // hydration and only correct it afterwards — the one extra render this trades for that is
    // the correct, standard way to handle browser feature detection in React, which is why
    // this line is exempted below rather than reworked again to avoid it.
    if (typeof IntersectionObserver === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        // "Once only, never on scroll back" — stop watching the moment it has revealed once,
        // rather than toggling visibility on every scroll in and out.
        observer.disconnect();
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}
