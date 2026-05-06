import React, { useEffect, useState, useRef } from 'react';
import API from '../api/axios';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../hooks/useAuth';
import { ROLE_LABELS, hasPermission } from '../lib/constants';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';
import ConfirmModal from '../components/ConfirmModal';

const ROLE_COLORS = { super_admin: 'rgba(139,92,246,0.10)', admin: 'rgba(255,69,0,0.10)', manager: 'rgba(255,184,0,0.12)', creator: 'rgba(30,122,74,0.10)', viewer: 'rgba(22,15,8,0.06)' };
const ROLE_TEXT   = { super_admin: '#7C3AED', admin: 'var(--coral)', manager: '#A07000', creator: 'var(--sage)', viewer: 'rgba(22,15,8,0.38)' };

/* Shared field styles — mirrors SurveyCreate / SurveyEdit */
const inp   = { width: '100%', boxSizing: 'border-box', padding: '14px 18px', background: 'var(--cream)', border: '1.5px solid rgba(22,15,8,0.1)', borderRadius: 14, fontFamily: 'Fraunces, serif', fontSize: 15, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' };
const lbl   = { fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', display: 'block', marginBottom: 10 };

/* Pill button that matches espresso save / submit buttons */
const pillBtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 22px', borderRadius: 999, border: 'none',
  background: active ? 'var(--espresso)' : 'var(--cream-deep)',
  color: active ? 'var(--cream)' : 'rgba(22,15,8,0.5)',
  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  cursor: 'pointer', transition: 'all 0.2s',
});


