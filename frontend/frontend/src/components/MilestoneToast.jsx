import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const MILESTONES = [1, 10, 50, 100, 500, 1000];

// Tiny confetti burst using canvas
function ConfettiCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const COLORS = ['#FF4500', '#FDB849', '#1E7A4A', '#D63B1F', '#fff'];
    const particles = Array.from({ length: 60 }, () => ({
      x: W / 2, y: H / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * -10 - 2,
      r: Math.random() * 4 + 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3;
        p.alpha -= 0.018;
        if (p.alpha <= 0) return;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      if (particles.some(p => p.alpha > 0)) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 16 }} />;
}

export function checkMilestone(prevCount, newCount) {
  for (const m of MILESTONES) {
    if (prevCount < m && newCount >= m) {
      showMilestoneToast(m);
      break;
    }
  }
}

export function showMilestoneToast(count) {
  toast.custom(
    t => (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        style={{ position: 'relative', background: 'var(--espresso)', borderRadius: 16, padding: '20px 24px', minWidth: 280, boxShadow: '0 24px 60px rgba(22,15,8,0.35)', overflow: 'hidden', cursor: 'pointer' }}
        onClick={() => toast.dismiss(t.id)}
      >
        <ConfettiCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: 8, color: 'var(--coral)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6L12 2z"/>
              <path d="M5 5l1 1M17.5 5l1 1M5 19l1-1M17.5 19l1 1" strokeWidth="1" opacity="0.5"/>
            </svg>
          </div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 18, color: 'var(--cream)', marginBottom: 4 }}>
            {count} {count === 1 ? 'response' : 'responses'}!
          </div>
          <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(253,245,232,0.55)' }}>
            {count === 1   ? 'Your first response is in — momentum starts here.' :
             count === 10  ? 'Double digits — great momentum!' :
             count === 50  ? 'Fifty responses! You\'re on a roll.' :
             count === 100 ? 'A century! Incredible engagement.' :
             count === 500 ? 'Five hundred! This is serious research.' :
                             'One thousand responses. Legendary.'}
          </div>
        </div>
      </motion.div>
    ),
    { duration: 5000, position: 'bottom-right' }
  );
}
