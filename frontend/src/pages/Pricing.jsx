import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createOrder, openCheckout } from '../api/paymentApi';
import useAuthStore from '../hooks/useAuth';
import useSubscription from '../hooks/useSubscription';

const PLANS = [
  {
    code: 'free',
    label: 'Starter',
    price: 'Free',
    period: null,
    description: 'Everything you need to run your first study.',
    features: [
      '3 active surveys',
      '100 responses / month',
      'Basic analytics',
      '5 question types',
      'Email support',
    ],
    cta: 'Start for free',
    style: 'outline',
  },
  {
    code: 'pro',
    label: 'Pro',
    price: '₹2,499',
    period: 'month',
    description: 'For teams who need more power and deeper insights.',
    features: [
      'Unlimited surveys',
      '10,000 responses / month',
      'Full analytics + AI insights',
      'All 24+ question types',
      'Custom branding',
      'Team collaboration (5 seats)',
    ],
    cta: 'Start 14-day trial',
    style: 'filled',
    badge: 'Most popular',
  },
  {
    code: 'enterprise',
    label: 'Enterprise',
    price: 'Custom',
    period: null,
    description: 'Tailored for large research teams and organisations.',
    features: [
      'Unlimited everything',
      'On-premise deployment option',
      'Dedicated research analyst',
      '99.9% SLA guarantee',
      'API + Webhooks access',
    ],
    cta: 'Contact sales',
    style: 'outline',
  },
];

