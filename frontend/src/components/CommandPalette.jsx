import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api/axios';
import useAuthStore from '../hooks/useAuth';
import { hasPermission } from '../lib/constants';
import toast from 'react-hot-toast';

// ── Static actions ────────────────────────────────────────────────────────────
// Icon IDs map to compact SVG paths rendered inline
const ICON_PATHS = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
  surveys:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>,
  analytics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M7 20V12M11 20V8M15 20V14M19 20V4"/></svg>,
  team:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="3"/><path d="M3 21v-1a6 6 0 0 1 6-6v0a6 6 0 0 1 6 6v1"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-1a4 4 0 0 0-3-3.85"/></svg>,
  settings:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  new:       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  edit:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
};

const STATIC_ACTIONS = [
  { id: 'nav-dashboard',  label: 'Go to Dashboard',    icon: 'dashboard', group: 'Navigate', to: '/dashboard' },
  { id: 'nav-surveys',    label: 'Go to Surveys',       icon: 'surveys',   group: 'Navigate', to: '/surveys' },
  { id: 'nav-analytics',  label: 'Go to Analytics',     icon: 'analytics', group: 'Navigate', to: '/surveys' },
  { id: 'nav-team',       label: 'Go to Team',          icon: 'team',      group: 'Navigate', to: '/team', perm: 'manage_team' },
  { id: 'nav-settings',   label: 'Go to Settings',      icon: 'settings',  group: 'Navigate', to: '/settings' },
  { id: 'new-survey',     label: 'Create New Survey',   icon: 'new',       group: 'Actions',  to: '/surveys/new', perm: 'create_survey' },
];

