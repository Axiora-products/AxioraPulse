import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * HelpTip — a subtle ⓘ icon that shows a styled tooltip on hover/focus.
 *
 * Usage:
 *   <HelpTip text="Conditional logic lets you show questions only when certain answers are given." />
 *   <HelpTip text="..." position="left" />
 */
export default function HelpTip({ text, position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  // Close on Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setVisible(false); };
    if (visible) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  const tooltipPos = {
    top:    { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top:    'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
    left:   { right:  'calc(100% + 8px)', top:  '50%', transform: 'translateY(-50%)' },
    right:  { left:   'calc(100% + 8px)', top:  '50%', transform: 'translateY(-50%)' },
  }[position] || {};

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', marginLeft: 6 }}
    >
      <button
        type="button"
        aria-label="Help"
        aria-expanded={visible}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          background: 'var(--coral)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: '#fff',
          width: 14,
          height: 14,
          borderRadius: '50%',
          boxShadow: visible ? '0 0 12px rgba(255, 69, 0, 0.85)' : '0 0 8px rgba(255, 69, 0, 0.55)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          outline: 'none',
          position: 'relative',
          textTransform: 'none',
          letterSpacing: 'normal',
          transform: visible ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        <span style={{ fontSize: 9, fontFamily: "'Syne', sans-serif", fontWeight: 800, lineHeight: 1, position: 'relative', zIndex: 2, top: '-0.5px' }}>i</span>
        {visible && (
          <>
            <div className="sonar-ring" style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
            <div className="sonar-ring" style={{ width: '100%', height: '100%', pointerEvents: 'none', animationDelay: '0.9s' }} />
            <div className="sonar-ring" style={{ width: '100%', height: '100%', pointerEvents: 'none', animationDelay: '1.8s' }} />
          </>
        )}
      </button>

      <AnimatePresence>
        {visible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'absolute',
              zIndex: 8000,
              ...tooltipPos,
              width: 240,
              background: 'var(--espresso)',
              color: 'var(--cream)',
              fontFamily: "'Fraunces', serif",
              fontWeight: 300,
              fontSize: 13,
              lineHeight: 1.55,
              padding: '10px 14px',
              borderRadius: 10,
              boxShadow: '0 8px 32px rgba(22,15,8,0.25)',
              pointerEvents: 'none',
              whiteSpace: 'normal',
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            {text}
            {/* Arrow */}
            <span style={{
              position: 'absolute',
              ...(position === 'top'    ? { top: '100%', left: '50%', transform: 'translateX(-50%)', borderTop: '5px solid var(--espresso)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent' } : {}),
              ...(position === 'bottom' ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', borderBottom: '5px solid var(--espresso)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent' } : {}),
              ...(position === 'left'   ? { left: '100%', top: '50%', transform: 'translateY(-50%)', borderLeft: '5px solid var(--espresso)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' } : {}),
              ...(position === 'right'  ? { right: '100%', top: '50%', transform: 'translateY(-50%)', borderRight: '5px solid var(--espresso)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' } : {}),
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
