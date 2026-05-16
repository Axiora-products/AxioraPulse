import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api/axios';

// ── Launch target ─────────────────────────────────────────────────────────────
const LAUNCH_DATE = new Date('2026-07-01T00:00:00Z');

function getTimeLeft() {
  const diff = LAUNCH_DATE - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

// ── Floating particles ────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2.5 + 1,
  dur: Math.random() * 14 + 10,
  delay: Math.random() * -20,
  dx: (Math.random() - 0.5) * 6,
  dy: (Math.random() - 0.5) * 6,
}));

function Particles() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {PARTICLES.map(p => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: p.id % 3 === 0 ? 'rgba(255,184,0,0.5)' : 'rgba(255,69,0,0.4)',
          }}
          animate={{
            x: [0, p.dx * 30, p.dx * -20, 0],
            y: [0, p.dy * 20, p.dy * 40, 0],
            opacity: [0, 0.7, 0.4, 0],
            scale: [0, 1, 0.8, 0],
          }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Big background sonar rings ────────────────────────────────────────────────
function SonarBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {[1, 2, 3, 4].map(i => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: i * 220, height: i * 220,
            borderRadius: '50%',
            border: '1px solid rgba(255,69,0,0.12)',
          }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.15, 0.5] }}
          transition={{ duration: 4, delay: i * 0.9, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <motion.div
        style={{
          position: 'absolute',
          width: 32, height: 32,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,69,0,0.25) 0%, transparent 70%)',
        }}
        animate={{ scale: [1, 3.5, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────
const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.35)', marginRight: 8, position: 'relative', top: -2 }}>Axiora</span>
    <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 26, letterSpacing: '-1px', color: 'var(--cream)', lineHeight: 1 }}>Pulse</span>
    <div style={{ position: 'relative', width: 10, height: 10, background: 'var(--coral)', borderRadius: '50%', boxShadow: '0 0 14px rgba(255,69,0,0.65)', alignSelf: 'flex-start', marginTop: 5, marginLeft: 8, flexShrink: 0 }}>
      <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
    </div>
  </div>
);

// ── Countdown digit with flip animation ───────────────────────────────────────
function CountUnit({ value, label }) {
  const prev = useRef(value);
  const flipping = prev.current !== value;
  useEffect(() => { prev.current = value; }, [value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', minWidth: 'clamp(52px, 8vw, 90px)', height: 'clamp(60px, 10vw, 100px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Card background */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(253,245,232,0.04)',
          border: '1px solid rgba(253,245,232,0.08)',
          borderRadius: 12,
          backdropFilter: 'blur(8px)',
        }} />
        <AnimatePresence mode="popLayout">
          <motion.div
            key={value}
            initial={{ y: -28, opacity: 0, rotateX: -40 }}
            animate={{ y: 0, opacity: 1, rotateX: 0 }}
            exit={{ y: 28, opacity: 0, rotateX: 40 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'Playfair Display, serif', fontWeight: 900,
              fontSize: 'clamp(30px, 5.5vw, 64px)', lineHeight: 1,
              color: 'var(--cream)', letterSpacing: '-2px',
              position: 'relative',
            }}>
            {String(value).padStart(2, '0')}
          </motion.div>
        </AnimatePresence>
      </div>
      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.3)' }}>
        {label}
      </span>
    </div>
  );
}

