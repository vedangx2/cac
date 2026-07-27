'use client';

// app/global-error.tsx
//
// The last-resort screen, shown only if something crashes so badly that even the root layout
// can't render.
//
// WHY THIS FILE EXISTS: Next renders this in place of the root layout, which means it does
// NOT inherit our persistent safety footer. Without this file, a crash would produce the one
// screen in the entire app with no "not a medical device" disclaimer on it. CLAUDE.md says
// that footer appears on every screen, so it is re-stated here by hand.
//
// Everything is written with inline styles rather than Tailwind classes on purpose. If the
// app has broken badly enough to land here, we cannot assume the stylesheet loaded — and the
// disclaimer has to be readable no matter what else has gone wrong.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#f1f3f4',
          color: '#0b0f12',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <main style={{ flex: 1, margin: '0 auto', maxWidth: '40rem', padding: '3rem 1.25rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '1.125rem', lineHeight: 1.6, marginTop: '1rem' }}>
            The app hit an unexpected error. Any athletes and results you had already saved are
            still stored on this device — this did not delete anything.
          </p>

          <div
            style={{
              border: '3px solid #ce1126',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginTop: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.6 }}>
              If you were in the middle of checking an athlete after a possible head impact, do
              not wait for this app. Have them evaluated by a medical professional now.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              minHeight: '3.5rem',
              padding: '0 1.5rem',
              borderRadius: '0.75rem',
              border: 'none',
              backgroundColor: '#0b5fff',
              color: '#ffffff',
              fontSize: '1.125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>

        {/* The persistent safety footer, restated because this screen bypasses the layout. */}
        <footer
          style={{
            borderTop: '1px solid #ccd4d9',
            backgroundColor: '#ffffff',
            padding: '1rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            lineHeight: 1.6,
            color: '#4b565d',
          }}
        >
          Student-built screening aid — not a medical device. Always consult a medical
          professional.
        </footer>
      </body>
    </html>
  );
}
