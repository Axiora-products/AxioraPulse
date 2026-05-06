import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';

const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginRight: 8, position: 'relative', top: -2 }}>Axiora</span>
    <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 24, letterSpacing: '-1px', color: 'var(--espresso)', lineHeight: 1 }}>Pulse</span>
    <div style={{ position: 'relative', width: 9, height: 9, background: 'var(--coral)', borderRadius: '50%', boxShadow: '0 0 10px rgba(255,69,0,0.55)', alignSelf: 'flex-start', marginTop: 5, marginLeft: 8, flexShrink: 0 }}>
      <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
    </div>
  </div>
);

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { stopLoading } = useLoading();
  const nav = useNavigate();
  useEffect(() => { stopLoading(); }, [stopLoading]);

  const go = async e => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email');
    setBusy(true);
    try {
      await API.post('/auth/reset-password-request', { email });
      setSent(true);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--warm-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: 380 }}>

        {/* Header: logo + close button (back to wherever user came from) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
          <Link to="/login" style={{ textDecoration: 'none' }}><Logo /></Link>
          <button onClick={() => nav(-1)}
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(22,15,8,0.12)', background: 'transparent', color: 'rgba(22,15,8,0.4)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--coral)'; e.currentTarget.style.color = 'var(--coral)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.12)'; e.currentTarget.style.color = 'rgba(22,15,8,0.4)'; }}>
            ✕
          </button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,69,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24 }}>✉</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 28, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 12 }}>Check your inbox</h2>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16, lineHeight: 1.7, color: 'rgba(22,15,8,0.5)', marginBottom: 36 }}>
              We've sent a password reset link to <strong style={{ color: 'var(--espresso)', fontWeight: 500 }}>{email}</strong>. Follow the link to set a new password.
            </p>
            <Link to="/login" style={{ display: 'inline-flex', padding: '14px 32px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', transition: 'background 0.25s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 32, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 8 }}>Reset password</h2>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16, color: 'rgba(22,15,8,0.45)', marginBottom: 40, lineHeight: 1.6 }}>
              Enter your email and we'll send you a link to reset your password.
            </p>

            <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div>
                <label style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 10 }}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0 0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid rgba(22,15,8,0.12)', fontFamily: 'Fraunces, serif', fontSize: 17, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'}
                />
              </div>

              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={busy}
                style={{ padding: '16px 28px', background: busy ? 'rgba(22,15,8,0.3)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s' }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
                onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
                {busy ? 'Sending…' : 'Send reset link →'}
              </motion.button>
            </form>

            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)', marginTop: 36, textAlign: 'center' }}>
              Remember it?{' '}
              <Link to="/login" style={{ color: 'var(--espresso)', fontWeight: 500, textDecoration: 'none', borderBottom: '1px solid rgba(22,15,8,0.2)', paddingBottom: 1 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--coral)'; e.currentTarget.style.borderBottomColor = 'var(--coral)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--espresso)'; e.currentTarget.style.borderBottomColor = 'rgba(22,15,8,0.2)'; }}>
                Sign in →
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
