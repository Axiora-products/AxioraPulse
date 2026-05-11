import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getPlans, createOrder, openCheckout } from '../api/paymentApi';
import useAuthStore from '../hooks/useAuth';
import useSubscription from '../hooks/useSubscription';

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function planFeatures(plan) {
  const features = [];
  if (plan.max_surveys != null) features.push(`Up to ${plan.max_surveys} surveys`);
  else features.push('Unlimited surveys');
  if (plan.max_responses != null) features.push(`${plan.max_responses.toLocaleString()} responses / month`);
  else features.push('Unlimited responses');
  if (plan.max_team_members != null) features.push(`${plan.max_team_members} team member${plan.max_team_members === 1 ? '' : 's'}`);
  else features.push('Unlimited team members');
  if (plan.ai_insights_enabled) features.push('AI insights & suggestions');
  else features.push('Core analytics');
  features.push('Custom branding');
  if (plan.code === 'enterprise') features.push('Dedicated support & SLA');
  return features;
}

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const { profile, user } = useAuthStore();
  const { subscription, load: loadSub, loaded } = useSubscription();
  const navigate = useNavigate();

  useEffect(() => {
    getPlans().then(setPlans).catch(() => toast.error('Could not load plans'));
    if (user && !loaded) loadSub();
  }, [user, loaded]);

  const currentPlanCode = subscription?.plan?.code || 'free';

  async function handleUpgrade(plan) {
    if (!user) { navigate('/register'); return; }
    if (plan.code === 'enterprise') {
      window.location.href = 'mailto:hello@axioralabs.com?subject=Enterprise Plan Inquiry';
      return;
    }
    setLoadingPlan(plan.code);
    try {
      const order = await createOrder(plan.code);
      await openCheckout({
        order,
        planCode: plan.code,
        profile,
        onSuccess: async () => {
          toast.success(`You're now on the ${plan.name} plan!`);
          await loadSub();
          navigate('/billing');
        },
        onError: (msg) => toast.error(msg),
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not initiate payment');
    } finally {
      setLoadingPlan(null);
    }
  }

  const sorted = [...plans].sort((a, b) => a.price_paise - b.price_paise);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', padding: '80px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div className="sec-tag" style={{ justifyContent: 'center' }}>Plans & Pricing</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(36px, 6vw, 56px)', letterSpacing: '-2px', lineHeight: 1.04, color: 'var(--espresso)', marginBottom: 18 }}>
            Simple, honest pricing
          </h1>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 17, color: 'rgba(22,15,8,0.5)', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
            Start free. Upgrade when your team grows. No hidden fees, no lock-in.
          </p>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'start' }}>
          {sorted.map((plan) => {
            const isCurrent = currentPlanCode === plan.code;
            const isPro = plan.code === 'pro';
            const isEnterprise = plan.code === 'enterprise';
            const busy = loadingPlan === plan.code;
            const priceDisplay = plan.price_paise === 0
              ? (isEnterprise ? 'Custom' : 'Free')
              : `₹${(plan.price_paise / 100).toLocaleString('en-IN')}`;

            return (
              <div key={plan.id} style={{
                background: isPro ? 'var(--espresso)' : 'var(--warm-white)',
                borderRadius: 24,
                padding: '36px 32px',
                border: isPro ? 'none' : '1px solid rgba(22,15,8,0.07)',
                boxShadow: isPro ? '0 24px 60px rgba(22,15,8,0.22)' : '0 2px 12px rgba(22,15,8,0.05)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {isPro && (
                  <div style={{
                    position: 'absolute', top: 20, right: 20,
                    background: 'var(--coral)', color: '#fff',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '5px 12px', borderRadius: 999,
                  }}>
                    Most popular
                  </div>
                )}

                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: 20, right: isPro ? 120 : 20,
                    background: isPro ? 'rgba(255,255,255,0.12)' : 'rgba(22,15,8,0.07)',
                    color: isPro ? 'rgba(253,245,232,0.7)' : 'rgba(22,15,8,0.4)',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '5px 12px', borderRadius: 999,
                  }}>
                    Current plan
                  </div>
                )}

                {/* Plan name */}
                <div style={{
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: isPro ? 'var(--coral)' : 'rgba(22,15,8,0.35)',
                  marginBottom: 12,
                }}>
                  {plan.name}
                </div>

                {/* Price */}
                <div style={{ marginBottom: 6 }}>
                  <span style={{
                    fontFamily: 'Playfair Display, serif', fontWeight: 900,
                    fontSize: 42, letterSpacing: '-2px',
                    color: isPro ? 'var(--warm-white)' : 'var(--espresso)',
                  }}>
                    {priceDisplay}
                  </span>
                  {plan.price_paise > 0 && (
                    <span style={{
                      fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 600,
                      color: isPro ? 'rgba(253,245,232,0.4)' : 'rgba(22,15,8,0.35)',
                      marginLeft: 6,
                    }}>
                      / {plan.billing_period}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p style={{
                  fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14,
                  color: isPro ? 'rgba(253,245,232,0.5)' : 'rgba(22,15,8,0.45)',
                  marginBottom: 28, lineHeight: 1.6,
                }}>
                  {plan.description}
                </p>

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {planFeatures(plan).map((f, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {isPro
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12" /></svg>
                        : <CheckIcon />
                      }
                      <span style={{
                        fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, lineHeight: 1.5,
                        color: isPro ? 'rgba(253,245,232,0.7)' : 'rgba(22,15,8,0.6)',
                      }}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  disabled={isCurrent || busy}
                  onClick={() => handleUpgrade(plan)}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 999, border: 'none',
                    background: isCurrent
                      ? (isPro ? 'rgba(255,255,255,0.08)' : 'rgba(22,15,8,0.06)')
                      : (isPro ? 'var(--coral)' : 'var(--espresso)'),
                    color: isCurrent
                      ? (isPro ? 'rgba(253,245,232,0.3)' : 'rgba(22,15,8,0.3)')
                      : '#fff',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: isCurrent ? 'default' : 'pointer',
                    transition: 'opacity 0.2s',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? 'Opening checkout…' : isCurrent ? 'Current plan' : isEnterprise ? 'Contact us' : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Back link for authenticated users */}
        {user && (
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'rgba(22,15,8,0.3)',
              }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
