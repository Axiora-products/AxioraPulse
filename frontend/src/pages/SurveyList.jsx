import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import API from '../api/axios';
import useAuthStore from '../hooks/useAuth';
import { hasPermission, SURVEY_STATUS, timeAgo, isExpired, formatDate } from '../lib/constants';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';
import ConfirmModal from '../components/ConfirmModal';

const STATUS_FILTERS = ['all', 'active', 'draft', 'paused', 'expired', 'closed'];
const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc',  label: 'Oldest first' },
  { value: 'title_asc',    label: 'Title A–Z' },
  { value: 'title_desc',   label: 'Title Z–A' },
];

export default function SurveyList() {
  const { profile } = useAuthStore();
  const nav = useNavigate();
  const { stopLoading } = useLoading();
  const [surveys, setSurveys] = useState([]);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [sort, setSort]         = useState('created_desc');
  const [sortOpen, setSortOpen] = useState(false);
  const [menu, setMenu]       = useState(null);
  const sortRef = useRef(null);
  const menuRef = useRef({});

  // ── Click-outside: close sort dropdown ───────────────────────────────────
  useEffect(() => {
    if (!sortOpen) return;
    const h = e => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [sortOpen]);

  // ── Click-outside: close kebab menu ──────────────────────────────────────
  useEffect(() => {
    if (!menu) return;
    const h = e => {
      const ref = menuRef.current[menu];
      if (ref && !ref.contains(e.target)) setMenu(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  // ── ConfirmModal state ────────────────────────────────────────────────────
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [confirmProps, setConfirmProps] = useState({});

  // ── Extend prompt state ───────────────────────────────────────────────────
  const [extendOpen,  setExtendOpen]  = useState(false);
  const [extendId,    setExtendId]    = useState(null);

  const location = useLocation();
  useEffect(() => { if (profile?.id) load(); else stopLoading(); }, [profile?.id, location.key]);

  async function load() {
    try {
      const res = await API.get('/surveys/');
      setSurveys(res.data || []);
    } catch (e) { console.error(e); }
    finally { stopLoading(); }
  }

  // ── Sorted + filtered list ────────────────────────────────────────────────
  const list = surveys
    .filter(s =>
      s.title.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || s.status === filter)
    )
    .sort((a, b) => {
      if (sort === 'created_desc') return new Date(b.created_at) - new Date(a.created_at);
      if (sort === 'created_asc')  return new Date(a.created_at) - new Date(b.created_at);
      if (sort === 'title_asc')    return a.title.localeCompare(b.title);
      if (sort === 'title_desc')   return b.title.localeCompare(a.title);
      return 0;
    });

  // ── Actions ───────────────────────────────────────────────────────────────
  function confirmDelete(id, title) {
    setMenu(null);
    setConfirmProps({
      title: 'Delete survey?',
      body: `"${title}" and all its responses will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
      onConfirm: () => doDelete(id),
    });
    setConfirmOpen(true);
  }

  async function doDelete(id) {
    try {
      await API.delete(`/surveys/${id}`);
      setSurveys(p => p.filter(s => s.id !== id));
      toast.success('Survey deleted');
    } catch (e) { toast.error('Failed to delete survey'); }
  }

  async function chg(id, st) {
    const sv = surveys.find(s => s.id === id);
    if (st === 'active' && isExpired(sv?.expires_at)) {
      setMenu(null);
      setExtendId(id);
      setExtendOpen(true);
      return;
    }
    if (st === 'active' && sv.questions.length < 2) {
      return toast.error('At least 2 questions are required to publish');
    }
    try {
      await API.patch(`/surveys/${id}/status`, { status: st });
      toast.success('Updated'); setMenu(null); load();
    } catch (e) { toast.error('Failed to update status'); }
  }

  async function doExtend(days) {
    const x = new Date();
    x.setDate(x.getDate() + parseInt(days || 7));
    try {
      await API.patch(`/surveys/${extendId}`, { status: 'active', expires_at: x.toISOString() });
      toast.success('Survey reactivated'); load();
    } catch (e) { toast.error('Failed to reactivate survey'); }
  }

  function copy(slug) {
    const appOrigin = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    navigator.clipboard.writeText(`${appOrigin}/s/${slug}`);
    toast.success('Link copied!'); setMenu(null);
  }

  async function duplicate(sv) {
    setMenu(null);
    try {
      const res = await API.post(`/surveys/${sv.id}/duplicate`);
      toast.success('Survey duplicated!');
      nav(`/surveys/${res.data.id}/edit`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to duplicate');
    }
  }

  const STATUS_COLORS = {
    active: 'var(--sage)', draft: 'rgba(22,15,8,0.25)',
    paused: 'var(--saffron)', expired: 'var(--terracotta)', closed: 'var(--terracotta)',
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Confirm Modal ── */}
      <ConfirmModal open={confirmOpen} onClose={() => setConfirmOpen(false)} {...confirmProps} />

      {/* ── Extend expiry prompt ── */}
      <ConfirmModal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title="Reactivate survey"
        body="This survey has expired. Extend the expiry date to make it active again."
        confirmLabel="Reactivate"
        prompt={{ label: 'Extend by (days)', defaultValue: '7', type: 'number', min: 1, max: 365 }}
        onConfirm={doExtend}
      />

      {/* Header */}
      <div className="np-page-header">
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 10 }}>Research</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(32px,4vw,48px)', letterSpacing: '-2px', color: 'var(--espresso)', margin: 0 }}>Surveys</h1>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.5)', marginTop: 6 }}>{surveys.length} total</p>
        </div>
        {hasPermission(profile?.role, 'create_survey') && (
          <Link to="/surveys/new"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '14px 28px', borderRadius: 999, textDecoration: 'none', transition: 'background 0.25s ease' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--coral)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--espresso)'}>
            + New Survey
          </Link>
        )}
      </div>

      {/* Search + filters + sort */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 36, flexWrap: 'wrap', alignItems: 'center' }} className="np-filter-bar">
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search surveys…"
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 44, paddingRight: 20, paddingTop: 12, paddingBottom: 12, background: 'var(--warm-white)', border: '1px solid rgba(22,15,8,0.1)', borderRadius: 999, fontFamily: 'Fraunces, serif', fontSize: 14, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor = 'var(--coral)'}
            onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
          />
        </div>

        {/* Status filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '10px 16px', borderRadius: 999, border: `1px solid ${filter === f ? 'transparent' : 'rgba(22,15,8,0.08)'}`, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'all 0.2s', background: filter === f ? 'var(--espresso)' : 'var(--warm-white)', color: filter === f ? 'var(--cream)' : 'rgba(22,15,8,0.5)' }}>
              {f === 'all' ? 'All' : SURVEY_STATUS[f]?.label || f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ position: 'relative' }} ref={sortRef}>
          <button onClick={() => setSortOpen(o => !o)}
            style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(22,15,8,0.08)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--warm-white)', color: 'rgba(22,15,8,0.5)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'border-color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.2)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.08)'}>
            {SORT_OPTIONS.find(o => o.value === sort)?.label}
            <span style={{ fontSize: 8, opacity: 0.45 }}>{sortOpen ? '▲' : '▼'}</span>
          </button>
          {sortOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, background: 'var(--espresso)', borderRadius: 14, padding: 6, boxShadow: '0 16px 48px rgba(22,15,8,0.2)', minWidth: '100%' }}>
              {SORT_OPTIONS.map(o => (
                <button key={o.value} onClick={() => { setSort(o.value); setSortOpen(false); }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: sort === o.value ? 'var(--coral)' : 'rgba(253,245,232,0.7)', borderRadius: 9, transition: 'background 0.15s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(253,245,232,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  {sort === o.value ? '✓  ' : ''}{o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      {list.length === 0 ? (
        <div style={{ background: 'var(--warm-white)', borderRadius: 24, border: '1px solid rgba(22,15,8,0.07)', textAlign: 'center', padding: '80px 40px' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: 64, color: 'rgba(22,15,8,0.06)', fontWeight: 900, letterSpacing: -3, marginBottom: 16 }}>Empty</div>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 16, color: 'rgba(22,15,8,0.5)' }}>
            {search || filter !== 'all' ? 'No surveys match your filter.' : 'No surveys yet — create your first one.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 20, position: 'relative', zIndex: 1 }}>
          {list.map((sv, i) => (
            <motion.div key={sv.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              whileHover={{ y: -4, boxShadow: '0 24px 60px rgba(22,15,8,0.1)' }}
              style={{ background: 'var(--warm-white)', borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)', overflow: 'visible', position: 'relative', zIndex: menu === sv.id ? 100 : 1 }}>

              {/* Colour accent bar */}
              <div style={{ height: 3, borderRadius: '20px 20px 0 0', background: sv.theme_color || 'var(--coral)' }} />

              <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[sv.status] || 'rgba(22,15,8,0.25)', boxShadow: sv.status === 'active' ? '0 0 6px rgba(30,122,74,0.5)' : 'none' }} />
                    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: STATUS_COLORS[sv.status] || 'rgba(22,15,8,0.4)' }}>
                      {SURVEY_STATUS[sv.status]?.label || 'Draft'}
                    </span>
                  </div>

                  {/* Kebab menu */}
                  <div style={{ position: 'relative' }} ref={el => menuRef.current[sv.id] = el}>
                    <button onClick={() => setMenu(menu === sv.id ? null : sv.id)}
                      aria-label="Survey options"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8, color: 'rgba(22,15,8,0.3)', transition: 'all 0.2s', fontSize: 18, lineHeight: 1 }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--cream-deep)'; e.currentTarget.style.color = 'var(--espresso)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(22,15,8,0.3)'; }}>
                      ···
                    </button>
                    {menu === sv.id && (
                      <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 200, width: 190, background: 'var(--espresso)', borderRadius: 16, padding: 8, boxShadow: '0 24px 60px rgba(22,15,8,0.25)' }}>
                        {[
                          { label: 'Edit',        icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, action: () => { nav(`/surveys/${sv.id}/edit`); setMenu(null); } },
                          { label: 'Analytics',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M7 20V12M11 20V8M15 20V14M19 20V4"/></svg>, action: () => { nav(`/surveys/${sv.id}/analytics`); setMenu(null); } },
                          // Copy link — only shown when survey is NOT in draft
                          sv.status !== 'draft' && { label: 'Copy link', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, action: () => copy(sv.slug) },
                          { label: 'Duplicate',   icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>, action: () => duplicate(sv) },
                          sv.status !== 'active' && { label: 'Activate',  icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5V8.5z" fill="currentColor" stroke="none"/></svg>, action: () => chg(sv.id, 'active'), coral: true },
                          sv.status === 'active' && { label: 'Pause',     icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="14" y1="8" x2="14" y2="16"/></svg>, action: () => chg(sv.id, 'paused') },
                          hasPermission(profile?.role, 'delete_survey') && sv.status === 'draft' && { label: 'Delete', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>, action: () => confirmDelete(sv.id, sv.title), danger: true },
                        ].filter(Boolean).map(item => (
                          <button key={item.label} onClick={item.action}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: item.danger ? 'var(--terracotta)' : item.coral ? 'var(--coral)' : 'rgba(253,245,232,0.7)', borderRadius: 10, transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(253,245,232,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <span style={{ opacity: 0.7, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Link to={`/surveys/${sv.id}/edit`} style={{ textDecoration: 'none' }}>
                  <h3 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 18, color: 'var(--espresso)', lineHeight: 1.3, marginBottom: 8, transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--coral)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--espresso)'}>
                    {sv.title}
                  </h3>
                </Link>

                <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 12, color: 'rgba(22,15,8,0.5)' }}>
                  {timeAgo(sv.created_at)} · {sv.creator?.full_name || '—'}
                </p>
                {sv.expires_at && (
                  <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isExpired(sv.expires_at) ? 'var(--terracotta)' : 'rgba(22,15,8,0.4)', marginTop: 4 }}>
                    {isExpired(sv.expires_at) ? 'Expired' : `Expires ${formatDate(sv.expires_at)}`}
                  </p>
                )}

                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(22,15,8,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Link to={`/surveys/${sv.id}/analytics`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--coral)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.4)'}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M7 20V12M11 20V8M15 20V14M19 20V4"/></svg>
                    Analytics
                  </Link>
                  <Link to={`/surveys/${sv.id}/edit`} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--espresso)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.4)'}>
                    Edit
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
