import React, { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useLoading } from '../context/LoadingContext';
import useAuthStore from "../hooks/useAuth";
import { cognitoSignIn, cognitoForgotPassword, cognitoConfirmPassword } from '../lib/cognito';
import API from '../api/axios';

const Logo = ({ dark }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: dark ? 'rgba(253,245,232,0.35)' : 'rgba(22,15,8,0.35)', marginRight: 8, position: 'relative', top: -2 }}>Axiora</span>
    <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 24, letterSpacing: '-1px', color: dark ? 'var(--cream)' : 'var(--espresso)', lineHeight: 1 }}>Pulse</span>
    <div style={{ position: 'relative', width: 9, height: 9, background: 'var(--coral)', borderRadius: '50%', boxShadow: '0 0 10px rgba(255,69,0,0.55)', alignSelf: 'flex-start', marginTop: 5, marginLeft: 8, flexShrink: 0 }}>
      <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
    </div>
  </div>
);

function friendlyAuthError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('email not confirmed'))
    return 'Incorrect email or password. Please try again.';
  if (m.includes('expired') || m.includes('otp') || m.includes('token'))
    return 'Your sign-in link has expired. Please log in with your password or request a new link.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts — please wait a minute before trying again.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Connection error. Please check your internet and try again.';
  return msg;
}

