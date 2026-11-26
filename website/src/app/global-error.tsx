'use client';

/**
 * Last-resort boundary: replaces the ROOT layout when it fails, so it must render its own <html>/<body>
 * and can't rely on providers, antd or Tailwind fonts. Plain inline styles in the site's colors.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAFAF8',
          color: '#0A0A0A',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: 16,
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid #E7E7E2',
            borderRadius: 24,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 15, color: '#66665E', margin: '0 0 24px', lineHeight: 1.5 }}>
            Influverse couldn&apos;t load. Please try again in a moment.
          </p>
          {error.digest && <p style={{ fontSize: 12, color: '#66665E', margin: '0 0 16px' }}>Ref: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{
              height: 44,
              padding: '0 24px',
              borderRadius: 9999,
              border: 'none',
              background: '#0A0A0A',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
