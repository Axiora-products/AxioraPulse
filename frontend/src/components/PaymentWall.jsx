import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import usePaymentWall from '../hooks/usePaymentWall';

export default function PaymentWall() {
  const { open, message, hide } = usePaymentWall();
  const navigate = useNavigate();

  function handleUpgrade() {
    hide();
    navigate('/pricing');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={hide}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(22,15,8,0.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--warm-white)',
              borderRadius: 24,
              padding: '40px 44px',
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 32px 80px rgba(22,15,8,0.22)',
              textAlign: 'center',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(255,69,0,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>

            <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 22, color: 'var(--espresso)', marginBottom: 12, lineHeight: 1.2 }}>
              Upgrade your plan
            </div>

            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.55)', lineHeight: 1.65, marginBottom: 28 }}>
              {message || 'This feature requires a paid plan.'}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={hide}
                style={{
                  padding: '12px 24px', borderRadius: 999,
                  border: '1px solid rgba(22,15,8,0.12)',
                  background: 'transparent',
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'rgba(22,15,8,0.4)', cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={handleUpgrade}
                style={{
                  padding: '12px 28px', borderRadius: 999, border: 'none',
                  background: 'var(--coral)', color: '#fff',
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 10,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                View plans
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
