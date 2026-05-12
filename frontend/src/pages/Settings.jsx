import React, { useState, useEffect } from 'react';
import useAuthStore from '../hooks/useAuth';
import { hasPermission, ROLE_LABELS } from '../lib/constants';
import toast from 'react-hot-toast';
import { useLoading } from '../context/LoadingContext';
import API from '../api/axios';

const card  = { background: 'var(--warm-white)', borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)', padding: '36px 40px', marginBottom: 20 };
const label = { fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', display: 'block', marginBottom: 10 };
const inp   = { width: '100%', boxSizing: 'border-box', padding: '14px 18px', background: 'var(--cream)', border: '1px solid rgba(22,15,8,0.1)', borderRadius: 12, fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s' };
const dis   = { ...inp, background: 'var(--cream-deep)', color: 'rgba(22,15,8,0.3)', cursor: 'not-allowed' };
const btn   = { padding: '13px 28px', borderRadius: 999, border: 'none', background: 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.25s ease' };
const secH  = { fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 28 };

// ── ApprovedDomainsCard ───────────────────────────────────────────────────────
// req #5/#6/#12/#13: only super_admin can view/edit; saved per tenant
function ApprovedDomainsCard({ tenant, onSaved }) {
  const [domains, setDomains] = React.useState(() =>
    (tenant?.approved_domains || []).join(', ')
  );
  const [saving, setSaving] = React.useState(false);

  // Keep in sync if tenant reloads
  React.useEffect(() => {
    setDomains((tenant?.approved_domains || []).join(', '));
  }, [tenant?.id]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const parsed = domains
        .split(/[,\n]+/)
        .map(d => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(d => d && d.includes('.'));

      if (parsed.length === 0) {
        toast.error('Enter at least one valid domain (e.g. company.com)');
        return;
      }

      await API.patch('/tenants/me', { approved_domains: parsed });
      onSaved(parsed);
      setDomains(parsed.join(', '));
      toast.success('Approved domains saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to save domains');
    } finally {
      setSaving(false);
    }
  }

  const approvedList = (tenant?.approved_domains || []);

  return (
    <div style={card}>
      <div style={secH}>Approved Email Domains</div>
      <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.5)', lineHeight: 1.65, marginBottom: 20, marginTop: -16 }}>
        Invitations can only be sent to addresses belonging to these domains.
        You must set at least one domain before any invites can be sent.
      </p>

      {/* Current approved domains pill list */}
      {approvedList.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {approvedList.map(d => (
            <span key={d} style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '5px 12px', borderRadius: 999, background: 'rgba(30,122,74,0.1)', color: 'var(--sage)', border: '1px solid rgba(30,122,74,0.15)' }}>
              @{d}
            </span>
          ))}
        </div>
      )}

      {approvedList.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)', marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A07000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#A07000' }}>No domains set — invitations are blocked until you add at least one.</span>
        </div>
      )}

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={label}>Domains (comma-separated)</label>
          <textarea
            value={domains}
            onChange={e => setDomains(e.target.value)}
            placeholder="company.com, partner.org"
            rows={3}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
            onFocus={e => e.target.style.borderColor = 'var(--coral)'}
            onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'}
          />
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 12, color: 'rgba(22,15,8,0.38)', marginTop: 8 }}>
            Enter domains without the @ sign, e.g. <em>acme.com</em>. Separate multiple domains with commas.
          </p>
        </div>
        <div>
          <button type="submit" disabled={saving} style={{ ...btn, opacity: saving ? 0.5 : 1 }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'var(--coral)'; }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = 'var(--espresso)'; }}>
            {saving ? 'Saving…' : 'Save domains'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Settings() {
  // BUG FIX: Destructure updateTenant from the store — previously the org save
  // updated Supabase but never synced back to Zustand, so the nav header kept
  // showing the old org name until a full page refresh.
  const { profile, tenant, updateProfile, updateTenant } = useAuthStore();
  const { stopLoading } = useLoading();
  // No async data fetch — stop the nav spinner immediately
  useEffect(() => { stopLoading(); }, [stopLoading]);
  const [pF, sPF] = useState({ full_name: profile?.full_name || '' });
  const [tF, sTF] = useState({ name: tenant?.name || '', primary_color: tenant?.primary_color || '#FF4500' });
  const [sP, sSP] = useState(false);
  const [sT, sST] = useState(false);
  const [pwF, setPwF] = useState({ current: '', next: '', confirm: '' });
  const [sPw, setSPw] = useState(false);

  async function savePw(e) {
    e.preventDefault();
    if (pwF.next.length < 8) return toast.error('Password must be at least 8 characters');
    if (pwF.next !== pwF.confirm) return toast.error('Passwords do not match');
    setSPw(true);
    try {
      await API.patch('/auth/me/password', { new_password: pwF.next });
      toast.success('Password updated');
      setPwF({ current: '', next: '', confirm: '' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update password');
    } finally { setSPw(false); }
  }

  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('np-theme', next ? 'dark' : 'light');
  }

  // Sync approved_domains back into the Zustand store after save
  // (updateTenant re-fetches the whole row; this is a lightweight local patch)
  function syncDomains(domains) {
    useAuthStore.setState(s => ({ tenant: s.tenant ? { ...s.tenant, approved_domains: domains } : s.tenant }));
  }

  async function saveP(e) {
    e.preventDefault(); sSP(true);
    try { await updateProfile({ full_name: pF.full_name }); toast.success('Profile saved'); }
    catch (e) { toast.error(e.message); } finally { sSP(false); }
  }

  async function saveT(e) {
    e.preventDefault();
    if (!tenant?.id) return toast.error('Organisation not loaded');
    sST(true);
    try {
      // BUG FIX: Use updateTenant from the store instead of calling supabase directly.
      // This updates both the DB and the Zustand store in one step, so the nav
      // header reflects the new name immediately without a page refresh.
      await updateTenant({ name: tF.name, primary_color: tF.primary_color });
      toast.success('Organisation saved');
    } catch (e) { toast.error(e.message); } finally { sST(false); }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 10 }}>Account</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 48, letterSpacing: '-2px', color: 'var(--espresso)', margin: 0 }}>Settings</h1>
      </div>

      {/* Profile */}
      <div style={card}>
        <div style={secH}>Profile</div>
        <form onSubmit={saveP} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={label}>Full Name</label>
            <input value={pF.full_name} onChange={e => sPF({ ...pF, full_name: e.target.value })} style={inp}
              onFocus={e => e.target.style.borderColor = 'var(--coral)'}
              onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
          </div>
          <div>
            <label style={label}>Email</label>
            <input value={profile?.email || ''} disabled style={dis} />
          </div>
          <div>
            <label style={label}>Role</label>
            <div style={{ ...dis, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, background: 'rgba(255,69,0,0.1)', color: 'var(--coral)' }}>
                {ROLE_LABELS[profile?.role]}
              </span>
            </div>
          </div>
          <div>
            <button type="submit" disabled={sP} style={btn}
              onMouseEnter={e => { if (!sP) e.currentTarget.style.background = 'var(--coral)'; }}
              onMouseLeave={e => { if (!sP) e.currentTarget.style.background = 'var(--espresso)'; }}>
              {sP ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Password */}
      <div style={card}>
        <div style={secH}>Change Password</div>
        <form onSubmit={savePw} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={label}>New Password</label>
            <input type="password" value={pwF.next} onChange={e => setPwF(p => ({ ...p, next: e.target.value }))}
              placeholder="At least 8 characters" style={inp}
              onFocus={e => e.target.style.borderColor = 'var(--coral)'}
              onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
          </div>
          <div>
            <label style={label}>Confirm New Password</label>
            <input type="password" value={pwF.confirm} onChange={e => setPwF(p => ({ ...p, confirm: e.target.value }))}
              placeholder="Repeat new password" style={inp}
              onFocus={e => e.target.style.borderColor = 'var(--coral)'}
              onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
          </div>
          {pwF.next && pwF.confirm && pwF.next !== pwF.confirm && (
            <p style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, color: 'var(--terracotta)', margin: '-10px 0 0', letterSpacing: '0.06em' }}>Passwords don't match</p>
          )}
          <div>
            <button type="submit" disabled={sPw || !pwF.next || !pwF.confirm} style={{ ...btn, opacity: (sPw || !pwF.next || !pwF.confirm) ? 0.5 : 1 }}
              onMouseEnter={e => { if (!sPw) e.currentTarget.style.background = 'var(--coral)'; }}
              onMouseLeave={e => { if (!sPw) e.currentTarget.style.background = 'var(--espresso)'; }}>
              {sPw ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>

      {/* Organisation */}
      {hasPermission(profile?.role, 'manage_tenant') && (
        <div style={card}>
          <div style={secH}>Organisation</div>
          <form onSubmit={saveT} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={label}>Name</label>
              <input value={tF.name} onChange={e => sTF({ ...tF, name: e.target.value })} style={inp}
                onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
            </div>
            <div>
              <label style={label}>Workspace URL</label>
              <div style={{ ...dis, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>{tenant?.slug}</span>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, opacity: 0.5 }}>.Axiora.io</span>
              </div>
            </div>
            <div>
              <label style={label}>Plan</label>
              <div style={{ ...dis, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, background: 'rgba(30,122,74,0.1)', color: 'var(--sage)' }}>
                  {tenant?.plan || 'Free'}
                </span>
              </div>
            </div>
            <div>
              <label style={label}>Brand Colour</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input type="color" value={tF.primary_color} onChange={e => sTF({ ...tF, primary_color: e.target.value })}
                  style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid rgba(22,15,8,0.1)', cursor: 'pointer', padding: 2, background: 'var(--warm-white)' }} />
                <input value={tF.primary_color} onChange={e => sTF({ ...tF, primary_color: e.target.value })}
                  style={{ ...inp, flex: 1, fontFamily: 'Fraunces, serif', letterSpacing: '0.05em' }}
                  onFocus={e => e.target.style.borderColor = 'var(--coral)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(22,15,8,0.1)'} />
              </div>
            </div>
            <div>
              <button type="submit" disabled={sT} style={btn}
                onMouseEnter={e => { if (!sT) e.currentTarget.style.background = 'var(--coral)'; }}
                onMouseLeave={e => { if (!sT) e.currentTarget.style.background = 'var(--espresso)'; }}>
                {sT ? 'Saving…' : 'Save organisation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Approved Email Domains — req #5/#6/#12/#13 */}
      {hasPermission(profile?.role, 'manage_tenant') && (
        <ApprovedDomainsCard tenant={tenant} onSaved={syncDomains} />
      )}

      {/* Preferences */}
      <div style={card}>
        <div style={secH}>Preferences</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--espresso)', marginBottom: 4 }}>Dark mode</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.5)' }}>Easy on the eyes at night</div>
          </div>
          {/* Toggle switch */}
          <button onClick={toggleDark} role="switch" aria-checked={dark}
            style={{ width: 48, height: 26, borderRadius: 999, border: 'none', background: dark ? 'var(--coral)' : 'rgba(22,15,8,0.15)', cursor: 'pointer', position: 'relative', transition: 'background 0.25s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: dark ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
