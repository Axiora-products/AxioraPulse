import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../hooks/useAuth';
import PageLoader from '../pages/PageLoader';
import { hasPermission, ROLE_LABELS } from '../lib/constants';
import CommandPalette from './CommandPalette';
import NotificationFeed from './NotificationFeed';
import { IcoMenu, IcoClose, IcoSettings, IcoArrowLeft, IcoClock } from './Icons';
import API from '../api/axios';
import {
  PanelLeftClose, PanelLeftOpen, PanelRightClose,
  PanelRightOpen
} from 'lucide-react';

export default function DashboardLayout() {
  const { profile, tenant, signOut, loading, checkSession } = useAuthStore();
  const [userMenu, setUserMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const userRef = useRef(null);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  // Sidebar data
  const [surveys, setSurveys] = useState([]);
  const [files, setFiles] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);

  // Fetch surveys and files for sidebar
  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setSidebarLoading(true);
      try {
        const [survRes, fileRes] = await Promise.allSettled([
          API.get('/surveys/?limit=50'),
          API.get('/uploads/files'),
        ]);
        if (survRes.status === 'fulfilled') setSurveys(survRes.value.data || []);
        if (fileRes.status === 'fulfilled') setFiles(fileRes.value.data || []);
      } catch { }
      setSidebarLoading(false);
    };
    load();
  }, [profile]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenu) return;
    const handler = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenu(false);
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

  // Refresh sidebar surveys when navigating back to survey pages
  useEffect(() => {
    if (!profile) return;
    if (loc.pathname === '/surveys' || loc.pathname === '/dashboard') {
      API.get('/surveys/?limit=50').then(r => setSurveys(r.data || [])).catch(() => { });
    }
  }, [loc.pathname, profile]);

  const refreshFiles = async () => {
    try {
      const res = await API.get('/uploads/files');
      setFiles(res.data || []);
    } catch { }
  };

  // ── Auto sign-out after inactivity ───────────────────────────────────────
  const IDLE_LIMIT = 30 * 60 * 1000;
  const WARN_BEFORE = 1 * 60 * 1000;
  const idleTimer = useRef(null);
  const warnTimer = useRef(null);
  const warnToastId = useRef(null);

  useEffect(() => {
    if (!profile) return;
    const clearTimers = () => { clearTimeout(idleTimer.current); clearTimeout(warnTimer.current); };
    const scheduleSignOut = () => {
      clearTimers();
      warnTimer.current = setTimeout(() => {
        import('react-hot-toast').then(({ default: toast }) => {
          warnToastId.current = toast('You\'ll be signed out in 1 minute due to inactivity', {
            duration: 60000,
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14.5" /></svg>,
            style: { fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', background: '#160F08', color: '#FDF5E8', borderRadius: 12, padding: '12px 18px' },
          });
        });
      }, IDLE_LIMIT - WARN_BEFORE);
      idleTimer.current = setTimeout(() => { signOut(); }, IDLE_LIMIT);
    };
    const onActivity = () => {
      if (warnToastId.current) {
        import('react-hot-toast').then(({ default: toast }) => { toast.dismiss(warnToastId.current); });
        warnToastId.current = null;
      }
      scheduleSignOut();
    };
    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    scheduleSignOut();
    return () => { clearTimers(); EVENTS.forEach(e => window.removeEventListener(e, onActivity)); };
  }, [profile, signOut]);

  // All hooks declared above — safe to early-return now.
  if (loading || !profile) return <PageLoader label="Loading workspace…" />;

  const initials = (profile?.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Group surveys by status
  const activeSurveys = surveys.filter(s => s.status === 'active');
  const draftSurveys = surveys.filter(s => s.status === 'draft');
  const closedSurveys = surveys.filter(s => ['closed', 'paused', 'expired'].includes(s.status));

  function handleSignOut() { signOut(); setUserMenu(false); }

  const statusBadge = (status) => {
    const map = { active: 'ws-badge-active', draft: 'ws-badge-draft', closed: 'ws-badge-closed', paused: 'ws-badge-paused', expired: 'ws-badge-closed' };
    return <span className={`ws-badge ${map[status] || 'ws-badge-draft'}`}>{status}</span>;
  };

  const fileIcon = (type) => {
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('word') || type?.includes('doc')) return '📝';
    if (type?.includes('audio')) return '🎙️';
    if (type?.includes('image')) return '🖼️';
    return '📎';
  };

  const handleDeleteSurvey = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await API.delete(`/surveys/${id}`);
      setSurveys(prev => prev.filter(s => s.id !== id));
    } catch { }
  };

  return (
    <div
      className={`ws-layout${isLeftCollapsed ? ' left-collapsed' : ''}${isRightCollapsed ? ' right-collapsed' : ''}`}
      style={{ cursor: 'none' }}
    >
      {/* ── MOBILE TOP BAR ── */}
      <div className="ws-mobile-topbar">
        <NavLink to="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 0, lineHeight: 1 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)', marginRight: 6 }}>Axiora</span>
          <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 18, letterSpacing: '-0.5px', color: 'var(--espresso)' }}>Pulse</span>
        </NavLink>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationFeed />
          <button className="ws-mobile-hamburger" onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <IcoClose size={20} color="var(--espresso)" /> : <IcoMenu size={20} color="var(--espresso)" />}
          </button>
        </div>
      </div>

      {/* ── MOBILE OVERLAY ── */}
      <div className={`ws-sidebar-overlay${mobileOpen ? ' visible' : ''}`} onClick={() => setMobileOpen(false)} />

      {/* ── LEFT SIDEBAR ── */}
      <aside className={`ws-sidebar${mobileOpen ? ' mobile-open' : ''}`}>

        {/* Header: Logo + New Survey */}
        <div className="ws-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '16px' }}>
            <NavLink to="/dashboard" className="ws-sidebar-logo" onClick={() => setMobileOpen(false)}>
              <span className="ws-sidebar-logo-pre">Axiora</span>
              <span className="ws-sidebar-logo-main">Pulse</span>
              <div className="ws-sidebar-logo-dot">
                <div className="sonar-ring" /><div className="sonar-ring" /><div className="sonar-ring" />
              </div>
            </NavLink>
            <button
              onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
              className="ws-sidebar-collapse-btn"
              title={isLeftCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              style={{
                width: '36px',
                height: '36px',
                background: 'rgba(253,245,232,0.05)',
                border: '1px solid rgba(253,245,232,0.08)',
                color: 'rgba(253,245,232,0.55)',
                cursor: 'pointer',
                padding: 0,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.25s ease',
                backdropFilter: 'blur(12px)',
                marginTop: '-4px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,69,0,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,69,0,0.25)';
                e.currentTarget.style.color = '#FF4500';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(253,245,232,0.05)';
                e.currentTarget.style.borderColor = 'rgba(253,245,232,0.08)';
                e.currentTarget.style.color = 'rgba(253,245,232,0.55)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isLeftCollapsed ? (
                /* OPEN SIDEBAR */
                <PanelLeftOpen
                  size={18}
                  strokeWidth={1.8}
                  color="rgba(253,245,232,0.75)"
                />
              ) : (
                <PanelLeftClose
                  size={18}
                  strokeWidth={1.8}
                  color="rgba(253,245,232,0.75)"
                />
              )}
            </button>

          </div>
          <Link to="/surveys/new" className="ws-new-btn" onClick={() => setMobileOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span>New Survey</span>
          </Link>
        </div>

        {/* Scrollable Body */}
        <div className="ws-sidebar-body">

          {/* Nav links */}
          <div className="ws-sidebar-section">
            <NavLink to="/dashboard" className={`ws-sidebar-item${loc.pathname === '/dashboard' ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
              <div className="ws-sidebar-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              </div>
              <span className="ws-sidebar-item-text">Overview</span>
            </NavLink>
            <NavLink to="/surveys" className={`ws-sidebar-item${loc.pathname === '/surveys' ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
              <div className="ws-sidebar-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
              </div>
              <span className="ws-sidebar-item-text">Surveys</span>
            </NavLink>
            <NavLink to="/team" className={`ws-sidebar-item${loc.pathname === '/team' ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
              <div className="ws-sidebar-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </div>
              <span className="ws-sidebar-item-text">Team</span>
            </NavLink>
          </div>

          {/* Active Surveys */}
          {activeSurveys.length > 0 && (
            <div className="ws-sidebar-section">
              <div className="ws-sidebar-section-label">Active ({activeSurveys.length})</div>
              {activeSurveys.map(s => (
                <NavLink key={s.id} to={`/surveys/${s.id}/edit`} className={`ws-sidebar-item${loc.pathname.includes(s.id) ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
                  <div className="ws-sidebar-item-icon">📊</div>
                  <div className="ws-sidebar-item-text">
                    <span className="ws-sidebar-item-title">{s.title}</span>
                    <span className="ws-sidebar-item-meta">{s.questions?.length || 0} questions</span>
                  </div>
                  <div className="ws-sidebar-item-actions">
                    <Link to={`/surveys/${s.id}/analytics`} className="ws-sidebar-item-action" title="Analytics" onClick={e => e.stopPropagation()}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                    </Link>
                    <button className="ws-sidebar-item-action danger" title="Delete" onClick={e => handleDeleteSurvey(e, s.id)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </NavLink>
              ))}
            </div>
          )}

          {/* Draft Surveys */}
          {draftSurveys.length > 0 && (
            <div className="ws-sidebar-section">
              <div className="ws-sidebar-section-label">Drafts ({draftSurveys.length})</div>
              {draftSurveys.map(s => {
                const isPromptDraft = !s.questions || s.questions.length === 0;
                const linkTo = isPromptDraft ? `/surveys/new?draftId=${s.id}` : `/surveys/${s.id}/edit`;
                return (
                  <NavLink key={s.id} to={linkTo} className={`ws-sidebar-item${loc.pathname.includes(s.id) ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
                    <div className="ws-sidebar-item-icon">{isPromptDraft ? '🖋️' : '📝'}</div>
                    <div className="ws-sidebar-item-text">
                      <span className="ws-sidebar-item-title">{s.title}</span>
                      <span className="ws-sidebar-item-meta">{isPromptDraft ? 'Prompting...' : `Draft · ${s.questions?.length || 0} q`}</span>
                    </div>
                    <div className="ws-sidebar-item-actions">
                      <Link to={linkTo} className="ws-sidebar-item-action" title="Continue editing" onClick={e => e.stopPropagation()}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </Link>
                      <button className="ws-sidebar-item-action danger" title="Delete" onClick={e => handleDeleteSurvey(e, s.id)}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </NavLink>
                );
              })}
            </div>
          )}

          {/* Closed Surveys */}
          {closedSurveys.length > 0 && (
            <div className="ws-sidebar-section">
              <div className="ws-sidebar-section-label">Closed ({closedSurveys.length})</div>
              {closedSurveys.map(s => (
                <NavLink key={s.id} to={`/surveys/${s.id}/analytics`} className={`ws-sidebar-item${loc.pathname.includes(s.id) ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
                  <div className="ws-sidebar-item-icon" style={{ opacity: 0.5 }}>📋</div>
                  <div className="ws-sidebar-item-text">
                    <span className="ws-sidebar-item-title" style={{ opacity: 0.7 }}>{s.title}</span>
                    <span className="ws-sidebar-item-meta">{s.status}</span>
                  </div>
                </NavLink>
              ))}
            </div>
          )}

          {/* No surveys */}
          {surveys.length === 0 && !sidebarLoading && (
            <div className="ws-empty">
              <div className="ws-empty-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              </div>
              <div className="ws-empty-text">No surveys yet.<br />Create your first one!</div>
            </div>
          )}

          {/* Uploaded Files */}
          <div className="ws-sidebar-section">
            <div className="ws-sidebar-section-label">Files</div>
            <NavLink to="/files" className={`ws-sidebar-item${loc.pathname === '/files' ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
              <div className="ws-sidebar-item-icon">📁</div>
              <div className="ws-sidebar-item-text">
                <span className="ws-sidebar-item-title">All Files</span>
                <span className="ws-sidebar-item-meta">{files.length} uploaded</span>
              </div>
            </NavLink>
          </div>
        </div>

        {/* User Section at bottom */}
        <div className="ws-sidebar-user" ref={userRef}>
          <div className="ws-sidebar-avatar" onClick={() => setUserMenu(v => !v)}>
            {initials}
          </div>
          <div className="ws-sidebar-user-info" style={{ cursor: 'pointer' }} onClick={() => setUserMenu(v => !v)}>
            <div className="ws-sidebar-user-name">{profile?.full_name}</div>
            <div className="ws-sidebar-user-role">{(profile?.role || 'viewer').replace('_', ' ')}</div>
          </div>

          {/* ⌘K trigger */}
          <button onClick={() => setCmdOpen(true)} title="⌘K" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(253,245,232,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(253,245,232,0.25)'; e.currentTarget.style.background = 'rgba(253,245,232,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(253,245,232,0.1)'; e.currentTarget.style.background = 'transparent'; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(253,245,232,0.4)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </button>

          {/* Notifications */}
          <NotificationFeed placement="top" />

          {/* User dropdown menu */}
          <AnimatePresence>
            {userMenu && (
              <motion.div className="ws-user-menu"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}>
                <Link to="/billing" className="ws-user-menu-item" onClick={() => { setUserMenu(false); setMobileOpen(false); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                  Billing
                </Link>
                <Link to="/settings" className="ws-user-menu-item" onClick={() => { setUserMenu(false); setMobileOpen(false); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                  Settings
                </Link>
                <Link to="/reset-password" className="ws-user-menu-item" onClick={() => { setUserMenu(false); setMobileOpen(false); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Reset Password
                </Link>
                <div style={{ borderTop: '1px solid rgba(253,245,232,0.08)', margin: '4px 0' }} />
                <button className="ws-user-menu-item danger" onClick={handleSignOut}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* ── CONTENT AREA ── */}
      <div className="ws-content">
        <main className="ws-content-main">
          <Outlet context={{ refreshFiles }} />
        </main>

        {/* Footer */}
        <footer style={{ maxWidth: 1320, margin: '0 auto', padding: '12px 48px 14px', width: '100%', boxSizing: 'border-box', borderTop: '1px solid rgba(22,15,8,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(22,15,8,0.25)', textAlign: 'center', margin: 0 }}>
            © 2026 Axiora Pulse is a product of Axiora Global Solutions · Built for researchers, by researchers · Hyderabad
          </p>
        </footer>
      </div>

      {/* Command Palette */}
      <AnimatePresence>
        {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
      </AnimatePresence>

      <style>{`
        .ws-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

/* LEFT SIDEBAR */
.ws-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  flex-shrink: 0;
}

/* MAIN CONTENT AREA */
.ws-content {
  flex: 1;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ONLY CENTER CONTENT SCROLLS */
.ws-content-main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

/* OPTIONAL RIGHT SIDEBAR */
.ws-right-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  flex-shrink: 0;
}
        .ws-sidebar-collapse-btn:hover {
          color: var(--coral) !important;
          background: rgba(253, 245, 232, 0.08) !important;
        }

        /* --- Left Sidebar Narrow Collapsed Strip Styles --- */
        @media (min-width: 769px) {
          .ws-layout.left-collapsed .ws-sidebar {
            width: 80px;
            min-width: 80px;
            padding-left: 0;
            padding-right: 0;
            align-items: center;
          }
          
          /* Enforce absolute spatial stability for the center content - no layout shifting! */
          .ws-layout.left-collapsed .ws-content {
  margin-left: 0;
  width: calc(100% - 80px);
}

.ws-layout:not(.left-collapsed) .ws-content {
  width: calc(100% - 280px);
}

          /* Hide labels, text, metadata and extra controls */
          .ws-layout.left-collapsed .ws-sidebar-logo-pre,
          .ws-layout.left-collapsed .ws-sidebar-logo-main,
          .ws-layout.left-collapsed .ws-sidebar-item-text,
          .ws-layout.left-collapsed .ws-sidebar-section-label,
          .ws-layout.left-collapsed .ws-sidebar-item-meta,
          .ws-layout.left-collapsed .ws-sidebar-user-info,
          .ws-layout.left-collapsed .ws-empty-text,
          .ws-layout.left-collapsed .ws-sidebar-user button,
          .ws-layout.left-collapsed .ws-notification-feed-trigger {
            display: none !important;
          }

          /* Center header elements */
          .ws-layout.left-collapsed .ws-sidebar-header {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 8px;
          }
          .ws-layout.left-collapsed .ws-sidebar-logo {
            justify-content: center;
            margin-bottom: 24px;
            padding: 0;
          }
          .ws-layout.left-collapsed .ws-sidebar-logo-dot {
            margin: 0 !important;
          }

          /* Render New Survey button as a premium centered circle, maintaining original espresso/coral color */
          .ws-layout.left-collapsed .ws-new-btn {
  width: 52px;
  height: 52px;
  min-width: 52px;
  min-height: 52px;
  border-radius: 18px;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 0;
  margin: 8px auto 18px;

  overflow: hidden;
}

/* HIDE TEXT COMPLETELY */
.ws-layout.left-collapsed .ws-new-btn span {
  display: none !important;
}

/* CENTER ICON */
.ws-layout.left-collapsed .ws-new-btn svg {
  margin: 0 !important;
  width: 18px;
  height: 18px;
}
          .ws-layout.left-collapsed .ws-new-btn svg {
            margin: 0 !important;
          }

          /* Center navigation item icons */
          .ws-layout.left-collapsed .ws-sidebar-item {
            justify-content: center;
            padding: 12px 0;
            margin: 6px auto;
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
          }
          .ws-layout.left-collapsed .ws-sidebar-item-icon {
            margin: 0 !important;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          /* Center user avatar section */
          .ws-layout.left-collapsed .ws-sidebar-user {
            justify-content: center;
            padding: 16px 0;
            width: 100%;
          }
          .ws-layout.left-collapsed .ws-sidebar-avatar {
            margin: 0 auto !important;
          }

          /* Smooth toggle transition positioning */
          .ws-layout.left-collapsed .ws-sidebar-header > div:first-child {
            flex-direction: column !important;
            align-items: center !important;
            gap: 16px !important;
          }
          .ws-layout.left-collapsed .ws-sidebar-collapse-btn {
            margin: 0 !important;
            padding: 8px !important;
          }
        }
      `}</style>
    </div>
  );
}