// ── RoleDropdown — mirrors SurveyList sort dropdown exactly ──────────────────
function RoleDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(22,15,8,0.08)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'var(--warm-white)', color: ROLE_TEXT[value] || 'rgba(22,15,8,0.5)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'border-color 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.2)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(22,15,8,0.08)'}>
        {ROLE_LABELS[value]}
        <span style={{ fontSize: 7, opacity: 0.45 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 50, background: 'var(--espresso)', borderRadius: 14, padding: 6, boxShadow: '0 16px 48px rgba(22,15,8,0.25)', minWidth: '100%' }}>
          {Object.entries(ROLE_LABELS).filter(([v]) => {
            // admins cannot assign super_admin role (req #11)
            if (v === 'super_admin') return false;
            return true;
          }).map(([v, l]) => (
            <button key={v} onClick={() => { onChange(v); setOpen(false); }}
              style={{ display: 'block', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: v === value ? 'var(--coral)' : 'rgba(253,245,232,0.7)', borderRadius: 9, transition: 'background 0.15s', whiteSpace: 'nowrap' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(253,245,232,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              {v === value ? '✓  ' : ''}{l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamManagement() {
  const { profile, tenant } = useAuthStore();
  const { stopLoading } = useLoading();
  const [members, setMembers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [iE, sIE] = useState(''); const [iR, sIR] = useState('viewer'); const [iN, sIN] = useState('');
  const [busy, setBusy] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const location = useLocation();
  useEffect(() => { if (profile?.id) load(); else stopLoading(); }, [profile?.id, location.key]);

  async function load() {
    try {
      const res = await API.get('/users/');
      setMembers(res.data || []);
    } catch (e) { console.error(e); }
    finally { stopLoading(); }
  }
  async function invite(e) {
    e.preventDefault();
    if (!iE) return toast.error('Email required');
    setBusy(true);
    try {
      await API.post('/users/invite', { email: iE, role: iR, full_name: iN || null });
      toast.success(`Invited ${iE}`);
      setShowModal(false); sIE(''); sIN(''); sIR('viewer');
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send invite'); }
    finally { setBusy(false); }
  }
  async function chgRole(uid, newRole) {
    if (uid === profile.id) return toast.error("Can't change your own role");
    const target = members.find(m => m.id === uid);
    if (target?.role === 'super_admin') return toast.error("Super Admin's role cannot be changed");
    if (profile.role === 'admin' && newRole === 'super_admin') return toast.error("Admins cannot assign the Super Admin role");
    try {
      await API.patch(`/users/${uid}/role`, { role: newRole });
      toast.success('Role updated'); load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update role'); }
  }
  async function deactivate(uid) {
    if (uid === profile.id) return toast.error("Can't deactivate yourself");
    // req #11: admin cannot disable super_admin
    const target = members.find(m => m.id === uid);
    if (target?.role === 'super_admin') return toast.error("Super Admin cannot be disabled");
    setDeactivateTarget(uid);
  }

  // req #14: only super_admin can delete users
  function confirmDelete(uid) {
    if (profile.role !== 'super_admin') return toast.error("Only Super Admins can delete users");
    const target = members.find(m => m.id === uid);
    if (target?.role === 'super_admin') return toast.error("Super Admin cannot be deleted");
    setDeleteTarget(uid);
  }

  async function doDelete() {
    try {
      await API.delete(`/users/${deleteTarget}`);
      toast.success('User deleted'); setDeleteTarget(null); load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete user'); }
  }
  async function doDeactivate() {
    try {
      await API.patch(`/users/${deactivateTarget}/status`, { is_active: false });
      toast.success('Member deactivated'); load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to deactivate'); }
  }
  async function reactivate(uid) {
    if (uid === profile.id) return;
    try {
      await API.patch(`/users/${uid}/status`, { is_active: true });
      toast.success('Member reactivated'); load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to reactivate'); }
  }

  return (
    <div>
      <ConfirmModal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate member?"
        body="This member will lose access to the workspace. You can reactivate them later by updating their profile."
        confirmLabel="Deactivate"
        danger
        onConfirm={doDeactivate}
      />
      {/* req #14: delete only for super_admin */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete user permanently?"
        body="This will permanently delete the user and all their data. This cannot be undone."
        confirmLabel="Delete permanently"
        danger
        onConfirm={doDelete}
      />
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 48 }}>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 10 }}>Organisation</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(32px,4vw,48px)', letterSpacing: '-2px', color: 'var(--espresso)', margin: 0 }}>Team</h1>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.4)', marginTop: 6 }}>{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        {hasPermission(profile?.role, 'manage_team') && (() => {
          const hasNoDomains = !tenant?.approved_domains?.length;
          // req #6: super_admin must configure domains first; admins see the same gate
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {hasNoDomains && (
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A07000', background: 'rgba(255,184,0,0.1)', padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(255,184,0,0.2)' }}>
                  ⚠ Set approved domains in Settings first
                </span>
              )}
              <button
                onClick={() => { if (hasNoDomains) return toast.error('Configure approved email domains in Settings before inviting.'); setShowModal(true); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: hasNoDomains ? 'rgba(22,15,8,0.2)' : 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '14px 28px', borderRadius: 999, border: 'none', cursor: hasNoDomains ? 'not-allowed' : 'pointer', transition: 'background 0.25s ease' }}
                onMouseEnter={e => { if (!hasNoDomains) e.currentTarget.style.background = 'var(--coral)'; }}
                onMouseLeave={e => { if (!hasNoDomains) e.currentTarget.style.background = 'var(--espresso)'; }}>
                + Invite member
              </button>
            </div>
          );
        })()}
      </div>

      {/* Member grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 16 }}>
        {members.map(m => (
          <div key={m.id}
            style={{ background: 'var(--warm-white)', borderRadius: 20, border: `1.5px solid ${m.is_active === false ? 'rgba(214,59,31,0.12)' : 'rgba(22,15,8,0.07)'}`, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16, opacity: m.is_active === false ? 0.6 : 1, transition: 'box-shadow 0.2s, opacity 0.3s' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 12px 40px rgba(22,15,8,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

            {/* Avatar */}
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--espresso)', color: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 17, flexShrink: 0, letterSpacing: '-0.5px' }}>
              {m.full_name?.[0]?.toUpperCase() || '?'}
            </div>

            {/* Info — name, email, role badge */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 15, color: 'var(--espresso)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.full_name || 'Unnamed'}
                </div>
                {m.id === profile.id && (
                  <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)', background: 'var(--cream-deep)', padding: '3px 8px', borderRadius: 999 }}>You</span>
                )}
                {m.is_active === false && (
                  <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--terracotta)', background: 'rgba(214,59,31,0.08)', padding: '3px 8px', borderRadius: 999 }}>Disabled</span>
                )}
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 12, color: 'rgba(22,15,8,0.38)', marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>

              {/* Role — custom dropdown matching SurveyList sort style */}
              {hasPermission(profile?.role, 'manage_team') && m.id !== profile.id ? (
                <RoleDropdown value={m.role} onChange={role => chgRole(m.id, role)} />
              ) : (
                <span style={{ display: 'inline-block', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 999, background: ROLE_COLORS[m.role], color: ROLE_TEXT[m.role] }}>
                  {ROLE_LABELS[m.role]}
                </span>
              )}
            </div>

            {/* Action — enable / deactivate */}
            {hasPermission(profile?.role, 'manage_team') && m.id !== profile.id && m.role !== 'super_admin' && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {m.is_active === false ? (
                  <button onClick={() => reactivate(m.id)} title="Re-enable member"
                    style={{ padding: '8px 16px', borderRadius: 999, border: 'none', background: 'rgba(30,122,74,0.1)', color: 'var(--sage)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--sage)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30,122,74,0.1)'; e.currentTarget.style.color = 'var(--sage)'; }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Enable
                  </button>
                ) : (
                  /* req #15: both admin and super_admin can disable */
                  <button onClick={() => deactivate(m.id)} title="Disable member"
                    style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'none', color: 'rgba(22,15,8,0.2)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--terracotta)'; e.currentTarget.style.background = 'rgba(214,59,31,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(22,15,8,0.2)'; e.currentTarget.style.background = 'none'; }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  </button>
                )}
                {/* req #14: only super_admin sees delete button */}
                {profile.role === 'super_admin' && (
                  <button onClick={() => confirmDelete(m.id)} title="Delete user permanently"
                    style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'none', color: 'rgba(22,15,8,0.15)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--terracotta)'; e.currentTarget.style.background = 'rgba(214,59,31,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(22,15,8,0.15)'; e.currentTarget.style.background = 'none'; }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Invite modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,15,8,0.3)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--warm-white)', borderRadius: 24, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 40px 100px rgba(22,15,8,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <h3 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 26, letterSpacing: '-1px', color: 'var(--espresso)', margin: 0 }}>Invite member</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 20, lineHeight: 1, transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--espresso)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.3)'}>✕</button>
            </div>
            <form onSubmit={invite} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[{ l: 'Name', v: iN, sv: sIN, t: 'text', ph: 'Jane Smith' }, { l: 'Email *', v: iE, sv: sIE, t: 'email', ph: 'jane@company.com' }].map(f => (
                <div key={f.l}>
                  <label style={lbl}>{f.l}</label>
                  <input type={f.t} value={f.v} onChange={e => f.sv(e.target.value)} placeholder={f.ph} required={f.t === 'email'}
                    style={inp}
                    onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
                </div>
              ))}
              <div>
                <label style={lbl}>Role</label>
                <select value={iR} onChange={e => sIR(e.target.value)} style={inp}
                  onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}>
                  {['viewer','creator','manager','admin'].map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: '13px 20px', borderRadius: 999, border: '1px solid rgba(22,15,8,0.1)', background: 'transparent', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.5)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  style={{ flex: 1, padding: '13px 20px', borderRadius: 999, border: 'none', background: busy ? 'rgba(22,15,8,0.3)' : 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: busy ? 'not-allowed' : 'pointer', transition: 'background 0.25s' }}
                  onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--coral)'; }}
                  onMouseLeave={e => { if (!busy) e.currentTarget.style.background = 'var(--espresso)'; }}>
                  {busy ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