function Tick({ light }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke={light ? 'rgba(253,245,232,0.55)' : 'var(--coral)'}
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 2 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Pricing() {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const { profile, user } = useAuthStore();
  const { subscription, load: loadSub, loaded } = useSubscription();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loaded) loadSub();
  }, [user, loaded]);

  const currentPlanCode = subscription?.plan?.code || (user ? 'free' : null);

  async function handleCta(plan) {
    if (plan.code === 'enterprise') {
      window.location.href = 'mailto:hello@axioralabs.com?subject=Enterprise Plan';
      return;
    }
    if (plan.code === 'free') {
      navigate(user ? '/dashboard' : '/register');
      return;
    }
    if (!user) { navigate('/register'); return; }
    setLoadingPlan(plan.code);
    try {
      const order = await createOrder(plan.code);
      await openCheckout({
        order,
        planCode: plan.code,
        profile,
        onSuccess: async () => {
          toast.success(`You're now on the ${plan.label} plan!`);
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>

      {/* Nav strip */}
      <div style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => navigate(user ? '/dashboard' : '/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 20, color: 'var(--espresso)', letterSpacing: '-0.5px' }}>
            Axiora<span style={{ color: 'var(--coral)' }}>Pulse</span>
          </span>
        </button>
        {user && (
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none', border: '1px solid rgba(22,15,8,0.12)',
              borderRadius: 999, padding: '7px 18px', cursor: 'pointer',
              fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'rgba(22,15,8,0.45)',
            }}
          >
            ← Back
          </button>
        )}
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px 100px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,69,0,0.08)', borderRadius: 999,
            padding: '5px 16px', marginBottom: 24,
          }}>
            <span style={{
              fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
              letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--coral)',
            }}>
              Plans & Pricing
            </span>
          </div>
          <h1 style={{
            fontFamily: 'Playfair Display, serif', fontWeight: 900,
            fontSize: 'clamp(38px, 6vw, 60px)', letterSpacing: '-2.5px',
            lineHeight: 1.02, color: 'var(--espresso)', margin: '0 0 20px',
          }}>
            Simple, honest pricing
          </h1>
          <p style={{
            fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 17,
            color: 'rgba(22,15,8,0.48)', maxWidth: 440, margin: '0 auto', lineHeight: 1.75,
          }}>
            Start free. Upgrade when your research demands it.
            No surprises, no lock-in.
          </p>
        </div>

        {/* Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
          alignItems: 'stretch',
        }}>
          {PLANS.map((plan) => {
            const isPro = plan.code === 'pro';
            const isCurrent = currentPlanCode === plan.code;
            const busy = loadingPlan === plan.code;

            return (
              <div
                key={plan.code}
                style={{
                  background: isPro ? 'var(--espresso)' : 'var(--warm-white)',
                  borderRadius: 28,
                  padding: '36px 32px 32px',
                  border: isPro ? 'none' : '1px solid rgba(22,15,8,0.07)',
                  boxShadow: isPro
                    ? '0 28px 64px rgba(22,15,8,0.28)'
                    : '0 2px 16px rgba(22,15,8,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  transform: isPro ? 'translateY(-8px)' : 'none',
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--coral)', color: '#fff',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    padding: '5px 16px', borderRadius: '0 0 10px 10px',
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Current plan indicator */}
                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: 20, right: 20,
                    background: isPro ? 'rgba(255,255,255,0.1)' : 'rgba(22,15,8,0.06)',
                    color: isPro ? 'rgba(253,245,232,0.5)' : 'rgba(22,15,8,0.35)',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 8,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '4px 10px', borderRadius: 999,
                  }}>
                    Current
                  </div>
                )}

                {/* Plan label */}
                <div style={{
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
                  letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: isPro ? 'var(--coral)' : 'rgba(22,15,8,0.32)',
                  marginBottom: 16,
                  marginTop: plan.badge ? 16 : 0,
                }}>
                  {plan.label}
                </div>

                {/* Price */}
                <div style={{ marginBottom: 4, lineHeight: 1 }}>
                  <span style={{
                    fontFamily: 'Playfair Display, serif', fontWeight: 900,
                    fontSize: plan.price === 'Custom' ? 36 : 48,
                    letterSpacing: '-2px',
                    color: isPro ? '#fff' : 'var(--espresso)',
                  }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span style={{
                      fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 600,
                      color: isPro ? 'rgba(253,245,232,0.35)' : 'rgba(22,15,8,0.3)',
                      marginLeft: 6,
                    }}>
                      / {plan.period}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p style={{
                  fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13.5,
                  color: isPro ? 'rgba(253,245,232,0.45)' : 'rgba(22,15,8,0.42)',
                  lineHeight: 1.65, margin: '12px 0 28px',
                }}>
                  {plan.description}
                </p>

                {/* Divider */}
                <div style={{
                  height: 1,
                  background: isPro ? 'rgba(255,255,255,0.08)' : 'rgba(22,15,8,0.06)',
                  marginBottom: 24,
                }} />

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <Tick light={isPro} />
                      <span style={{
                        fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 14, lineHeight: 1.5,
                        color: isPro ? 'rgba(253,245,232,0.65)' : 'rgba(22,15,8,0.58)',
                      }}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  disabled={isCurrent || busy}
                  onClick={() => handleCta(plan)}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    borderRadius: 999,
                    border: isPro ? 'none' : '1.5px solid rgba(22,15,8,0.18)',
                    background: isPro
                      ? (isCurrent ? 'rgba(255,255,255,0.08)' : 'var(--coral)')
                      : 'transparent',
                    color: isPro
                      ? (isCurrent ? 'rgba(253,245,232,0.3)' : '#fff')
                      : (isCurrent ? 'rgba(22,15,8,0.25)' : 'var(--espresso)'),
                    fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10.5,
                    letterSpacing: '0.13em', textTransform: 'uppercase',
                    cursor: isCurrent ? 'default' : 'pointer',
                    opacity: busy ? 0.6 : 1,
                    transition: 'opacity 0.15s, background 0.15s',
                  }}
                >
                  {busy ? 'Opening checkout…' : isCurrent ? 'Current plan' : plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={{
          textAlign: 'center', marginTop: 48,
          fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13,
          color: 'rgba(22,15,8,0.3)', lineHeight: 1.7,
        }}>
          All plans include SSL, 99% uptime, and GDPR-compliant data handling.
          <br />
          Pro trial requires no credit card.
        </p>
      </div>
    </div>
  );
}
