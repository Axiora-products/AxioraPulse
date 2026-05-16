import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.35)', marginRight: 8, position: 'relative', top: -2 }}>Axiora</span>
    <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 26, letterSpacing: '-1px', color: 'var(--cream)', lineHeight: 1 }}>Pulse</span>
    <div style={{ position: 'relative', width: 10, height: 10, background: 'var(--coral)', borderRadius: '50%', boxShadow: '0 0 14px rgba(255,69,0,0.65)', alignSelf: 'flex-start', marginTop: 5, marginLeft: 8, flexShrink: 0 }}>
      <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
    </div>
  </div>
);

const LAUNCH_DATE = new Date('2025-06-15T00:00:00Z');

function getTimeLeft() {
  const diff = LAUNCH_DATE - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

function CountUnit({ value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          fontFamily: 'Playfair Display, serif', fontWeight: 900,
          fontSize: 'clamp(36px, 6vw, 72px)', lineHeight: 1,
          color: 'var(--cream)', letterSpacing: '-2px',
        }}>
        {String(value).padStart(2, '0')}
      </motion.div>
      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.35)' }}>
        {label}
      </span>
    </div>
  );
}

export default function ComingSoon() {
  const [time, setTime] = useState(getTimeLeft());
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleNotify = (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setSubmitted(true);
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--espresso)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Background orbs ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: 700, height: 700, borderRadius: '50%',
          filter: 'blur(100px)',
          background: 'radial-gradient(circle, rgba(255,69,0,0.22) 0%, transparent 70%)',
          top: -200, left: -150,
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          filter: 'blur(100px)',
          background: 'radial-gradient(circle, rgba(255,184,0,0.14) 0%, transparent 70%)',
          bottom: -100, right: -100,
        }} />
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          filter: 'blur(80px)',
          background: 'radial-gradient(circle, rgba(255,69,0,0.1) 0%, transparent 70%)',
          top: '55%', right: '20%',
        }} />
      </div>

      {/* ── Grain overlay ── */}
      <div className="grain" style={{ opacity: 0.04 }} />

      {/* ── Watermark ── */}
      <div style={{
        position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'Playfair Display, serif', fontWeight: 900,
        fontSize: 'clamp(100px, 18vw, 240px)', color: 'transparent',
        WebkitTextStroke: '1px rgba(253,245,232,0.03)',
        letterSpacing: -8, lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>Pulse</div>

      {/* ── Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 640, width: '100%' }}>

        {/* Logo */}
        <div style={{ marginBottom: 56 }}>
          <Logo />
        </div>

        {/* Label */}
        <div style={{
          display: 'inline-block', marginBottom: 24,
          fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.28em', textTransform: 'uppercase',
          color: 'var(--coral)', opacity: 0.9,
        }}>
          Coming Soon
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'Playfair Display, serif', fontWeight: 900,
          fontSize: 'clamp(42px, 7vw, 80px)', lineHeight: 1.0,
          letterSpacing: '-2.5px', color: 'var(--cream)',
          marginBottom: 24,
        }}>
          We're almost<br />
          <em style={{ fontStyle: 'italic', color: 'var(--saffron)' }}>ready.</em>
        </h1>

        {/* Body */}
        <p style={{
          fontFamily: 'Fraunces, serif', fontWeight: 300,
          fontSize: 17, lineHeight: 1.75,
          color: 'rgba(253,245,232,0.5)',
          marginBottom: 48, maxWidth: 440, margin: '0 auto 48px',
        }}>
          Axiora Pulse is putting the finishing touches on something
          extraordinary. Drop your email and we'll tell you the moment
          the doors open.
        </p>

        {/* ── Countdown ── */}
        <div style={{
          display: 'flex', gap: 'clamp(20px, 4vw, 48px)',
          justifyContent: 'center', alignItems: 'flex-start',
          marginBottom: 52,
        }}>
          <CountUnit value={time.days} label="Days" />
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 5vw, 64px)', color: 'rgba(253,245,232,0.2)', lineHeight: 1, marginTop: 4 }}>:</div>
          <CountUnit value={time.hours} label="Hours" />
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 5vw, 64px)', color: 'rgba(253,245,232,0.2)', lineHeight: 1, marginTop: 4 }}>:</div>
          <CountUnit value={time.minutes} label="Minutes" />
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(32px, 5vw, 64px)', color: 'rgba(253,245,232,0.2)', lineHeight: 1, marginTop: 4 }}>:</div>
          <CountUnit value={time.seconds} label="Seconds" />
        </div>

        {/* ── Email capture ── */}
        {!submitted ? (
          <form onSubmit={handleNotify} style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                padding: '14px 20px', borderRadius: 999, border: '1px solid rgba(253,245,232,0.15)',
                background: 'rgba(253,245,232,0.07)', color: 'var(--cream)',
                fontFamily: 'Fraunces, serif', fontSize: 15,
                outline: 'none', width: 260, backdropFilter: 'blur(4px)',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(255,69,0,0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(253,245,232,0.15)'}
            />
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              type="submit"
              style={{
                padding: '14px 28px', borderRadius: 999,
                background: 'var(--coral)', color: 'white', border: 'none',
                fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: 'pointer', boxShadow: '0 0 28px rgba(255,69,0,0.35)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e03d00'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--coral)'}
            >
              Notify me
            </motion.button>
          </form>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 28px', borderRadius: 999,
              background: 'rgba(255,69,0,0.1)', border: '1px solid rgba(255,69,0,0.3)',
              fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--coral)',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            You're on the list
          </motion.div>
        )}

        {/* ── Divider ── */}
        <div style={{ margin: '40px auto 0', width: 40, height: 1, background: 'rgba(253,245,232,0.1)' }} />

        {/* ── Footer note ── */}
        <p style={{
          marginTop: 24,
          fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(253,245,232,0.2)',
        }}>
          Axiora &nbsp;·&nbsp; Smarter surveys, sharper insights
        </p>
      </motion.div>
    </div>
  );
}
