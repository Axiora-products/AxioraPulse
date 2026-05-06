import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Axiora ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--cream)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          {/* Large decorative number */}
          <div style={{
            fontFamily: 'Playfair Display, serif',
            fontWeight: 900,
            fontSize: 'clamp(80px,15vw,140px)',
            color: 'rgba(22,15,8,0.05)',
            letterSpacing: -8,
            lineHeight: 1,
            marginBottom: 8,
            userSelect: 'none',
          }}>
            Oops
          </div>

          <h1 style={{
            fontFamily: 'Playfair Display, serif',
            fontWeight: 700,
            fontSize: 'clamp(24px,4vw,32px)',
            letterSpacing: '-1px',
            color: 'var(--espresso)',
            margin: '0 0 16px',
          }}>
            Something went wrong
          </h1>

          <p style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 300,
            fontSize: 16,
            color: 'rgba(22,15,8,0.5)',
            lineHeight: 1.7,
            margin: '0 0 32px',
          }}>
            An unexpected error occurred. Your work may have been auto-saved.
            <br />Refresh the page to continue.
          </p>

          {/* Error detail (dev-mode helpful, collapsible) */}
          <details style={{ marginBottom: 32, textAlign: 'left' }}>
            <summary style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(22,15,8,0.35)',
              cursor: 'pointer',
              marginBottom: 8,
            }}>
              Error details
            </summary>
            <pre style={{
              fontFamily: 'monospace',
              fontSize: 12,
              color: 'var(--terracotta)',
              background: 'rgba(214,59,31,0.05)',
              border: '1px solid rgba(214,59,31,0.15)',
              borderRadius: 12,
              padding: 16,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}>
              {this.state.error?.toString()}
            </pre>
          </details>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--espresso)',
                color: 'var(--cream)',
                fontFamily: 'Syne, sans-serif',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '14px 28px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.25s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}
            >
              ↺ Refresh page
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--cream-deep)',
                color: 'rgba(22,15,8,0.6)',
                fontFamily: 'Syne, sans-serif',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '14px 28px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,15,8,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--cream-deep)'}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