export default function CommandPalette({ onClose }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const nav = useNavigate();
  const { profile } = useAuthStore();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const search = useCallback(async (q) => {
    const trimmed = q.trim().toLowerCase();

    // Filter static actions
    const staticFiltered = STATIC_ACTIONS.filter(a => {
      if (a.perm && !hasPermission(profile?.role, a.perm)) return false;
      return !trimmed || a.label.toLowerCase().includes(trimmed) || a.group.toLowerCase().includes(trimmed);
    });

    if (!trimmed) {
      setResults(staticFiltered.slice(0, 8));
      setSelected(0);
      return;
    }

    setLoading(true);
    try {
      const { data: surveys } = await API.get('/surveys/', { 
        params: { q: trimmed } 
      });

      const surveyActions = (surveys || []).flatMap(sv => [
        { id: `sv-edit-${sv.id}`,     label: sv.title,             icon: 'edit',      group: 'Surveys', to: `/surveys/${sv.id}/edit`,      meta: sv.status },
        { id: `sv-analytics-${sv.id}`, label: `${sv.title} — Analytics`, icon: 'analytics', group: 'Surveys', to: `/surveys/${sv.id}/analytics` },
      ]);

      const combined = [...staticFiltered, ...surveyActions].slice(0, 10);
      setResults(combined);
      setSelected(0);
    } catch (e) {
      console.error('Palette search error:', e);
      setResults(staticFiltered);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 120);
    return () => clearTimeout(t);
  }, [query, search]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter')      { e.preventDefault(); execute(results[selected]); }
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [results, selected]);

  function execute(item) {
    if (!item) return;
    nav(item.to);
    onClose();
  }

  // Group results
  const grouped = results.reduce((acc, item, idx) => {
    const g = item.group;
    if (!acc[g]) acc[g] = [];
    acc[g].push({ ...item, _idx: idx });
    return acc;
  }, {});

  const statusColor = { active: 'var(--sage)', draft: 'rgba(22,15,8,0.3)', paused: 'var(--saffron)', expired: 'var(--terracotta)', closed: 'var(--terracotta)' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(22,15,8,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', padding: '12vh 24px 24px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: -16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: 700, background: 'var(--warm-white)', borderRadius: 22, boxShadow: '0 48px 120px rgba(22,15,8,0.4)', overflow: 'hidden', border: '1px solid rgba(22,15,8,0.06)' }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px', borderBottom: '1.5px solid rgba(22,15,8,0.07)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(22,15,8,0.3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Where to? Search surveys, pages, actions…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 300, color: 'var(--espresso)', caretColor: 'var(--coral)' }}
          />
          {loading ? (
            <div style={{ width: 14, height: 14, border: '2px solid rgba(22,15,8,0.1)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'nx-spin 0.6s linear infinite' }} />
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <kbd style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 8px', borderRadius: 7, background: 'var(--cream-deep)', color: 'rgba(22,15,8,0.35)', border: '1px solid rgba(22,15,8,0.1)' }}>ESC</kbd>
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ maxHeight: 520, overflowY: 'auto', padding: '10px 10px' }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--cream-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(22,15,8,0.25)" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)', marginBottom: 6 }}>No results</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.3)' }}>Try "create", "settings", or a survey name</div>
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} style={{ marginBottom: 4 }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.25)', padding: '10px 14px 6px' }}>
                {group}
              </div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setSelected(item._idx)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: item.id === 'new-survey' ? '13px 14px' : '11px 14px',
                    borderRadius: 12,
                    border: item.id === 'new-survey' ? '1.5px solid rgba(255,69,0,0.18)' : 'none',
                    background: item.id === 'new-survey'
                      ? (selected === item._idx ? 'var(--coral)' : 'rgba(255,69,0,0.05)')
                      : (selected === item._idx ? 'var(--espresso)' : 'transparent'),
                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s',
                    marginBottom: item.id === 'new-survey' ? 2 : 0,
                  }}
                >
                  <span style={{
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, borderRadius: 8,
                    background: item.id === 'new-survey'
                      ? (selected === item._idx ? 'rgba(255,255,255,0.18)' : 'rgba(255,69,0,0.12)')
                      : (selected === item._idx ? 'rgba(253,245,232,0.1)' : 'var(--cream-deep)'),
                    color: item.id === 'new-survey'
                      ? (selected === item._idx ? '#fff' : 'var(--coral)')
                      : (selected === item._idx ? 'rgba(253,245,232,0.8)' : 'rgba(22,15,8,0.45)'),
                  }}>
                    {ICON_PATHS[item.icon] || ICON_PATHS.edit}
                  </span>
                  <span style={{
                    fontFamily: 'Syne, sans-serif', fontSize: 12, fontWeight: 700,
                    color: item.id === 'new-survey'
                      ? (selected === item._idx ? '#fff' : 'var(--coral)')
                      : (selected === item._idx ? 'var(--cream)' : 'var(--espresso)'),
                    flex: 1, letterSpacing: '0.02em',
                  }}>
                    {item.label}
                  </span>
                  {item.meta && (
                    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: selected === item._idx ? 'rgba(253,245,232,0.4)' : statusColor[item.meta] || 'rgba(22,15,8,0.3)', flexShrink: 0 }}>
                      {item.meta}
                    </span>
                  )}
                  <kbd style={{
                    fontFamily: 'Syne, sans-serif', fontSize: 9, padding: '3px 7px', borderRadius: 6,
                    background: item.id === 'new-survey'
                      ? (selected === item._idx ? 'rgba(255,255,255,0.18)' : 'rgba(255,69,0,0.08)')
                      : (selected === item._idx ? 'rgba(253,245,232,0.12)' : 'var(--cream-deep)'),
                    color: item.id === 'new-survey'
                      ? (selected === item._idx ? 'rgba(255,255,255,0.7)' : 'var(--coral)')
                      : (selected === item._idx ? 'rgba(253,245,232,0.5)' : 'rgba(22,15,8,0.3)'),
                    border: `1px solid ${item.id === 'new-survey' ? 'rgba(255,69,0,0.12)' : (selected === item._idx ? 'rgba(253,245,232,0.1)' : 'rgba(22,15,8,0.08)')}`,
                    flexShrink: 0,
                  }}>↵</kbd>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '12px 24px', borderTop: '1.5px solid rgba(22,15,8,0.06)', display: 'flex', gap: 18, alignItems: 'center' }}>
          {[['↑↓', 'Navigate'], ['↵', 'Open'], ['Esc', 'Dismiss']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <kbd style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, padding: '3px 7px', borderRadius: 5, background: 'var(--cream-deep)', color: 'rgba(22,15,8,0.4)', border: '1px solid rgba(22,15,8,0.08)' }}>{key}</kbd>
              <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 600, color: 'rgba(22,15,8,0.3)', letterSpacing: '0.08em' }}>{label}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.2)' }}>Axiora Command</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
