import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../hooks/useAuth';
import PageLoader from '../pages/PageLoader';
import { hasPermission, ROLE_LABELS } from '../lib/constants';
import CommandPalette from './CommandPalette';
import NotificationFeed from './NotificationFeed';
import { IcoMenu, IcoClose, IcoSettings, IcoArrowLeft, IcoClock } from './Icons';

// Nav items — Settings removed (lives in avatar menu now)
const NAV = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/surveys', label: 'Surveys' },
  { to: '/surveys/new', label: 'New', perm: 'create_survey', exact: true },
  { to: '/team', label: 'Team', perm: 'manage_team' },
];

export default function DashboardLayout() {
  const { profile, tenant, signOut, loading, checkSession } = useAuthStore();
  const [userMenu, setUserMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const avatarRef = useRef(null);

  // Close avatar dropdown on outside click — reliable across all browsers
  useEffect(() => {
    if (!userMenu) return;
    const handler = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenu]);

  // Global ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const h = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(o => !o); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const nav = useNavigate();
  const loc = useLocation();

  // STALE SESSION FIX: On every navigation, verify the session is still alive
  useEffect(() => {
    checkSession();
  }, [loc.pathname, checkSession]);


  // ── Auto sign-out after inactivity ───────────────────────────────────────
  // Signs out after 30 minutes of no mouse/keyboard/scroll/touch activity.
  // The toast gives the user a heads-up 60 s before the cut-off.
  // Only applies inside the dashboard (this layout); survey response pages
  // are public and never wrapped by DashboardLayout.
  const IDLE_LIMIT = 30 * 60 * 1000;   // 30 min
  const WARN_BEFORE = 1 * 60 * 1000;   //  1 min warning
  const idleTimer = useRef(null);
  const warnTimer = useRef(null);
  const warnToastId = useRef(null);

  useEffect(() => {
    if (!profile) return;   // not yet authenticated — nothing to time out

    const clearTimers = () => {
      clearTimeout(idleTimer.current);
      clearTimeout(warnTimer.current);
    };

    const scheduleSignOut = () => {
      clearTimers();

      // Warn 1 minute before
      warnTimer.current = setTimeout(() => {
        // Dynamic import avoids a circular dep; toast is already loaded by App.jsx
        import('react-hot-toast').then(({ default: toast }) => {
          warnToastId.current = toast('You\'ll be signed out in 1 minute due to inactivity', {
            duration: 60000,
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14.5"/></svg>,
            style: { fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 600,
                     letterSpacing: '0.04em', background: '#160F08', color: '#FDF5E8',
                     borderRadius: 12, padding: '12px 18px' },
          });
        });
      }, IDLE_LIMIT - WARN_BEFORE);

      // Sign out when idle limit is reached
      idleTimer.current = setTimeout(() => {
        signOut();
      }, IDLE_LIMIT);
    };

    const onActivity = () => {
      // Dismiss warning toast if user becomes active again
      if (warnToastId.current) {
        import('react-hot-toast').then(({ default: toast }) => {
          toast.dismiss(warnToastId.current);
        });
        warnToastId.current = null;
      }
      scheduleSignOut();
    };

    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    scheduleSignOut(); // start on mount

    return () => {
      clearTimers();
      EVENTS.forEach(e => window.removeEventListener(e, onActivity));
    };
  }, [profile, signOut]);

  // All hooks declared above — safe to early-return now.
  if (loading || !profile) return <PageLoader label="Loading workspace…" />;

  const items = NAV;
  const initials = (profile?.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Issue #3: precise active state — Surveys active everywhere under /surveys EXCEPT /surveys/new
  function isNavActive(item) {
    if (item.exact) return loc.pathname === item.to;
    if (item.to === '/surveys') return loc.pathname.startsWith('/surveys') && loc.pathname !== '/surveys/new';
    if (item.to === '/dashboard') return loc.pathname === '/dashboard';
    return loc.pathname.startsWith(item.to);
  }

  function handleSignOut() {
    signOut();
    setUserMenu(false);
  }

  const menuItemStyle = (danger) => ({
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', borderRadius: 10, border: 'none',
    background: 'transparent', cursor: 'pointer',
    fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: danger ? 'rgba(214,59,31,0.7)' : 'rgba(253,245,232,0.45)',
    transition: 'all 0.2s', textDecoration: 'none',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', cursor: 'none' }}>

      {/* ── STICKY TOP NAV ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(253,245,232,0.92)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(22,15,8,0.07)',
        height: 64, padding: '0 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo with sonar dot (issue #4) */}
        <NavLink to="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginRight: 8, position: 'relative', top: -2 }}>Axiora</span>
          <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 22, letterSpacing: '-1px', color: 'var(--espresso)', lineHeight: 1 }}>Pulse</span>
          <div style={{ position: 'relative', width: 9, height: 9, background: 'var(--coral)', borderRadius: '50%', boxShadow: '0 0 10px rgba(255,69,0,0.55)', alignSelf: 'flex-start', marginTop: 5, marginLeft: 8, flexShrink: 0 }}>
            <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
          </div>
        </NavLink>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }} className="np-desktop-nav">
          {items.map(n => {
            const active = isNavActive(n);
            return (
              <NavLink key={n.to} to={n.to}
                style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', padding: '7px 16px', borderRadius: 999, background: active ? 'var(--espresso)' : 'transparent', color: active ? 'var(--cream)' : 'rgba(22,15,8,0.4)', transition: 'all 0.2s ease' }}>
                {n.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Right: org + notifications + cmd + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {tenant && <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.25)' }} className="np-desktop-nav">{tenant.name}</span>}

          {/* ⌘K trigger */}
          <button onClick={() => setCmdOpen(true)}
            className="np-desktop-nav"
            title="Command palette (⌘K)"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(22,15,8,0.08)', background: 'var(--cream)', cursor: 'pointer', transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.2)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.08)'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(22,15,8,0.35)" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <kbd style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, color: 'rgba(22,15,8,0.35)', letterSpacing: '0.06em', background: 'none', border: 'none', padding: 0 }}>⌘K</kbd>
          </button>

          {/* Notifications */}
          <NotificationFeed />

          <div style={{ position: 'relative' }} ref={avatarRef}>
            <button onClick={() => setUserMenu(v => !v)}
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--espresso)', color: 'var(--cream)', border: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
              {initials}
            </button>

            <AnimatePresence>
              {userMenu && (
                <>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'absolute', right: 0, top: 42, zIndex: 20, width: 240, background: 'var(--espresso)', borderRadius: 18, padding: 14, boxShadow: '0 24px 80px rgba(22,15,8,0.3)' }}>

                    {/* User info */}
                    <div style={{ padding: '8px 8px 14px', borderBottom: '1px solid rgba(253,245,232,0.08)', marginBottom: 8 }}>
                      <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 2 }}>{profile?.full_name}</div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 12, color: 'rgba(253,245,232,0.4)', marginBottom: 8 }}>{profile?.email}</div>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, background: 'rgba(255,69,0,0.15)', color: 'var(--coral)' }}>
                        {(profile?.role || "super_admin").replace("_", " ").toUpperCase()}
                      </span>
                    </div>

                    {/* Billing */}
                    <Link to="/billing" onClick={() => setUserMenu(false)}
                      style={menuItemStyle(false)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(253,245,232,0.08)'; e.currentTarget.style.color = 'var(--cream)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(253,245,232,0.45)'; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: 'middle' }}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                      Billing
                    </Link>

                    {/* Issue #1: Settings in avatar menu */}
                    <Link to="/settings" onClick={() => setUserMenu(false)}
                      style={menuItemStyle(false)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(253,245,232,0.08)'; e.currentTarget.style.color = 'var(--cream)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(253,245,232,0.45)'; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: 'middle' }}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                      Settings
                    </Link>

                    {/* Issue #2: Reset password link */}
                    <Link to="/reset-password" onClick={() => setUserMenu(false)}
                      style={menuItemStyle(false)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(253,245,232,0.08)'; e.currentTarget.style.color = 'var(--cream)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(253,245,232,0.45)'; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: 'middle' }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      Reset password
                    </Link>

                    <div style={{ borderTop: '1px solid rgba(253,245,232,0.08)', marginTop: 4, paddingTop: 4 }}>
                      <button onClick={handleSignOut} style={menuItemStyle(true)}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(214,59,31,0.15)'; e.currentTarget.style.color = 'var(--terracotta)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(214,59,31,0.7)'; }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: 'middle' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button onClick={() => setMobileOpen(v => !v)} className="np-mobile-nav"
            style={{ background: 'none', border: 'none', padding: 6, color: 'var(--espresso)', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {mobileOpen ? <IcoClose size={22} color="var(--espresso)" /> : <IcoMenu size={22} color="var(--espresso)" />}
          </button>
        </div>
      </header>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ background: 'var(--espresso)', overflow: 'hidden', position: 'relative', zIndex: 100 }}>
            <div style={{ padding: '12px 24px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(n => {
                const active = isNavActive(n);
                return (
                  <NavLink key={n.to} to={n.to} onClick={() => setMobileOpen(false)}
                    style={{ fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', padding: '12px 16px', borderRadius: 10, background: active ? 'rgba(255,69,0,0.15)' : 'transparent', color: active ? 'var(--coral)' : 'rgba(253,245,232,0.45)' }}>
                    {n.label}
                  </NavLink>
                );
              })}
              <NavLink to="/settings" onClick={() => setMobileOpen(false)}
                style={({ isActive }) => ({ fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', padding: '12px 16px', borderRadius: 10, background: isActive ? 'rgba(255,69,0,0.15)' : 'transparent', color: isActive ? 'var(--coral)' : 'rgba(253,245,232,0.45)' })}>
                Settings
              </NavLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page content */}
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '52px 48px 40px', width: '100%', boxSizing: 'border-box' }}>
        <Outlet />
      </main>

      {/* Command Palette */}
      <AnimatePresence>
        {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
      </AnimatePresence>

      {/* Issue #6: Footer */}
      <footer style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 48px 40px', width: '100%', boxSizing: 'border-box', borderTop: '1px solid rgba(22,15,8,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(22,15,8,0.25)', textAlign: 'center', margin: 0 }}>
          © 2026 Axiora Pulse is a product of Axiora Labs · Built for researchers, by researchers · Hyderabad
        </p>
      </footer>

      <style>{`
        /* Responsive toggles */
        @media (max-width: 768px) {
          .np-desktop-nav { display: none !important; }
          .np-mobile-nav  { display: flex !important; }
        }
        @media (min-width: 769px) {
          .np-mobile-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}