function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('email'); // 'email' | 'reset' | 'done'

  const send = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email address');
    setBusy(true);
    try {
      await cognitoForgotPassword(email);
      setStep('reset');
    } catch (err) {
      toast.error(friendlyAuthError(err.message));
    } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    if (!code || !newPw) return toast.error('Fill in all fields');
    if (newPw.length < 8) return toast.error('Password needs 8+ characters');
    setBusy(true);
    try {
      await cognitoConfirmPassword(email, code, newPw);
      setStep('done');
    } catch (err) {
      toast.error(friendlyAuthError(err.message));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* Backdrop */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(22,15,8,0.55)', backdropFilter: 'blur(4px)' }} />

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', background: 'var(--warm-white)', borderRadius: 24, padding: '40px 44px', width: '100%', maxWidth: 380, boxShadow: '0 32px 80px rgba(22,15,8,0.25)' }}>

        {/* Close */}
        <button onClick={onClose}
          style={{ position: 'absolute', top: 18, right: 18, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(22,15,8,0.07)', color: 'rgba(22,15,8,0.5)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,15,8,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(22,15,8,0.07)'}>✕</button>

        {step === 'done' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,69,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22 }}>✓</div>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 24, letterSpacing: '-0.5px', color: 'var(--espresso)', marginBottom: 10 }}>Password updated</h3>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, lineHeight: 1.7, color: 'rgba(22,15,8,0.5)', marginBottom: 28 }}>
              You can now sign in with your new password.
            </p>
            <button onClick={onClose}
              style={{ padding: '13px 28px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.25s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
              Back to sign in
            </button>
          </div>
        ) : step === 'reset' ? (
          <>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 26, letterSpacing: '-0.5px', color: 'var(--espresso)', marginBottom: 6 }}>Set new password</h3>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)', marginBottom: 32, lineHeight: 1.6 }}>
              Enter the code sent to <strong style={{ color: 'var(--espresso)' }}>{email}</strong> and choose a new password.
            </p>
            <form onSubmit={reset} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {[
                { label: 'Verification code', val: code, set: setCode, type: 'text', ph: '123456' },
                { label: 'New password', val: newPw, set: setNewPw, type: 'password', ph: 'Min 8 characters' },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 10 }}>{f.label}</label>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0 0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid rgba(22,15,8,0.12)', fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                    onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'} />
                </div>
              ))}
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={busy}
                style={{ padding: '15px 28px', background: busy ? 'rgba(22,15,8,0.35)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s' }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
                onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
                {busy ? 'Updating…' : 'Update password →'}
              </motion.button>
            </form>
          </>
        ) : (
          <>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 26, letterSpacing: '-0.5px', color: 'var(--espresso)', marginBottom: 6 }}>Reset password</h3>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)', marginBottom: 32, lineHeight: 1.6 }}>
              Enter your email and we'll send you a verification code.
            </p>
            <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <label style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 10 }}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0 0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid rgba(22,15,8,0.12)', fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'} />
              </div>
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={busy}
                style={{ padding: '15px 28px', background: busy ? 'rgba(22,15,8,0.35)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s' }}
                onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
                onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
                {busy ? 'Sending…' : 'Send code →'}
              </motion.button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgot] = useState(false);
  const { user, initialized, initialize } = useAuthStore();
  const { stopLoading } = useLoading();
  const nav = useNavigate();
  useEffect(() => { stopLoading(); }, [stopLoading]);

  if (initialized && user) {
    return <Navigate to="/dashboard" replace />;
  }
  const go = async (e) => {
    e.preventDefault();
    if (!email || !pw) return toast.error('Fill in all fields');
    setBusy(true);
    try {
      const session = await cognitoSignIn(email, pw);
      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem('token', idToken);

      // Sync profile with backend (links cognito_sub for migrated users)
      await API.post('/auth/sync', { id_token: idToken });

      await initialize(true);
      toast.success('Welcome back!');
      nav('/dashboard');
    } catch (err) {
      toast.error(friendlyAuthError(err.message || 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-grid" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 480px' }}>

      {/* ── LEFT: dark editorial panel ── */}
      <div className="auth-left" style={{ background: 'var(--espresso)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 72px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle,rgba(255,69,0,0.35),transparent 70%)', top: -150, right: -150 }} />
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle,rgba(255,184,0,0.2),transparent 70%)', bottom: -100, left: -100 }} />
        </div>
        <div className="grain" style={{ opacity: 0.035 }} />
        <div style={{ position: 'absolute', bottom: -30, left: -10, fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(120px,15vw,220px)', color: 'transparent', WebkitTextStroke: '1px rgba(253,245,232,0.04)', letterSpacing: -5, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>Pulse</div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: 72 }}><Logo dark /></div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px,3.5vw,50px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-1.5px', color: 'var(--cream)', marginBottom: 24 }}>
            Research that{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--saffron)' }}>holds up</em>
            {' '}in a room.
          </h2>
          <p style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 300, lineHeight: 1.7, color: 'rgba(253,245,232,0.5)', maxWidth: 380, marginBottom: 60 }}>
            Trusted by insight leads at India's largest FMCG, financial, and consumer brands.
          </p>
          <div style={{ display: 'flex', gap: 40 }}>
            {[{ val: '2.4', unit: 'k', lbl: 'Research teams' }, { val: '84', unit: '%', lbl: 'Median incidence' }, { val: '4.9', unit: '★', lbl: 'Practitioner rating' }].map(s => (
              <div key={s.lbl}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 32, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>
                  {s.val}<span style={{ color: 'var(--saffron)' }}>{s.unit}</span>
                </div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.3)', marginTop: 4 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: form panel ── */}
      <div style={{ background: 'var(--warm-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 56px', borderLeft: '1px solid rgba(22,15,8,0.06)' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ width: '100%', maxWidth: 340 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'block', marginBottom: 48 }}><Logo dark={false} /></Link>

          <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 32, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 8 }}>Sign in</h2>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16, color: 'rgba(22,15,8,0.45)', marginBottom: 40 }}>Enter your credentials to continue</p>

          <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {[
              { label: 'Email', type: 'email', val: email, set: setEmail, ph: 'you@company.com' },
              { label: 'Password', type: 'password', val: pw, set: setPw, ph: '••••••••' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 10 }}>{f.label}</label>
                <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0 0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid rgba(22,15,8,0.12)', fontFamily: 'Fraunces, serif', fontSize: 17, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' }}
                  onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'}
                />
              </div>
            ))}

            {/* Forgot password */}
            <div style={{ marginTop: -12, textAlign: 'right' }}>
              <button type="button" onClick={() => setForgot(true)}
                style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.4)', cursor: 'pointer', transition: 'color 0.2s', textDecoration: 'underline', textDecorationColor: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--coral)'; e.currentTarget.style.textDecorationColor = 'var(--coral)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(22,15,8,0.4)'; e.currentTarget.style.textDecorationColor = 'transparent'; }}>
                Forgot password?
              </button>
            </div>

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              type="submit" disabled={busy}
              style={{ marginTop: 4, padding: '16px 28px', background: busy ? 'rgba(22,15,8,0.4)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s ease' }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
              onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
              {busy ? 'Signing in…' : 'Sign in →'}
            </motion.button>
          </form>

          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)', marginTop: 40, textAlign: 'center' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--espresso)', fontWeight: 500, textDecoration: 'none', borderBottom: '1px solid rgba(22,15,8,0.2)', paddingBottom: 1, transition: 'color 0.2s, border-color 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--coral)'; e.currentTarget.style.borderBottomColor = 'var(--coral)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--espresso)'; e.currentTarget.style.borderBottomColor = 'rgba(22,15,8,0.2)'; }}>
              Create one →
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {forgotOpen && <ForgotPasswordModal onClose={() => setForgot(false)} />}
      </AnimatePresence>

      <style>{`
        @media (max-width: 768px) {
          .auth-grid { grid-template-columns: 1fr !important; }
          .auth-left { display: none !important; }
        }
      `}</style>
    </div>
  );
}
