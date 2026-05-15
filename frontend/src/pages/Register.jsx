import React, { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';
import useAuthStore from "../hooks/useAuth";
import { cognitoSignUp, cognitoConfirmSignUp, cognitoSignIn, cognitoResendCode } from '../lib/cognito';
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

export default function Register() {
  const location = useLocation();
  const [f, sf] = useState({ 
    fullName: '', 
    email: location.state?.email || '', 
    password: '', 
    tenantName: '', 
    tenantSlug: '' 
  });
  const [verifyCode, setVerifyCode] = useState('');
  const [step, setStep] = useState(location.state?.step || 'form'); // 'form' | 'verify'
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const { user, initialized, initialize } = useAuthStore();
  const { stopLoading } = useLoading();
  const nav = useNavigate();
  useEffect(() => { stopLoading(); }, [stopLoading]);

  if (initialized && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const s = (k, v) => sf(p => {
    const n = { ...p, [k]: v };
    if (k === 'tenantName') n.tenantSlug = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return n;
  });

  // Step 1: sign up with Cognito → sends verification email
  const go = async (e) => {
    e.preventDefault();
    if (!f.fullName || !f.email || !f.password || !f.tenantName) return toast.error('Fill all fields');
    if (f.password.length < 8) return toast.error('Password needs 8+ characters');
    setBusy(true);
    try {
      await cognitoSignUp(f.email, f.password, f.fullName);
      setStep('verify');
      toast.success('Verification code sent to your email');
    } catch (err) {
      if (err.code === 'UsernameExistsException') {
        toast(
          (t) => (
            <span>
              Account exists.{' '}
              <button 
                onClick={() => { setStep('verify'); toast.dismiss(t.id); }}
                style={{ background: 'none', border: 'none', color: 'var(--espresso)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
              >
                Verify now?
              </button>
            </span>
          ),
          { duration: 6000 }
        );
      } else {
        toast.error(err.message || 'Registration failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!f.email) return toast.error('Email is missing');
    setResending(true);
    try {
      await cognitoResendCode(f.email);
      toast.success('New verification code sent!');
    } catch (err) {
      toast.error(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  // Step 2: confirm verification code → sign in → sync with backend
  const confirm = async (e) => {
    e.preventDefault();
    if (!verifyCode) return toast.error('Enter the verification code');
    setBusy(true);
    try {
      await cognitoConfirmSignUp(f.email, verifyCode);
      
      // If we don't have password (e.g. redirected from Login), redirect back to Login
      if (!f.password) {
        toast.success('Email verified! Please sign in.');
        return nav('/login', { state: { email: f.email } });
      }

      const session = await cognitoSignIn(f.email, f.password);
      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem('token', idToken);

      await API.post('/auth/sync', {
        id_token: idToken,
        tenant_name: f.tenantName,
        tenant_slug: f.tenantSlug || f.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      });

      await initialize(true);
      toast.success('Welcome to Axiora Pulse!');
      nav('/dashboard');
    } catch (err) {
      if (err.code === 'CodeMismatchException') {
        toast.error('Incorrect code — please try again');
      } else {
        toast.error(err.message || 'Verification failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '0 0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid rgba(22,15,8,0.12)', fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' };
  const labelStyle = { fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 10 };

  return (
    <div className="auth-grid" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 480px' }}>

      {/* ── LEFT: dark editorial panel ── */}
      <div className="auth-left" style={{ background: 'var(--espresso)', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 72px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', filter: 'blur(90px)', background: 'radial-gradient(circle,rgba(255,69,0,0.3),transparent 70%)', top: -200, left: -150 }} />
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', filter: 'blur(80px)', background: 'radial-gradient(circle,rgba(255,184,0,0.18),transparent 70%)', bottom: -80, right: -80 }} />
        </div>
        <div className="grain" style={{ opacity: 0.035 }} />
        <div style={{ position: 'absolute', bottom: -30, right: -20, fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(120px,15vw,200px)', color: 'transparent', WebkitTextStroke: '1px rgba(253,245,232,0.04)', letterSpacing: -5, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>Axiora</div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: 72 }}><Logo dark /></div>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 'clamp(34px,3.5vw,50px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-1.5px', color: 'var(--cream)', marginBottom: 24 }}>
            Insights your team{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--saffron)' }}>actually</em>
            {' '}trust.
          </h2>
          <p style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 300, lineHeight: 1.7, color: 'rgba(253,245,232,0.5)', maxWidth: 380, marginBottom: 60 }}>
            Set up your workspace in under a minute. No credit card needed. Built for researchers who mean business.
          </p>
          <div style={{ display: 'flex', gap: 40 }}>
            {[{ val: '< 1', unit: 'min', lbl: 'Setup time' }, { val: '24+', unit: '', lbl: 'Question types' }, { val: '99.9', unit: '%', lbl: 'Uptime SLA' }].map(st => (
              <div key={st.lbl}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 32, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>
                  {st.val}<span style={{ color: 'var(--saffron)' }}>{st.unit}</span>
                </div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(253,245,232,0.3)', marginTop: 4 }}>{st.lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: form panel ── */}
      <div style={{ background: 'var(--warm-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 56px', borderLeft: '1px solid rgba(22,15,8,0.06)', overflowY: 'auto' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ width: '100%', maxWidth: 340 }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'block', marginBottom: 40 }}><Logo dark={false} /></Link>

          {step === 'verify' ? (
            <>
              <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 30, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 6 }}>Check your email</h2>
              <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)', marginBottom: 36 }}>
                We sent a 6-digit code to <strong style={{ color: 'var(--espresso)' }}>{f.email}</strong>
              </p>
              <form onSubmit={confirm} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <label style={labelStyle}>Verification code</label>
                  <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="123456" autoFocus maxLength={6}
                    style={{ ...inputStyle, letterSpacing: '0.3em', fontSize: 20 }}
                    onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                    onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'}
                  />
                </div>
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  type="submit" disabled={busy}
                  style={{ marginTop: 4, padding: '16px 28px', background: busy ? 'rgba(22,15,8,0.4)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s ease' }}
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
                  onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
                  {busy ? 'Verifying…' : 'Verify & continue →'}
                </motion.button>
              </form>
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button onClick={resend} disabled={resending}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--espresso)', fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: 13, cursor: resending ? 'not-allowed' : 'pointer', textDecoration: 'underline', opacity: resending ? 0.5 : 1 }}>
                  {resending ? 'Resending…' : "Didn't get a code? Resend"}
                </button>
              </div>
              <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.4)', marginTop: 12, textAlign: 'center' }}>
                Wrong email?{' '}
                <button onClick={() => setStep('form')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--espresso)', fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                  Go back
                </button>
              </p>
            </>
          ) : (
            <>
          <h2 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 30, letterSpacing: '-1px', color: 'var(--espresso)', marginBottom: 6 }}>Create workspace</h2>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)', marginBottom: 36 }}>Set up your team's survey platform</p>

          <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {[
              { label: 'Your name', key: 'fullName', type: 'text', ph: 'Jane Smith' },
              { label: 'Work email', key: 'email', type: 'email', ph: 'jane@company.com' },
              { label: 'Password', key: 'password', type: 'password', ph: 'Min 6 characters' },
              { label: 'Organisation', key: 'tenantName', type: 'text', ph: 'Acme Research' },
            ].map(field => (
              <div key={field.key}>
                <label style={labelStyle}>{field.label}</label>
                <input type={field.type} value={f[field.key]} onChange={e => s(field.key, e.target.value)} placeholder={field.ph}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderBottomColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderBottomColor = 'rgba(22,15,8,0.12)'}
                />
              </div>
            ))}

            <div>
              <label style={labelStyle}>Workspace URL</label>
              <div style={{ display: 'flex', alignItems: 'baseline', borderBottom: '2px solid rgba(22,15,8,0.12)', transition: 'border-color 0.2s' }}
                onFocusCapture={e => e.currentTarget.style.borderBottomColor = 'var(--coral)'}
                onBlurCapture={e => e.currentTarget.style.borderBottomColor = 'rgba(22,15,8,0.12)'}>
                <input value={f.tenantSlug} onChange={e => s('tenantSlug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme"
                  style={{ ...inputStyle, flex: 1, border: 'none', borderBottom: 'none', fontFamily: 'Fraunces, serif' }}
                />
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 11, color: 'rgba(22,15,8,0.3)', paddingBottom: 12, whiteSpace: 'nowrap' }}>.Axiora.io</span>
              </div>
            </div>

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              type="submit" disabled={busy}
              style={{ marginTop: 4, padding: '16px 28px', background: busy ? 'rgba(22,15,8,0.4)' : 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 999, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s ease' }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
              onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
              {busy ? 'Creating…' : 'Create workspace →'}
            </motion.button>
          </form>

          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)', marginTop: 36, textAlign: 'center' }}>
            Have an account?{' '}
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

      <style>{`
        @media (max-width: 768px) {
          .auth-grid { grid-template-columns: 1fr !important; }
          .auth-left { display: none !important; }
        }
      `}</style>
    </div>
  );
}