const Sep = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 26, paddingTop: 8 }}>
    <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }}
      style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(253,245,232,0.25)' }} />
    <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity }}
      style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(253,245,232,0.25)' }} />
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ComingSoon() {
  const [time, setTime] = useState(getTimeLeft());
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleNotify = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setStatus('loading');
    try {
      await API.post('/public/waitlist', { email });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--espresso)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Background layers ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', filter: 'blur(120px)', background: 'radial-gradient(circle, rgba(255,69,0,0.18) 0%, transparent 70%)', top: -200, left: -150 }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', filter: 'blur(100px)', background: 'radial-gradient(circle, rgba(255,184,0,0.12) 0%, transparent 70%)', bottom: -100, right: -100 }} />
      </div>

      <SonarBackground />
      <Particles />
      <div className="grain" style={{ opacity: 0.04 }} />

      {/* Watermark */}
      <div style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)', fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(100px, 18vw, 240px)', color: 'transparent', WebkitTextStroke: '1px rgba(253,245,232,0.03)', letterSpacing: -8, lineHeight: 1, userSelect: 'none', pointerEvents: 'none', whiteSpace: 'nowrap' }}>Pulse</div>

      {/* ── Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 660, width: '100%' }}>

        {/* Logo */}
        <div style={{ marginBottom: 52 }}><Logo /></div>

        {/* Label */}
        <motion.div
          initial={{ opacity: 0, letterSpacing: '0.5em' }}
          animate={{ opacity: 0.9, letterSpacing: '0.28em' }}
          transition={{ duration: 1.2, delay: 0.2 }}
          style={{ display: 'inline-block', marginBottom: 20, fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--coral)' }}>
          Coming Soon
        </motion.div>

        {/* Headline */}
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(42px, 7vw, 80px)', lineHeight: 1.0, letterSpacing: '-2.5px', color: 'var(--cream)', marginBottom: 20 }}>
          We're almost<br />
          <em style={{ fontStyle: 'italic', color: 'var(--saffron)' }}>ready.</em>
        </h1>

        {/* Body */}
        <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 17, lineHeight: 1.75, color: 'rgba(253,245,232,0.5)', margin: '0 auto 48px', maxWidth: 440 }}>
          Axiora Pulse is putting the finishing touches on something
          extraordinary. Drop your email and we'll tell you the moment
          the doors open.
        </p>

        {/* ── Countdown ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{ display: 'flex', gap: 'clamp(12px, 3vw, 32px)', justifyContent: 'center', alignItems: 'flex-start', marginBottom: 52 }}>
          <CountUnit value={time.days}    label="Days" />
          <Sep />
          <CountUnit value={time.hours}   label="Hours" />
          <Sep />
          <CountUnit value={time.minutes} label="Minutes" />
          <Sep />
          <CountUnit value={time.seconds} label="Seconds" />
        </motion.div>

        {/* ── Email capture ── */}
        <AnimatePresence mode="wait">
          {status === 'done' ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderRadius: 999, background: 'rgba(255,69,0,0.1)', border: '1px solid rgba(255,69,0,0.3)', fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--coral)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              You're on the list — check your email!
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleNotify} style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{ padding: '14px 20px', borderRadius: 999, border: '1px solid rgba(253,245,232,0.15)', background: 'rgba(253,245,232,0.07)', color: 'var(--cream)', fontFamily: 'Fraunces, serif', fontSize: 15, outline: 'none', width: 260, backdropFilter: 'blur(4px)', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = 'rgba(255,69,0,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(253,245,232,0.15)'}
              />
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={status === 'loading'}
                style={{ padding: '14px 28px', borderRadius: 999, background: 'var(--coral)', color: 'white', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: status === 'loading' ? 'default' : 'pointer', boxShadow: '0 0 28px rgba(255,69,0,0.35)', opacity: status === 'loading' ? 0.7 : 1, transition: 'background 0.2s, opacity 0.2s' }}
                onMouseEnter={e => { if (status !== 'loading') e.currentTarget.style.background = '#e03d00'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--coral)'}
              >
                {status === 'loading' ? '…' : 'Notify me'}
              </motion.button>
              {status === 'error' && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ width: '100%', textAlign: 'center', fontFamily: 'Fraunces, serif', fontSize: 13, color: 'var(--terracotta)', margin: '4px 0 0' }}>
                  Something went wrong — please try again.
                </motion.p>
              )}
            </motion.form>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div style={{ margin: '40px auto 0', width: 40, height: 1, background: 'rgba(253,245,232,0.1)' }} />
        <p style={{ marginTop: 24, fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.2)' }}>
          Axiora &nbsp;·&nbsp; Smarter surveys, sharper insights
        </p>
      </motion.div>
    </div>
  );
}
