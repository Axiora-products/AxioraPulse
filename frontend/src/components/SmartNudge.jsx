import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * SmartNudge
 * ─────────────────────────────────────────────────────────────────
 * Shows a small motivational banner when the respondent hits a
 * meaningful progress milestone.  Auto-dismisses after 4 seconds.
 * Never shows the same milestone twice per session.
 *
 * Props
 * ─────
 *  visiblePos    number  — current position in visible questions (1-based)
 *  visibleTotal  number  — total visible questions
 *  tc            string  — theme colour hex
 */
export default function SmartNudge({ visiblePos, visibleTotal, tc = '#FF4500' }) {
  const [nudge,   setNudge]   = useState(null);   // { emoji, message } | null
  const seen      = useRef(new Set());             // milestones already shown
  const hideTimer = useRef(null);

  // Milestone definitions — checked in priority order
  const milestones = [
    {
      key:     'start',
      test:    (pos, tot) => pos === 1 && tot > 2,
      emoji:   '👋',
      message: 'Great start! Every answer matters.',
    },
    {
      key:     'halfway',
      test:    (pos, tot) => tot >= 4 && pos === Math.ceil(tot / 2),
      emoji:   '🔥',
      message: 'Halfway there — you\'re doing great!',
    },
    {
      key:     'three_quarters',
      test:    (pos, tot) => tot >= 6 && pos === Math.ceil(tot * 0.75),
      emoji:   '💪',
      message: 'Almost there — just a few left!',
    },
    {
      key:     'penultimate',
      test:    (pos, tot) => tot > 3 && pos === tot - 1,
      emoji:   '⚡',
      message: 'One more after this — finish strong!',
    },
    {
      key:     'last',
      test:    (pos, tot) => tot > 1 && pos === tot,
      emoji:   '🎯',
      message: 'Last question — you\'ve got this!',
    },
  ];

  useEffect(() => {
    if (!visiblePos || !visibleTotal) return;

    for (const m of milestones) {
      if (!seen.current.has(m.key) && m.test(visiblePos, visibleTotal)) {
        seen.current.add(m.key);
        setNudge({ emoji: m.emoji, message: m.message });

        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setNudge(null), 4000);
        break; // only one nudge at a time
      }
    }

    return () => clearTimeout(hideTimer.current);
  }, [visiblePos, visibleTotal]);

  return (
    <AnimatePresence>
      {nudge && (
        <motion.div
          key={nudge.message}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{    opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position:    'absolute',
            bottom:      24,
            left:        '50%',
            transform:   'translateX(-50%)',
            zIndex:      30,
            display:     'flex',
            alignItems:  'center',
            gap:         12,
            padding:     '12px 20px',
            borderRadius: 999,
            background:  'var(--espresso)',
            boxShadow:   `0 8px 32px rgba(22,15,8,0.2), 0 0 0 1px rgba(22,15,8,0.06)`,
            whiteSpace:  'nowrap',
            pointerEvents: 'none',   // non-blocking — never interrupts answering
          }}
        >
          {/* Coloured dot accent */}
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tc, flexShrink: 0 }} />

          {/* Emoji */}
          <span style={{ fontSize: 16, lineHeight: 1 }}>{nudge.emoji}</span>

          {/* Text */}
          <span style={{
            fontFamily:    'Fraunces, serif',
            fontWeight:    300,
            fontSize:      14,
            color:         'var(--cream)',
            letterSpacing: '0.01em',
          }}>
            {nudge.message}
          </span>

          {/* Auto-dismiss progress bar */}
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 4, ease: 'linear' }}
            style={{
              position:      'absolute',
              bottom:        0,
              left:          0,
              right:         0,
              height:        2,
              borderRadius:  '0 0 999px 999px',
              background:    tc,
              transformOrigin: 'left',
              opacity:       0.5,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
