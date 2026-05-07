import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

function friendlyAuthError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp'))
    return 'This link has expired or is no longer valid. Please request a new password reset.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts — please wait a minute before trying again.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Connection error. Please check your internet and try again.';
  return msg;
}

export default function UpdatePassword() {
  const [pw, setPw]           = useState('');
  const [confirm, setCf]      = useState('');
  const [busy, setBusy]       = useState(false);
  const [ready, setReady]     = useState(false);
  const [linkBad, setLinkBad] = useState(false);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    stopLoading();
    if (!token) {
      setLinkBad(true);
    } else {
      setReady(true);
    }
  }, [stopLoading, token]);

  const go = async e => {
    e.preventDefault();
    if (pw.length < 6)     return toast.error('Password needs 6+ characters');
    if (pw !== confirm)    return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await API.post(`/auth/reset-password?token=${token}`, { new_password: pw });
      toast.success('Password updated! Please sign in.');
      nav('/login');
    } catch (e) {
      toast.error(friendlyAuthError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const inp = {
    width: '100%', boxSizing: 'border-box',
    padding: '0 0 12px', background: 'transparent', border: 'none',
    borderBottom: '2px solid rgba(22,15,8,0.12)',
    fontFamily: 'Fraunces, serif', fontSize: 17, color: 'var(--espresso)',
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--warm-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: 380 }}>

        <Link to="/login" style={{ textDecoration: 'none', display: 'block', marginBottom: 48 }}><Logo /></Link>

        {/* ── Expired / bad link state ── */}
        {linkBad ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(214,59,31,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 28 }}>⏱</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 28, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 12 }}>Link has expired</h2>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16, lineHeight: 1.7, color: 'rgba(22,15,8,0.5)', marginBottom: 10 }}>
              Password reset links are valid for <strong style={{ color: 'var(--espresso)' }}>1 hour</strong>. This one is no longer active.
            </p>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)', marginBottom: 36 }}>
              Don't worry — simply request a new link below and check your inbox.
            </p>
            <Link to="/reset-password"
              style={{ display: 'inline-flex', padding: '14px 32px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', transition: 'background 0.25s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
              Request new link →
            </Link>
          </div>

        /* ── Verifying state ── */
        ) : !ready ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,69,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24 }}>⏳</div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 28, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 12 }}>Verifying link…</h2>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)' }}>Please wait while we verify your reset link.</p>
          </div>

        /* ── Set new password ── */
        ) : (
          <>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 32, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 8 }}>New password</h2>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16, color: 'rgba(22,15,8,0.45)', marginBottom: 40, lineHeight: 1.6 }}>
              Choose a strong password for your account.
            </p>

            <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {[
                { label: 'New password',     val: pw,      set: setPw,  ph: 'Min 6 characters' },
                { label: 'Confirm password', val: confirm, set: setCf,  ph: 'Same as above' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 10 }}>{f.label}</label>
                  <input type="password" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={inp}
                    onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                    onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'}
                  />
                </div>
              ))}

              {pw && confirm && pw !== confirm && (
                <p style={{ fontFamily: 'Fraunces, serif', fontSize: 13, color: 'var(--terracotta)', marginTop: -16 }}>Passwords don't match</p>
              )}

              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={busy}
                style={{ marginTop: 4, padding: '16px 28px', background: busy ? 'rgba(22,15,8,0.3)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s' }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
                onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
                {busy ? 'Updating…' : 'Set new password →'}
              </motion.button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
