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

  // No IntersectionObserver support (very old browser): start already visible rather than
  // leaving the content invisible forever. A missing enhancement should never hide real
  // content. Computed once, in the initial state, rather than set from inside the effect below
  // — calling setState synchronously in an effect body triggers a needless second render.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const node = ref.current;
    // Nothing to observe: either the ref isn't attached yet, or this browser has no
    // IntersectionObserver and `visible` already started true (see the initialiser above).
    if (!node || typeof IntersectionObserver === 'undefined') return;

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
