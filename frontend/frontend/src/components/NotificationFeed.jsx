import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { timeAgo } from '../lib/constants';
import useAuthStore from '../hooks/useAuth';

const SEEN_KEY = 'np-seen-notifications';

function getSeenIds() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function markSeen(ids) {
  try {
    const existing = getSeenIds();
    ids.forEach(id => existing.add(id));
    // Keep max 200 ids to avoid unbounded growth
    const arr = [...existing].slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {}
}
function clearAllSeen() {
  try { localStorage.removeItem(SEEN_KEY); } catch {}
}

export default function NotificationFeed() {
  const [open, setOpen]       = useState(false);
  const [events, setEvents]   = useState([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  const { profile } = useAuthStore();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const load = useCallback(async () => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    try {
      const res = await API.get('/dashboard/feed');
      const feed = res.data || [];
      setEvents(feed);

      // Count unseen
      const seen = getSeenIds();
      const newCount = feed.filter(e => !seen.has(e.id)).length;
      setUnread(newCount);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [profile?.tenant_id]);

  useEffect(() => { load(); }, [load]);

  // Manual refresh available via button in UI. 
  // Realtime subscription removed as backend now uses FastAPI/SQLAlchemy.

  function handleOpen() {
    const nowOpen = !open;
    setOpen(nowOpen);
    if (nowOpen) {
      // Mark all current as seen when panel opens
      const ids = events.map(e => e.id);
      markSeen(ids);
      setUnread(0);
    }
  }

  function handleMarkAllRead() {
    const ids = events.map(e => e.id);
    markSeen(ids);
    setUnread(0);
  }

  function handleClear() {
    // Clear localStorage seen list so fresh notifications will appear again on next load
    // But visually mark all as read now
    handleMarkAllRead();
  }

  const seen = getSeenIds();

  const iconEl = (icon) => {
    if (icon === 'inbox') return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17.24 4H6.76a2 2 0 0 0-1.79 1.11z"/></svg>
    );
    if (icon === 'active') return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 3l14 9-14 9V3z"/></svg>
    );
    if (icon === 'paused') return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>
    );
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
    );
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        style={{ position: 'relative', background: open ? 'var(--cream-deep)' : 'none', border: 'none', cursor: 'pointer', padding: '7px', borderRadius: 10, color: open ? 'var(--espresso)' : 'rgba(22,15,8,0.4)', fontSize: 18, lineHeight: 1, transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--cream-deep)'; e.currentTarget.style.color = 'var(--espresso)'; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(22,15,8,0.4)'; } }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, background: 'var(--coral)', borderRadius: 999, border: '2px solid var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 8, color: '#fff', lineHeight: 1, padding: '0 3px' }}
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'absolute', right: 0, top: 48, zIndex: 500, width: 340, background: 'var(--warm-white)', borderRadius: 20, boxShadow: '0 32px 80px rgba(22,15,8,0.2), 0 2px 8px rgba(22,15,8,0.06)', border: '1px solid rgba(22,15,8,0.07)', overflow: 'hidden' }}
          >
            {/* Header */}
            <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(22,15,8,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--espresso)' }}>Activity</span>
                {unread > 0 && (
                  <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', background: 'var(--coral)', color: '#fff', borderRadius: 999, padding: '2px 6px' }}>{unread} new</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {unread > 0 && (
                  <button onClick={handleMarkAllRead}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--sage)', transition: 'opacity 0.2s', padding: '4px 8px', borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(30,122,74,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    ✓ Mark read
                  </button>
                )}
                <button onClick={load}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', transition: 'all 0.2s', padding: '4px 8px', borderRadius: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--coral)'; e.currentTarget.style.background = 'rgba(255,69,0,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(22,15,8,0.35)'; e.currentTarget.style.background = 'none'; }}>
                  ↺
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {loading && (
                <div style={{ padding: 24, textAlign: 'center', fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.35)' }}>Loading…</div>
              )}
              {!loading && events.length === 0 && (
                <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                  <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: 'rgba(22,15,8,0.15)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17.24 4H6.76a2 2 0 0 0-1.79 1.11z"/></svg>
                  </div>
                  <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)', margin: 0 }}>All caught up</p>
                  <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.25)', margin: '6px 0 0' }}>No recent activity</p>
                </div>
              )}
              {!loading && events.map((ev, i) => {
                const isNew = !seen.has(ev.id) && unread > 0;
                return (
                  <button key={ev.id}
                    onClick={() => { nav(ev.to); setOpen(false); markSeen([ev.id]); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', background: isNew ? 'rgba(255,69,0,0.03)' : 'none', border: 'none', borderBottom: '1px solid rgba(22,15,8,0.045)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s', position: 'relative' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(22,15,8,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = isNew ? 'rgba(255,69,0,0.03)' : 'none'}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: isNew ? 'rgba(255,69,0,0.1)' : 'rgba(22,15,8,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, color: isNew ? 'var(--coral)' : 'rgba(22,15,8,0.4)', transition: 'all 0.2s' }}>{iconEl(ev.icon)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Fraunces, serif', fontWeight: isNew ? 400 : 300, fontSize: 13, color: 'var(--espresso)', margin: '0 0 4px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.text}</p>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(22,15,8,0.3)' }}>{timeAgo(ev.time)}</span>
                    </div>
                    {isNew && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)', flexShrink: 0, marginTop: 8, boxShadow: '0 0 4px rgba(255,69,0,0.4)' }}/>}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            {events.length > 0 && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(22,15,8,0.06)', display: 'flex', justifyContent: 'center' }}>
                <button onClick={handleClear}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)', transition: 'color 0.2s', padding: '4px 12px', borderRadius: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--espresso)'; e.currentTarget.style.background = 'rgba(22,15,8,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(22,15,8,0.3)'; e.currentTarget.style.background = 'none'; }}>
                  Mark all as read
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
