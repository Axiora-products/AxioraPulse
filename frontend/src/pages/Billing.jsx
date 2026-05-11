import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useSubscription from '../hooks/useSubscription';

const card = { background: 'var(--warm-white)', borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)', padding: '36px 40px', marginBottom: 20 };
const secH = { fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 24 };
const row  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(22,15,8,0.06)' };
const lbl  = { fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)' };
const val  = { fontFamily: 'Fraunces, serif', fontWeight: 400, fontSize: 15, color: 'var(--espresso)' };

function StatusBadge({ status }) {
  const colors = {
    active: { bg: 'rgba(30,122,74,0.1)', color: '#1E7A4A' },
    cancelled: { bg: 'rgba(214,59,31,0.1)', color: 'var(--terracotta)' },
    past_due: { bg: 'rgba(255,184,0,0.15)', color: '#B08000' },
  };
  const c = colors[status] || colors.active;
  return (
    <span style={{
      fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      padding: '5px 12px', borderRadius: 999,
      background: c.bg, color: c.color,
    }}>
      {status}
    </span>
  );
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Billing() {
  const { subscription, loading, loaded, load } = useSubscription();
  const navigate = useNavigate();

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const plan = subscription?.plan;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <div className="sec-tag">Billing</div>
        <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 32, letterSpacing: '-1.5px', color: 'var(--espresso)', lineHeight: 1.1, marginBottom: 8 }}>
          Subscription & billing
        </h1>
        <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)', lineHeight: 1.6 }}>
          Manage your plan and view subscription details.
        </p>
      </div>

      {/* Current plan card */}
      <div style={card}>
        <div style={secH}>Current plan</div>

        {loading && (
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)' }}>Loading…</p>
        )}

        {!loading && !plan && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 22, color: 'var(--espresso)', marginBottom: 4 }}>Free</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.4)' }}>
                  3 surveys · 100 responses / month · 1 team member
                </div>
              </div>
              <span style={{ marginLeft: 'auto', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999, background: 'rgba(22,15,8,0.06)', color: 'rgba(22,15,8,0.4)' }}>
                Current plan
              </span>
            </div>
            <button
              onClick={() => navigate('/pricing')}
              style={{ padding: '13px 28px', borderRadius: 999, border: 'none', background: 'var(--coral)', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Upgrade plan
            </button>
          </div>
        )}

        {!loading && plan && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 22, color: 'var(--espresso)', marginBottom: 6 }}>
                  {plan.name}
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, color: 'rgba(22,15,8,0.45)' }}>
                  {plan.price_paise > 0
                    ? `₹${(plan.price_paise / 100).toLocaleString('en-IN')} / ${plan.billing_period}`
                    : 'Free'}
                </div>
              </div>
              <StatusBadge status={subscription.status} />
            </div>

            <div>
              {[
                ['Plan', plan.name],
                ['Status', <StatusBadge key="s" status={subscription.status} />],
                ['Period start', fmt(subscription.current_period_start)],
                ['Period end', fmt(subscription.current_period_end)],
                ['Surveys', plan.max_surveys != null ? `Up to ${plan.max_surveys}` : 'Unlimited'],
                ['Responses / month', plan.max_responses != null ? plan.max_responses.toLocaleString() : 'Unlimited'],
                ['Team members', plan.max_team_members != null ? plan.max_team_members : 'Unlimited'],
                ['AI insights', plan.ai_insights_enabled ? 'Included' : 'Not included'],
              ].map(([label, value], i, arr) => (
                <div key={label} style={{ ...row, borderBottom: i === arr.length - 1 ? 'none' : row.borderBottom }}>
                  <span style={lbl}>{label}</span>
                  <span style={val}>{value}</span>
                </div>
              ))}
            </div>

            {plan.code !== 'enterprise' && (
              <div style={{ marginTop: 28 }}>
                <button
                  onClick={() => navigate('/pricing')}
                  style={{ padding: '13px 28px', borderRadius: 999, border: 'none', background: 'var(--espresso)', color: 'var(--cream)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Change plan
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
